/** PNG/JPEG export with 300 DPI metadata — port of encode_image */
"use strict";

const ENC_DPI = 300;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const len = data ? data.length : 0;
  const chunk = new Uint8Array(4 + 4 + len + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, len);
  chunk.set(typeBytes, 4);
  if (data) chunk.set(data, 8);
  const crcData = new Uint8Array(4 + len);
  crcData.set(typeBytes);
  if (data) crcData.set(data, 4);
  view.setUint32(8 + len, crc32(crcData));
  return chunk;
}

function pngPhysChunk(dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  view.setUint32(0, ppm);
  view.setUint32(4, ppm);
  data[8] = 1;
  return pngChunk("pHYs", data);
}

function pngTextChunk(key, value) {
  const keyBytes = new TextEncoder().encode(key);
  const valBytes = new TextEncoder().encode(value);
  const data = new Uint8Array(keyBytes.length + 1 + valBytes.length);
  data.set(keyBytes);
  data[keyBytes.length] = 0;
  data.set(valBytes, keyBytes.length + 1);
  return pngChunk("tEXt", data);
}

function insertPngChunks(pngBytes, extraChunks) {
  const sigLen = 8;
  let pos = sigLen;
  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  const len = view.getUint32(pos);
  pos += 4 + 4 + len + 4; // skip IHDR
  const before = pngBytes.slice(0, pos);
  const after = pngBytes.slice(pos);
  const parts = [before];
  for (const ch of extraChunks) parts.push(ch);
  parts.push(after);
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function printSizeMm(pageFmt, img) {
  if (pageFmt === "a4") return { w: 210, h: 297 };
  if (pageFmt === "letter") return { w: 215.9, h: 279.4 };
  return { w: img.cols / ENC_DPI * 25.4, h: img.rows / ENC_DPI * 25.4 };
}

async function matToPngBytes(mat) {
  const rgba = new cv.Mat();
  cv.cvtColor(mat, rgba, cv.COLOR_BGR2RGBA);
  const canvas = new OffscreenCanvas(rgba.cols, rgba.rows);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows),
    0, 0,
  );
  rgba.delete();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

async function encodePng(mat, pageFmt, pngMode, pngColors) {
  const mm = printSizeMm(pageFmt, mat);
  const meta = [
    pngPhysChunk(ENC_DPI),
    pngTextChunk("dpi", String(ENC_DPI)),
    pngTextChunk("print_size_mm", `${mm.w.toFixed(1)}x${mm.h.toFixed(1)}`),
  ];

  if (pngMode === "grayscale") {
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_BGR2GRAY);
    const bytes = await pngEncodeGray(gray.data, gray.cols, gray.rows, meta);
    gray.delete();
    return bytes;
  }

  if (pngMode === "indexed") {
    const q = quantize(mat, pngColors);
    const { indices, palette } = buildPalette(q);
    const bytes = await pngEncodeIndexed(indices, palette, q.cols, q.rows, meta);
    q.delete();
    return bytes;
  }

  return insertPngChunks(await matToPngBytes(mat), meta);
}

async function encodeJpeg(mat, quality) {
  return matToCanvasBlob(mat, "image/jpeg", quality);
}

async function encodeImage(mat, pageFmt, opts) {
  const {
    file_format = "jpeg",
    png_mode = "rgb",
    png_colors = 256,
    jpeg_quality = 65,
  } = opts;

  if (file_format === "jpeg") {
    return { bytes: await encodeJpeg(mat, jpeg_quality), mime: "image/jpeg" };
  }
  return {
    bytes: await encodePng(mat, pageFmt, png_mode, png_colors),
    mime: "image/png",
  };
}
