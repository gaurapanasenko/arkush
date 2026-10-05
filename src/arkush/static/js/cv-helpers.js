/** OpenCV.js helpers — classic script for worker importScripts. */
"use strict";

function disposeMat(mat) {
  if (mat && !mat.isDeleted()) mat.delete();
}

async function bufferToMat(buffer) {
  const blob = new Blob([buffer]);
  const bitmap = await createImageBitmap(blob);
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, w, h);
  const rgba = cv.matFromImageData(imageData);
  const bgr = new cv.Mat();
  cv.cvtColor(rgba, bgr, cv.COLOR_RGBA2BGR);
  rgba.delete();
  if (bgr.empty()) {
    bgr.delete();
    throw new Error("Invalid image");
  }
  return bgr;
}

function matNbytes(mat) {
  return mat.rows * mat.cols * mat.channels();
}

function matToRgba(mat) {
  const rgba = new cv.Mat();
  cv.cvtColor(mat, rgba, cv.COLOR_BGR2RGBA);
  return rgba;
}

function matToImageBitmap(mat) {
  const rgba = matToRgba(mat);
  const canvas = new OffscreenCanvas(rgba.cols, rgba.rows);
  const ctx = canvas.getContext("2d");
  const imgData = new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows);
  ctx.putImageData(imgData, 0, 0);
  rgba.delete();
  return canvas.transferToImageBitmap();
}

async function matToCanvasBlob(mat, mime, quality) {
  const rgba = matToRgba(mat);
  const canvas = new OffscreenCanvas(rgba.cols, rgba.rows);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows),
    0, 0,
  );
  rgba.delete();
  const opts = { type: mime };
  if (mime === "image/jpeg" && quality != null) opts.quality = quality / 100;
  const blob = await canvas.convertToBlob(opts);
  return new Uint8Array(await blob.arrayBuffer());
}

function matClone(mat) {
  const out = new cv.Mat();
  mat.copyTo(out);
  return out;
}

function cornersFromMat(mat) {
  const pts = [];
  for (let i = 0; i < 4; i++) {
    pts.push([mat.floatAt(i, 0), mat.floatAt(i, 1)]);
  }
  return pts;
}

function cornersToMat(corners) {
  const data = new Float32Array(8);
  for (let i = 0; i < 4; i++) {
    data[i * 2] = corners[i][0];
    data[i * 2 + 1] = corners[i][1];
  }
  return cv.matFromArray(4, 1, cv.CV_32FC2, data);
}

function percentile(grayMat, p) {
  const data = grayMat.data;
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
