export function gaussianSigma(radius) {
  const k = radius * 2 + 1;
  return 0.3 * ((k - 1) * 0.5 - 1) + 0.8;
}
