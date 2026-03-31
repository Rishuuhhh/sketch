/** @import { AppState, Stroke } from './types.js' */

/**
 * Draw a smooth uniform-width stroke using quadratic bezier curves.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./types.js').Stroke} stroke
 */
function drawStrokeShape(ctx, stroke, zoom = 1) {
  const { color, width, points } = stroke;
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width / zoom;  // compensate for viewport zoom
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';

  ctx.beginPath();

  if (points.length === 1) {
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.stroke();
  ctx.restore();
}

function drawStroke(ctx, stroke, zoom) {
  const { tool } = stroke;
  if (tool === 'clear') { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); return; }
  if (tool === 'erase') return;
  drawStrokeShape(ctx, stroke, zoom);
}

export function createRenderer(canvas, viewport) {
  const ctx = canvas.getContext('2d');

  return {
    render(state) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (viewport) viewport.applyToContext(ctx);
      const zoom = viewport ? viewport.zoom : 1;

      for (const stroke of state.strokes) {
        drawStroke(ctx, stroke, zoom);
      }

      if (state.activeStroke !== null) {
        if (state.activeStroke.tool === 'eraser') {
          const pts = state.activeStroke.points;
          const last = pts[pts.length - 1];
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.65)';
          ctx.lineWidth = 1.5 / zoom;
          ctx.setLineDash([4 / zoom, 3 / zoom]);
          ctx.beginPath();
          ctx.arc(last.x, last.y, state.activeStroke.width / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else {
          drawStrokeShape(ctx, state.activeStroke, zoom);
        }
      }
    },
  };
}
