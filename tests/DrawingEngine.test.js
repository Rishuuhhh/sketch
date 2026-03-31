import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrawingEngine } from '../src/DrawingEngine.js';
import { createDefaultAppState } from '../src/types.js';

function makePointerEvent(offsetX, offsetY) {
  return { offsetX, offsetY };
}

function makeDeps(initialState) {
  const state = initialState ?? createDefaultAppState();
  const stateManager = {
    getState: () => state,
    commitStroke: vi.fn((stroke) => { state.strokes.push(stroke); }),
  };
  const storageService = { save: vi.fn() };
  const renderer = { render: vi.fn() };
  return { state, stateManager, storageService, renderer };
}

describe('DrawingEngine', () => {
  describe('onPointerDown', () => {
    it('creates an activeStroke with current tool/color/width and first point', () => {
      const { state, stateManager, storageService, renderer } = makeDeps();
      state.activeTool = 'pen';
      state.strokeColor = '#ff0000';
      state.strokeWidth = 6;

      const engine = createDrawingEngine({ stateManager, storageService, renderer });
      engine.onPointerDown(makePointerEvent(10, 20));

      expect(state.activeStroke).not.toBeNull();
      expect(state.activeStroke.tool).toBe('pen');
      expect(state.activeStroke.color).toBe('#ff0000');
      expect(state.activeStroke.width).toBe(6);
      expect(state.activeStroke.points).toEqual([{ x: 10, y: 20 }]);
    });

    it('calls renderer.render after creating activeStroke', () => {
      const { stateManager, storageService, renderer } = makeDeps();
      const engine = createDrawingEngine({ stateManager, storageService, renderer });
      engine.onPointerDown(makePointerEvent(0, 0));
      expect(renderer.render).toHaveBeenCalledOnce();
    });
  });

  describe('onPointerMove', () => {
    it('appends point to activeStroke and calls render', () => {
      const { state, stateManager, storageService, renderer } = makeDeps();
      const engine = createDrawingEngine({ stateManager, storageService, renderer });

      engine.onPointerDown(makePointerEvent(5, 5));
      renderer.render.mockClear();

      engine.onPointerMove(makePointerEvent(15, 25));

      expect(state.activeStroke.points).toHaveLength(2);
      expect(state.activeStroke.points[1]).toEqual({ x: 15, y: 25 });
      expect(renderer.render).toHaveBeenCalledOnce();
    });

    it('is a no-op when activeStroke is null', () => {
      const { state, stateManager, storageService, renderer } = makeDeps();
      state.activeStroke = null;
      const engine = createDrawingEngine({ stateManager, storageService, renderer });

      engine.onPointerMove(makePointerEvent(10, 10));

      expect(renderer.render).not.toHaveBeenCalled();
    });
  });

  describe('onPointerUp', () => {
    it('commits activeStroke, clears it, persists, and renders', () => {
      const { state, stateManager, storageService, renderer } = makeDeps();
      const engine = createDrawingEngine({ stateManager, storageService, renderer });

      engine.onPointerDown(makePointerEvent(0, 0));
      engine.onPointerMove(makePointerEvent(10, 10));
      renderer.render.mockClear();

      engine.onPointerUp(makePointerEvent(20, 20));

      expect(stateManager.commitStroke).toHaveBeenCalledOnce();
      const committed = stateManager.commitStroke.mock.calls[0][0];
      expect(committed.points).toHaveLength(3);
      expect(committed.points[2]).toEqual({ x: 20, y: 20 });

      expect(state.activeStroke).toBeNull();
      expect(storageService.save).toHaveBeenCalledWith(state.strokes);
      expect(renderer.render).toHaveBeenCalledOnce();
    });

    it('is a no-op when activeStroke is null', () => {
      const { state, stateManager, storageService, renderer } = makeDeps();
      state.activeStroke = null;
      const engine = createDrawingEngine({ stateManager, storageService, renderer });

      engine.onPointerUp(makePointerEvent(10, 10));

      expect(stateManager.commitStroke).not.toHaveBeenCalled();
      expect(storageService.save).not.toHaveBeenCalled();
      expect(renderer.render).not.toHaveBeenCalled();
    });

    it('works with eraser tool', () => {
      const { state, stateManager, storageService, renderer } = makeDeps();
      state.activeTool = 'eraser';
      const engine = createDrawingEngine({ stateManager, storageService, renderer });

      engine.onPointerDown(makePointerEvent(1, 1));
      engine.onPointerUp(makePointerEvent(2, 2));

      const committed = stateManager.commitStroke.mock.calls[0][0];
      expect(committed.tool).toBe('eraser');
    });
  });
});
