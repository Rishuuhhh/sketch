/**
 * GhostEngine — performant ephemeral ghost strokes.
 *
 * Performance strategy:
 * - Each committed stroke is baked once onto a small offscreen canvas.
 *   Fading = just changing globalAlpha when compositing the offscreen canvas.
 *   No per-frame re-tessellation of geometry.
 * - The active (in-progress) stroke is drawn live but with a single batched path.
 * - shadowBlur is replaced with a cheap double-draw glow (draw wide+transparent, then normal).
 * - Points are decimated on commit (Douglas-Peucker) to keep geometry lean.
 * - The RAF loop stops when nothing is visible.
 */

const IDLE_DELAY    = 600;   // ms idle before fade starts
const FADE_DURATION = 1800;  // ms for full fade-out
const GLOW_DURATION = 200;   // ms bloom at fade start
const MAX_GHOSTS    = 40;    // hard cap — drop oldest if exceeded
const DECIMATE_EPS  = 1.5;   // Douglas-Peucker epsilon (px, world space)

// ── Douglas-Peucker point decimation ─────────────────────────────────────────
function dpReduce(pts, eps) {
  if (pts.length <= 2) return pts;
  let maxDist = 0, idx = 0;
  const end = pts.length - 1;
  const ax = pts[0].x, ay = pts[0].y;
  const bx = pts[end].x, by = pts[end].y;
  const abLen = Math.hypot(bx - ax, by - ay);
  for (let i = 1; i < end; i++) {
    const dist = abLen < 0.001
      ? Math.hypot(pts[i].x - ax, pts[i].y - ay)
      : Math.abs((by - ay) * pts[i].x - (bx - ax) * pts[i].y + bx * ay - by * ax) / abLen;
    if (dist > maxDist) { maxDist = dist; idx = i; }
  }
  if (maxDist > eps) {
    const l = dpReduce(pts.slice(0, idx + 1), eps);
    const r = dpReduce(pts.slice(idx), eps);
    return [...l.slice(0, -1), ...r];
  }
  return [pts[0], pts[end]];
}

// ── Draw a variable-width stroke onto any ctx ─────────────────────────────────
function renderStroke(ctx, points, width, color, widthScale = 1) {
  if (points.length === 0) return;

  if (points.length === 1) {
    const r = Math.max(0.5, (width / 2) * (points[0].pressure ?? 0.5) * widthScale);
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    return;
  }

  // Draw as a series of line segments with varying lineWidth.
  // Each segment gets its own beginPath so lineWidth can change per segment.
  // This avoids the dotted-caps artefact from the filled-quad approach.
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const pressure = ((a.pressure ?? 0.5) + (b.pressure ?? 0.5)) / 2;
    const lw = Math.max(0.5, width * pressure * widthScale);

    ctx.beginPath();
    ctx.lineWidth = lw;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

// ── Bake a stroke onto an offscreen canvas ────────────────────────────────────
function bakeStroke(stroke, vp) {
  // Find bounding box in world space, expand by stroke width + glow margin
  const margin = stroke.width + 16;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of stroke.points) {
    if (p.x - margin < minX) minX = p.x - margin;
    if (p.y - margin < minY) minY = p.y - margin;
    if (p.x + margin > maxX) maxX = p.x + margin;
    if (p.y + margin > maxY) maxY = p.y + margin;
  }

  // Convert bbox to screen space so the offscreen canvas is pixel-accurate
  const zoom = vp ? vp.zoom : 1;
  const sx = vp ? vp.offsetX : 0, sy = vp ? vp.offsetY : 0;
  const screenMinX = minX * zoom + sx;
  const screenMinY = minY * zoom + sy;
  const screenMaxX = maxX * zoom + sx;
  const screenMaxY = maxY * zoom + sy;
  const w = Math.ceil(screenMaxX - screenMinX) + 2;
  const h = Math.ceil(screenMaxY - screenMinY) + 2;

  if (w <= 0 || h <= 0) return null;

  const oc = new OffscreenCanvas(w, h);
  const octx = oc.getContext('2d');

  // Translate so world coords map into the offscreen canvas
  octx.setTransform(zoom, 0, 0, zoom, -screenMinX, -screenMinY);

  // Glow: shadowBlur is fine here — runs once at bake time, not every frame
  octx.shadowColor = stroke.color;
  octx.shadowBlur  = 8;
  renderStroke(octx, stroke.points, stroke.width, stroke.color);
  // Second pass without shadow for crisp centre line
  octx.shadowBlur = 0;
  renderStroke(octx, stroke.points, stroke.width, stroke.color);

  return {
    canvas: oc,
    // Screen-space position of the top-left corner of the offscreen canvas
    screenX: screenMinX,
    screenY: screenMinY,
  };
}

