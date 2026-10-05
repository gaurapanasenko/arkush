export function levelsForColors(colors) {
  return Math.max(2, Math.ceil(Math.cbrt(Math.max(2, Math.min(256, colors)))));
}

export function quantizeChannelValue(value, levels) {
  const scale = 255 / (levels - 1);
  return Math.min(255, Math.round(Math.round(value / scale) * scale));
}
