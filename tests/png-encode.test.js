import { describe, expect, it } from "vitest";
import {
  buildPaletteFromBgr,
  ihdrColorType,
  ihdrData,
  packScanlines,
} from "../src/arkush/static/js/pure/png-encode.js";

describe("pngEncode", () => {
  it("sets IHDR color types", () => {
    expect(ihdrColorType(ihdrData(10, 20, 0))).toBe(0);
    expect(ihdrColorType(ihdrData(10, 20, 3))).toBe(3);
  });

  it("packs scanlines with filter byte", () => {
    const flat = new Uint8Array([1, 2, 3, 4]);
    const packed = packScanlines(flat, 2, 1);
    expect(packed).toEqual(new Uint8Array([0, 1, 2, 0, 3, 4]));
  });

  it("builds palette indices", () => {
    const data = new Uint8Array([255, 0, 0, 0, 255, 0]);
    const { indices, palette } = buildPaletteFromBgr(data, 2);
    expect(palette.length).toBe(2);
    expect(indices[0]).toBe(0);
    expect(indices[1]).toBe(1);
  });
});
