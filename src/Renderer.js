import { getSelectionBounds } from './SelectionEngine.js';

/**
 * Draw a smooth uniform-width stroke using quadratic bezier curves.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./types.js').Stroke} stroke
 */
function drawStrokeShape(ctx, stroke, inverseScale = 1) {
  const { color, width, points } = stroke;
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * inverseScale;
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

function drawStroke(ctx, stroke, inverseScale = 1) {
  const { tool } = stroke;
  if (tool === 'clear') { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); return; }
  if (tool === 'erase') return;
  drawStrokeShape(ctx, stroke, inverseScale);
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
        ctx.save();
        const isSelected = state.selection && state.selection.strokeIds.includes(stroke.id);
        
        let inverseScale = 1;
        if (isSelected && state.selection.transform) {
           const { dx, dy, scaleX, scaleY, originX, originY } = state.selection.transform;
           ctx.translate(originX + dx, originY + dy);
           ctx.scale(scaleX, scaleY);
           ctx.translate(-originX, -originY);
           if (scaleX !== 0) inverseScale = 1 / Math.abs(scaleX);
        }

        if (isSelected) {
           // Highlight slightly
           ctx.shadowColor = 'rgba(139, 92, 246, 0.4)';
           ctx.shadowBlur = 4 / zoom;
        }

        drawStroke(ctx, stroke, inverseScale);
        ctx.restore();
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
        } else if (state.activeStroke.tool === 'lasso') {
          ctx.save();
          const pts = state.activeStroke.points;
          if (pts.length > 0) {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            if (pts.length > 1) ctx.closePath();

            if (pts.length >= 3) {
              ctx.fillStyle = 'rgba(139, 92, 246, 0.08)';
              ctx.fill();
            }

            ctx.strokeStyle = state.activeStroke.color;
            ctx.lineWidth = state.activeStroke.width / zoom;
            ctx.setLineDash([6 / zoom, 4 / zoom]);
            ctx.stroke();
          }
          ctx.restore();
        } else {
          drawStrokeShape(ctx, state.activeStroke);
        }
      }

      // Draw bounding box if selection exists
      const bounds = getSelectionBounds(state);
      if (bounds) {
         ctx.save();
         const t = state.selection.transform;
         if (t) {
            ctx.translate(t.originX + t.dx, t.originY + t.dy);
            ctx.scale(t.scaleX, t.scaleY);
            ctx.translate(-t.originX, -t.originY);
         }
         
         const { minX, minY, maxX, maxY } = bounds;
         const p = 5 / zoom; // padding
         
         ctx.strokeStyle = '#8b5cf6';
         ctx.lineWidth = 1.5 / zoom;
         ctx.setLineDash([4 / zoom, 4 / zoom]);
         ctx.strokeRect(minX - p, minY - p, (maxX - minX) + p*2, (maxY - minY) + p*2);
         
         // handles
         ctx.setLineDash([]);
         ctx.fillStyle = '#fff';
         const hr = 4 / zoom;
         const handles = [
            [minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]
         ];
         for (const [hx, hy] of handles) {
            ctx.beginPath();
            ctx.arc(hx, hy, hr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
         }

         const midX = (minX + maxX) / 2;
         const midY = (minY + maxY) / 2;
         const edgeHandles = [
            [midX, minY],   // top
            [maxX, midY],   // right
            [midX, maxY],   // bottom
            [minX, midY],   // left
         ];
         for (const [hx, hy] of edgeHandles) {
            ctx.beginPath();
            ctx.rect(hx - hr, hy - hr, hr * 2, hr * 2);
            ctx.fill();
            ctx.stroke();
         }
         ctx.restore();
      }
    },
  };
}
