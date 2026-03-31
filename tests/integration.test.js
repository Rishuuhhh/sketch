/**
 * Integration tests for the full load/draw/persist cycle.
 *
 * Validates Requirements 6.1 and 6.2:
 * - 6.1: WHEN the user makes any change to the Canvas, THE Application SHALL save the Canvas state to browser local storage.
 * - 6.2: WHEN the Application loads in a new Session, THE Application SHALL restore the most recently saved Canvas state from local storage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createStateManager } from '../src/StateManager.js';
import { createStorageService } from '../src/StorageService.js';
import { createDrawingEngine } from '../src/DrawingEngine.js';

// In-memory storage backend (no real localStorage needed)
function createMemoryStorage() {
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

// Minimal mock renderer — we only care about state, not pixels
function createMockRenderer() {
  return { render: () => {} };
}

// Helper: build a fake PointerEvent-like object with offsetX/offsetY
function pointerEvent(x, y) {
  return { offsetX: x, offsetY: y };
}

// Helper: simulate a complete draw gesture (down → move → up)
function drawStroke(engine, points) {
  const [first, ...rest] = points;
  engine.onPointerDown(pointerEvent(first.x, first.y));
  for (const p of rest) {
    engine.onPointerMove(pointerEvent(p.x, p.y));
  }
  engine.onPointerUp(pointerEvent(rest.at(-1)?.x ?? first.x, rest.at(-1)?.y ?? first.y));
}

describe('Integration: full load/draw/persist cycle', () => {
  let memStorage;
  let storageService;
  let stateManager;
  let renderer;
  let engine;

  beforeEach(() => {
    memStorage = createMemoryStorage();
    storageService = createStorageService(memStorage);
    stateManager = createStateManager();
    renderer = createMockRenderer();
    engine = createDrawingEngine({ stateManager, storageService, renderer });
  });

  it('full draw cycle: stroke is committed to stateManager and persisted to storage', () => {
    // Simulate pointerdown → pointermove → pointerup
    drawStroke(engine, [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);

    // Stroke should be in stateManager
    const strokes = stateManager.getState().strokes;
    expect(strokes).toHaveLength(1);
    expect(strokes[0].tool).toBe('pen');
    expect(strokes[0].points.length).toBeGreaterThanOrEqual(2);

    // Stroke should be persisted in storage
    const saved = storageService.load();
    expect(saved).not.toBeNull();
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(strokes[0].id);
  });

  it('persistence restore: new StateManager loading from storage restores strokes', () => {
    // Draw a stroke so it gets persisted
    drawStroke(engine, [
      { x: 5, y: 5 },
      { x: 15, y: 15 },
    ]);

    const originalStrokes = stateManager.getState().strokes;
    expect(originalStrokes).toHaveLength(1);

    // Simulate a page reload: create a new StateManager seeded from storage
    const restoredStrokes = storageService.load();
    expect(restoredStrokes).not.toBeNull();

    const newStateManager = createStateManager({
      strokes: restoredStrokes,
      redoStack: [],
      activeStroke: null,
      activeTool: 'pen',
      strokeColor: '#000000',
      strokeWidth: 4,
    });

    const restoredState = newStateManager.getState();
    expect(restoredState.strokes).toHaveLength(1);
    expect(restoredState.strokes[0].id).toBe(originalStrokes[0].id);
    expect(restoredState.strokes[0].points).toEqual(originalStrokes[0].points);
  });

  it('multiple strokes: all 3 strokes are persisted and can be restored', () => {
    // Draw 3 distinct strokes
    drawStroke(engine, [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    drawStroke(engine, [{ x: 20, y: 20 }, { x: 30, y: 30 }]);
    drawStroke(engine, [{ x: 40, y: 40 }, { x: 50, y: 50 }]);

    // All 3 should be in stateManager
    const strokes = stateManager.getState().strokes;
    expect(strokes).toHaveLength(3);

    // All 3 should be persisted
    const saved = storageService.load();
    expect(saved).toHaveLength(3);
    expect(saved.map(s => s.id)).toEqual(strokes.map(s => s.id));

    // Restore into a fresh StateManager and verify all 3 come back
    const newStateManager = createStateManager({
      strokes: saved,
      redoStack: [],
      activeStroke: null,
      activeTool: 'pen',
      strokeColor: '#000000',
      strokeWidth: 4,
    });

    const restoredStrokes = newStateManager.getState().strokes;
    expect(restoredStrokes).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(restoredStrokes[i].id).toBe(strokes[i].id);
      expect(restoredStrokes[i].points).toEqual(strokes[i].points);
    }
  });
});
