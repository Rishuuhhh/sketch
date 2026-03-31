/** @import { AppState, Stroke } from './types.js' */
import { createDefaultAppState, createStroke } from './types.js';

const MAX_UNDO = 50;

export function createStateManager(initialState) {
  /** @type {AppState} */
  const state = initialState ?? createDefaultAppState();

  // Each entry: { do: fn, undo: fn }
  const undoStack = [];
  const redoStack = [];

  function push(action) {
    action.do();
    undoStack.push(action);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
    sync();
  }

  function sync() {
    state.undoAvailable = undoStack.length > 0;
    state.redoStack = redoStack.length > 0 ? [{}] : [];
    document.dispatchEvent(new CustomEvent('stroke-committed'));
  }

  return {
    getState() { return state; },

    commitStroke(stroke) {
      push({
        do:   () => state.strokes.push(stroke),
        undo: () => { state.strokes = state.strokes.filter(s => s !== stroke); },
      });
    },

    commitErase(before, after) {
      push({
        do:   () => { state.strokes = after; },
        undo: () => { state.strokes = before; },
      });
    },

    clearCanvas() {
      const before = state.strokes.slice();
      const clearStroke = createStroke('clear', '', 0, []);
      push({
        do:   () => { state.strokes = [...before, clearStroke]; },
        undo: () => { state.strokes = before; },
      });
    },

    undo() {
      if (undoStack.length === 0) return;
      const action = undoStack.pop();
      action.undo();
      redoStack.push(action);
      sync();
    },

    redo() {
      if (redoStack.length === 0) return;
      const action = redoStack.pop();
      action.do();
      undoStack.push(action);
      sync();
    },

    setTool(tool)          { state.activeTool = tool; },
    setColor(color)        { state.strokeColor = color; },
    setStrokeWidth(width)  { state.strokeWidth = width; },
    setGhostColor(color)   { state.ghostColor = color; },
  };
}
