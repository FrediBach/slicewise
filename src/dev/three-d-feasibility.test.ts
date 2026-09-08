// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('routes suites, cancels/releases workers, ignores stale replies and recovers from errors', async () => {
  document.body.innerHTML =
    '<button id="run"></button><button id="contours"></button><button id="repeat"></button><button id="cancel"></button><p id="status"></p><pre id="results"></pre>';
  const workers: FakeWorker[] = [];
  class FakeWorker {
    onmessage?: (event: { data: { id: number; type: string; rows: { status: string }[] } }) => void;
    onerror?: (event: { message: string }) => void;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      workers.push(this);
    }
  }
  vi.stubGlobal('Worker', FakeWorker);
  await import('./three-d-feasibility');
  const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
  button('repeat').click();
  expect(workers[0].postMessage).toHaveBeenCalledWith({
    id: expect.any(Number),
    repeats: 20,
    suite: 'contours',
  });
  const staleId = workers[0].postMessage.mock.calls[0][0].id;
  expect(button('contours').disabled).toBe(true);
  button('cancel').click();
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  expect(button('contours').disabled).toBe(false);
  button('contours').click();
  const currentId = workers[1].postMessage.mock.calls[0][0].id;
  expect(currentId).not.toBe(staleId);
  workers[0].onmessage!({ data: { id: staleId, type: 'result', rows: [] } });
  expect(document.getElementById('status')!.textContent).toMatch(/Running/);
  expect(workers[1].terminate).not.toHaveBeenCalled();
  workers[1].onmessage!({
    data: { id: currentId, type: 'result', rows: [{ status: 'rejected' }] },
  });
  expect(document.getElementById('status')!.textContent).toContain('1 rejected');
  expect(workers[1].terminate).toHaveBeenCalledOnce();
  button('run').click();
  expect(workers[2].postMessage).toHaveBeenCalledWith({
    id: expect.any(Number),
    repeats: 1,
    suite: 'analytic',
  });
  workers[2].onerror!({ message: 'WASM failed' });
  expect(document.getElementById('status')!.textContent).toContain('WASM failed');
  expect(workers[2].terminate).toHaveBeenCalledOnce();
  expect(button('contours').disabled).toBe(false);
  button('contours').click();
  window.dispatchEvent(new Event('pagehide'));
  expect(workers[3].terminate).toHaveBeenCalledOnce();
});
