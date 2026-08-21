/**
 * colorPair.ts — perceptually-grounded random color pairs for generative art.
 *
 * Everything happens in OKLCH (cylindrical Oklab). Three properties make it the
 * right space for this job:
 *
 *   1. L is perceptually uniform, so |L1 - L2| is an honest "brightness
 *      difference". In HSL it is not: yellow and blue both sit at L=50% while
 *      differing ~4x in perceived brightness.
 *   2. Hue is stable across lightness — rotating H does not shift the apparent
 *      color family the way HSV does (the "blue turns purple" problem).
 *   3. Chroma is unbounded in Oklch but sRGB is not, and the reachable maximum
 *      depends heavily on (L, H). Sampling chroma as a *fraction of the maximum
 *      reachable at that L and H* is what keeps saturation looking consistent
 *      instead of muddy in some hues and neon in others.
 *
 * "Nice" is therefore defined as: in-gamut, chroma expressed relative to the
 * gamut boundary, lightness kept out of the crushed extremes, and hues related
 * by a harmonic interval rather than at random.
 */

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export type RandomSource = () => number;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface OklabColor {
  L: number;
  a: number;
  b: number;
}

export interface OklchColor {
  L: number;
  C: number;
  H: number;
}

export type ColorInput = string | RgbColor | OklchColor;
export type NumericRange = readonly [minimum: number, maximum: number];

export interface ColorHarmony {
  name: string;
  offsets: readonly number[];
  weight: number;
}

export interface CreateColorPairOptions {
  color?: ColorInput | null;
  minLightnessDiff?: number;
  lightnessRange?: NumericRange;
  chromaRange?: NumericRange;
  minContrast?: number | null;
  harmonies?: readonly ColorHarmony[];
  hueJitter?: number;
  seed?: number | null;
  rng?: RandomSource | null;
}

export interface FormattedColor {
  hex: string;
  rgb: RgbColor;
  oklch: OklchColor;
  css: string;
}

export interface ColorPair {
  a: FormattedColor;
  b: FormattedColor;
  harmony: string;
  lightnessDiff: number;
  contrast: number;
}

export interface ColorGradientStop {
  position: number;
  color: string;
}

export interface CreateColorGradientOptions {
  count?: number;
  rng?: RandomSource;
}

interface ColorPairConfig {
  color: ColorInput | null;
  minLightnessDiff: number;
  lightnessRange: NumericRange;
  chromaRange: NumericRange;
  minContrast: number | null;
  harmonies: readonly ColorHarmony[];
  hueJitter: number;
  seed: number | null;
  rng: RandomSource | null;
}

const DEFAULTS: ColorPairConfig = {
  color: null,
  /** Minimum perceptual lightness gap, in Oklab L units (0..1). */
  minLightnessDiff: 0.25,
  /** Allowed lightness band. Avoids crushed blacks and washed-out whites. */
  lightnessRange: [0.28, 0.9],
  /** Chroma as a fraction of the max reachable at that (L, H). */
  chromaRange: [0.45, 0.95],
  /** Optional WCAG 2.1 contrast floor (e.g. 4.5). null = don't enforce. */
  minContrast: null,
  /** Hue intervals in degrees, with relative weights. */
  harmonies: [
    { name: 'monochrome', offsets: [0], weight: 1 },
    { name: 'analogous', offsets: [-40, -25, 25, 40], weight: 3 },
    { name: 'split-complement', offsets: [-150, 150], weight: 2 },
    { name: 'triad', offsets: [-120, 120], weight: 2 },
    { name: 'complement', offsets: [180], weight: 2 },
  ],
  /** Jitter applied to the chosen hue interval, in degrees. */
  hueJitter: 6,
  seed: null,
  rng: null,
};

// ---------------------------------------------------------------------------
// Deterministic RNG — generative art needs reproducible seeds
// ---------------------------------------------------------------------------

