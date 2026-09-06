import { generateMesh, type GenerativeParams } from './generativeMesh';

import { generateTerrain, type TerrainParams } from './generative-terrain';

type GenerateRequest = {
  type: 'generate';
  id: number;
  source?: 'generative' | 'terrain';
  params: GenerativeParams | TerrainParams;
};

self.addEventListener('message', (event: MessageEvent<GenerateRequest>) => {
  if (event.data?.type !== 'generate') return;

  try {
    const mesh =
      event.data.source === 'terrain'
        ? generateTerrain(event.data.params as TerrainParams)
        : generateMesh(event.data.params as GenerativeParams);
    const positions = mesh.positions.buffer;
    const normals = mesh.normals.buffer;
    const indices = mesh.indices.buffer;
    self.postMessage(
      { type: 'result', id: event.data.id, positions, normals, indices, stats: mesh.stats },
      { transfer: [positions, normals, indices] },
    );
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: event.data.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
