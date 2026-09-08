import { strToU8, zipSync } from 'fflate';
import type { SolidMesh } from './solid-kernel';

export const THREE_MF_LIMITS = { triangles: 500_000, modelBytes: 96 * 1024 * 1024 } as const;
const MODEL_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MODEL_TYPE = 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml';
const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
function objectName(name: string) {
  return (
    Array.from(name.slice(0, 200))
      .filter((c) => {
        const cp = c.codePointAt(0)!;
        return (
          cp === 9 ||
          cp === 10 ||
          cp === 13 ||
          (cp >= 32 && cp <= 0xd7ff) ||
          (cp >= 0xe000 && cp <= 0xfffd) ||
          cp > 0xffff
        );
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim() || 'Object'
  );
}

/** Minimal Core model package. The placed mesh is preserved with an identity build item. */
export function serializeThreeMf({ V, T }: SolidMesh, name: string): ArrayBuffer {
  if (
    V.length < 12 ||
    V.length % 3 ||
    T.length < 12 ||
    T.length % 3 ||
    T.length / 3 > THREE_MF_LIMITS.triangles ||
    V.length / 3 > THREE_MF_LIMITS.triangles * 3
  )
    throw new Error('3MF mesh exceeds the complete-triangle budget.');
  if (!V.every(Number.isFinite) || T.some((v) => v >= V.length / 3))
    throw new Error('Invalid 3MF coordinates or indices.');
  const chunks: string[] = [];
  let length = 0;
  const add = (part: string) => {
    length += part.length;
    // Coordinates and markup are ASCII; reserve UTF-8 expansion for the short name.
    if (length + 800 > THREE_MF_LIMITS.modelBytes)
      throw new Error('3MF model exceeds the 96 MiB serialization budget.');
    chunks.push(part);
  };
  const title = xml(objectName(name));
  add(
    `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="${MODEL_NS}"><metadata name="Title">${title}</metadata><metadata name="Application">Slicewise</metadata><resources><object id="1" type="model" name="${title}"><mesh><vertices>`,
  );
  for (let i = 0; i < V.length; i += 3)
    add(`<vertex x="${V[i]}" y="${V[i + 1]}" z="${V[i + 2]}"/>`);
  add('</vertices><triangles>');
  for (let i = 0; i < T.length; i += 3)
    add(`<triangle v1="${T[i]}" v2="${T[i + 1]}" v3="${T[i + 2]}"/>`);
  add('</triangles></mesh></object></resources><build><item objectid="1"/></build></model>');
  const archive = zipSync(
    {
      '[Content_Types].xml': strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="${MODEL_TYPE}"/></Types>`,
      ),
      '_rels/.rels': strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"><Relationship Id="rel1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/></Relationships>`,
      ),
      '3D/3dmodel.model': strToU8(chunks.join('')),
    },
    { level: 6, mtime: new Date(2000, 0, 1) },
  );
  return archive.buffer;
}
