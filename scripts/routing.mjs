/**
 * Orthogonal routing for dependency arrows. Pure geometry: rectangles are
 * {left, top, right, bottom} in board coordinates.
 */

const EPS = 1;

function cx(r) {
  return (r.left + r.right) / 2;
}

function verticalBlocked(x, y1, y2, rects, skip) {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  return rects.some(r => !skip.includes(r) && x >= r.left - EPS && x <= r.right + EPS
    && r.bottom > lo + EPS && r.top < hi - EPS);
}

function horizontalBlocked(y, x1, x2, rects, skip) {
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  return rects.some(r => !skip.includes(r) && y >= r.top - EPS && y <= r.bottom + EPS
    && r.right > lo + EPS && r.left < hi - EPS);
}

function pathFrom(points) {
  return points.map(([x, y], i) => `${i ? "L" : "M"} ${Math.round(x)} ${Math.round(y)}`).join(" ");
}

/**
 * Route an arrow from prerequisite `s` to dependent `t`.
 * @param {object} s       Source rectangle
 * @param {object} t       Target rectangle
 * @param {object[]} rects All node rectangles (used to avoid drawing through nodes)
 * @param {{gapX:number, gapY:number}} gaps Spacing between grid cells
 * @returns {string} SVG path data
 */
export function routeEdge(s, t, rects, { gapX, gapY }) {
  const skip = [s, t];
  const sx = cx(s);
  const tx = cx(t);

  // Same row, side by side: short horizontal link.
  if (Math.abs(s.top - t.top) < EPS) {
    const leftToRight = tx > sx;
    const x1 = leftToRight ? s.right : s.left;
    const x2 = leftToRight ? t.left : t.right;
    const y = (s.top + s.bottom) / 2;
    if (!horizontalBlocked(y, x1, x2, rects, skip)) return pathFrom([[x1, y], [x2, y]]);
  }

  // Target below source: drop into the channel just above the target row.
  if (t.top >= s.bottom - EPS) {
    const sy = s.bottom;
    const ty = t.top;
    const channelY = ty - gapY / 2;
    if (Math.abs(sx - tx) < EPS && !verticalBlocked(sx, sy, ty, rects, skip)) {
      return pathFrom([[sx, sy], [tx, ty]]);
    }
    if (!verticalBlocked(sx, sy, channelY, rects, skip)) {
      return pathFrom([[sx, sy], [sx, channelY], [tx, channelY], [tx, ty]]);
    }
    // Something sits directly below the source: detour through a column gutter.
    const firstY = sy + gapY / 2;
    const gx = tx >= sx ? s.right + gapX / 2 : s.left - gapX / 2;
    return pathFrom([[sx, sy], [sx, firstY], [gx, firstY], [gx, channelY], [tx, channelY], [tx, ty]]);
  }

  // Target above or beside the source: loop underneath both and enter from below.
  const belowY = Math.max(s.bottom, t.bottom) + gapY / 2;
  return pathFrom([[sx, s.bottom], [sx, belowY], [tx, belowY], [tx, t.bottom]]);
}
