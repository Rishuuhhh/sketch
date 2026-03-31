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
  const sentinel = createStroke('erase', '', 0, []);
  sentinel.erasedIds = [...toRemove];
  state.strokes = state.strokes.filter(s => !toRemove.has(s.id));
  stateManager.commitStroke(sentinel);
  return toRemove;
}

// ── Pressure simulation for mouse / touch ─────────────────────────────────────
// We smooth pressure using an exponential moving average of pointer velocity.
// Fast movement → lower pressure (thin); slow/stopped → higher pressure (thick).

const VELOCITY_SMOOTH = 0.6;   // EMA factor for velocity smoothing
const MIN_SIM_PRESSURE = 0.08;
const MAX_SIM_PRESSURE = 1.0;

function velocityToPressure(vx, vy) {
  const speed = Math.hypot(vx, vy);
  // Map speed 0–8 px/ms to pressure 1.0–0.08 (inverse: fast = thin)
  const t = Math.min(speed / 8, 1);
  return MAX_SIM_PRESSURE + t * (MIN_SIM_PRESSURE - MAX_SIM_PRESSURE);
}

// ── DrawingEngine ─────────────────────────────────────────────────────────────

export function createDrawingEngine({ stateManager, storageService, renderer, viewport }) {
  let pendingEraserPoints = [];

  // Per-stroke velocity state for pressure simulation
  let lastX = 0, lastY = 0, lastT = 0;
  let smoothVx = 0, smoothVy = 0;

  function getPressure(event, wx, wy) {
    // Use real pen pressure when available
    if (event.pointerType === 'pen') {
      // Apply power curve: makes light touches noticeably thinner
      return Math.pow(Math.max(0.01, event.pressure), 0.6);
    }
    const now = performance.now();
    const dt = Math.max(now - lastT, 1);
    const rawVx = (wx - lastX) / dt;
    const rawVy = (wy - lastY) / dt;
    smoothVx = smoothVx * VELOCITY_SMOOTH + rawVx * (1 - VELOCITY_SMOOTH);
    smoothVy = smoothVy * VELOCITY_SMOOTH + rawVy * (1 - VELOCITY_SMOOTH);
    lastX = wx; lastY = wy; lastT = now;
    return velocityToPressure(smoothVx, smoothVy);
  }

  /** Convert a pointer event's coords to world space. */
  function toWorld(event) {
    if (viewport) {
      // Use offsetX/offsetY when available (standard events), fall back to clientX for coalesced
      const ox = event.offsetX ?? (event.clientX - event.target.getBoundingClientRect().left);
      const oy = event.offsetY ?? (event.clientY - event.target.getBoundingClientRect().top);
      return viewport.toWorld(ox, oy);
    }
    return { x: event.offsetX, y: event.offsetY };
  }

  return {
    onPointerDown(event) {
      const state = stateManager.getState();
      const { x, y } = toWorld(event);

      lastX = x; lastY = y;
      lastT = performance.now();
      smoothVx = 0; smoothVy = 0;

      if (state.activeTool === 'eraser') {
        const pt = createPoint(x, y, 0.5);
        state.activeStroke = createStroke('eraser', '', state.strokeWidth, [pt]);
        pendingEraserPoints = [pt];
      } else {
        const pressure = getPressure(event, x, y);
        const pt = createPoint(x, y, pressure);
        state.activeStroke = createStroke(state.activeTool, state.strokeColor, state.strokeWidth, [pt]);
      }
      renderer.render(state);
    },

    onPointerMove(event) {
      const state = stateManager.getState();
      if (state.activeStroke === null) return;

      // Use coalesced events for smoother, higher-fidelity input
      const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];

      for (const e of events) {
        const { x, y } = toWorld(e);

        if (state.activeStroke.tool === 'eraser') {
          const pt = createPoint(x, y, 0.5);
          state.activeStroke.points.push(pt);
          pendingEraserPoints.push(pt);

          const eraserRadius = state.activeStroke.width / 2;
          const removed = applyErase(pendingEraserPoints, eraserRadius, state, stateManager);
          if (removed.size > 0) {
            pendingEraserPoints = [];
            storageService.save(state.strokes);
          }
        } else {
          const pressure = getPressure(e, x, y);
          state.activeStroke.points.push(createPoint(x, y, pressure));
        }
      }

      renderer.render(state);
    },

    onPointerUp(event) {
      const state = stateManager.getState();
      if (state.activeStroke === null) return;

      const { x, y } = toWorld(event);

      if (state.activeStroke.tool === 'eraser') {
        const pt = createPoint(x, y, 0.5);
        state.activeStroke.points.push(pt);
        pendingEraserPoints.push(pt);
        applyErase(pendingEraserPoints, state.activeStroke.width / 2, state, stateManager);
        pendingEraserPoints = [];
        state.activeStroke = null;
      } else {
        const pressure = getPressure(event, x, y);
        state.activeStroke.points.push(createPoint(x, y, pressure));
        stateManager.commitStroke(state.activeStroke);
        state.activeStroke = null;
      }

      storageService.save(state.strokes);
      renderer.render(state);
    },
  };
}
