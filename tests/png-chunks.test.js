import { describe, expect, it } from "vitest";
import { insertPngChunks, pngPhysChunk } from "../src/arkush/static/js/pure/png-chunks.js";

describe("pngPhysChunk", () => {
  it("encodes 300 DPI as pixels per meter", () => {
    const chunk = pngPhysChunk(300);
    expect(chunk[4]).toBe(0x70); // pHYs
    const ppm = new DataView(chunk.buffer, chunk.byteOffset + 8).getUint32(0);
    expect(ppm).toBe(Math.round(300 / 0.0254));
  });
});

describe("insertPngChunks", () => {
  it("inserts after IHDR", () => {
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = new Uint8Array(25);
    ihdr.set([0, 0, 0, 13, 73, 72, 68, 82], 0);
    const phys = pngPhysChunk(300);
    const out = insertPngChunks(new Uint8Array([...sig, ...ihdr]), [phys]);
    expect(out.length).toBe(sig.length + ihdr.length + phys.length);
    const typeOff = sig.length + ihdr.length + 4;
    expect(String.fromCharCode(out[typeOff], out[typeOff + 1], out[typeOff + 2], out[typeOff + 3])).toBe("pHYs");
  });
});
