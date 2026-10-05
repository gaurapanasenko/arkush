export function ihdrColorType(data) {
  return data[9];
}

export function ihdrData(width, height, colorType) {
  const d = new Uint8Array(13);
  const v = new DataView(d.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  d[8] = 8;
  d[9] = colorType;
  return d;
}

export function packScanlines(flat, width, bpp) {
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

export function buildPaletteFromBgr(data, pixelCount) {
  const map = new Map();
  const palette = [];
  const indices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const b = data[i * 3];
    const g = data[i * 3 + 1];
    const r = data[i * 3 + 2];
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
