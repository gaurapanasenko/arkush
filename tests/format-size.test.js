import { describe, expect, it } from "vitest";
import { DPI, formatSize, printSizeMm, toPx } from "../src/arkush/static/js/pure/format-size.js";

describe("formatSize", () => {
  it("returns A4 at 300 DPI", () => {
    const [w, h] = formatSize("a4");
    expect(w).toBe(Math.floor(210 / 25.4 * DPI));
    expect(h).toBe(Math.floor(297 / 25.4 * DPI));
  });

  it("returns Letter at 300 DPI", () => {
    const [w, h] = formatSize("letter");
    expect(w).toBe(Math.floor(8.5 * DPI));
    expect(h).toBe(Math.floor(11 * DPI));
  });

  it("returns null for none", () => {
    expect(formatSize("none")).toBeNull();
  });

  it("supports custom mm", () => {
    const [w, h] = formatSize("custom", 100, 200, "mm");
    expect(w).toBe(toPx(100, "mm"));
    expect(h).toBe(toPx(200, "mm"));
  });

  it("supports custom inches", () => {
    const [w, h] = formatSize("custom", 4, 6, "in");
    expect(w).toBe(4 * DPI);
    expect(h).toBe(6 * DPI);
  });
});

describe("printSizeMm", () => {
  it("returns fixed sizes for a4 and letter", () => {
    expect(printSizeMm("a4", 100, 100)).toEqual({ w: 210, h: 297 });
    expect(printSizeMm("letter", 100, 100)).toEqual({ w: 215.9, h: 279.4 });
  });

  it("derives from pixels for other formats", () => {
    const mm = printSizeMm("none", 300, 600);
    expect(mm.w).toBeCloseTo(25.4, 1);
    expect(mm.h).toBeCloseTo(50.8, 1);
  });
});
