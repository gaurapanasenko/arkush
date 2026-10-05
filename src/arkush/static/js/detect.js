/** Document corner detection — port of detect.py */
"use strict";

const MAX_DIM = 2000;

function orderCorners(pts) {
  const s = pts.map(p => p[0] + p[1]);
  const d = pts.map(p => p[1] - p[0]);
  const minS = s.indexOf(Math.min(...s));
  const maxS = s.indexOf(Math.max(...s));
  const minD = d.indexOf(Math.min(...d));
  const maxD = d.indexOf(Math.max(...d));
  return [pts[minS], pts[minD], pts[maxS], pts[maxD]];
}

function findQuad(contours) {
  const limit = Math.min(10, contours.size());
  for (let i = 0; i < limit; i++) {
    const cnt = contours.get(i);
    const peri = cv.arcLength(cnt, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
    if (approx.rows === 4 && cv.contourArea(approx) > 0) {
      const pts = [];
      for (let j = 0; j < 4; j++) {
        pts.push([approx.intPtr(j, 0)[0], approx.intPtr(j, 0)[1]]);
      }
      approx.delete();
      return orderCorners(pts);
    }
    approx.delete();
  }
  return null;
}

function findCorners(img) {
  const h = img.rows;
  const w = img.cols;
  const scale = Math.min(1.0, MAX_DIM / Math.max(h, w));

  let work = img;
  let workOwned = false;
  if (scale < 1.0) {
    work = new cv.Mat();
    const sz = new cv.Size(Math.round(w * scale), Math.round(h * scale));
    cv.resize(img, work, sz, 0, 0, cv.INTER_AREA);
    workOwned = true;
  }

  const gray = new cv.Mat();
  cv.cvtColor(work, gray, cv.COLOR_BGR2GRAY);
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  const edges = new cv.Mat();
  cv.Canny(blurred, edges, 50, 150);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  let corners = findQuad(contours);
  if (!corners) {
    const wh = work.rows;
    const ww = work.cols;
    corners = [[0, 0], [ww - 1, 0], [ww - 1, wh - 1], [0, wh - 1]];
  }

  if (scale < 1.0) {
    corners = corners.map(([x, y]) => [x / scale, y / scale]);
  }

  gray.delete();
  blurred.delete();
  edges.delete();
  contours.delete();
  hierarchy.delete();
  if (workOwned) work.delete();

  return { corners, scale };
}

function displayImage(img, scale) {
  if (scale >= 1.0) return matClone(img);
  const out = new cv.Mat();
  const sz = new cv.Size(Math.round(img.cols * scale), Math.round(img.rows * scale));
  cv.resize(img, out, sz, 0, 0, cv.INTER_AREA);
  return out;
}
