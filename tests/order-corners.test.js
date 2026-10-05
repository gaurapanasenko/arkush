import { describe, expect, it } from "vitest";
import { orderCorners } from "../src/arkush/static/js/pure/order-corners.js";

describe("orderCorners", () => {
  it("orders TL, TR, BR, BL", () => {
    const pts = [[100, 0], [100, 200], [0, 200], [0, 0]];
    const ordered = orderCorners(pts);
    expect(ordered[0]).toEqual([0, 0]);
    expect(ordered[1]).toEqual([100, 0]);
    expect(ordered[2]).toEqual([100, 200]);
    expect(ordered[3]).toEqual([0, 200]);
  });
});
