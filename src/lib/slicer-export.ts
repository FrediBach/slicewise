import { type ContourToolpathGroup } from './contour-engine';
import type { UunaExpressiveMotion } from './gcode-3d-toolpaths';
import { generateGCode } from './gcode';
import { resolveGCodeMachineLayout, type GCodeLayoutRotation } from './gcode-layout';
import { resolveGCodeProfile } from './gcode-profiles';
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
      ? { kind: 'coordinated-xyz', contactZ: state.uunaExpressiveMotion.contactZ }
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
  return {
    content,
    rotation: layout.rotation,
    sheet: layout.sheet,
    sourceSheet: layout.sourceSheet,
    validation: validateGCode(content, {
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
            contactZ: state.uunaExpressiveMotion.contactZ,
            zConvention: profile.capabilities.zConvention,
          }
        : undefined,
    }),
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
