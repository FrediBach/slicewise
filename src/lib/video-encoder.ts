import { ANIMATION_VIDEO_MIME_TYPE, type AnimationVideoFrame } from './animation-video-export';

export type AnimationVideoCodec = 'vp9' | 'vp8';

export type AnimationVideoEncoderOptions = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: AnimationVideoCodec;
};

export interface VideoEncoderAdapter {
  readonly codec: AnimationVideoCodec;
  addFrame(frame: AnimationVideoFrame): Promise<void>;
  finalize(): Promise<Blob>;
  cancel(): Promise<void>;
}

type CodecCheck = (codec: AnimationVideoCodec) => Promise<boolean>;

export async function selectAnimationVideoCodec(
  check: CodecCheck,
): Promise<AnimationVideoCodec | null> {
  if (await check('vp9')) return 'vp9';
  if (await check('vp8')) return 'vp8';
  return null;
}

export async function detectAnimationVideoCodec(
  width: number,
  height: number,
  bitrate: number,
): Promise<AnimationVideoCodec | null> {
  if (!('VideoEncoder' in globalThis) || !('VideoFrame' in globalThis)) return null;
  const { Quality, canEncodeVideo } = await import('mediabunny');
  const quality = new Quality({ bitrate });
  return selectAnimationVideoCodec((codec) => canEncodeVideo(codec, { width, height, quality }));
}

export async function createVideoEncoderAdapter(
  options: AnimationVideoEncoderOptions,
): Promise<VideoEncoderAdapter> {
  const { BufferTarget, CanvasSource, Output, Quality, WebMOutputFormat } =
    await import('mediabunny');
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const source = new CanvasSource(options.canvas, {
    codec: options.codec,
    quality: new Quality({ bitrate: options.bitrate }),
    keyFrameInterval: 2,
    transform: {
      width: options.width,
      height: options.height,
      fit: 'fill',
      alpha: 'discard',
    },
  });
  output.addVideoTrack(source, { frameRate: options.fps });
  await output.start();
  let closed = false;

  const closeSource = () => {
    if (closed) return;
    closed = true;
    source.close();
  };

  return {
    codec: options.codec,
    async addFrame(frame) {
      await source.add(frame.timestampUs / 1_000_000, frame.durationUs / 1_000_000, {
        keyFrame: frame.index === 0,
      });
    },
    async finalize() {
      closeSource();
      await output.finalize();
      if (!target.buffer) throw new Error('The video encoder produced no output');
      return new Blob([target.buffer], { type: ANIMATION_VIDEO_MIME_TYPE });
    },
    async cancel() {
      closeSource();
      if (output.state !== 'canceled' && output.state !== 'finalized') await output.cancel();
    },
  };
}

export async function rasterizeAnimationSvg(
  svg: string,
  canvas: HTMLCanvasElement,
  background: string,
): Promise<void> {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('The browser could not create a video canvas');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener(
        'error',
        () => reject(new Error('The rendered SVG could not be loaded for video export')),
        { once: true },
      );
      image.src = url;
    });
    context.save();
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    } finally {
      context.restore();
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
