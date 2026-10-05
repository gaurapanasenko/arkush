import { describe, expect, it } from "vitest";
import { gaussianSigma } from "../src/arkush/static/js/pure/gaussian-sigma.js";

describe("gaussianSigma", () => {
  it("grows with radius", () => {
    expect(gaussianSigma(30)).toBeCloseTo(9.5, 1);
    expect(gaussianSigma(30)).toBeGreaterThan(gaussianSigma(5));
  });
});
