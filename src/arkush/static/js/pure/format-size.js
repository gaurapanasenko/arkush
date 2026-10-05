export const DPI = 300;

export const FORMATS = {
  a4: [Math.floor(210 / 25.4 * DPI), Math.floor(297 / 25.4 * DPI)],
  letter: [Math.floor(8.5 * DPI), Math.floor(11 * DPI)],
};

export function toPx(size, unit) {
  return unit === "in" ? Math.floor(size * DPI) : Math.floor(size / 25.4 * DPI);
}

export function formatSize(fmt, width, height, unit = "mm") {
  if (fmt === "none") return null;
  if (fmt === "custom" && width && height) return [toPx(width, unit), toPx(height, unit)];
  return FORMATS[fmt] || null;
}

export function printSizeMm(pageFmt, widthPx, heightPx) {
  if (pageFmt === "a4") return { w: 210, h: 297 };
  if (pageFmt === "letter") return { w: 215.9, h: 279.4 };
  return { w: widthPx / DPI * 25.4, h: heightPx / DPI * 25.4 };
}
