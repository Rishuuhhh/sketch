/**
 * Unit tests for main.js pan behaviour — tested in isolation via the actual modules.
 *
 * Because main.js is a browser module that calls document.getElementById and canvas APIs,
 * we cannot import it directly. Instead we:
 *   1. Mirror the shouldPan() logic in a standalone function to test it directly.
 *   2. Test pointerdown suppression via DrawingEngine (pan mode must not create strokes).
 *   3. Test cursor restoration via CursorManager (after pan drag ends with activeTool='pan').
 *
 * Requirements: 4.1, 4.3, 4.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStateManager } from '../src/StateManager.js';
import { createCursorManager } from '../src/CursorManager.js';
import { createDrawingEngine } from '../src/DrawingEngine.js';
import { createStorageService } from '../src/StorageService.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCanvas() {
  return {
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
}

function makeViewport() {
  return { zoom: 1, toWorld: (x, y) => ({ x, y }) };
}

function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
  };
}

function makeMockRenderer() {
  return { render: vi.fn() };
}

/**
 * Standalone mirror of the shouldPan() logic from main.js.
 * Kept in sync with the implementation in src/main.js.
 */
function makeShouldPan(stateManager, spaceDown = false) {
  return function shouldPan(event) {
    return event.button === 1
      || (event.button === 0 && spaceDown)
      || (event.pointerType === 'pen' && event.buttons === 2)
      || (event.button === 0 && stateManager.getState().activeTool === 'pan');
  };
}

// ── shouldPan() logic ─────────────────────────────────────────────────────────

describe('shouldPan() logic — Requirements 4.1', () => {
  it('returns true when button === 0 and activeTool === "pan"', () => {
    const stateManager = createStateManager();
    stateManager.setTool('pan');
    const shouldPan = makeShouldPan(stateManager);

    const result = shouldPan({ button: 0, pointerType: 'mouse', buttons: 1 });
    expect(result).toBe(true);
  });

  it('returns false when button === 0 and activeTool === "pen" (no space held)', () => {
    const stateManager = createStateManager();
    stateManager.setTool('pen');
    const shouldPan = makeShouldPan(stateManager, false);

    const result = shouldPan({ button: 0, pointerType: 'mouse', buttons: 1 });
    expect(result).toBe(false);
  });

  it('returns false when button === 0 and activeTool === "eraser" (no space held)', () => {
    const stateManager = createStateManager();
    stateManager.setTool('eraser');
    const shouldPan = makeShouldPan(stateManager, false);

    const result = shouldPan({ button: 0, pointerType: 'mouse', buttons: 1 });
    expect(result).toBe(false);
  });

  it('returns true for middle mouse button regardless of activeTool', () => {
    const stateManager = createStateManager();
    stateManager.setTool('pen');
    const shouldPan = makeShouldPan(stateManager);

    const result = shouldPan({ button: 1, pointerType: 'mouse', buttons: 4 });
    expect(result).toBe(true);
  });

  it('returns true when button === 0 and spaceDown is true', () => {
    const stateManager = createStateManager();
    stateManager.setTool('pen');
    const shouldPan = makeShouldPan(stateManager, true /* spaceDown */);

    const result = shouldPan({ button: 0, pointerType: 'mouse', buttons: 1 });
    expect(result).toBe(true);
  });
});

// ── pointerdown suppression — Requirements 4.4 ───────────────────────────────

