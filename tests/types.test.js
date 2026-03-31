import { describe, it, expect } from 'vitest';
import { createDefaultAppState, createPoint, createStroke } from '../src/types.js';

describe('types', () => {
  it('createDefaultAppState returns correct shape', () => {
    const state = createDefaultAppState();
    expect(state.strokes).toEqual([]);
    expect(state.redoStack).toEqual([]);
    expect(state.activeStroke).toBeNull();
    expect(state.activeTool).toBe('pen');
    expect(state.strokeColor).toBe('#000000');
    expect(typeof state.strokeWidth).toBe('number');
  });

  it('createPoint returns {x, y}', () => {
    const p = createPoint(10, 20);
    expect(p).toEqual({ x: 10, y: 20 });
  });

  it('createStroke returns correct shape', () => {
    const stroke = createStroke('pen', '#ff0000', 4, [{ x: 0, y: 0 }]);
    expect(stroke.tool).toBe('pen');
    expect(stroke.color).toBe('#ff0000');
    expect(stroke.width).toBe(4);
    expect(stroke.points).toEqual([{ x: 0, y: 0 }]);
    expect(typeof stroke.id).toBe('string');
    expect(stroke.id.length).toBeGreaterThan(0);
  });

  it('createStroke defaults to empty points array', () => {
    const stroke = createStroke('clear', '', 0);
    expect(stroke.points).toEqual([]);
  });

  it('each stroke gets a unique id', () => {
    const a = createStroke('pen', '#000', 2);
    const b = createStroke('pen', '#000', 2);
    expect(a.id).not.toBe(b.id);
  });
});
