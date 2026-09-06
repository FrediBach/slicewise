// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import { generateTerrain, type TerrainParams } from './generative-terrain';

vi.mock('./animation-storage', () => ({
  localAnimationProjectId: () => 'terrain-test',
  loadAnimationProject: async () => null,
  saveAnimationProject: vi.fn(),
}));
vi.mock('./video-encoder', () => ({ detectAnimationVideoCodec: vi.fn(async () => null) }));

type Request = { type: string; id: number; source: string; params: TerrainParams };
class WorkerStub extends EventTarget {
  static instances: WorkerStub[] = [];
  requests: Request[] = [];
  constructor() {
    super();
    WorkerStub.instances.push(this);
  }
  postMessage(request: Request) {
    this.requests.push(request);
  }
  complete(request: Request) {
    const mesh = generateTerrain({ terrainRes: 32 });
    this.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'result',
          id: request.id,
          positions: mesh.positions.buffer,
          indices: mesh.indices.buffer,
          normals: mesh.normals.buffer,
          stats: mesh.stats,
        },
      }),
    );
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('switches terrain sources, coalesces slider edits, and rejects stale generation results', async () => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.stubGlobal('Worker', WorkerStub);
  document.body.innerHTML = renderToStaticMarkup(<App />);
  await import('./slicer');
  const generator = WorkerStub.instances[1];
  const edit = (id: string, value: string, event = 'change') => {
    const control = document.getElementById(id) as HTMLInputElement;
    control.value = value;
    control.dispatchEvent(new Event(event, { bubbles: true }));
  };
  edit('demo', 'terrain');
  await vi.advanceTimersByTimeAsync(120);
  const first = generator.requests.at(-1)!;
  expect(first.source).toBe('terrain');
  expect(first.params.terrainSeed).toBe(7);
  expect(document.getElementById('terrainControls')).not.toHaveAttribute('hidden');
  expect(document.getElementById('generativeControls')).toHaveAttribute('hidden');
  edit('terrainSeed', '23', 'input');
  edit('terrainSeed', '24', 'input');
  expect((document.getElementById('terrainSeedN') as HTMLInputElement).value).toBe('24');
  generator.complete(first);
  expect(document.getElementById('mName')).not.toHaveTextContent('terrain · seed 7');
  const latest = generator.requests.at(-1)!;
  expect(latest.params.terrainSeed).toBe(24);
  generator.complete(latest);
  expect(document.getElementById('mName')).toHaveTextContent('terrain · seed 24');
  edit('terrainErosionN', '85', 'input');
  await vi.advanceTimersByTimeAsync(120);
  const stale = generator.requests.at(-1)!;
  expect(stale.params.terrainErosion).toBe(85);
  edit('demo', 'generative');
  generator.complete(stale);
  expect(generator.requests.at(-1)!.source).toBe('generative');
  edit('demo', 'knot');
  generator.complete(generator.requests.at(-1)!);
  expect(document.getElementById('mName')).toHaveTextContent('demo · torus knot');
  expect(document.getElementById('terrainControls')).toHaveAttribute('hidden');
  edit('demo', 'terrain');
  await vi.advanceTimersByTimeAsync(120);
  expect(generator.requests.at(-1)!.params.terrainSeed).toBe(24);
  expect(generator.requests.at(-1)!.params.terrainErosion).toBe(85);
});