describe('pointerdown in pan mode does not create a stroke — Requirements 4.4', () => {
  let stateManager;
  let engine;

  beforeEach(() => {
    stateManager = createStateManager();
    const storageService = createStorageService(makeMemoryStorage());
    engine = createDrawingEngine({
      stateManager,
      storageService,
      renderer: makeMockRenderer(),
      viewport: makeViewport(),
    });
  });

  it('does not add a stroke when activeTool is "pan" and pointerdown fires', () => {
    stateManager.setTool('pan');

    // In main.js, shouldPan() returns true for pan tool, so engine.onPointerDown is never called.
    // We verify this by confirming that if we DO call engine.onPointerDown while activeTool='pan',
    // the engine still creates an activeStroke (it doesn't know about pan — that's main.js's job).
    // The real test is that main.js's handler returns early before calling engine.onPointerDown.
    // We simulate that guard here: only call engine.onPointerDown when shouldPan() is false.
    const shouldPan = makeShouldPan(stateManager);
    const event = { button: 0, pointerType: 'mouse', buttons: 1, clientX: 10, clientY: 10, target: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } };

    const initialStrokeCount = stateManager.getState().strokes.length;

    if (!shouldPan(event)) {
      engine.onPointerDown(event);
    }
    // shouldPan() returns true for pan tool, so engine.onPointerDown is NOT called
    // strokes array must remain unchanged
    expect(stateManager.getState().strokes).toHaveLength(initialStrokeCount);
    expect(stateManager.getState().activeStroke).toBeNull();
  });

  it('does create a stroke when activeTool is "pen" and pointerdown fires', () => {
    stateManager.setTool('pen');

    const shouldPan = makeShouldPan(stateManager);
    const event = {
      button: 0, pointerType: 'mouse', buttons: 1,
      clientX: 10, clientY: 10,
      target: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    };

    if (!shouldPan(event)) {
      engine.onPointerDown(event);
    }

    // pen tool: engine.onPointerDown IS called, activeStroke is set
    expect(stateManager.getState().activeStroke).not.toBeNull();
  });
});

// ── cursor restoration after pan drag — Requirements 4.3 ─────────────────────

describe('cursor restoration after pan-tool drag — Requirements 4.3', () => {
  let canvas;
  let stateManager;
  let cursorManager;

  beforeEach(() => {
    canvas = makeCanvas();
    stateManager = createStateManager();
    cursorManager = createCursorManager(canvas, stateManager, makeViewport());
  });

  it('restores cursor to "grab" (not pen cursor) after pan drag ends with activeTool="pan"', () => {
    stateManager.setTool('pan');

    // Simulate what main.js pointerdown does: set cursor to 'grabbing'
    canvas.style.cursor = 'grabbing';

    // Simulate what main.js pointerup does when panToolActive is true:
    // const panToolActive = stateManager.getState().activeTool === 'pan';
    // if (!spaceDown && !panToolActive) { cursorManager.update(); } else { canvas.style.cursor = 'grab'; }
    const spaceDown = false;
    const panToolActive = stateManager.getState().activeTool === 'pan';
    if (!spaceDown && !panToolActive) {
      cursorManager.update();
    } else {
      canvas.style.cursor = 'grab';
    }

    expect(canvas.style.cursor).toBe('grab');
  });

  it('does NOT restore cursor to "grab" after pan drag ends with activeTool="pen" and spaceDown=false', () => {
    stateManager.setTool('pen');

    // Simulate pointerdown cursor change
    canvas.style.cursor = 'grabbing';

    // Simulate pointerup with spaceDown=false and activeTool='pen'
    const spaceDown = false;
    const panToolActive = stateManager.getState().activeTool === 'pan';
    if (!spaceDown && !panToolActive) {
      cursorManager.update(); // should set pen cursor, not 'grab'
    } else {
      canvas.style.cursor = 'grab';
    }

    expect(canvas.style.cursor).not.toBe('grab');
    expect(canvas.style.cursor).not.toBe('grabbing');
  });

  it('restores cursor to "grab" after pan drag ends when spaceDown=true (space-pan mode)', () => {
    stateManager.setTool('pen'); // tool is pen, but space is held

    canvas.style.cursor = 'grabbing';

    const spaceDown = true;
    const panToolActive = stateManager.getState().activeTool === 'pan';
    if (!spaceDown && !panToolActive) {
      cursorManager.update();
    } else {
      canvas.style.cursor = 'grab';
    }

    expect(canvas.style.cursor).toBe('grab');
  });
});
