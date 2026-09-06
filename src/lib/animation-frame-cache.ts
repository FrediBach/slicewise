import { animationPreviewIntervalMs } from './animation-playback';

type Entry<T> = { value: T; bytes: number };

/**
 * A bounded, progressively sampled timeline. Memory pressure halves temporal
 * density instead of evicting the beginning of a loop in favour of its end.
 * Values are owned by the caller and must remain immutable while cached.
 */
export class AnimationFrameCache<T> {
  private entries = new Map<number, Entry<T>>();
  private context: object | null = null;
  private meshVersion = -1;
  private intervalMs = 1000 / 30;
  private durationMs = 0;
  private usedBytes = 0;
  private sampleStride = 1;
  generation = 0;

  constructor(
    private readonly maxBytes = 32 * 1024 * 1024,
    private readonly maxFrames = 240,
  ) {}

  configure(context: object, meshVersion: number, durationMs: number, fps: number): void {
    const intervalMs = animationPreviewIntervalMs(fps);
    if (
      context === this.context &&
      meshVersion === this.meshVersion &&
      durationMs === this.durationMs &&
      intervalMs === this.intervalMs
    )
      return;
    this.clear();
    this.context = context;
    this.meshVersion = meshVersion;
    this.durationMs = Math.max(0, durationMs);
    this.intervalMs = intervalMs;
  }

  clear(): void {
    this.entries.clear();
    this.context = null;
    this.usedBytes = 0;
    this.sampleStride = 1;
    this.generation++;
  }

  get size(): number {
    return this.entries.size;
  }
  get bytes(): number {
    return this.usedBytes;
  }
  get stride(): number {
    return this.sampleStride;
  }

  frameAt(timeMs: number): number {
    const time = Math.min(this.durationMs, Math.max(0, timeMs));
    return Math.floor((time / this.intervalMs + 1e-7) / this.sampleStride) * this.sampleStride;
  }

  timeAt(frame: number): number {
    return Math.min(this.durationMs, frame * this.intervalMs);
  }

  get(frame: number): T | undefined {
    return this.entries.get(frame)?.value;
  }

  put(frame: number, value: T, bytes: number, generation = this.generation): void {
    if (
      generation !== this.generation ||
      frame % this.sampleStride !== 0 ||
      !Number.isFinite(bytes) ||
      bytes < 0 ||
      bytes > this.maxBytes ||
      this.maxFrames < 1
    )
      return;
    this.usedBytes -= this.entries.get(frame)?.bytes ?? 0;
    this.entries.set(frame, { value, bytes });
    this.usedBytes += bytes;
    while (this.usedBytes > this.maxBytes || this.entries.size > this.maxFrames) {
      this.sampleStride *= 2;
      for (const [index, entry] of this.entries) {
        if (index % this.sampleStride === 0) continue;
        this.entries.delete(index);
        this.usedBytes -= entry.bytes;
      }
    }
  }

  /** Bounded look-ahead; wrapping is only useful for looping playback. */
  nextMissing(frame: number, loop: boolean): number | undefined {
    const slots = Math.ceil(this.durationMs / (this.intervalMs * this.sampleStride));
    const slot = Math.floor(frame / this.sampleStride);
    for (let ahead = 1; ahead <= Math.min(32, slots - 1); ahead++) {
      if (!loop && slot + ahead >= slots) break;
      const next = ((slot + ahead) % slots) * this.sampleStride;
      if (!this.entries.has(next)) return next;
    }
    return undefined;
  }
}

/** Busy playback never supersedes an unfinished render, even after many ticks. */
export function planAnimationPreview<T>(
  cache: AnimationFrameCache<T>,
  timeMs: number,
  busy: boolean,
  loop: boolean,
): { cached?: T; renderFrame?: number; prefetch: boolean } {
  const frame = cache.frameAt(timeMs);
  const cached = cache.get(frame);
  return {
    cached,
    renderFrame: busy ? undefined : cached === undefined ? frame : cache.nextMissing(frame, loop),
    prefetch: cached !== undefined,
  };
}
