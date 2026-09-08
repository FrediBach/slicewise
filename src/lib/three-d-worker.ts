import { ThreeDGeometryCache } from './three-d-cache';
import { previewThreeD, prepareThreeD } from './three-d-preparation';
import type { ThreeDRequest, ThreeDReply } from './three-d-project';

const geometryCache = new ThreeDGeometryCache();

// Heavy WASM loads only for an explicit preparation action, from the local bundle.
let kernelModule: Promise<import('manifold-3d').ManifoldToplevel> | null = null;
self.addEventListener('message', async (event: MessageEvent<ThreeDRequest>) => {
  const request = event.data;
  const { id, source } = request;
  try {
    let reply: ThreeDReply;
    if (request.purpose === 'prepare') {
      self.postMessage({
        id,
        sourceVersion: source.version,
        progress: 'Loading the local geometry kernel…',
      } satisfies ThreeDReply);
      kernelModule ??= Promise.all([
        import('manifold-3d'),
        import('manifold-3d/manifold.wasm?url'),
      ]).then(async ([{ default: Module }, { default: wasmUrl }]) => {
        const module = await Module({ locateFile: () => wasmUrl });
        module.setup();
        return module;
      });
      reply = prepareThreeD(
        request,
        await kernelModule,
        (progress) =>
          self.postMessage({ id, sourceVersion: source.version, progress } satisfies ThreeDReply),
        geometryCache,
      );
    } else reply = previewThreeD(request, geometryCache).reply;
    const buffers = new Set<ArrayBuffer>();
    for (const artifact of [reply.artifact, reply.sourceArtifact])
      if (artifact) {
        buffers.add(artifact.V.buffer as ArrayBuffer);
        buffers.add(artifact.T.buffer as ArrayBuffer);
      }
    if (reply.slices) {
      buffers.add(reply.slices.positions.buffer as ArrayBuffer);
      buffers.add(reply.slices.selected.buffer as ArrayBuffer);
    }
    self.postMessage(reply, { transfer: [...buffers] });
  } catch (error) {
    kernelModule = null;
    self.postMessage({
      id,
      sourceVersion: source.version,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ThreeDReply);
  }
});
