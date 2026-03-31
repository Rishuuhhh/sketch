/** @import { AppState, Stroke } from './types.js' */

// ── Variable-width stroke rendering ──────────────────────────────────────────
// Each segment between two points is drawn as a filled trapezoid whose end
// widths are derived from the per-point pressure values.  Adjacent segments
// share endpoints so the path is seamless.

/**
 * Returns the two perpendicular offset points for a segment endpoint.
 * @param {number} dx @param {number} dy  — normalised direction
 * @param {number} cx @param {number} cy  — centre point
 * @param {number} r                      — half-width (radius)
 */
function perp(dx, dy, cx, cy, r) {
  return [
    { x: cx - dy * r, y: cy + dx * r },
    { x: cx + dy * r, y: cy - dx * r },
  ];
}

/**
 * Draw a pressure-sensitive stroke as a series of filled trapezoids.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Stroke} stroke
 */
function drawVariableStroke(ctx, stroke) {
  const { color, width, points } = stroke;
  if (points.length === 0) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalCompositeOperation = 'source-over';

  if (points.length === 1) {
    // Single dot
    const r = Math.max(0.5, (width / 2) * points[0].pressure);
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Draw each segment as a filled quad
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const nx = dx / len, ny = dy / len;

    const rA = Math.max(0.5, (width / 2) * (a.pressure ?? 0.5));
    const rB = Math.max(0.5, (width / 2) * (b.pressure ?? 0.5));

    const [aL, aR] = perp(nx, ny, a.x, a.y, rA);
    const [bL, bR] = perp(nx, ny, b.x, b.y, rB);

    ctx.beginPath();
    ctx.moveTo(aL.x, aL.y);
    ctx.lineTo(bL.x, bL.y);
    ctx.lineTo(bR.x, bR.y);
    ctx.lineTo(aR.x, aR.y);
    ctx.closePath();
    ctx.fill();

    // Round caps at each joint to avoid gaps between segments
    ctx.beginPath();
    ctx.arc(b.x, b.y, rB, 0, Math.PI * 2);
    ctx.fill();
  }

  // Round cap at the very start
  const r0 = Math.max(0.5, (width / 2) * (points[0].pressure ?? 0.5));
  ctx.beginPath();
  ctx.arc(points[0].x, points[0].y, r0, 0, Math.PI * 2);
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
      // Clear in screen space
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply viewport transform — everything below is in world space
      if (viewport) viewport.applyToContext(ctx);

      for (const stroke of state.strokes) {
        drawStroke(ctx, stroke);
      }

      if (state.activeStroke !== null) {
        if (state.activeStroke.tool === 'eraser') {
          // Dashed circle cursor — drawn in world space, radius scaled by zoom
          const pts = state.activeStroke.points;
          const last = pts[pts.length - 1];
          const zoom = viewport ? viewport.zoom : 1;
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.65)';
          ctx.lineWidth = 1.5 / zoom;          // keep visual thickness constant
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
