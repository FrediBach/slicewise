import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createVideoEncoderAdapter,
  rasterizeAnimationSvg,
  selectAnimationVideoCodec,
} from './video-encoder';

const mediaMocks = vi.hoisted(() => ({
  sourceAdd: vi.fn(async () => undefined),
  sourceClose: vi.fn(),
  outputStart: vi.fn(async () => undefined),
  outputFinalize: vi.fn(async () => undefined),
  outputCancel: vi.fn(async () => undefined),
  sourceConfig: vi.fn(),
}));

vi.mock('mediabunny', () => {
  class BufferTarget {
    buffer: ArrayBuffer | null = new Uint8Array([1, 2, 3]).buffer;
  }
  class CanvasSource {
    add = mediaMocks.sourceAdd;
    close = mediaMocks.sourceClose;
    constructor(_canvas: HTMLCanvasElement, config: unknown) {
      mediaMocks.sourceConfig(config);
    }
  }
  class Output {
    state: 'pending' | 'started' | 'canceled' | 'finalizing' | 'finalized' = 'pending';
    target: BufferTarget;
    constructor({ target }: { target: BufferTarget }) {
      this.target = target;
    }
    addVideoTrack() {}
    async start() {
      this.state = 'started';
      await mediaMocks.outputStart();
    }
    async finalize() {
      this.state = 'finalized';
      await mediaMocks.outputFinalize();
    }
    async cancel() {
      this.state = 'canceled';
      await mediaMocks.outputCancel();
    }
  }
  return {
    BufferTarget,
    CanvasSource,
    Output,
    Quality: class {},
    WebMOutputFormat: class {},
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('animation video codec selection', () => {
  it('prefers VP9 and avoids unnecessary fallback checks', async () => {
    const check = vi.fn(async () => true);
    await expect(selectAnimationVideoCodec(check)).resolves.toBe('vp9');
    expect(check).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledWith('vp9');
  });

  it('falls back to VP8 and reports unsupported browsers', async () => {
    const fallback = vi.fn(async (codec: string) => codec === 'vp8');
    await expect(selectAnimationVideoCodec(fallback)).resolves.toBe('vp8');
    expect(fallback.mock.calls.map(([codec]) => codec)).toEqual(['vp9', 'vp8']);

    await expect(selectAnimationVideoCodec(async () => false)).resolves.toBeNull();
  });
});

describe('Mediabunny video encoder adapter', () => {
  const options = {
    canvas: {} as HTMLCanvasElement,
    width: 1080,
    height: 720,
    fps: 30,
    bitrate: 8_000_000,
    codec: 'vp9' as const,
  };

  it('passes explicit timestamps, finalizes WebM, and closes its source', async () => {
    const adapter = await createVideoEncoderAdapter(options);
    await adapter.addFrame({
      index: 0,
      timeMs: 0,
      timestampUs: 33_333,
      durationUs: 33_333,
    });
    const blob = await adapter.finalize();

    expect(mediaMocks.sourceConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        codec: 'vp9',
        transform: {
          width: 1080,
          height: 720,
          fit: 'fill',
          alpha: 'discard',
        },
      }),
    );
    expect(mediaMocks.sourceAdd).toHaveBeenCalledWith(0.033333, 0.033333, { keyFrame: true });
    expect(mediaMocks.sourceClose).toHaveBeenCalledOnce();
    expect(mediaMocks.outputFinalize).toHaveBeenCalledOnce();
    expect(blob.type).toBe('video/webm');
    expect(blob.size).toBe(3);
  });

  it('closes and cancels partially written output exactly once', async () => {
    const adapter = await createVideoEncoderAdapter(options);
    await adapter.cancel();
    await adapter.cancel();

    expect(mediaMocks.sourceClose).toHaveBeenCalledOnce();
    expect(mediaMocks.outputCancel).toHaveBeenCalledOnce();
  });
});

describe('animation SVG rasterization', () => {
  function stubLoadedImage() {
    const image = new EventTarget();
    Object.defineProperty(image, 'src', {
      set: () => queueMicrotask(() => image.dispatchEvent(new Event('load'))),
    });
    class MockImage {
      constructor() {
        return image;
      }
    }
    vi.stubGlobal('Image', MockImage);
    return image;
  }

  it('loads SVG through an image element, flattens the background, and releases its URL', async () => {
    const image = stubLoadedImage();
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const canvas = {
      width: 1080,
      height: 720,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;
    const createObjectURL = vi.fn(() => 'blob:animation-frame');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    await rasterizeAnimationSvg('<svg/>', canvas, '#123456');

    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/svg+xml;charset=utf-8' }),
    );
    expect(context.fillStyle).toBe('#123456');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1080, 720);
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 1080, 720);
    expect(context.restore).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:animation-frame');
  });

  it('restores the canvas and releases the URL when drawing fails', async () => {
    stubLoadedImage();
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(() => {
        throw new Error('draw failed');
      }),
    };
    const canvas = {
      width: 2,
      height: 2,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:failed-frame'),
      revokeObjectURL,
    });

    await expect(rasterizeAnimationSvg('<svg/>', canvas, '#fff')).rejects.toThrow('draw failed');
    expect(context.restore).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:failed-frame');
  });

  it('reports SVG loading failures and releases the URL', async () => {
    const image = new EventTarget();
    Object.defineProperty(image, 'src', {
      set: () => queueMicrotask(() => image.dispatchEvent(new Event('error'))),
    });
    class InvalidImage {
      constructor() {
        return image;
      }
    }
    vi.stubGlobal('Image', InvalidImage);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:invalid-frame'),
      revokeObjectURL,
    });
    const canvas = {
      getContext: vi.fn(() => ({})),
    } as unknown as HTMLCanvasElement;

    await expect(rasterizeAnimationSvg('<svg/>', canvas, '#fff')).rejects.toThrow(
      'The rendered SVG could not be loaded for video export',
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invalid-frame');
  });
});
