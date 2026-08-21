import { describe, expect, it } from "vitest";
import { contourSettings, makeContourMesh } from "../test/fixtures/contours";
import { computeContours } from "./contour-engine";

describe("computeContours", () => {
  it("turns a normalized mesh into finite SVG and grouped toolpaths", () => {
    const result = computeContours(makeContourMesh(), contourSettings, false);

    expect(result.svg).toMatch(/^<svg[^>]+width="120mm" height="100mm"/);
    expect(result.svg).toContain("<path");
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    expect(result.paths).toBeGreaterThan(0);
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.toolpaths.length).toBeGreaterThan(0);
    expect(result.bytes).toBe(new TextEncoder().encode(result.svg).byteLength);
  });

  it("renders every requested morph step into labeled SVG groups", () => {
    const result = computeContours(makeContourMesh(), {
      ...contourSettings,
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
