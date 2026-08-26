import { computeContours } from './contour-engine';

let mesh = null;

self.addEventListener('message', ({ data }) => {
  if (data.type === 'mesh') {
    mesh = {
      V: new Float32Array(data.mesh.V),
      T: new Uint32Array(data.mesh.T),
      N: new Float32Array(data.mesh.N),
      ...(data.mesh.lineArtOffsets
        ? {
            lineArt: {
              offsets: new Uint32Array(data.mesh.lineArtOffsets),
              kind: data.mesh.lineArtKind,
            },
          }
        : {}),
    };
    return;
  }
  if (data.type !== 'render' || !mesh) return;
  try {
    const result = computeContours(mesh, data.settings, data.quick);
    self.postMessage({ type: 'result', id: data.id, meshVersion: data.meshVersion, result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: data.id,
      meshVersion: data.meshVersion,
      message: error instanceof Error ? error.message : 'Contour rendering failed',
    });
  }
});
