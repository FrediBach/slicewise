import { describe, expect, it } from 'vitest';
import { defaultUunaExpressiveMotion } from './gcode-3d-toolpaths';
import { generateGCode, type ToolpathGroup } from './gcode';

const group = (runs: number[][]): ToolpathGroup => ({
  color: '#123456',
  label: 'contours',
  runs,
});

describe('generateGCode', () => {
  it('converts SVG coordinates to a bottom-left machine origin', () => {
    const output = generateGCode([group([[10, 20, 30, 40]])], { width: 200, height: 100 });

    expect(output).toContain('; Origin: bottom-left of sheet; +X right; +Y up');
    expect(output).toContain('G0 X30 Y60 F3000');
    expect(output).toContain('G1 X10 Y80 F1200');
  });

  it('preserves Y coordinates for the rear-left plotter origin', () => {
    const output = generateGCode(
      [group([[10, 20, 30, 40]])],
      { width: 200, height: 100 },
      { origin: 'rear-left', drawFeed: 2400, travelFeed: 4800 },
    );

    expect(output).toContain('; Origin: rear-left of sheet; +X right; +Y toward front');
    expect(output).toContain('G0 X10 Y20 F4800');
    expect(output).toContain('G1 X30 Y40 F2400');
  });

  it('orders runs from the nearest endpoint and requests pen changes', () => {
    const output = generateGCode(
      [
        group([
          [100, 100, 110, 100],
          [10, 0, 1, 0],
        ]),
        { color: '#abcdef', label: 'outline', runs: [[5, 5, 6, 6]] },
      ],
      { width: 120, height: 120 },
      { origin: 'rear-left' },
    );

    const firstMove = output.split('\n').find((line) => line.startsWith('G0 X'));
    expect(firstMove).toBe('G0 X1 Y0 F3000');
    expect(output).toContain('M0 ; change pen to #abcdef');
  });

  it('drops unusable paths and sanitizes user text in comments', () => {
    const output = generateGCode(
      [
        {
          color: 'black',
          label: 'empty',
          runs: [
            [1, 2],
            [Number.NaN, 0, 2, 2],
          ],
        },
      ],
      { width: -1, height: Number.NaN },
      { name: 'study (draft)\n2', machine: 'plotter (A)' },
    );

    expect(output).toContain('; Source: study  draft  2');
    expect(output).toContain('; Machine: plotter  A');
    expect(output).toContain('; Sheet: 210 x 210 mm');
    expect(output).not.toContain('; Tool 1:');
  });

  it('deduplicates near-identical points and clamps numeric precision', () => {
    const output = generateGCode(
      [group([[0, 0, 0.0001, 0.0001, 1.23456, 2.34567]])],
      { width: 10, height: 10 },
      { origin: 'rear-left' },
    );

    expect(output).toContain('G0 X0 Y0 F3000');
    expect(output).toContain('G1 X1.235 Y2.346 F1200');
    expect(output).not.toContain('0.0001');
  });

  it('emits configured machine motion and effect notes', () => {
    const output = generateGCode(
      [group([[0, 0, 1, 1]])],
      { width: 10, height: 10 },
      {
        penUp: 3.25,
        penDown: -2.5,
        zFeed: 900,
        machine: 'UUNA TEK',
        layout: { rotation: 'clockwise-90', sourceWidth: 297, sourceHeight: 420 },
        effects: {
          kaleidoscope: true,
          halftone: true,
          chroma: true,
          misregistration: true,
          humanizer: true,
          blueprint: true,
          topographicMap: true,
          vectorZoom: true,
        },
      },
    );

    expect(output).toContain('G1 Z3.25 F900 ; pen up');
    expect(output).toContain('G1 Z-2.5 F900 ; pen down');
    expect(output).toContain('Kaleidoscope: mirrored radial geometry is included');
    expect(output).toContain('SVG dash styling is exported as continuous plotter paths');
    expect(output).toContain('chromatic SVG offsets are exported as one base contour set');
    expect(output).toContain('offset colour copies are included as physical pen groups');
    expect(output).toContain('Humanizer: hand-drawn variations are included');
    expect(output).toContain('blueprint border and annotations are SVG-only');
    expect(output).toContain('Topographic map: elevation labels, locations, and map symbols');
    expect(output).toContain('Vector zoom: enlarged detail, borders, and dashed leaders');
    expect(output).toContain('Layout: rotated 90 degrees clockwise from 297 x 420 mm canvas');
  });

  it('always returns controller setup and shutdown for an empty drawing', () => {
    const output = generateGCode([], {}, {});

    expect(output).toContain('G21 ; millimetres');
    expect(output).toContain('G90 ; absolute positioning');
    expect(output).toContain('G0 X0 Y0 F3000');
    expect(output.endsWith('M2\n')).toBe(true);
  });

  it('keeps the legacy serializer byte-identical when binary motion is explicit', () => {
    const groups = [group([[1, 2, 3, 4]])];
    const sheet = { width: 10, height: 10 };

    expect(
      generateGCode(groups, sheet, { origin: 'rear-left', motion: { kind: 'binary-z' } }),
    ).toBe(generateGCode(groups, sheet, { origin: 'rear-left' }));
  });

  it('serializes constant-contact strokes as coordinated XYZ motion', () => {
    const output = generateGCode(
      [group([[1, 2, 3, 4]])],
      { width: 10, height: 10 },
      {
        origin: 'rear-left',
        penUp: 0,
        penDown: -3,
        zFeed: 2000,
        drawFeed: 3000,
        motion: {
          kind: 'coordinated-xyz',
          settings: { ...defaultUunaExpressiveMotion(-2.5), enabled: true },
        },
      },
    );

    expect(output).toContain('; Motion: coordinated XYZ · constant contact');
    expect(output).toContain('G0 X1 Y2 F3000');
    expect(output).toContain('G1 Z-2.5 F2000 ; pen contact');
    expect(output).toContain('G1 X3 Y4 Z-2.5 F3000');
    expect(output).toContain('G1 Z0 F2000 ; pen up');
  });

  it('serializes tapered pressure and fixed-angle setup metadata', () => {
    const settings = {
      ...defaultUunaExpressiveMotion(-3),
      enabled: true,
      mode: 'tapered' as const,
      maximumPressDepth: 1,
      penAngle: 45,
      tiltDirection: 30,
    };
    const output = generateGCode(
      [group([[10, 10, 20, 10]])],
      { width: 30, height: 30 },
      {
        origin: 'rear-left',
        penUp: 0,
        motion: { kind: 'coordinated-xyz', settings },
      },
    );

    expect(output).toContain('; Motion: coordinated XYZ · tapered pressure');
    expect(output).toContain('; Pen angle: 45 degrees above paper; set holder manually');
    expect(output).toContain('; Pen tilt direction: 30 degrees in machine coordinates');
    expect(output).toContain('; Tip offset compensation: enabled');
    expect(output).toContain('; Pressure ramps: 2 mm lead-in; 2 mm lead-out');
    expect(output).toMatch(/G1 X\S+ Y\S+ Z-4 F1200/);
  });

  it('clips unsafe moves and joins nearby runs before plotting', () => {
    const output = generateGCode(
      [
        group([
          [-5, 5, 5, 5],
          [5.1, 5, 15, 5],
        ]),
      ],
      { width: 10, height: 10 },
      { origin: 'rear-left', mergeTolerance: 0.15 },
    );

    expect(output).toContain('; Artboard clipping: enabled');
    expect(output).toContain('; Optimized pen-up travel:');
    expect(output.match(/; pen down/g)).toHaveLength(1);
    expect(output).not.toMatch(/X-5|X15/);
  });

  it('records modulation and stroke-direction setup in expressive metadata', () => {
    const output = generateGCode(
      [group([[0, 0, 8, 0]])],
      { width: 10, height: 10 },
      {
        origin: 'rear-left',
        motion: {
          kind: 'coordinated-xyz',
          settings: {
            ...defaultUunaExpressiveMotion(),
            mode: 'modulated',
            modulationDepth: 0.5,
            modulationPeriod: 8,
            modulationPhase: 90,
          },
        },
      },
    );

    expect(output).toContain('arc-length pressure modulation');
    expect(output).toContain('Pressure modulation: 50% depth; 8 mm wavelength; 90 degrees phase');
    expect(output).toContain('Stroke direction: preserved');
  });
});
