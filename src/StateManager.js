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

    setTool(tool) {
      state.activeTool = tool;
      if (tool !== 'lasso') state.selection.strokeIds = [];
    },
    setColor(color)        { state.strokeColor = color; },
    setStrokeWidth(width)  { state.strokeWidth = width; },
    setGhostColor(color)   { state.ghostColor = color; },
    
    setSelection(ids) {
      state.selection.strokeIds = ids;
      state.selection.transform = null;
      document.dispatchEvent(new CustomEvent('stroke-committed')); // just to force UI sync if needed
    },
    
    commitTransform(copy) {
      if (!state.selection.transform || state.selection.strokeIds.length === 0) return;
      const { dx, dy, scaleX, scaleY, originX, originY } = state.selection.transform;
      const ids = state.selection.strokeIds;
      
      const beforeStrokes = state.strokes.map(s => ({...s, points: [...s.points]})); // deep copy enough?
      // Wait, we need a full deep clone of the points array for undo
      const deepCloneStrokes = strokes => strokes.map(s => ({...s, points: s.points.map(p => ({...p}))}));

      const before = deepCloneStrokes(state.strokes);
      
      const doTransform = () => {
         let newStrokes = state.strokes;
         let targetStrokes;
         
         if (copy) {
            targetStrokes = state.strokes.filter(s => ids.includes(s.id)).map(s => ({
               ...s,
               id: String(Date.now()) + Math.random().toString(36).slice(2),
               points: s.points.map(p => ({...p}))
            }));
            newStrokes = [...state.strokes, ...targetStrokes];
            state.selection.strokeIds = targetStrokes.map(s => s.id);
         } else {
            targetStrokes = state.strokes.filter(s => ids.includes(s.id));
         }

         for (const s of targetStrokes) {
            for (const p of s.points) {
               const lx = p.x - originX;
               const ly = p.y - originY;
               p.x = originX + lx * scaleX + dx;
               p.y = originY + ly * scaleY + dy;
            }
         }
         state.strokes = newStrokes;
         state.selection.transform = null;
      };

      const undoTransform = () => {
         state.strokes = before;
         state.selection.strokeIds = ids; // restore original selection
         state.selection.transform = null;
      };

      push({ do: doTransform, undo: undoTransform });
    }
  };
}
