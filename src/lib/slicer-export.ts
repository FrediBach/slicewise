import { type ContourToolpathGroup } from './contour-engine';
import type { UunaExpressiveMotion } from './gcode-3d-toolpaths';
import { createUunaCalibrationOperations, UUNA_CALIBRATION_SHEET } from './gcode-calibration';
import { generateGCode } from './gcode';
import { resolveGCodeMachineLayout, type GCodeLayoutRotation } from './gcode-layout';
import { resolveGCodeProfile } from './gcode-profiles';
import { analyzeBroadNibSpacing, type BroadNibSpacingAnalysis } from './gcode-nib-footprint';
import { validateGCode, type GCodeValidationResult } from './gcode-validation';

export interface ExportState {
  toolpaths: ContourToolpathGroup[];
  pw: number;
  ph: number;
  name: string;
  drawFeed: number;
  travelFeed: number;
  penUp: number;
  penDown: number;
  zFeed: number;
  uunaExpressiveMotion: UunaExpressiveMotion;
  gcodeProfile: string;
  gcodeAutoRotate: boolean;
  clipToArtboard: boolean;
  optimizeTravel: boolean;
  mergeTolerance: number;
  kaleidoscope: boolean;
  halftone: boolean;
  chroma: boolean;
  misregistration: boolean;
  humanizer: boolean;
  yarnCurl: boolean;
  blueprint: boolean;
  topographicMap: boolean;
  vectorZoom1Enabled?: boolean;
  vectorZoom2Enabled?: boolean;
  vectorZoom3Enabled?: boolean;
  vectorZoom4Enabled?: boolean;
  exportFormat: string;
  svg: string;
}

export type CurrentExport = {
  content: string;
  extension: 'svg' | 'gcode';
  type: 'image/svg+xml' | 'text/x-gcode';
};

export type GCodeExportPreflight = {
  content: string;
  rotation: GCodeLayoutRotation;
  sheet: { width: number; height: number };
  sourceSheet: { width: number; height: number };
  validation: GCodeValidationResult;
  expressiveMotion: UunaExpressiveMotion | null;
  broadNibSpacing: BroadNibSpacingAnalysis | null;
};

export function createGCodeExportPreflight(state: ExportState): GCodeExportPreflight {
  const profile = resolveGCodeProfile(state.gcodeProfile);
  const expressiveMotionEnabled =
    state.uunaExpressiveMotion.enabled && profile.capabilities.coordinatedXYZ;
  const layout = resolveGCodeMachineLayout(
    state.toolpaths,
    { width: state.pw, height: state.ph },
    profile.workingArea,
    state.gcodeAutoRotate,
  );
  const expressiveMotion = expressiveMotionEnabled
    ? {
        ...state.uunaExpressiveMotion,
        tiltDirection:
          (state.uunaExpressiveMotion.tiltDirection +
            (layout.rotation === 'clockwise-90' ? 90 : 0)) %
          360,
      }
    : null;
  const content = generateGCode(layout.groups, layout.sheet, {
    name: state.name,
    drawFeed: state.drawFeed,
    travelFeed: state.travelFeed,
    penUp: state.penUp,
    penDown: state.penDown,
    zFeed: state.zFeed,
    machine: profile.machine,
    origin: profile.origin,
    layout:
      layout.rotation === 'clockwise-90'
        ? {
            rotation: layout.rotation,
            sourceWidth: layout.sourceSheet.width,
            sourceHeight: layout.sourceSheet.height,
          }
        : undefined,
    clipToArtboard: state.clipToArtboard,
    optimizeTravel: state.optimizeTravel,
    mergeTolerance: state.mergeTolerance,
    motion: expressiveMotionEnabled
      ? { kind: 'coordinated-xyz', settings: expressiveMotion! }
      : undefined,
    effects: {
      kaleidoscope: state.kaleidoscope,
      halftone: state.halftone,
      chroma: state.chroma,
      misregistration: state.misregistration,
      humanizer: state.humanizer,
      yarnCurl: state.yarnCurl,
      blueprint: state.blueprint,
      topographicMap: state.topographicMap,
      vectorZoom:
        state.vectorZoom1Enabled ||
        state.vectorZoom2Enabled ||
        state.vectorZoom3Enabled ||
        state.vectorZoom4Enabled,
    },
  });
  const validation = validateGCode(content, {
    width: layout.sheet.width,
    height: layout.sheet.height,
    penUp: state.penUp,
    penDown: state.penDown,
    drawFeed: state.drawFeed,
    travelFeed: state.travelFeed,
    zFeed: state.zFeed,
    machineWidth: profile.workingArea?.width,
    machineHeight: profile.workingArea?.height,
    motion: expressiveMotionEnabled
      ? {
          kind: 'coordinated-xyz',
          contactZ: expressiveMotion!.contactZ,
          maximumPressDepth: expressiveMotion!.maximumPressDepth,
          mode: expressiveMotion!.mode,
          penAngle: expressiveMotion!.penAngle,
          tiltDirection: expressiveMotion!.tiltDirection,
          tipCompensation: expressiveMotion!.tipCompensation,
          zConvention: profile.capabilities.zConvention,
        }
      : undefined,
  });
  const broadNibSpacing =
    expressiveMotion && expressiveMotion.nibWidth > 0
      ? analyzeBroadNibSpacing(layout.groups, expressiveMotion.nibWidth)
      : null;
  if (broadNibSpacing?.nearbyRunPairs) {
    const warning = {
      severity: 'warning' as const,
      code: 'broad-nib-spacing',
      line: 0,
      message: `${broadNibSpacing.nearbyRunPairs} stroke pair${broadNibSpacing.nearbyRunPairs === 1 ? '' : 's'} may merge with a ${expressiveMotion!.nibWidth} mm nib.`,
    };
    validation.issues.push(warning);
    validation.warnings.push(warning);
  }
  return {
    content,
    rotation: layout.rotation,
    sheet: layout.sheet,
    sourceSheet: layout.sourceSheet,
    expressiveMotion,
    broadNibSpacing,
    validation,
  };
}

