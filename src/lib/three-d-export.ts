import { serializeThreeMf } from './three-mf';
import type { ThreeDReply, ThreeDRequest } from './three-d-project';
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
    ((reply.untreatedExport === true && !reply.preparation) ||
      (reply.preparation?.status === 'accepted' &&
        reply.preparation.bodyCount === 1 &&
        REQUIRED_CHECKS.every((check) => reply.preparation?.checks?.[check] === 'passed')))
  );
}
/** Serializes the exact placed source or an audited treatment result. */
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

/** Package each format independently, retaining the preview if serialization fails. */
export function packageThreeDExports(request: ThreeDRequest, reply: ThreeDReply): void {
  reply.untreatedExport = request.purpose !== 'prepare' && request.project.sizeConfirmed;
  try {
    reply.stl = prepareStlExport(reply);
  } catch (error) {
    reply.stlError = error instanceof Error ? error.message : String(error);
  }
  try {
    reply.threeMf = prepareThreeMfExport(reply, request.source.name);
  } catch (error) {
    reply.threeMfError = error instanceof Error ? error.message : String(error);
  }
}
