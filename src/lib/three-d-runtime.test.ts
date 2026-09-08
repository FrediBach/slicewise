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
  runtime.request(request);
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
