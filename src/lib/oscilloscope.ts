export type OscilloscopeRun = number[];

export interface OscilloscopeSettings {
  oscilloscopeSpacing: number;
  oscilloscopeIntensity: number;
}

export interface OscilloscopeEffect {
  frame: OscilloscopeRun;
  scanlines: OscilloscopeRun[];
  echoes: OscilloscopeRun[];
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  value < minimum ? minimum : value > maximum ? maximum : value;

function roundedRectangle(x: number, y: number, width: number, height: number): OscilloscopeRun {
  const radius = Math.min(12, width * 0.08, height * 0.08);
  const run: OscilloscopeRun = [];
  const corners: ReadonlyArray<[number, number, number]> = [
    [x + width - radius, y + radius, -Math.PI / 2],
    [x + width - radius, y + height - radius, 0],
    [x + radius, y + height - radius, Math.PI / 2],
    [x + radius, y + radius, Math.PI],
  ];
  const samples = 8;
  for (const [cx, cy, start] of corners)
    for (let sample = 0; sample <= samples; sample++) {
      const angle = start + (sample / samples) * (Math.PI / 2);
      run.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    }
  run.push(run[0], run[1]);
  return run;
}

function signalColumns(
  runs: readonly OscilloscopeRun[],
  left: number,
  right: number,
  sampleStep: number,
): number[][] {
  const columnCount = Math.max(2, Math.ceil((right - left) / sampleStep) + 1);
  const columns = Array.from({ length: columnCount }, () => [] as number[]);
  for (const run of runs)
    for (let point = 2; point < run.length; point += 2) {
      const x0 = run[point - 2],
        y0 = run[point - 1],
        x1 = run[point],
        y1 = run[point + 1];
      if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
      const first = clamp(Math.floor((Math.min(x0, x1) - left) / sampleStep), 0, columnCount - 1);
      const last = clamp(Math.ceil((Math.max(x0, x1) - left) / sampleStep), 0, columnCount - 1);
      for (let column = first; column <= last; column++) {
        const x = Math.min(right, left + column * sampleStep);
        if (Math.abs(x1 - x0) < 1e-8) {
          if (Math.abs(x - x0) <= sampleStep) columns[column].push((y0 + y1) / 2);
          continue;
        }
        const t = (x - x0) / (x1 - x0);
        if (t >= 0 && t <= 1) columns[column].push(y0 + (y1 - y0) * t);
      }
    }
  return columns;
}

/**
 * Builds a CRT-like treatment entirely from finite open/closed polylines.
 * Brightness is represented by nearby echo paths and scanline displacement;
 * no raster filters, opacity tricks, or filled shapes are required.
 */
export function createOscilloscopeEffect(
  sourceRuns: readonly OscilloscopeRun[],
  width: number,
  height: number,
  margin: number,
  settings: OscilloscopeSettings,
): OscilloscopeEffect {
  const spacing = clamp(Number(settings.oscilloscopeSpacing) || 4, 1, 10);
  const intensity = clamp(Number(settings.oscilloscopeIntensity) || 0, 0, 100) / 100;
  const inset = clamp(Number(margin) || 0, 0, Math.min(width, height) / 2 - 1);
  const left = inset,
    right = Math.max(left + 2, width - inset),
    top = inset,
    bottom = Math.max(top + 2, height - inset);
  const sampleStep = clamp(spacing * 0.42, 0.7, 2);
  const columns = signalColumns(sourceRuns, left, right, sampleStep);
  const scanlines: OscilloscopeRun[] = [];
  const influenceRadius = spacing * (1.5 + intensity * 1.75);
  const displacement = spacing * intensity * 0.52;

  for (let baseY = top + spacing; baseY < bottom - spacing * 0.35; baseY += spacing) {
    const run: OscilloscopeRun = [];
    for (let column = 0; column < columns.length; column++) {
      const x = Math.min(right, left + column * sampleStep);
      let nearest = Number.POSITIVE_INFINITY;
      for (const signalY of columns[column]) {
        const delta = signalY - baseY;
        if (Math.abs(delta) < Math.abs(nearest)) nearest = delta;
      }
      let y = baseY;
      if (Number.isFinite(nearest) && Math.abs(nearest) < influenceRadius) {
        const proximity = 1 - Math.abs(nearest) / influenceRadius;
        const direction = nearest === 0 ? Math.sin(x * 0.73 + baseY) : -Math.sign(nearest);
        y += direction * displacement * proximity * proximity;
        y += Math.sin(x * 0.31 + baseY * 0.17) * spacing * intensity * proximity * 0.035;
      }
      run.push(x, clamp(y, top, bottom));
    }
    if (run.length >= 4) scanlines.push(run);
  }

  const echoes: OscilloscopeRun[] = [];
  const echoLayers = intensity <= 0 ? 0 : intensity < 0.55 ? 1 : 2;
  for (let layer = 1; layer <= echoLayers; layer++) {
    const offset = spacing * (0.16 + layer * 0.19);
    for (const source of sourceRuns) {
      if (source.length < 4) continue;
      for (const direction of [-1, 1]) {
        const echo: OscilloscopeRun = [];
        for (let point = 0; point < source.length; point += 2)
          echo.push(source[point], source[point + 1] + offset * direction);
        echoes.push(echo);
      }
    }
  }

  return {
    frame: roundedRectangle(left, top, right - left, bottom - top),
    scanlines,
    echoes,
  };
}
