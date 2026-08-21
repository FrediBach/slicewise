import { describe, expect, it } from "vitest";
import { computeContours } from "./contour-engine";
import { sphereDemo, vertexNormals, weld } from "./mesh";

const makeMesh = () => {
  const normalized = weld(sphereDemo("ripple", 24, 12));
  return { ...normalized, N: vertexNormals(normalized.V, normalized.T) };
};

const settings = {
  az: 35,
  el: 24,
  roll: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  lens: "clean",
  lensAmount: 100,
  lines: 8,
  gapEase: "linear",
  easeStrength: 100,
  easeCycles: 1,
  easeCenter: 50,
  quality: 3,
  axis: "up",
  cutAz: 0,
  cutEl: 90,
  spiral: false,
  hide: true,
  sil: true,
  sw: 0.35,
  color: "#15181a",
  backgroundColor: "#ffffff",
  gradientEnabled: false,
  gradientColors: 3,
  gradientStops: [
    { position: 0, color: "#ef4444" },
    { position: 1, color: "#3b82f6" },
  ],
  pw: 120,
  ph: 100,
  margin: 10,
  bg: true,
  halftone: false,
  halftoneSize: 2.4,
  halftoneContrast: 75,
  halftoneCycles: 2,
  chroma: false,
  chromaAmount: 1.5,
  humanizer: false,
  humanizerAmount: 30,
  blueprint: false,
  blueprintStyle: "blue",
  documentTitle: "test sphere",
  morphEnabled: false,
  morphSteps: 3,
  morphTargets: {},
  morphSecondEnabled: false,
  morphStepsY: 2,
  morphTargets2: {},
};

describe("computeContours", () => {
  it("turns a normalized mesh into finite SVG and grouped toolpaths", () => {
    const result = computeContours(makeMesh(), settings, false);

    expect(result.svg).toMatch(/^<svg[^>]+width="120mm" height="100mm"/);
    expect(result.svg).toContain("<path");
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    expect(result.paths).toBeGreaterThan(0);
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.toolpaths.length).toBeGreaterThan(0);
    expect(result.bytes).toBe(new TextEncoder().encode(result.svg).byteLength);
  });

  it("renders every requested morph step into labeled SVG groups", () => {
    const result = computeContours(makeMesh(), {
      ...settings,
      hide: false,
      morphEnabled: true,
      morphTargets: { az: 90, color: "#ff0000" },
    }, true);

    expect(result.svg).toContain('data-morph-x-step="1"');
    expect(result.svg).toContain('data-morph-x-step="3"');
    expect(result.svg.match(/data-morph-x-step=/g)).toHaveLength(3);
    expect(result.paths).toBeGreaterThan(0);
  });
});
