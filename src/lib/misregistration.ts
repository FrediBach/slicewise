export type MisregistrationScope = 'contours' | 'all';

export interface MisregistrationSettings {
  misregistration: boolean;
  misregistrationCopies: number;
  misregistrationOffset: number;
  misregistrationRotation: number;
  misregistrationScope: MisregistrationScope | string;
  misregistrationColor1: string;
  misregistrationColor2: string;
  misregistrationColor3: string;
}

export interface MisregistrationGroup {
  color: string;
  label: string;
  runs: number[][];
}

const DEFAULT_COLORS = ['#00a7e1', '#ec008c', '#ffd400'] as const;
const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

function validColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : fallback;
}

function transformRun(
  run: readonly number[],
  centerX: number,
  centerY: number,
  dx: number,
  dy: number,
  rotation: number,
): number[] {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const transformed: number[] = [];
  for (let index = 0; index + 1 < run.length; index += 2) {
    const x = run[index] - centerX;
    const y = run[index + 1] - centerY;
    transformed.push(centerX + x * cosine - y * sine + dx, centerY + x * sine + y * cosine + dy);
  }
  return transformed;
}

/** Create deterministic physical registration copies around the artboard centre. */
export function createMisregistrationGroups(
  runs: readonly number[][],
  settings: MisregistrationSettings,
  artboardWidth: number,
  artboardHeight: number,
): MisregistrationGroup[] {
  if (!settings.misregistration || !runs.length || artboardWidth <= 0 || artboardHeight <= 0)
    return [];
  const copies = clamp(Math.round(Number(settings.misregistrationCopies) || 0), 1, 3);
  const offset = clamp(Number(settings.misregistrationOffset) || 0, 0, 20);
  const maximumRotation =
    (clamp(Number(settings.misregistrationRotation) || 0, 0, 5) * Math.PI) / 180;
  const colors = [
    validColor(settings.misregistrationColor1, DEFAULT_COLORS[0]),
    validColor(settings.misregistrationColor2, DEFAULT_COLORS[1]),
    validColor(settings.misregistrationColor3, DEFAULT_COLORS[2]),
  ];
  const centerX = artboardWidth / 2;
  const centerY = artboardHeight / 2;
  const groups: MisregistrationGroup[] = [];

  for (let index = 0; index < copies; index++) {
    const angle = copies === 1 ? 0 : (index / copies) * Math.PI * 2;
    const rotationFactor = copies === 1 ? 1 : (index / (copies - 1)) * 2 - 1;
    const dx = Math.cos(angle) * offset;
    const dy = Math.sin(angle) * offset;
    const rotation = maximumRotation * rotationFactor;
    groups.push({
      color: colors[index],
      label: `misregistration copy ${index + 1}`,
      runs: runs.map((run) => transformRun(run, centerX, centerY, dx, dy, rotation)),
    });
  }
  return groups;
}
