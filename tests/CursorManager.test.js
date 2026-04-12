import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCursorManager } from '../src/CursorManager.js';

function makeCanvas() {
  return { style: { cursor: '' } };
}

function makeStateManager(activeTool = 'pen', overrides = {}) {
  return {
    getState: vi.fn(() => ({
      activeTool,
      strokeWidth: 6,
      strokeColor: '#000000',
      ...overrides,
    })),
  };
}

function makeViewport(zoom = 1) {
  return { zoom };
}

describe('CursorManager', () => {
  let canvas;

  beforeEach(() => {
    canvas = makeCanvas();
  });

  // Requirements 5.1 — pan tool sets 'grab' cursor
  it('sets cursor to "grab" when activeTool is "pan"', () => {
    const sm = makeStateManager('pan');
    const cm = createCursorManager(canvas, sm, makeViewport());
    cm.update();
    expect(canvas.style.cursor).toBe('grab');
  });

  // Requirements 5.1 — switching from another tool to pan sets 'grab'
  it('sets cursor to "grab" after switching from pen to pan', () => {
    const sm = makeStateManager('pen');
    const cm = createCursorManager(canvas, sm, makeViewport());
    cm.update(); // prime the cache with 'pen'

    sm.getState.mockReturnValue({ activeTool: 'pan', strokeWidth: 6, strokeColor: '#000000' });
    cm.update();
    expect(canvas.style.cursor).toBe('grab');
  });

  // Requirements 5.3 — pen tool does NOT produce 'grab' or 'grabbing'
  it('does NOT set cursor to "grab" or "grabbing" when activeTool is "pen"', () => {
    const sm = makeStateManager('pen');
    const cm = createCursorManager(canvas, sm, makeViewport());
    cm.update();
    expect(canvas.style.cursor).not.toBe('grab');
    expect(canvas.style.cursor).not.toBe('grabbing');
  });

  // Requirements 5.3 — eraser tool does NOT produce 'grab' or 'grabbing'
  it('does NOT set cursor to "grab" or "grabbing" when activeTool is "eraser"', () => {
    const sm = makeStateManager('eraser');
    const cm = createCursorManager(canvas, sm, makeViewport());
    cm.update();
    expect(canvas.style.cursor).not.toBe('grab');
    expect(canvas.style.cursor).not.toBe('grabbing');
  });

  // Switching away from pan back to pen should not leave 'grab'
  it('does NOT set cursor to "grab" after switching from pan back to pen', () => {
    const sm = makeStateManager('pan');
    const cm = createCursorManager(canvas, sm, makeViewport());
    cm.update();
    expect(canvas.style.cursor).toBe('grab');

    sm.getState.mockReturnValue({ activeTool: 'pen', strokeWidth: 6, strokeColor: '#000000' });
    cm.update();
    expect(canvas.style.cursor).not.toBe('grab');
    expect(canvas.style.cursor).not.toBe('grabbing');
  });
});
