import { describe, it, expect, beforeEach } from 'vitest';
import { createStateManager } from '../src/StateManager.js';
import { createStroke } from '../src/types.js';

describe('StateManager', () => {
  let sm;

  beforeEach(() => {
    sm = createStateManager();
  });

  describe('getState', () => {
    it('returns default state when no initial state provided', () => {
      const state = sm.getState();
      expect(state.strokes).toEqual([]);
      expect(state.redoStack).toEqual([]);
      expect(state.activeStroke).toBeNull();
      expect(state.activeTool).toBe('pen');
    });
  });

  describe('commitStroke', () => {
    it('adds stroke to strokes array', () => {
      const stroke = createStroke('pen', '#000', 4, [{ x: 0, y: 0 }]);
      sm.commitStroke(stroke);
      expect(sm.getState().strokes).toHaveLength(1);
      expect(sm.getState().strokes[0]).toBe(stroke);
    });

    it('clears redoStack when committing a pen stroke', () => {
      const s1 = createStroke('pen', '#000', 4);
      sm.commitStroke(s1);
      sm.undo();
      expect(sm.getState().redoStack).toHaveLength(1);
      const s2 = createStroke('pen', '#000', 4);
      sm.commitStroke(s2);
      expect(sm.getState().redoStack).toHaveLength(0);
    });

    it('clears redoStack when committing an eraser stroke', () => {
      const s1 = createStroke('pen', '#000', 4);
      sm.commitStroke(s1);
      sm.undo();
      const s2 = createStroke('eraser', '#000', 4);
      sm.commitStroke(s2);
      expect(sm.getState().redoStack).toHaveLength(0);
    });

    it('does NOT clear redoStack when committing a clear sentinel stroke', () => {
      const s1 = createStroke('pen', '#000', 4);
      sm.commitStroke(s1);
      sm.undo();
      expect(sm.getState().redoStack).toHaveLength(1);
      sm.clearCanvas();
      expect(sm.getState().redoStack).toHaveLength(1);
    });
  });

  describe('undo', () => {
    it('moves last stroke from strokes to redoStack', () => {
      const stroke = createStroke('pen', '#000', 4);
      sm.commitStroke(stroke);
      sm.undo();
      expect(sm.getState().strokes).toHaveLength(0);
      expect(sm.getState().redoStack).toHaveLength(1);
      expect(sm.getState().redoStack[0]).toBe(stroke);
    });

    it('is a no-op when strokes is empty', () => {
      sm.undo();
      expect(sm.getState().strokes).toHaveLength(0);
      expect(sm.getState().redoStack).toHaveLength(0);
    });
  });

  describe('redo', () => {
    it('moves last stroke from redoStack back to strokes', () => {
      const stroke = createStroke('pen', '#000', 4);
      sm.commitStroke(stroke);
      sm.undo();
      sm.redo();
      expect(sm.getState().strokes).toHaveLength(1);
      expect(sm.getState().redoStack).toHaveLength(0);
      expect(sm.getState().strokes[0]).toBe(stroke);
    });

    it('is a no-op when redoStack is empty', () => {
      sm.redo();
      expect(sm.getState().strokes).toHaveLength(0);
      expect(sm.getState().redoStack).toHaveLength(0);
    });
  });

  describe('clearCanvas', () => {
    it('pushes a sentinel clear stroke onto strokes', () => {
      sm.clearCanvas();
      const state = sm.getState();
      expect(state.strokes).toHaveLength(1);
      expect(state.strokes[0].tool).toBe('clear');
      expect(state.strokes[0].points).toEqual([]);
    });

    it('clear action is undoable', () => {
      const stroke = createStroke('pen', '#000', 4);
      sm.commitStroke(stroke);
      sm.clearCanvas();
      expect(sm.getState().strokes).toHaveLength(2);
      sm.undo();
      expect(sm.getState().strokes).toHaveLength(1);
      expect(sm.getState().strokes[0]).toBe(stroke);
    });
  });

  describe('setTool', () => {
    it('updates activeTool', () => {
      sm.setTool('eraser');
      expect(sm.getState().activeTool).toBe('eraser');
      sm.setTool('pen');
      expect(sm.getState().activeTool).toBe('pen');
    });
  });

  describe('setColor', () => {
    it('updates strokeColor', () => {
      sm.setColor('#ff0000');
      expect(sm.getState().strokeColor).toBe('#ff0000');
    });
  });

  describe('setStrokeWidth', () => {
    it('updates strokeWidth', () => {
      sm.setStrokeWidth(10);
      expect(sm.getState().strokeWidth).toBe(10);
    });
  });
});
