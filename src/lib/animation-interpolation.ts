export type AnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';
export type AnimationParameterKind = 'continuous' | 'integer' | 'seed' | 'color';
export type AnimationValue = number | string;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const animationEasings = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'hold',
] as const satisfies readonly AnimationEasing[];

export function isAnimationEasing(value: unknown): value is AnimationEasing {
  return animationEasings.includes(value as AnimationEasing);
}

export function clampAnimationValue(value: number, min = -Infinity, max = Infinity): number {
  return value < min ? min : value > max ? max : value;
}

export function normalizeAnimationValue(
  value: unknown,
  kind: AnimationParameterKind,
  min?: number,
  max?: number,
): AnimationValue | undefined {
  if (kind === 'color')
    return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : undefined;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  const rounded = kind === 'integer' || kind === 'seed' ? Math.round(numeric) : numeric;
  return clampAnimationValue(rounded, min, max);
}

export function applyAnimationEasing(amount: number, easing: AnimationEasing): number {
  const t = clampAnimationValue(amount, 0, 1);
  if (easing === 'hold') return 0;
  if (easing === 'ease-in') return t * t;
  if (easing === 'ease-out') return 1 - (1 - t) * (1 - t);
  if (easing === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2;
  return t;
}

export function interpolateRgbColor(from: string, to: string, amount: number): string {
  if (!HEX_COLOR.test(from) || !HEX_COLOR.test(to)) return from;
  const channels = (color: string): number[] =>
    [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  const start = channels(from);
  const end = channels(to);
  return `#${start
    .map((channel, index) =>
      Math.round(channel + (end[index] - channel) * clampAnimationValue(amount, 0, 1))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function interpolateAnimationValue(
  from: AnimationValue,
  to: AnimationValue,
  amount: number,
  kind: AnimationParameterKind,
  min?: number,
  max?: number,
): AnimationValue {
  if (kind === 'color') return interpolateRgbColor(String(from), String(to), amount);
  if (kind === 'seed') return amount < 1 ? Number(from) : Number(to);

  const value = Number(from) + (Number(to) - Number(from)) * amount;
  const rounded = kind === 'integer' ? Math.round(value) : value;
  return clampAnimationValue(rounded, min, max);
}
