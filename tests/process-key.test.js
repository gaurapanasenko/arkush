import { describe, expect, it } from "vitest";
import { processKey } from "../src/arkush/static/js/pure/process-key.js";

describe("processKey", () => {
  it("is stable for same payload", async () => {
    const payload = { c: [[0, 0]], f: "a4", filters: [], p: 0 };
    expect(await processKey(payload)).toBe(await processKey(payload));
  });

  it("differs when corners change", async () => {
    const a = await processKey({ c: [[0, 0]], f: "a4", filters: [], p: 0 });
    const b = await processKey({ c: [[1, 0]], f: "a4", filters: [], p: 0 });
    expect(a).not.toBe(b);
  });
});
