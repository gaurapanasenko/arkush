import { describe, expect, it } from "vitest";
import {
  fromDisplayCorner,
  paddingInOriginal,
  toDisplayCorner,
} from "../src/arkush/static/js/pure/coords.js";

describe("coords", () => {
  it("roundtrips display ↔ original", () => {
    const scale = 0.5;
    const pad = 10;
    const orig = [400, 300];
    const disp = toDisplayCorner(...orig, scale, pad);
    expect(fromDisplayCorner(...disp, scale, pad)).toEqual(orig);
  });

  it("converts edge padding to original pixels", () => {
    expect(paddingInOriginal(50, 0.5)).toBe(100);
  });

  it("roundtrips corners placed in the padding band", () => {
    const scale = 0.5;
    const pad = 20;
    const orig = [-10, -5];
    expect(fromDisplayCorner(...toDisplayCorner(...orig, scale, pad), scale, pad)).toEqual(orig);
  });
});
