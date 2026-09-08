import { previewThreeD } from './three-d-preparation';
import { packageThreeDExports } from './three-d-export';
import { serializeThreeMf } from './three-mf';
import { solidBox } from '../test/fixtures/solid';
import { auditPrintTopology } from './print-validation';
import { serializeBinaryStl } from './stl-export';
import { expect, it } from 'vitest';
import { ThreeDRuntime } from './three-d-runtime';
import { createThreeDProject, type ThreeDRequest, type ThreeDReply } from './three-d-project';
class WorkerStub extends EventTarget {
  requests: ThreeDRequest[] = [];
  terminated = false;
  postMessage(request: ThreeDRequest) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(reply: ThreeDReply) {
    this.dispatchEvent(new MessageEvent('message', { data: reply }));
  }
}
it('coalesces edits, rejects stale sources and exit replies, and restarts after errors', () => {
  const workers: WorkerStub[] = [];
  const runtime = new ThreeDRuntime(
    () => {},
    () => {
      const worker = new WorkerStub();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  );
  const mesh = {
    V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    T: new Uint32Array([0, 1, 2]),
    N: new Float32Array(9),
  };
  const source = { id: 'a', version: 1, name: 'A', mesh, imported: false, upY: false };
  const request = { source, project: createThreeDProject('a'), settings: {} };
  runtime.request(request);
  runtime.request({ ...request, project: { ...request.project, radiusMm: 1 } });
  runtime.request({ ...request, source: { ...source, version: 2 } });
  expect(workers[0].requests).toHaveLength(1);
  expect(workers[0].requests[0].source.mesh.V).not.toBe(mesh.V);
  workers[0].reply({ id: 1, sourceVersion: 1, error: 'old failure' });
  expect(runtime.state.status).toBe('pending');
  expect(workers[0].requests).toHaveLength(2);
  expect(workers[0].requests[1].id).toBe(3);
  workers[0].reply({ id: 3, sourceVersion: 2, error: 'current failure' });
  expect(runtime.state.message).toBe('current failure');
  runtime.stop();
  expect(workers[0].terminated).toBe(true);
  workers[0].reply({ id: 3, sourceVersion: 2, error: 'late' });
  expect(runtime.state.active).toBe(false);
  runtime.request(request);
  expect(workers).toHaveLength(2);
  workers[1].dispatchEvent(new Event('error'));
  expect(workers[1].terminated).toBe(true);
  expect(runtime.state.status).toBe('error');
  runtime.request(request);
  expect(workers).toHaveLength(3);
  runtime.stop();
  expect(mesh.V.byteLength).toBe(36);
});

it('keeps progress pending, cancels native work, restarts and invalidates accepted results on edits', () => {
  const workers: WorkerStub[] = [];
  const runtime = new ThreeDRuntime(
    () => {},
    () => {
      const w = new WorkerStub();
      workers.push(w);
      return w as unknown as Worker;
    },
  );
  const artifact = {
    V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    T: new Uint32Array([0, 1, 2]),
    min: [0, 0, 0] as [number, number, number],
    max: [1, 1, 0] as [number, number, number],
    dimensions: [1, 1, 0] as [number, number, number],
  };
  const input = {
    source: { id: 'a', version: 1, name: 'A', mesh: artifact, imported: false, upY: false },
    project: { ...createThreeDProject('a'), sizeConfirmed: true, treatment: 'inset' as const },
    settings: {},
  };
  runtime.request(input);
  workers[0].reply({ id: 1, sourceVersion: 1, artifact, sourceArtifact: artifact });
  runtime.prepare();
  const first = workers[0].requests.at(-1)!;
  workers[0].reply({ id: first.id, sourceVersion: 1, progress: 'Constructing tools…' });
  expect(runtime.state.preparation?.status).toBe('pending');
  runtime.cancel();
  expect(workers[0].terminated).toBe(true);
  expect(runtime.state.preparation?.status).toBe('cancelled');
  expect(runtime.exportStl()).toBeNull();
  expect(runtime.exportThreeMf()).toBeNull();
  workers[0].reply({
    id: first.id,
    sourceVersion: 1,
    artifact,
    preparation: { status: 'accepted', message: 'late' },
  });
  expect(runtime.state.preparation?.status).toBe('cancelled');
  expect(runtime.exportStl()).toBeNull();
  expect(runtime.exportThreeMf()).toBeNull();
  runtime.prepare();
  expect(workers).toHaveLength(2);
  const next = workers[1].requests.at(-1)!;
  workers[1].reply({
    id: next.id,
    sourceVersion: 1,
    artifact,
    sourceArtifact: artifact,
    stl: serializeBinaryStl(solidBox()),
    threeMf: serializeThreeMf(solidBox(), 'A'),
    preparation: {
      status: 'accepted',
      message: 'accepted',
      bodyCount: 1,
      checks: auditPrintTopology(solidBox()).checks,
    },
  });
  expect(runtime.state.preparation?.status).toBe('accepted');
  expect(runtime.state.exportAvailable).toBe(true);
  expect(runtime.state.threeMfAvailable).toBe(true);
  const model = runtime.exportThreeMf()!;
  new Uint8Array(model).fill(0);
  expect(runtime.exportThreeMf()).toEqual(serializeThreeMf(solidBox(), 'A'));
  const download = runtime.exportStl()!;
  expect(download).toEqual(serializeBinaryStl(solidBox()));
  new Uint8Array(download).fill(0);
  expect(runtime.exportStl()).toEqual(serializeBinaryStl(solidBox()));
  const calls = workers[1].requests.length;
  runtime.request(input);
  expect(workers[1].requests).toHaveLength(calls);
  expect(runtime.state.preparation?.status).toBe('accepted');
  runtime.request({ ...input, project: { ...input.project, radiusMm: 1 } });
  expect(runtime.state.artifact).toBeNull();
  expect(runtime.exportStl()).toBeNull();
  expect(runtime.exportThreeMf()).toBeNull();
  expect(runtime.state.preparation?.status).toBe('idle');
  workers[1].reply({
    id: workers[1].requests.at(-1)!.id,
    sourceVersion: 1,
    artifact,
    sourceArtifact: artifact,
  });
  runtime.prepare();
  runtime.request({ ...input, source: { ...input.source, version: 2 } });
  expect(workers[1].terminated).toBe(true);
  expect(workers).toHaveLength(3);
  runtime.stop();
});

it('downloads detached untreated files and replaces them only with current preview replies', () => {
  const worker = new WorkerStub();
  const runtime = new ThreeDRuntime(
    () => {},
    () => worker as unknown as Worker,
  );
  const input = {
    source: { id: 'box', version: 1, name: 'Box', mesh: solidBox(), imported: false, upY: false },
    project: { ...createThreeDProject('box'), sizeConfirmed: true },
    settings: { axis: 'up' as const, lines: 3 },
  };
  const respond = (request: ThreeDRequest) => {
    const { reply } = previewThreeD(request);
    packageThreeDExports(request, reply);
    worker.reply(reply);
    return reply;
  };
  runtime.request(input);
  const first = worker.requests[0];
  const reply = respond(first);
  expect(runtime.state.preparation?.status).toBe('idle');
  expect(runtime.state.exportAvailable).toBe(true);
  expect(runtime.state.threeMfAvailable).toBe(true);
  const stl = runtime.exportStl()!;
  const model = runtime.exportThreeMf()!;
  expect(stl).toEqual(reply.stl);
  expect(model).toEqual(reply.threeMf);
  new Uint8Array(stl).fill(0);
  new Uint8Array(model).fill(0);
  expect(runtime.exportStl()).toEqual(reply.stl);
  expect(runtime.exportThreeMf()).toEqual(reply.threeMf);
  runtime.request({ ...input, project: { ...input.project, longestMm: 120 } });
  expect(runtime.exportStl()).toBeNull();
  expect(runtime.exportThreeMf()).toBeNull();
  worker.reply(reply);
  expect(runtime.exportStl()).toBeNull();
  respond(worker.requests.at(-1)!);
  expect(new Uint8Array(runtime.exportStl()!)).not.toEqual(new Uint8Array(reply.stl!));
  runtime.stop();
  expect(runtime.exportStl()).toBeNull();
  expect(runtime.exportThreeMf()).toBeNull();
});
