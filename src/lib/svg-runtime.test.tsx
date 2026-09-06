// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import { parseSVG } from './svg-mesh';

vi.mock('./animation-storage', () => ({
  localAnimationProjectId: () => 'svg-test',
  loadAnimationProject: async () => null,
  saveAnimationProject: vi.fn(),
}));
vi.mock('./video-encoder', () => ({ detectAnimationVideoCodec: vi.fn(async () => null) }));

class WorkerStub extends EventTarget {
  static instances: WorkerStub[] = [];
  requests: { type: string; mesh?: { preserveSurface?: boolean } }[] = [];
  constructor() {
    super();
    WorkerStub.instances.push(this);
  }
  postMessage(request: WorkerStub['requests'][number]) {
    this.requests.push(request);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('preserves SVG surfaces through upload, bevel rebuilds, axis changes, and worker transfer', async () => {
  vi.stubGlobal('Worker', WorkerStub);
  vi.stubGlobal('slicewiseParseSVG', parseSVG);
  document.body.innerHTML = renderToStaticMarkup(<App />);
  await import('./slicer');
  const renderer = WorkerStub.instances[0];
  const meshRequests = () => renderer.requests.filter((request) => request.type === 'mesh');
  expect(meshRequests().at(-1)?.mesh?.preserveSurface).toBe(false);

  const file = document.getElementById('file') as HTMLInputElement;
  Object.defineProperty(file, 'files', {
    value: [
      new File(
        ['<svg xmlns="http://www.w3.org/2000/svg"><path d="M103.057 0L206.114 178.5H0Z"/></svg>'],
        'triangle.svg',
        { type: 'image/svg+xml' },
      ),
    ],
  });
  file.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => expect(document.getElementById('mName')).toHaveTextContent('triangle.svg'));
  expect(meshRequests().at(-1)?.mesh?.preserveSurface).toBe(true);

  const beforeBevel = meshRequests().length;
  document.getElementById('svgRounded')!.click();
  await waitFor(() => expect(meshRequests().length).toBeGreaterThan(beforeBevel));
  expect(meshRequests().at(-1)?.mesh?.preserveSurface).toBe(true);
  document.getElementById('upY')!.click();
  expect(meshRequests().at(-1)?.mesh?.preserveSurface).toBe(true);

  const demo = document.getElementById('demo') as HTMLSelectElement;
  demo.value = 'knot';
  demo.dispatchEvent(new Event('change', { bubbles: true }));
  expect(meshRequests().at(-1)?.mesh?.preserveSurface).toBe(false);
});
