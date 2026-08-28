import { type ContourToolpathGroup } from './contour-engine';
import { generateGCode } from './gcode';

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
  gcodeProfile: string;
  clipToArtboard: boolean;
  optimizeTravel: boolean;
  mergeTolerance: number;
  kaleidoscope: boolean;
  halftone: boolean;
  chroma: boolean;
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

export function createGCodeExport(state: ExportState): string {
  const isUunaTek = state.gcodeProfile === 'uunatek3';
  return generateGCode(
    state.toolpaths,
    { width: state.pw, height: state.ph },
    {
      name: state.name,
      drawFeed: state.drawFeed,
      travelFeed: state.travelFeed,
      penUp: state.penUp,
      penDown: state.penDown,
      zFeed: state.zFeed,
      machine: isUunaTek ? 'UUNA TEK 3.0 A3' : 'Generic Z-axis plotter',
      origin: isUunaTek ? 'rear-left' : 'bottom-left',
      clipToArtboard: state.clipToArtboard,
      optimizeTravel: state.optimizeTravel,
      mergeTolerance: state.mergeTolerance,
      effects: {
        kaleidoscope: state.kaleidoscope,
        halftone: state.halftone,
        chroma: state.chroma,
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
    },
  );
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
