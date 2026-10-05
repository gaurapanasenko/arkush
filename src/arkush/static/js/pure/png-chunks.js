export function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return ~c >>> 0;
}

export function pngChunk(type, data) {
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

export function pngPhysChunk(dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  view.setUint32(0, ppm);
  view.setUint32(4, ppm);
  data[8] = 1;
  return pngChunk("pHYs", data);
}

export function insertPngChunks(pngBytes, extraChunks) {
  const sigLen = 8;
  let pos = sigLen;
  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  const len = view.getUint32(pos);
  pos += 4 + 4 + len + 4;
  const before = pngBytes.slice(0, pos);
  const after = pngBytes.slice(pos);
  const parts = [before, ...extraChunks, after];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
