const run = document.querySelector<HTMLButtonElement>('#run')!;
const contours = document.querySelector<HTMLButtonElement>('#contours')!;
const repeat = document.querySelector<HTMLButtonElement>('#repeat')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
const status = document.querySelector<HTMLElement>('#status')!;
const results = document.querySelector<HTMLElement>('#results')!;
let worker: Worker | undefined;
let revision = 0;
function stop() {
  revision++;
  worker?.terminate();
  worker = undefined;
  run.disabled = contours.disabled = repeat.disabled = false;
  cancel.disabled = true;
}
function start(repeats: number, suite: 'analytic' | 'contours') {
  stop();
  const id = revision;
  worker = new Worker(new URL('../lib/three-d-feasibility-worker.ts', import.meta.url), {
    type: 'module',
  });
  run.disabled = contours.disabled = repeat.disabled = true;
  cancel.disabled = false;
  status.textContent = 'Running local WASM fixtures…';
  results.textContent = '';
  worker.onmessage = (event) => {
    if (event.data.id !== revision) return;
    if (event.data.type === 'result') {
      results.textContent = JSON.stringify(
        { userAgent: navigator.userAgent, rows: event.data.rows },
        null,
        2,
      );
      const rejected = event.data.rows.filter(
        (row: { status?: string }) => row.status === 'rejected',
      ).length;
      status.textContent = `Completed ${event.data.rows.length} results; ${rejected} rejected. Worker released.`;
    } else status.textContent = `Failed: ${event.data.message}`;
    stop();
  };
  worker.onerror = (event) => {
    if (id !== revision) return;
    status.textContent = `Worker failed: ${event.message}`;
    stop();
  };
  worker.postMessage({ id, repeats, suite });
}
run.addEventListener('click', () => start(1, 'analytic'));
contours.addEventListener('click', () => start(1, 'contours'));
repeat.addEventListener('click', () => start(20, 'contours'));
cancel.addEventListener('click', () => {
  stop();
  status.textContent = 'Cancelled. Worker released; run again to initialize a fresh kernel.';
});
window.addEventListener('pagehide', stop);

export {};
