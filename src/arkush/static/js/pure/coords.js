export function toDisplayCorner(x, y, displayScale, edgePadding) {
  return [x * displayScale + edgePadding, y * displayScale + edgePadding];
}

export function fromDisplayCorner(cx, cy, displayScale, edgePadding) {
  return [(cx - edgePadding) / displayScale, (cy - edgePadding) / displayScale];
}

export function paddingInOriginal(displayPad, displayScale) {
  return Math.round(displayPad / displayScale);
}
