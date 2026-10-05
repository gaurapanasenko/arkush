import { describe, expect, it } from "vitest";
import { percentile } from "../src/arkush/static/js/pure/percentile.js";

describe("percentile", () => {
  it("picks low and high clip points", () => {
    const data = new Uint8Array([0, 0, 0, 100, 100, 100]);
    expect(percentile(data, 1)).toBe(0);
    expect(percentile(data, 90)).toBe(100);
  });

  it("is constant on uniform input", () => {
    const data = new Uint8Array(100).fill(42);
    expect(percentile(data, 0)).toBe(42);
    expect(percentile(data, 99)).toBe(42);
  });
});
