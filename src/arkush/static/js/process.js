/** Perspective warp, filters — port of process.py */
"use strict";

const DPI = 300;
const FORMATS = {
  a4: [Math.floor(210 / 25.4 * DPI), Math.floor(297 / 25.4 * DPI)],
  letter: [Math.floor(8.5 * DPI), Math.floor(11 * DPI)],
};

class ProcessingCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "ProcessingCancelled";
  }
}

function toPx(size, unit) {
  return unit === "in" ? Math.floor(size * DPI) : Math.floor(size / 25.4 * DPI);
}

function formatSize(fmt, width, height, unit) {
  if (fmt === "none") return null;
  if (fmt === "custom" && width && height) return [toPx(width, unit), toPx(height, unit)];
  return FORMATS[fmt] || null;
}

function detectAutoLevels(img, clip = 0.005) {
  const gray = new cv.Mat();
  cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);
  let lo = percentile(gray, clip * 100);
  let hi = percentile(gray, (1 - clip) * 100);
  gray.delete();
  lo = Math.max(0, Math.min(254, lo));
  hi = Math.max(lo + 1, Math.min(255, hi));
  return [lo, hi];
}

function autoLevels(img, low, high) {
  low = Math.max(0, Math.min(254, low));
  high = Math.max(low + 1, Math.min(255, high));
  const span = high - low;
  const out = new cv.Mat();
  img.convertTo(out, cv.CV_32FC3);
  const data = out.data32F;
  const ch = out.channels();
  const n = out.rows * out.cols;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const idx = i * ch + c;
      let v = (data[idx] - low) / span * 255;
      data[idx] = Math.max(0, Math.min(255, v));
    }
  }
  const result = new cv.Mat();
  out.convertTo(result, cv.CV_8UC3);
  out.delete();
  return result;
}

function gaussianSigma(radius) {
  const k = radius * 2 + 1;
  return 0.3 * ((k - 1) * 0.5 - 1) + 0.8;
}

function fastGaussian(img, sigma, targetSigma = 20.0, minDim = 400) {
  if (sigma <= 0) return matClone(img);
  const oh = img.rows;
  const ow = img.cols;
  if (sigma <= targetSigma) {
    const out = new cv.Mat();
    cv.GaussianBlur(img, out, new cv.Size(0, 0), sigma, sigma);
    return out;
  }
  let factor = sigma / targetSigma;
  factor = Math.min(factor, ow / minDim, oh / minDim);
  factor = Math.max(factor, 1.0);
  if (factor <= 1.0) {
    const out = new cv.Mat();
    cv.GaussianBlur(img, out, new cv.Size(0, 0), sigma, sigma);
    return out;
  }
  const nw = Math.max(1, Math.round(ow / factor));
  const nh = Math.max(1, Math.round(oh / factor));
  const work = new cv.Mat();
  cv.resize(img, work, new cv.Size(nw, nh), 0, 0, cv.INTER_AREA);
  const blurred = new cv.Mat();
  cv.GaussianBlur(work, blurred, new cv.Size(0, 0), sigma / factor, sigma / factor);
  const out = new cv.Mat();
  cv.resize(blurred, out, new cv.Size(ow, oh), 0, 0, cv.INTER_LINEAR);
  work.delete();
  blurred.delete();
  return out;
}

function blurChannel(img, blur, radius) {
  if (blur === "median") {
    const k = Math.max(3, Math.min((radius * 2 + 1) | 1, 15));
    const u8 = new cv.Mat();
    if (img.type() === cv.CV_32FC1 || img.type() === cv.CV_32F) {
      img.convertTo(u8, cv.CV_8U);
    } else {
      img.copyTo(u8);
    }
    const out = new cv.Mat();
    cv.medianBlur(u8, out, k);
    u8.delete();
    const f32 = new cv.Mat();
    out.convertTo(f32, cv.CV_32F);
    out.delete();
    return f32;
  }
  const f32 = new cv.Mat();
  if (img.channels() === 1) {
    img.convertTo(f32, cv.CV_32F);
  } else {
    img.copyTo(f32);
  }
  const blurred = fastGaussian(f32, gaussianSigma(radius));
  f32.delete();
  return blurred;
}

function divideBg(img, blur, radius, gain) {
  radius = Math.max(1, Math.min(450, radius));
  gain = Math.max(1, Math.min(255, gain));
  const f = new cv.Mat();
  img.convertTo(f, cv.CV_32FC3);
  const gray = new cv.Mat();
  cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);
  const grayF = new cv.Mat();
  gray.convertTo(grayF, cv.CV_32F);
  gray.delete();
  const blurred = blurChannel(grayF, blur, radius);
  grayF.delete();
  const out = new cv.Mat();
  out.create(img.rows, img.cols, cv.CV_8UC3);
  const fd = f.data32F;
  const bd = blurred.data32F;
  const od = out.data;
  const n = img.rows * img.cols;
  for (let i = 0; i < n; i++) {
    const b = bd[i] + 1.0;
    for (let c = 0; c < 3; c++) {
      const v = (fd[i * 3 + c] / b) * gain;
      od[i * 3 + c] = Math.max(0, Math.min(255, v));
    }
  }
  f.delete();
  blurred.delete();
  return out;
}

function blurImg(img, blur, radius) {
  radius = Math.max(1, Math.min(450, radius));
  const f = new cv.Mat();
  img.convertTo(f, cv.CV_32FC3);
  const blurred = blurChannel(f, blur, radius);
  f.delete();
  const out = new cv.Mat();
  blurred.convertTo(out, cv.CV_8UC3);
  blurred.delete();
  return out;
}

