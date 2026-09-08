import { deformMesh } from './mesh-deformation';
import { placeThreeDSource, type ThreeDRequest, type ThreeDReply } from './three-d-project';
self.addEventListener('message', (event: MessageEvent<ThreeDRequest>) => {
  const { id, source, project, settings } = event.data;
  try {
    const artifact = placeThreeDSource(deformMesh(source.mesh, settings), source, project);
    const reply: ThreeDReply = { id, sourceVersion: source.version, artifact };
    self.postMessage(reply, { transfer: [artifact.V.buffer, artifact.T.buffer] });
  } catch (error) {
    self.postMessage({
      id,
      sourceVersion: source.version,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ThreeDReply);
  }
});
