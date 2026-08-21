import { describe, expect, it } from "vitest";
import { contrastRatio, createColorPair, oklchToHex, parseColor } from "./colorPair";

describe("colour pairing", () => {
  it("is reproducible for a seed", () => {
    expect(createColorPair({ seed: 42 })).toEqual(createColorPair({ seed: 42 }));
    expect(createColorPair({ seed: 42 })).not.toEqual(createColorPair({ seed: 43 }));
  });

  it("preserves a supplied base colour and generates a contrasting partner", () => {
    const pair = createColorPair({ color: "#336699", seed: 7, minContrast: 4.5 });

    expect(pair.a.hex).toBe("#336699");
    expect(pair.contrast).toBeGreaterThanOrEqual(4.5);
    expect(pair.lightnessDiff).toBeGreaterThan(0);
  });

  it("accepts shorthand hex and rejects malformed colours", () => {
    const parsed = parseColor("#abc");

    expect(oklchToHex(parsed)).toBe("#aabbcc");
    expect(() => parseColor("not-a-colour")).toThrow(/Bad color/);
  });

  it("computes WCAG contrast symmetrically", () => {
    const black = parseColor("#000000");
    const white = parseColor("#ffffff");

    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
  });
});