function unsharp(img, radius, amount) {
  radius = Math.max(1, Math.min(50, radius));
  const amountF = Math.max(1, Math.min(300, amount)) / 100.0;
  const blurred = new cv.Mat();
  cv.GaussianBlur(img, blurred, new cv.Size(0, 0), radius, radius);
  const out = new cv.Mat();
  cv.addWeighted(img, 1 + amountF, blurred, -amountF, 0, out, cv.CV_8U);
  blurred.delete();
  return out;
}

function toGrayscale(img) {
  const gray = new cv.Mat();
  cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);
  const out = new cv.Mat();
  cv.cvtColor(gray, out, cv.COLOR_GRAY2BGR);
  gray.delete();
  return out;
}

function quantize(img, colors) {
  // ponytail: std opencv.js has no kmeans — per-channel binning (~∛colors levels)
  const levels = levelsForColors(colors);
  const out = matClone(img);
  const d = out.data;
  const scale = 255 / (levels - 1);
  for (let i = 0; i < d.length; i++) {
    d[i] = Math.min(255, Math.round(Math.round(d[i] / scale) * scale));
  }
  return out;
}

function levelsForColors(colors) {
  return Math.max(2, Math.ceil(Math.cbrt(Math.max(2, Math.min(256, colors)))));
}

function applyFilter(img, filt) {
  switch (filt.type) {
    case "auto_levels":
      return autoLevels(img, filt.low ?? 0, filt.high ?? 255);
    case "divide_bg":
      return divideBg(img, filt.blur ?? "gaussian", filt.radius ?? 30, filt.gain ?? 255);
    case "blur":
      return blurImg(img, filt.blur ?? "gaussian", filt.radius ?? 5);
    case "unsharp":
      return unsharp(img, filt.radius ?? 2, filt.amount ?? 100);
    case "grayscale":
      return toGrayscale(img);
    case "quantize":
      return quantize(img, filt.colors ?? 16);
    default:
      return matClone(img);
  }
}

function edgePad(img, px) {
  px = Math.max(0, px | 0);
  if (px === 0) return matClone(img);
  const h = img.rows;
  const w = img.cols;
  const ch = img.channels();
  const out = new cv.Mat();
  cv.copyMakeBorder(img, out, px, px, px, px, cv.BORDER_REPLICATE);
  return out;
}

function warp(img, corners, outSize) {
  const src = cornersToMat(corners);
  let ow, oh;
  if (!outSize) {
    const c = corners;
    const w1 = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]);
    const w2 = Math.hypot(c[2][0] - c[3][0], c[2][1] - c[3][1]);
    const h1 = Math.hypot(c[3][0] - c[0][0], c[3][1] - c[0][1]);
    const h2 = Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]);
    ow = Math.floor(Math.max(w1, w2));
    oh = Math.floor(Math.max(h1, h2));
  } else {
    [ow, oh] = outSize;
  }
  const dstData = new Float32Array([0, 0, ow - 1, 0, ow - 1, oh - 1, 0, oh - 1]);
  const dst = cv.matFromArray(4, 1, cv.CV_32FC2, dstData);
  const m = cv.getPerspectiveTransform(src, dst);
  const out = new cv.Mat();
  cv.warpPerspective(img, out, m, new cv.Size(ow, oh));
  src.delete();
  dst.delete();
  m.delete();
  return out;
}

function processImage(img, corners, fmt, filters, padding, cancelled, customWidth, customHeight, customUnit) {
  if (cancelled && cancelled()) throw new ProcessingCancelled();

  let work = img;
  let workOwned = false;
  let pts = corners.map(c => [...c]);

  if (padding > 0) {
    work = edgePad(img, padding);
    workOwned = true;
    pts = pts.map(([x, y]) => [x + padding, y + padding]);
  }

  const outSize = formatSize(fmt, customWidth, customHeight, customUnit);
  let result = warp(work, pts, outSize);
  if (workOwned) work.delete();

  for (const filt of filters) {
    if (cancelled && cancelled()) {
      result.delete();
      throw new ProcessingCancelled();
    }
    const next = applyFilter(result, filt);
    if (next !== result) result.delete();
    result = next;
  }
  return result;
}

function downscaleForPreview(img, maxDim = 1200) {
  const m = Math.max(img.rows, img.cols);
  if (m <= maxDim) return matClone(img);
  const scale = maxDim / m;
  const out = new cv.Mat();
  cv.resize(img, out, new cv.Size(0, 0), scale, scale, cv.INTER_AREA);
  return out;
}

function detectLevelsPipeline(img, corners, fmt, filters, padding, customWidth, customHeight, customUnit) {
  let work = img;
  let workOwned = false;
  let pts = corners.map(c => [...c]);
  if (padding > 0) {
    work = edgePad(img, padding);
    workOwned = true;
    pts = pts.map(([x, y]) => [x + padding, y + padding]);
  }
  const outSize = formatSize(fmt, customWidth, customHeight, customUnit);
  let warped = warp(work, pts, outSize);
  if (workOwned) work.delete();
  for (const filt of filters) {
    const next = applyFilter(warped, filt);
    if (next !== warped) warped.delete();
    warped = next;
  }
  const levels = detectAutoLevels(warped);
  warped.delete();
  return levels;
}
