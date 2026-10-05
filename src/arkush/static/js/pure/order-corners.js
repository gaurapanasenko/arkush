/** Order points: top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts) {
  const s = pts.map(p => p[0] + p[1]);
  const d = pts.map(p => p[1] - p[0]);
  const minS = s.indexOf(Math.min(...s));
  const maxS = s.indexOf(Math.max(...s));
  const minD = d.indexOf(Math.min(...d));
  const maxD = d.indexOf(Math.max(...d));
  return [pts[minS], pts[minD], pts[maxS], pts[maxD]];
}
