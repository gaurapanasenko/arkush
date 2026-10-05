/** Percentile on raw byte values (e.g. grayscale pixels). */
export function percentile(data, p) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  const target = Math.floor(data.length * p / 100);
  let cum = 0;
  for (let v = 0; v < 256; v++) {
    cum += hist[v];
    if (cum > target) return v;
  }
  return 255;
}
