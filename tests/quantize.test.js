import { describe, expect, it } from "vitest";
import { levelsForColors, quantizeChannelValue } from "../src/arkush/static/js/pure/quantize.js";

describe("quantize", () => {
  it("reduces distinct levels", () => {
    const levels = levelsForColors(16);
    expect(levels).toBe(3);
    expect(quantizeChannelValue(127, levels)).not.toBe(127);
    expect(quantizeChannelValue(0, levels)).toBe(0);
    expect(quantizeChannelValue(255, levels)).toBe(255);
  });
});
