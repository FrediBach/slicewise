import { describe, expect, it } from "vitest";
import { generateGCode, type ToolpathGroup } from "./gcode";

const group = (runs: number[][]): ToolpathGroup => ({
  color: "#123456",
  label: "contours",
  runs,
});

describe("generateGCode", () => {
  it("converts SVG coordinates to a bottom-left machine origin", () => {
    const output = generateGCode([group([[10, 20, 30, 40]])], { width: 200, height: 100 });

    expect(output).toContain("; Origin: bottom-left of sheet; +X right; +Y up");
    expect(output).toContain("G0 X30 Y60 F3000");
    expect(output).toContain("G1 X10 Y80 F1200");
  });

  it("preserves Y coordinates for the rear-left plotter origin", () => {
    const output = generateGCode(
      [group([[10, 20, 30, 40]])],
      { width: 200, height: 100 },
      { origin: "rear-left", drawFeed: 2400, travelFeed: 4800 },
    );

    expect(output).toContain("; Origin: rear-left of sheet; +X right; +Y toward front");
    expect(output).toContain("G0 X10 Y20 F4800");
    expect(output).toContain("G1 X30 Y40 F2400");
  });

  it("orders runs from the nearest endpoint and requests pen changes", () => {
    const output = generateGCode(
      [
        group([[100, 100, 110, 100], [10, 0, 1, 0]]),
        { color: "#abcdef", label: "outline", runs: [[5, 5, 6, 6]] },
      ],
      { width: 120, height: 120 },
      { origin: "rear-left" },
    );

    const firstMove = output.split("\n").find(line => line.startsWith("G0 X"));
    expect(firstMove).toBe("G0 X1 Y0 F3000");
    expect(output).toContain("M0 ; change pen to #abcdef");
  });

  it("drops unusable paths and sanitizes user text in comments", () => {
    const output = generateGCode(
      [{ color: "black", label: "empty", runs: [[1, 2], [Number.NaN, 0, 2, 2]] }],
      { width: -1, height: Number.NaN },
      { name: "study (draft)\n2", machine: "plotter (A)" },
    );

    expect(output).toContain("; Source: study  draft  2");
    expect(output).toContain("; Machine: plotter  A");
    expect(output).toContain("; Sheet: 210 x 210 mm");
    expect(output).not.toContain("; Tool 1:");
  });
});
