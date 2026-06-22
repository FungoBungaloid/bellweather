// interpolate.js — Inverse Distance Weighting onto a regular grid.
// Chosen over kriging: a few lines, deterministic, and explainable
// ("nearby cities pull the value toward them").

// points: [{x, y, value}] in PIXEL space (already projected).
// Returns a flat Float64Array of length gx*gy, row-major (d3.contours layout).
export function idwGrid(points, width, height, gx, gy, power = 2) {
  const grid = new Float64Array(gx * gy);
  const cw = width / gx;
  const ch = height / gy;
  for (let j = 0; j < gy; j++) {
    const py = (j + 0.5) * ch;
    for (let i = 0; i < gx; i++) {
      const px = (i + 0.5) * cw;
      let num = 0;
      let den = 0;
      let hit = null;
      for (let k = 0; k < points.length; k++) {
        const p = points[k];
        const dx = px - p.x;
        const dy = py - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) {
          hit = p.value;
          break;
        }
        const w = 1 / Math.pow(d2, power / 2);
        num += w * p.value;
        den += w;
      }
      grid[j * gx + i] = hit !== null ? hit : num / den;
    }
  }
  return grid;
}