function mulberry32(seed: number): RandomSource {
  // Sequential seeds (1, 2, 3…) are the common case in generative art, but
  // mulberry32's first outputs are strongly correlated across nearby states.
  // Scramble the seed with a splitmix-style avalanche before use.
  let a = seed >>> 0;
  a = Math.imul(a ^ (a >>> 16), 0x21f0aaad) >>> 0;
  a = Math.imul(a ^ (a >>> 15), 0x735a2d97) >>> 0;
  a = (a ^ (a >>> 15)) >>> 0;

  return function (): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Color space conversions (Björn Ottosson's Oklab)
// ---------------------------------------------------------------------------

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function linearRgbToOklab({ r, g, b }: RgbColor): OklabColor {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l),
    m_ = Math.cbrt(m),
    s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToLinearRgb({ L, a, b }: OklabColor): RgbColor {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_,
    m = m_ * m_ * m_,
    s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

const oklchToOklab = ({ L, C, H }: OklchColor): OklabColor => ({
  L,
  a: C * Math.cos((H * Math.PI) / 180),
  b: C * Math.sin((H * Math.PI) / 180),
});

function oklabToOklch({ L, a, b }: OklabColor): OklchColor {
  const C = Math.hypot(a, b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H: C < 1e-6 ? 0 : H };
}

// ---------------------------------------------------------------------------
// Gamut handling
// ---------------------------------------------------------------------------

const EPS = 1e-5;

function inSrgbGamut(oklch: OklchColor): boolean {
  const { r, g, b } = oklabToLinearRgb(oklchToOklab(oklch));
  return r >= -EPS && r <= 1 + EPS && g >= -EPS && g <= 1 + EPS && b >= -EPS && b <= 1 + EPS;
}

/**
 * Largest chroma reachable in sRGB at a given lightness and hue.
 * Binary search: the in-gamut set along the chroma axis is a single interval
 * starting at 0, so bisection converges reliably. ~1e-4 precision in 20 steps.
 */
function maxChroma(L: number, H: number): number {
  let lo = 0,
    hi = 0.4;
  if (inSrgbGamut({ L, C: hi, H })) return hi;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inSrgbGamut({ L, C: mid, H })) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Clip chroma to the gamut boundary, preserving L and H exactly. */
const gamutMap = ({ L, C, H }: OklchColor): OklchColor => ({
  L: clamp(L, 0, 1),
  C: Math.min(C, maxChroma(clamp(L, 0, 1), H)),
  H: ((H % 360) + 360) % 360,
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function oklchToRgb255(oklch: OklchColor): RgbColor {
  const lin = oklabToLinearRgb(oklchToOklab(oklch));
  return {
    r: Math.round(clamp(linearToSrgb(lin.r), 0, 1) * 255),
    g: Math.round(clamp(linearToSrgb(lin.g), 0, 1) * 255),
    b: Math.round(clamp(linearToSrgb(lin.b), 0, 1) * 255),
  };
}

function oklchToHex(oklch: OklchColor): string {
  const { r, g, b } = oklchToRgb255(oklch);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Accepts '#rgb', '#rrggbb', {r,g,b} in 0–255, or an {L,C,H} object. */
function parseColor(input: null | undefined): null;
function parseColor(input: ColorInput): OklchColor;
function parseColor(input: ColorInput | null | undefined): OklchColor | null {
  if (input == null) return null;

  if (typeof input === 'object' && 'L' in input && 'C' in input && 'H' in input) {
    return gamutMap(input);
  }

  let r, g, b;
  if (typeof input === 'string') {
    let hex = input.trim().replace(/^#/, '');
    if (hex.length === 3)
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`Bad color: ${input}`);
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (typeof input === 'object') {
    ({ r, g, b } = input);
  } else {
    throw new Error(`Bad color: ${input}`);
  }

  return oklabToOklch(
    linearRgbToOklab({
      r: srgbToLinear(r / 255),
      g: srgbToLinear(g / 255),
      b: srgbToLinear(b / 255),
    }),
  );
}

/** WCAG 2.1 contrast ratio, 1..21. Separate from Oklab L on purpose. */
function contrastRatio(oklchA: OklchColor, oklchB: OklchColor): number {
  const lum = (oklch: OklchColor): number => {
    const { r, g, b } = oklchToRgb255(oklch);
    const [R, G, B] = [r, g, b].map((v) => srgbToLinear(v / 255));
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  const [hi, lo] = [lum(oklchA), lum(oklchB)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Sampling helpers
// ---------------------------------------------------------------------------

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function pickWeighted<T extends { weight: number }>(items: readonly T[], rng: RandomSource): T {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let t = rng() * total;
  for (const it of items) {
    t -= it.weight;
    if (t <= 0) return it;
  }
  return items[items.length - 1];
}

const pick = <T>(arr: readonly T[], rng: RandomSource): T => arr[Math.floor(rng() * arr.length)];

/**
 * Sample a partner lightness uniformly over the feasible set:
 *   { L : |L - L0| >= minDiff } ∩ [lo, hi]
 * That set is two intervals. Choosing a side with probability proportional to
 * its width keeps the result uniform rather than biased toward the near side.
 */
function pickPartnerLightness(
  L0: number,
  minDiff: number,
  [lo, hi]: NumericRange,
  rng: RandomSource,
): number {
  const downRoom = Math.max(0, L0 - minDiff - lo);
  const upRoom = Math.max(0, hi - (L0 + minDiff));

  if (downRoom + upRoom === 0) {
    // The base sits too centrally for the requested gap. Break out of the
    // preferred band rather than silently shrinking the gap.
    const goDown = L0 > 0.5;
    return clamp(goDown ? L0 - minDiff : L0 + minDiff, 0, 1);
  }

  const goDown = rng() * (downRoom + upRoom) < downRoom;
  return goDown ? lerp(lo, L0 - minDiff, rng()) : lerp(L0 + minDiff, hi, rng());
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Create two colors that work together, or a partner for a color you already
 * have.
 *
 */
function createColorPair(opts: CreateColorPairOptions = {}): ColorPair {
  const cfg: ColorPairConfig = { ...DEFAULTS, ...opts };
  const rng: RandomSource = cfg.rng ?? (cfg.seed != null ? mulberry32(cfg.seed) : Math.random);

  const [loL, hiL] = cfg.lightnessRange;
  const [loC, hiC] = cfg.chromaRange;

  // --- Color A: either the fixed input, or sampled fresh ---------------------
  let a = cfg.color == null ? null : parseColor(cfg.color);
  if (!a) {
    const H = rng() * 360;
    const L = lerp(loL, hiL, rng());
    a = { L, C: lerp(loC, hiC, rng()) * maxChroma(L, H), H };
  }

  // --- Hue: a harmonic interval, lightly jittered ---------------------------
  const harmony = pickWeighted(cfg.harmonies, rng);
  const offset = pick(harmony.offsets, rng) + (rng() * 2 - 1) * cfg.hueJitter;
  const H = (((a.H + offset) % 360) + 360) % 360;

  // --- Lightness: enforce the perceptual gap --------------------------------
  const L = pickPartnerLightness(a.L, cfg.minLightnessDiff, [loL, hiL], rng);

  // --- Chroma: keep the same relative saturation so they read as a family ---
  const aFraction = a.C / Math.max(maxChroma(a.L, a.H), 1e-6);
  // Opposing hues at high chroma vibrate against each other; damp them.
  const damp = Math.abs(((offset + 180) % 360) - 180) > 100 ? 0.82 : 1;
  const fraction = clamp(aFraction * lerp(0.8, 1.15, rng()) * damp, loC * 0.6, 1);

  let b = gamutMap({ L, C: fraction * maxChroma(L, H), H });

  // --- Optional WCAG pass: push apart until the ratio is met ----------------
  if (cfg.minContrast) {
    const dir = b.L >= a.L ? 1 : -1;
    let steps = 0;
    while (contrastRatio(a, b) < cfg.minContrast && b.L > 0 && b.L < 1 && steps++ < 120) {
      b = gamutMap({ L: clamp(b.L + dir * 0.01, 0, 1), C: b.C, H: b.H });
    }
  }

  const format = (c: OklchColor): FormattedColor => ({
    hex: oklchToHex(c),
    rgb: oklchToRgb255(c),
    oklch: { L: +c.L.toFixed(4), C: +c.C.toFixed(4), H: +c.H.toFixed(2) },
    css: `oklch(${(c.L * 100).toFixed(1)}% ${c.C.toFixed(4)} ${c.H.toFixed(1)})`,
  });

  return {
    a: format(a),
    b: format(b),
    harmony: harmony.name,
    lightnessDiff: +Math.abs(a.L - b.L).toFixed(4),
    contrast: +contrastRatio(a, b).toFixed(2),
  };
}

/**
 * Build a small harmonic gradient around an existing ink colour. A single
 * harmony is shared by every generated partner so the result reads as one
 * palette rather than a collection of unrelated random colours.
 */
function createColorGradient(
  color: ColorInput,
  { count = 4, rng = Math.random }: CreateColorGradientOptions = {},
): ColorGradientStop[] {
  const stopCount = clamp(Math.round(count), 2, 8);
  const base = oklchToHex(parseColor(color));
  const harmony = pickWeighted(DEFAULTS.harmonies, rng);
  const colors = [base];

  for (let index = 1; index < stopCount; index += 1) {
    colors.push(
      createColorPair({
        color: base,
        harmonies: [harmony],
        minLightnessDiff: 0.12,
        hueJitter: 10,
        rng,
      }).b.hex,
    );
  }

  return colors.map((stopColor, index) => ({
    position: index / (stopCount - 1),
    color: stopColor,
  }));
}

export {
  createColorGradient,
  createColorPair,
  parseColor,
  maxChroma,
  contrastRatio,
  oklchToHex,
  mulberry32,
};
