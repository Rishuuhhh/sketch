import { createPoint, createStroke } from './types.js';

const EPSILON = 1e-10;

/**
 * Maps a hit-test result and drag state to a CSS cursor string.
 * Pure function — takes all needed state as parameters.
 * @param {string|null} hit - result from hitTest()
 * @param {boolean} isDragging
 * @param {string|null} dragMode - current drag mode (needed for grabbing cursor)
 * @returns {string} CSS cursor value
 */
export function getCursorForHit(hit, isDragging, dragMode) {
  if (isDragging && dragMode === 'translate') return 'grabbing';
  if (hit === 'translate') return 'move';
  if (hit === 'resize-nw') return 'nw-resize';
  if (hit === 'resize-ne') return 'ne-resize';
  if (hit === 'resize-sw') return 'sw-resize';
  if (hit === 'resize-se') return 'se-resize';
  if (hit === 'resize-n') return 'n-resize';
  if (hit === 'resize-e') return 'e-resize';
  if (hit === 'resize-s') return 's-resize';
  if (hit === 'resize-w') return 'w-resize';
  return 'crosshair';
}

export function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const d2 = { x: p4.x - p3.x, y: p4.y - p3.y };
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < EPSILON) return false; // parallel
  const dx = p3.x - p1.x;
  const dy = p3.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / cross;
  const u = (dx * d1.y - dy * d1.x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function strokeIntersectsPolygon(stroke, polygon) {
  const pts = stroke.points;
  const n = polygon.length;
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i];
    const B = pts[i + 1];
    for (let j = 0; j < n; j++) {
      const C = polygon[j];
      const D = polygon[(j + 1) % n];
      if (segmentsIntersect(A, B, C, D)) return true;
    }
  }
  return false;
}

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
  let dragMode = null; // 'translate' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-e' | 'resize-s' | 'resize-w'
  let dragBounds = null; // bounds captured at drag start — held fixed for the entire drag
  let draggingAlt = false;
  let shiftDown = false;

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

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    if (Math.abs(pt.x - midX) < h && Math.abs(pt.y - minY) < h) return 'resize-n';
    if (Math.abs(pt.x - maxX) < h && Math.abs(pt.y - midY) < h) return 'resize-e';
    if (Math.abs(pt.x - midX) < h && Math.abs(pt.y - maxY) < h) return 'resize-s';
    if (Math.abs(pt.x - minX) < h && Math.abs(pt.y - midY) < h) return 'resize-w';

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
      shiftDown = event.shiftKey;

      const bounds = getSelectionBounds(state);
      const hit = hitTest(pt, bounds, zoom);

      if (hit) {
         isDragging = true;
         dragStart = pt;
         dragMode = hit;
         dragBounds = bounds; // capture bounds once — never recompute during drag
         draggingAlt = event.altKey;
         if (!state.selection.transform) {
             state.selection.transform = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, originX: 0, originY: 0 };
         }
         event.target.style.cursor = getCursorForHit(hit, true, dragMode);
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
      const zoom = viewport ? viewport.zoom : 1;

      if (isDragging) {
         shiftDown = event.shiftKey;
         if (dragMode === 'translate') {
            state.selection.transform.dx = pt.x - dragStart.x;
            state.selection.transform.dy = pt.y - dragStart.y;
            event.target.style.cursor = 'grabbing';
         } else {
            const bounds = dragBounds; // use fixed bounds from drag start
            let cw = bounds.maxX - bounds.minX;
            let ch = bounds.maxY - bounds.minY;
            if (cw < 1) cw = 1;
            if (ch < 1) ch = 1;
            
            let ox = bounds.minX + cw/2, oy = bounds.minY + ch/2;
            let cx = 0, cy = 0; // original corner

            if (dragMode === 'resize-n' || dragMode === 'resize-s') {
               const originX = (bounds.minX + bounds.maxX) / 2;
               const originY = dragMode === 'resize-n' ? bounds.maxY : bounds.minY;
               const s = (pt.y - originY) / ch;
               if (shiftDown) {
                  state.selection.transform.scaleX = s;
                  state.selection.transform.scaleY = s;
                  state.selection.transform.originX = (bounds.minX + bounds.maxX) / 2;
                  state.selection.transform.originY = (bounds.minY + bounds.maxY) / 2;
               } else {
                  state.selection.transform.scaleX = 1;
                  state.selection.transform.scaleY = s;
                  state.selection.transform.originX = originX;
                  state.selection.transform.originY = originY;
               }
               state.selection.transform.dx = 0;
               state.selection.transform.dy = 0;
            } else if (dragMode === 'resize-e' || dragMode === 'resize-w') {
               const originX = dragMode === 'resize-e' ? bounds.minX : bounds.maxX;
               const originY = (bounds.minY + bounds.maxY) / 2;
               const s = (pt.x - originX) / cw;
               if (shiftDown) {
                  state.selection.transform.scaleX = s;
                  state.selection.transform.scaleY = s;
                  state.selection.transform.originX = (bounds.minX + bounds.maxX) / 2;
                  state.selection.transform.originY = (bounds.minY + bounds.maxY) / 2;
               } else {
                  state.selection.transform.scaleX = s;
                  state.selection.transform.scaleY = 1;
                  state.selection.transform.originX = originX;
                  state.selection.transform.originY = originY;
               }
               state.selection.transform.dx = 0;
               state.selection.transform.dy = 0;
            } else {
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
         }
         renderer.render(state);
         return;
      }

      // Hover cursor update when a selection exists
      const bounds = getSelectionBounds(state);
      if (bounds) {
        const hit = hitTest(pt, bounds, zoom);
        event.target.style.cursor = getCursorForHit(hit, false, null);
      }

      if (pendingLassoPoints.length > 0) {
         pendingLassoPoints.push(pt);
         renderer.render(state);
      }
    },

    deleteSelection() {
      const state = stateManager.getState();
      if (state.activeTool !== 'lasso') return;
      if (state.selection.strokeIds.length === 0) return;
      stateManager.commitDelete(state.selection.strokeIds);
      renderer.render(stateManager.getState());
    },

    duplicateSelection() {
      const state = stateManager.getState();
      if (state.activeTool !== 'lasso') return;
      if (state.selection.strokeIds.length === 0) return;
      stateManager.commitDuplicate(state.selection.strokeIds);
      renderer.render(stateManager.getState());
    },

    cancelOrDeselect() {
      const state = stateManager.getState();
      if (state.activeTool !== 'lasso') return;
      if (pendingLassoPoints.length > 0) {
        pendingLassoPoints = [];
        state.activeStroke = null;
        renderer.render(state);
        return;
      }
      if (state.selection.strokeIds.length > 0) {
        stateManager.setSelection([]);
        renderer.render(stateManager.getState());
      }
    },

    onPointerUp(event) {
      const state = stateManager.getState();
      
      if (isDragging) {
         isDragging = false;
         dragBounds = null;
         if (state.selection.transform && (state.selection.transform.dx !== 0 || state.selection.transform.dy !== 0 || state.selection.transform.scaleX !== 1 || state.selection.transform.scaleY !== 1)) {
            stateManager.commitTransform(draggingAlt);
         }
         draggingAlt = false;
         storageService.save(stateManager.getState().strokes);
         renderer.render(stateManager.getState());
         // Restore cursor based on where pointer was released
         const zoom = viewport ? viewport.zoom : 1;
         const pt = toWorld(event);
         const finalBounds = getSelectionBounds(stateManager.getState());
         const hit = hitTest(pt, finalBounds, zoom);
         event.target.style.cursor = getCursorForHit(hit, false, null);
         return;
      }

      if (pendingLassoPoints.length > 0) {
        state.activeStroke = null;
        if (pendingLassoPoints.length > 2) {
          const newSelection = [];
          for (const s of state.strokes) {
            if (s.tool === 'clear' || s.tool === 'erase') continue;
            let selected = false;
            for (const p of s.points) {
              if (pointInPolygon(p, pendingLassoPoints)) { selected = true; break; }
            }
            if (!selected) {
              if (strokeIntersectsPolygon(s, pendingLassoPoints)) selected = true;
            }
            if (selected) newSelection.push(s.id);
          }
          stateManager.setSelection(newSelection);
        }
        pendingLassoPoints = [];
        renderer.render(state);
      }
    }
  };
}
