import { generateMesh, type GenerativeParams } from "./generativeMesh";

type GenerateRequest = {
  type: "generate";
  id: number;
  params: GenerativeParams;
};

self.addEventListener("message", (event: MessageEvent<GenerateRequest>) => {
  if (event.data?.type !== "generate") return;

  try {
    const mesh = generateMesh(event.data.params);
    const positions = mesh.positions.buffer;
    const normals = mesh.normals.buffer;
    const indices = mesh.indices.buffer;
    self.postMessage(
      { type: "result", id: event.data.id, positions, normals, indices, stats: mesh.stats },
      { transfer: [positions, normals, indices] },
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      id: event.data.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
