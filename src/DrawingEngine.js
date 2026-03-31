import { createStroke, createPoint } from './types.js';

// ── Eraser helpers ────────────────────────────────────────────────────────────

function pointNearSegment(px, py, ax, ay, bx, by, radius) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2 <= radius * radius;
}

function eraserHitsStroke(eraserPoints, stroke, radius) {
  if (stroke.tool === 'clear' || stroke.tool === 'erase' || stroke.points.length === 0) return false;
  const pts = stroke.points;
  const hitRadius = radius + stroke.width / 2;
  for (const ep of eraserPoints) {
    if (pts.length === 1) {
      if (Math.hypot(ep.x - pts[0].x, ep.y - pts[0].y) <= hitRadius) return true;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (pointNearSegment(ep.x, ep.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, hitRadius)) return true;
    }
  }
  return false;
}

function applyErase(eraserPoints, eraserRadius, state, stateManager) {
  const toRemove = new Set(
    state.strokes
      .filter(s => eraserHitsStroke(eraserPoints, s, eraserRadius))
      .map(s => s.id)
  );
  if (toRemove.size === 0) return toRemove;

  const before = state.strokes.slice();
  const after  = state.strokes.filter(s => !toRemove.has(s.id));

  // Commit as an undoable erase action
  stateManager.commitErase(before, after);
  return toRemove;
}

// ── DrawingEngine ─────────────────────────────────────────────────────────────

export function createDrawingEngine({ stateManager, storageService, renderer, viewport }) {
  let pendingEraserPoints = [];

  function toWorld(event) {
    if (viewport) {
      const rect = event.target.getBoundingClientRect();
      return viewport.toWorld(event.clientX - rect.left, event.clientY - rect.top);
    }
    return { x: event.offsetX, y: event.offsetY };
  }

  return {
    onPointerDown(event) {
      const state = stateManager.getState();
      const { x, y } = toWorld(event);

      if (state.activeTool === 'eraser') {
        const pt = createPoint(x, y);
        state.activeStroke = createStroke('eraser', '', state.strokeWidth, [pt]);
        pendingEraserPoints = [pt];
      } else {
        state.activeStroke = createStroke(state.activeTool, state.strokeColor, state.strokeWidth, [createPoint(x, y)]);
      }
      renderer.render(state);
    },

    onPointerMove(event) {
      const state = stateManager.getState();
      if (state.activeStroke === null) return;

      const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];

      for (const e of events) {
        const { x, y } = toWorld(e);

        if (state.activeStroke.tool === 'eraser') {
          const pt = createPoint(x, y);
          state.activeStroke.points.push(pt);
          pendingEraserPoints.push(pt);
          const removed = applyErase(pendingEraserPoints, state.activeStroke.width / 2, state, stateManager);
          if (removed.size > 0) {
            pendingEraserPoints = [];
            storageService.save(state.strokes);
          }
        } else {
          state.activeStroke.points.push(createPoint(x, y));
        }
      }

      renderer.render(state);
    },

    onPointerUp(event) {
      const state = stateManager.getState();
      if (state.activeStroke === null) return;

      const { x, y } = toWorld(event);

      if (state.activeStroke.tool === 'eraser') {
        const pt = createPoint(x, y);
        state.activeStroke.points.push(pt);
        pendingEraserPoints.push(pt);
        applyErase(pendingEraserPoints, state.activeStroke.width / 2, state, stateManager);
        pendingEraserPoints = [];
        state.activeStroke = null;
      } else {
        state.activeStroke.points.push(createPoint(x, y));
        stateManager.commitStroke(state.activeStroke);
        state.activeStroke = null;
      }

      storageService.save(state.strokes);
      renderer.render(state);
    },
  };
}