// ── GhostEngine factory ───────────────────────────────────────────────────────
export function createGhostEngine({ ghostCanvas, viewport }) {
  const ctx = ghostCanvas.getContext('2d');

  // { points, color, width, baked: {canvas, screenX, screenY} | null }
  const ghosts = [];
  let activeGhost = null;
  let rafId = null;
  let isActive = false;
  let idleStart = null;

  // Velocity / pressure
  const VSMOOTH = 0.7;
  let lastX = 0, lastY = 0, lastT = 0, svx = 0, svy = 0;

  function getPressure(event, wx, wy) {
    if (event.pointerType === 'pen' && event.pressure > 0) return event.pressure;
    const now = performance.now();
    const dt = Math.max(now - lastT, 1);
    const rvx = (wx - lastX) / dt, rvy = (wy - lastY) / dt;
    svx = svx * VSMOOTH + rvx * (1 - VSMOOTH);
    svy = svy * VSMOOTH + rvy * (1 - VSMOOTH);
    lastX = wx; lastY = wy; lastT = now;
    const speed = Math.hypot(svx, svy);
    return 0.95 + Math.min(speed / 20, 1) * (0.15 - 0.95);
  }

  function toWorld(event) {
    return viewport
      ? viewport.toWorld(event.offsetX, event.offsetY)
      : { x: event.offsetX, y: event.offsetY };
  }

  // ── Main draw ─────────────────────────────────────────────────────────────
  function drawFrame(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);

    // Compute global fade
    let globalFadeT = 0;
    if (idleStart !== null && !activeGhost) {
      const idle = now - idleStart;
      if (idle >= IDLE_DELAY) {
        const fadeAge = idle - IDLE_DELAY;
        globalFadeT = Math.max(0, (fadeAge - GLOW_DURATION) / (FADE_DURATION - GLOW_DURATION));
      }
    }

    if (globalFadeT >= 1) {
      ghosts.length = 0;
      idleStart = null;
      return;
    }

    const alpha = 1 - globalFadeT;

    // Composite baked offscreen canvases — O(1) per stroke regardless of point count
    ctx.globalAlpha = alpha;
    for (const g of ghosts) {
      if (g.baked) {
        ctx.drawImage(g.baked.canvas, g.baked.screenX, g.baked.screenY);
      }
    }
    ctx.globalAlpha = 1;

    // Active stroke: draw live in world space (still being drawn, no bake yet)
    if (activeGhost) {
      if (viewport) viewport.applyToContext(ctx);
      ctx.globalAlpha = 0.3;
      ctx.shadowColor = activeGhost.color;
      ctx.shadowBlur  = 8;
      renderStroke(ctx, activeGhost.points, activeGhost.width, activeGhost.color);
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 1;
      renderStroke(ctx, activeGhost.points, activeGhost.width, activeGhost.color);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  function loop(now) {
    drawFrame(now);
    if (ghosts.length > 0 || activeGhost) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
      ctx.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);
    }
  }

  function startLoop() {
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    get isActive() { return isActive; },
    set isActive(v) { isActive = v; },

    onPointerDown(event) {
      const { x, y } = toWorld(event);
      lastX = x; lastY = y; lastT = performance.now(); svx = 0; svy = 0;
      idleStart = null; // freeze fade clock
      const pressure = getPressure(event, x, y);
      activeGhost = {
        points: [{ x, y, pressure }],
        color: event.currentColor || '#f97316',
        width: event.currentWidth || 8,
        baked: null,
      };
      startLoop();
    },

    onPointerMove(event) {
      if (!activeGhost) return;
      const { x, y } = toWorld(event);
      const pressure = getPressure(event, x, y);
      activeGhost.points.push({ x, y, pressure });
    },

    onPointerUp(event) {
      if (!activeGhost) return;
      const { x, y } = toWorld(event);
      const pressure = getPressure(event, x, y);
      activeGhost.points.push({ x, y, pressure });

      // Decimate then bake — happens once per stroke
      activeGhost.points = dpReduce(activeGhost.points, DECIMATE_EPS);
      activeGhost.baked  = bakeStroke(activeGhost, viewport);

      // Enforce hard cap
      if (ghosts.length >= MAX_GHOSTS) ghosts.shift();
      ghosts.push(activeGhost);
      activeGhost = null;

      idleStart = performance.now();
      startLoop();
    },

    resize() {
      ghostCanvas.width  = ghostCanvas.parentElement.clientWidth;
      ghostCanvas.height = ghostCanvas.parentElement.clientHeight;
      // Re-bake all strokes at new zoom/offset
      for (const g of ghosts) g.baked = bakeStroke(g, viewport);
    },

    redraw() {
      // Re-bake after pan/zoom since screen coords changed
      for (const g of ghosts) g.baked = bakeStroke(g, viewport);
      if (ghosts.length > 0 || activeGhost) {
        drawFrame(performance.now());
        startLoop();
      }
    },
  };
}
