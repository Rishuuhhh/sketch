import { createPoint, createStroke } from './types.js';

export function getSelectionBounds(state) {
  if (!state.selection || state.selection.strokeIds.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const strokes = state.strokes.filter(s => state.selection.strokeIds.includes(s.id));
  if(strokes.length === 0) return null;
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (minX === Infinity) return null;
  if (minX === maxX) { minX -= 1; maxX += 1; }
  if (minY === maxY) { minY -= 1; maxY += 1; }
  return { minX, minY, maxX, maxY };
}

function pointInPolygon(point, vs) {
  let x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].x, yi = vs[i].y;
    let xj = vs[j].x, yj = vs[j].y;
    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function createSelectionEngine({ stateManager, storageService, renderer, viewport }) {
  let pendingLassoPoints = [];
  let isDragging = false;
  let dragStart = null;
  let dragMode = null; // 'translate' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se'
  let draggingAlt = false;

  function toWorld(event) {
    if (viewport) {
      const rect = event.target.getBoundingClientRect();
      return viewport.toWorld(event.clientX - rect.left, event.clientY - rect.top);
    }
    return { x: event.offsetX, y: event.offsetY };
  }

  function hitTest(pt, bounds, zoom) {
    if (!bounds) return null;
    const h = 8 / zoom; // handle size
    const p = 5 / zoom; // padding
    const { minX, minY, maxX, maxY } = bounds;
    
    if (Math.abs(pt.x - minX) < h && Math.abs(pt.y - minY) < h) return 'resize-nw';
    if (Math.abs(pt.x - maxX) < h && Math.abs(pt.y - minY) < h) return 'resize-ne';
    if (Math.abs(pt.x - minX) < h && Math.abs(pt.y - maxY) < h) return 'resize-sw';
    if (Math.abs(pt.x - maxX) < h && Math.abs(pt.y - maxY) < h) return 'resize-se';
    
    if (pt.x >= minX - p && pt.x <= maxX + p && pt.y >= minY - p && pt.y <= maxY + p) {
      return 'translate';
    }
    return null;
  }

  return {
    onPointerDown(event) {
      const state = stateManager.getState();
      const pt = toWorld(event);
      const zoom = viewport ? viewport.zoom : 1;

      const bounds = getSelectionBounds(state);
      const hit = hitTest(pt, bounds, zoom);

      if (hit) {
         isDragging = true;
         dragStart = pt;
         dragMode = hit;
         draggingAlt = event.altKey;
         if (!state.selection.transform) {
             state.selection.transform = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, originX: 0, originY: 0 };
         }
         return;
      }

      stateManager.setSelection([]);
      pendingLassoPoints = [pt];
      state.activeStroke = { tool: 'lasso', color: '#8b5cf6', width: 2, points: pendingLassoPoints };
      renderer.render(state);
    },

    onPointerMove(event) {
      const state = stateManager.getState();
      const pt = toWorld(event);

      if (isDragging) {
         if (dragMode === 'translate') {
            state.selection.transform.dx = pt.x - dragStart.x;
            state.selection.transform.dy = pt.y - dragStart.y;
         } else {
            const bounds = getSelectionBounds(state);
            let cw = bounds.maxX - bounds.minX;
            let ch = bounds.maxY - bounds.minY;
            if (cw < 1) cw = 1;
            if (ch < 1) ch = 1;
            
            let ox = bounds.minX + cw/2, oy = bounds.minY + ch/2;
            let cx = 0, cy = 0; // original corner

            if (dragMode === 'resize-nw') { ox = bounds.maxX; oy = bounds.maxY; cx = bounds.minX; cy = bounds.minY; }
            if (dragMode === 'resize-ne') { ox = bounds.minX; oy = bounds.maxY; cx = bounds.maxX; cy = bounds.minY; }
            if (dragMode === 'resize-sw') { ox = bounds.maxX; oy = bounds.minY; cx = bounds.minX; cy = bounds.maxY; }
            if (dragMode === 'resize-se') { ox = bounds.minX; oy = bounds.minY; cx = bounds.maxX; cy = bounds.maxY; }

            // Vector from origin to original corner
            const vx = cx - ox;
            const vy = cy - oy;
            const vLenSq = vx*vx + vy*vy;

            // Vector from origin to pointer
            const px = pt.x - ox;
            const py = pt.y - oy;

            // Project pointer vector onto corner vector to get uniform scale
            let s = vLenSq > 0 ? (px * vx + py * vy) / vLenSq : 1;

            state.selection.transform.scaleX = s;
            state.selection.transform.scaleY = s;
            state.selection.transform.originX = ox;
            state.selection.transform.originY = oy;
         }
         renderer.render(state);
         return;
      }

      if (pendingLassoPoints.length > 0) {
         pendingLassoPoints.push(pt);
         renderer.render(state);
      }
    },

    onPointerUp(event) {
      const state = stateManager.getState();
      
      if (isDragging) {
         isDragging = false;
         if (state.selection.transform && (state.selection.transform.dx !== 0 || state.selection.transform.dy !== 0 || state.selection.transform.scaleX !== 1 || state.selection.transform.scaleY !== 1)) {
            stateManager.commitTransform(draggingAlt);
         }
         draggingAlt = false;
         storageService.save(stateManager.getState().strokes);
         renderer.render(stateManager.getState());
         return;
      }

      if (pendingLassoPoints.length > 0) {
        state.activeStroke = null;
        if (pendingLassoPoints.length > 2) {
          const newSelection = [];
          for (const s of state.strokes) {
            if (s.tool === 'clear' || s.tool === 'erase') continue;
            let inPoly = false;
            for (const p of s.points) {
               if (pointInPolygon(p, pendingLassoPoints)) { inPoly = true; break; }
            }
            if (inPoly) newSelection.push(s.id);
          }
          stateManager.setSelection(newSelection);
        }
        pendingLassoPoints = [];
        renderer.render(state);
      }
    }
  };
}
