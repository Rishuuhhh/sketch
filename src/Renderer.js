/** @import { AppState, Stroke } from './types.js' */

// ── Smooth variable-width stroke rendering ────────────────────────────────────
// Builds a single closed outline path for the entire stroke using quadratic
// bezier curves through the midpoints of adjacent segments.  This gives smooth
// joins with no visible dots or gaps regardless of direction changes.

/**
 * Compute perpendicular offset points for a segment direction.
 */
function perpPts(nx, ny, cx, cy, r) {
  return [
    { x: cx - ny * r, y: cy + nx * r },
    { x: cx + ny * r, y: cy - nx * r },
  ];
}

/**
 * Apply pressure curve — maps raw 0-1 pressure to a more expressive range.
 * Power < 1 boosts low-pressure sensitivity (light touch = noticeably thin).
 */
function mapPressure(p) {
  return Math.pow(Math.max(0.01, Math.min(1, p ?? 0.5)), 0.7);
}

/**
 * Draw a smooth pressure-sensitive stroke as a single filled outline.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./types.js').Stroke} stroke
 */
function drawVariableStroke(ctx, stroke) {
  const { color, width, points } = stroke;
  if (points.length === 0) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalCompositeOperation = 'source-over';

  if (points.length === 1) {
    const r = Math.max(0.5, (width / 2) * mapPressure(points[0].pressure));
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Build per-segment data: direction normals and radii at each point
  const n = points.length;
  const segs = []; // { nx, ny, len } for each segment i→i+1

  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy);
    segs.push(len > 0 ? { nx: dx / len, ny: dy / len, len } : { nx: 1, ny: 0, len: 0 });
  }

  // Per-point averaged normal (average of adjacent segment normals)
  const normals = [];
  for (let i = 0; i < n; i++) {
    let nx, ny;
    if (i === 0) {
      nx = segs[0].nx; ny = segs[0].ny;
    } else if (i === n - 1) {
      nx = segs[n - 2].nx; ny = segs[n - 2].ny;
    } else {
      // Average the two adjacent segment directions
      nx = segs[i - 1].nx + segs[i].nx;
      ny = segs[i - 1].ny + segs[i].ny;
      const l = Math.hypot(nx, ny);
      if (l > 0) { nx /= l; ny /= l; } else { nx = segs[i].nx; ny = segs[i].ny; }
    }
    normals.push({ nx, ny });
  }

  // Compute left/right outline points at each input point
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const r = Math.max(0.5, (width / 2) * mapPressure(points[i].pressure));
    const { nx, ny } = normals[i];
    left.push({ x: points[i].x - ny * r, y: points[i].y + nx * r });
    right.push({ x: points[i].x + ny * r, y: points[i].y - nx * r });
  }

  // Draw the outline as a smooth bezier path through midpoints
  ctx.beginPath();

  // Helper: draw a smooth open curve through an array of points
  function smoothCurve(pts, moveTo) {
    if (pts.length === 1) {
      if (moveTo) ctx.moveTo(pts[0].x, pts[0].y);
      else ctx.lineTo(pts[0].x, pts[0].y);
      return;
    }
    if (moveTo) ctx.moveTo(pts[0].x, pts[0].y);
    else ctx.lineTo(pts[0].x, pts[0].y);

    for (let i = 0; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    // Last point
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  }

  // Left side forward, round end cap, right side backward, round start cap
  smoothCurve(left, true);

  // Round end cap
  const endPt = points[n - 1];
  const endR = Math.max(0.5, (width / 2) * mapPressure(points[n - 1].pressure));
  const endNorm = normals[n - 1];
  ctx.arcTo(
    endPt.x + endNorm.nx * endR, endPt.y + endNorm.ny * endR,
    right[n - 1].x, right[n - 1].y,
    endR
  );

  smoothCurve([...right].reverse(), false);

  // Round start cap
  const startPt = points[0];
  const startR = Math.max(0.5, (width / 2) * mapPressure(points[0].pressure));
  const startNorm = normals[0];
  ctx.arcTo(
    startPt.x - startNorm.nx * startR, startPt.y - startNorm.ny * startR,
    left[0].x, left[0].y,
    startR
  );

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Sentinel / eraser drawing ─────────────────────────────────────────────────

function drawStroke(ctx, stroke) {
  const { tool } = stroke;
  if (tool === 'clear') { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); return; }
  if (tool === 'erase') return;
  drawVariableStroke(ctx, stroke);
}

// ── Renderer factory ──────────────────────────────────────────────────────────

export function createRenderer(canvas, viewport) {
  const ctx = canvas.getContext('2d');

  return {
    render(state) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (viewport) viewport.applyToContext(ctx);

      for (const stroke of state.strokes) {
        drawStroke(ctx, stroke);
      }

      if (state.activeStroke !== null) {
        if (state.activeStroke.tool === 'eraser') {
          const pts = state.activeStroke.points;
          const last = pts[pts.length - 1];
          const zoom = viewport ? viewport.zoom : 1;
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.65)';
          ctx.lineWidth = 1.5 / zoom;
          ctx.setLineDash([4 / zoom, 3 / zoom]);
          ctx.beginPath();
          ctx.arc(last.x, last.y, state.activeStroke.width / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else {
          drawVariableStroke(ctx, state.activeStroke);
        }
      }
    },
  };
}
