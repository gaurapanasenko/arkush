/** Manual PNG encoder (gray / indexed). RGB still uses canvas in encode.js */
"use strict";

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function pngCrc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = data || new Uint8Array(0);
  const chunk = new Uint8Array(4 + 4 + body.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length);
  chunk.set(typeBytes, 4);
  if (body.length) chunk.set(body, 8);
  const crcData = new Uint8Array(4 + body.length);
  crcData.set(typeBytes);
  if (body.length) crcData.set(body, 4);
  view.setUint32(8 + body.length, pngCrc32(crcData));
  return chunk;
}

function ihdrData(width, height, colorType) {
  const d = new Uint8Array(13);
  const v = new DataView(d.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  d[8] = 8;
  d[9] = colorType;
  return d;
}

function concatChunks(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function packScanlines(flat, width, bpp) {
  const rowBytes = width * bpp;
  const rows = Math.floor(flat.length / rowBytes);
  const out = new Uint8Array(rows * (rowBytes + 1));
  let o = 0;
  for (let y = 0; y < rows; y++) {
    out[o++] = 0;
    out.set(flat.subarray(y * rowBytes, (y + 1) * rowBytes), o);
    o += rowBytes;
  }
  return out;
}

async function zlibDeflate(data) {
  const cs = new CompressionStream("deflate");
  const w = cs.writable.getWriter();
  w.write(data);
  w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

function buildPalette(mat) {
  const d = mat.data;
  const n = mat.rows * mat.cols;
  const map = new Map();
  const palette = [];
  const indices = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const b = d[i * 3];
    const g = d[i * 3 + 1];
    const r = d[i * 3 + 2];
    const key = (r << 16) | (g << 8) | b;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = palette.length;
      map.set(key, idx);
      palette.push([r, g, b]);
    }
    indices[i] = idx;
  }
  return { indices, palette };
}

function plteChunk(palette) {
  const data = new Uint8Array(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    data[i * 3] = palette[i][0];
    data[i * 3 + 1] = palette[i][1];
    data[i * 3 + 2] = palette[i][2];
  }
  return pngChunk("PLTE", data);
}

async function pngEncodeRaw(width, height, colorType, flat, bpp, metaChunks, preIdat) {
  const packed = packScanlines(flat, width, bpp);
  const idat = pngChunk("IDAT", await zlibDeflate(packed));
  return concatChunks([
    PNG_SIG,
    pngChunk("IHDR", ihdrData(width, height, colorType)),
    ...metaChunks,
    ...preIdat,
    idat,
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

async function pngEncodeGray(grayData, width, height, metaChunks) {
  return pngEncodeRaw(width, height, 0, grayData, 1, metaChunks, []);
}

async function pngEncodeIndexed(indices, palette, width, height, metaChunks) {
  return pngEncodeRaw(width, height, 3, indices, 1, metaChunks, [plteChunk(palette)]);
}