export function createGCodeExport(state: ExportState): string {
  const preflight = createGCodeExportPreflight(state);
  const firstError = preflight.validation.errors[0];
  if (firstError)
    throw new Error(
      `G-code preflight failed${firstError.line ? ` on line ${firstError.line}` : ''}: ${firstError.message}`,
    );
  return preflight.content;
}

export type UunaCalibrationExport = {
  content: string;
  sheet: typeof UUNA_CALIBRATION_SHEET;
  validation: GCodeValidationResult;
};

export function createUunaCalibrationExport(state: ExportState): UunaCalibrationExport {
  const profile = resolveGCodeProfile(state.gcodeProfile);
  if (!profile.capabilities.coordinatedXYZ)
    throw new Error('Select a UUNA TEK profile before exporting 3-axis calibration G-code.');
  const settings = { ...state.uunaExpressiveMotion, enabled: true, mode: 'tapered' as const };
  const operations = createUunaCalibrationOperations(state.penUp, settings);
  const content = generateGCode([], UUNA_CALIBRATION_SHEET, {
    name: 'UUNA TEK 3-axis calibration',
    machine: profile.machine,
    origin: profile.origin,
    drawFeed: state.drawFeed,
    travelFeed: state.travelFeed,
    penUp: state.penUp,
    penDown: state.penDown,
    zFeed: state.zFeed,
    clipToArtboard: false,
    optimizeTravel: false,
    comments: [
      'Calibration: contact ladder at left; angle-offset crosses at upper-right; taper fan below',
      'Calibration required: run pen-free first and begin with zero maximum press depth',
    ],
    motion: { kind: 'coordinated-xyz', settings, operations },
  });
  const validation = validateGCode(content, {
    width: UUNA_CALIBRATION_SHEET.width,
    height: UUNA_CALIBRATION_SHEET.height,
    machineWidth: profile.workingArea?.width,
    machineHeight: profile.workingArea?.height,
    penUp: state.penUp,
    penDown: state.penDown,
    drawFeed: state.drawFeed,
    travelFeed: state.travelFeed,
    zFeed: state.zFeed,
    motion: {
      kind: 'coordinated-xyz',
      contactZ: settings.contactZ,
      maximumPressDepth: settings.maximumPressDepth,
      mode: settings.mode,
      penAngle: settings.penAngle,
      tiltDirection: settings.tiltDirection,
      tipCompensation: settings.tipCompensation,
      zConvention: profile.capabilities.zConvention,
    },
  });
  const firstError = validation.errors[0];
  if (firstError)
    throw new Error(
      `Calibration preflight failed${firstError.line ? ` on line ${firstError.line}` : ''}: ${firstError.message}`,
    );
  return { content, sheet: UUNA_CALIBRATION_SHEET, validation };
}

export function createCurrentExport(state: ExportState): CurrentExport {
  if (state.exportFormat === 'gcode') {
    return {
      content: createGCodeExport(state),
      extension: 'gcode',
      type: 'text/x-gcode',
    };
  }
  return { content: state.svg, extension: 'svg', type: 'image/svg+xml' };
}

export function createExportFilename(name: string, extension: CurrentExport['extension']): string {
  const base =
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-|-$/g, '') || 'contours';
  return `${base}-contours.${extension}`;
}
