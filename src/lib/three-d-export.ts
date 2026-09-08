import { serializeThreeMf } from './three-mf';
import type { ThreeDReply } from './three-d-project';
import { serializeBinaryStl } from './stl-export';

const REQUIRED_CHECKS = [
  'buffers',
  'faces',
  'edges',
  'vertexLinks',
  'signedVolume',
  'nonAdjacentIntersections',
  'selfIntersections',
  'shellContainment',
] as const;
export function hasExportableGeometry(reply: ThreeDReply) {
  return (
    !reply.error &&
    !!reply.artifact &&
    reply.preparation?.status === 'accepted' &&
    reply.preparation.bodyCount === 1 &&
    REQUIRED_CHECKS.every((check) => reply.preparation?.checks?.[check] === 'passed')
  );
}
/** Called in the worker after the exact placed artifact has completed its audits. */
export function prepareStlExport(reply: ThreeDReply): ArrayBuffer | undefined {
  return hasExportableGeometry(reply) ? serializeBinaryStl(reply.artifact!) : undefined;
}

export function threeDStlFilename(name: string) {
  const base =
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-|-$/g, '') || 'object';
  return `${base}-3d-mm.stl`;
}

export function prepareThreeMfExport(reply: ThreeDReply, name: string): ArrayBuffer | undefined {
  return hasExportableGeometry(reply) ? serializeThreeMf(reply.artifact!, name) : undefined;
}
export function threeDModelFilename(name: string) {
  return threeDStlFilename(name).replace(/\.stl$/, '.model.3mf');
}
