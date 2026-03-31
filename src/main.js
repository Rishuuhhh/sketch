import { createDefaultAppState } from './types.js';
import { createStateManager } from './StateManager.js';
import { createRenderer } from './Renderer.js';
import { createStorageService } from './StorageService.js';
import { createExportService } from './ExportService.js';
import { createToolbarController } from './ToolbarController.js';
import { createDrawingEngine } from './DrawingEngine.js';
import { createViewport } from './Viewport.js';
import { createCursorManager } from './CursorManager.js';
import { createGhostEngine } from './GhostEngine.js';

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ghostCanvas = document.getElementById('ghost-canvas');

function resizeCanvas() {
  canvas.width  = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  ghostCanvas.width  = canvas.width;
  ghostCanvas.height = canvas.height;
}
resizeCanvas();

// ── Core modules ──────────────────────────────────────────────────────────────
const viewport      = createViewport();
const storageService = createStorageService();

const savedStrokes = storageService.load();
const state = createDefaultAppState();
if (savedStrokes !== null) state.strokes = savedStrokes;

const stateManager = createStateManager(state);
const renderer     = createRenderer(canvas, viewport);
const exportService = createExportService();
const cursorManager = createCursorManager(canvas, stateManager, viewport);
const ghostEngine   = createGhostEngine({ ghostCanvas, viewport });

const toolbarController = createToolbarController({
  stateManager, exportService, renderer, storageService,
});

const engine = createDrawingEngine({ stateManager, storageService, renderer, viewport });

// ── Render helper (also syncs cursor) ────────────────────────────────────────
function render() {
  renderer.render(stateManager.getState());
  cursorManager.update();
}

// ── Pan state ─────────────────────────────────────────────────────────────────
let isPanning    = false;
let panStartX    = 0;
let panStartY    = 0;
let spaceDown    = false;

// Touch pinch state
let activeTouches = new Map(); // pointerId → {x,y}
let lastPinchDist = null;

function shouldPan(event) {
  // Middle mouse, or Space+left, or pen barrel button (buttons & 2)
  return event.button === 1
    || (event.button === 0 && spaceDown)
    || (event.pointerType === 'pen' && event.buttons === 2);
}

// ── Zoom indicator ────────────────────────────────────────────────────────────
const zoomLabel = document.getElementById('zoom-label');
let zoomFadeTimer = null;

function showZoom() {
  if (!zoomLabel) return;
  zoomLabel.textContent = Math.round(viewport.zoom * 100) + '%';
  zoomLabel.style.opacity = '1';
  clearTimeout(zoomFadeTimer);
  zoomFadeTimer = setTimeout(() => { zoomLabel.style.opacity = '0'; }, 1200);
}

// ── Ghost tool toggle ─────────────────────────────────────────────────────────
const btnGhost = document.getElementById('btn-ghost');
let ghostMode = false;

function setGhostMode(on) {
  ghostMode = on;
  ghostEngine.isActive = on;
  btnGhost.classList.toggle('ghost-active', on);
  // Deactivate normal tool buttons visually when ghost is on
  document.getElementById('btn-pen').classList.toggle('active', !on && stateManager.getState().activeTool === 'pen');
  document.getElementById('btn-eraser').classList.toggle('active', !on && stateManager.getState().activeTool === 'eraser');
  if (on) {
    canvas.style.cursor = ghostCursor();
  } else {
    cursorManager.update();
  }
}

function ghostCursor() {
  const size = 14, c = 7;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${c}" cy="${c}" r="5" fill="#f97316" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
    <circle cx="${c}" cy="${c}" r="5" fill="none" stroke="rgba(255,180,80,0.7)" stroke-width="3" opacity="0.5"/>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`;
}

btnGhost?.addEventListener('click', () => setGhostMode(!ghostMode));

// ── Pointer events ────────────────────────────────────────────────────────────
canvas.addEventListener('pointerdown', e => {
  if (shouldPan(e)) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    return;
  }

  // Two-finger touch — track for pinch
  if (e.pointerType === 'touch') {
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size >= 2) return; // don't start drawing on pinch
  }

  if (ghostMode) {
    // Attach current color/width to the event for ghost engine
    const s = stateManager.getState();
    e.currentColor = s.strokeColor;
    e.currentWidth = s.strokeWidth;
    ghostEngine.onPointerDown(e);
    return;
  }

  engine.onPointerDown(e);
});

canvas.addEventListener('pointermove', e => {
  if (isPanning) {
    viewport.pan(e.clientX - panStartX, e.clientY - panStartY);
    panStartX = e.clientX;
    panStartY = e.clientY;
    render();
    ghostEngine.redraw();
    return;
  }

  // Pinch-to-zoom (two touch points)
  if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size === 2) {
      const [a, b] = [...activeTouches.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (lastPinchDist !== null) {
        const factor = dist / lastPinchDist;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const rect = canvas.getBoundingClientRect();
        viewport.zoomAt(factor, cx - rect.left, cy - rect.top);
        render();
        ghostEngine.redraw();
        showZoom();
      }
      lastPinchDist = dist;
      return;
    }
  }

  if (ghostMode) { ghostEngine.onPointerMove(e); return; }
  engine.onPointerMove(e);
});

canvas.addEventListener('pointerup', e => {
  if (isPanning) {
    isPanning = false;
    canvas.releasePointerCapture(e.pointerId);
    if (!spaceDown) cursorManager.update(); else canvas.style.cursor = 'grab';
    return;
  }
  activeTouches.delete(e.pointerId);
  lastPinchDist = null;
  if (ghostMode) { ghostEngine.onPointerUp(e); return; }
  engine.onPointerUp(e);
});

canvas.addEventListener('pointerleave', e => {
  if (isPanning) return;
  activeTouches.delete(e.pointerId);
  engine.onPointerUp(e);
});

canvas.addEventListener('pointercancel', e => {
  activeTouches.delete(e.pointerId);
  lastPinchDist = null;
  isPanning = false;
});

// ── Scroll-wheel zoom ─────────────────────────────────────────────────────────
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  // Trackpad pinch sends ctrlKey + small deltaY; wheel sends larger deltaY
  const delta = e.ctrlKey ? e.deltaY * 0.01 : e.deltaY * 0.001;
  const factor = Math.exp(-delta);
  viewport.zoomAt(factor, cx, cy);
  render();
  showZoom();
}, { passive: false });

// ── Space bar for pan mode ────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT') {
    spaceDown = true;
    canvas.style.cursor = 'grab';
    e.preventDefault();
  }
  // Ctrl+0 / Cmd+0 — reset zoom
  if ((e.ctrlKey || e.metaKey) && e.key === '0') {
    e.preventDefault();
    viewport.reset();
    render();
    showZoom();
  }
});

window.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    spaceDown = false;
    cursorManager.update();
  }
});

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  resizeCanvas();
  render();
  ghostEngine.redraw();
});

// ── Initial render ────────────────────────────────────────────────────────────
render();
toolbarController.updateButtonStates();

// Sync cursor when toolbar changes tool or width
document.getElementById('btn-pen')?.addEventListener('click', () => { setGhostMode(false); cursorManager.update(); });
document.getElementById('btn-eraser')?.addEventListener('click', () => { setGhostMode(false); cursorManager.update(); });
document.querySelectorAll('.width-btn').forEach(b => b.addEventListener('click', () => cursorManager.update()));
document.getElementById('color-picker')?.addEventListener('change', () => cursorManager.update());
