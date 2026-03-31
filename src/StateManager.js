/** @import { AppState, Stroke } from './types.js' */
import { createDefaultAppState, createStroke } from './types.js';

/**
 * Creates a StateManager that owns AppState and exposes mutation methods.
 *
 * @param {AppState} [initialState] - Optional initial state; defaults to createDefaultAppState().
 * @returns {{
 *   getState(): AppState,
 *   commitStroke(stroke: Stroke): void,
 *   undo(): void,
 *   redo(): void,
 *   clearCanvas(): void,
 *   setTool(tool: 'pen' | 'eraser'): void,
 *   setColor(color: string): void,
 *   setStrokeWidth(width: number): void,
 * }}
 */
export function createStateManager(initialState) {
  /** @type {AppState} */
  const state = initialState ?? createDefaultAppState();

  return {
    /** Returns the current AppState (by reference). */
    getState() {
      return state;
    },

    /**
     * Commits a completed stroke to the history.
     * Clears redoStack when the stroke tool is 'pen' or 'eraser'.
     *
     * @param {Stroke} stroke
     */
    commitStroke(stroke) {
      state.strokes.push(stroke);
      if (stroke.tool === 'pen' || stroke.tool === 'eraser') {
        state.redoStack = [];
      }
    },

    /**
     * Undoes the last stroke by moving it from strokes to redoStack.
     * No-op when strokes is empty.
     */
    undo() {
      if (state.strokes.length === 0) return;
      const last = state.strokes.pop();
      state.redoStack.push(last);
    },

    /**
     * Redoes the last undone stroke by moving it from redoStack back to strokes.
     * No-op when redoStack is empty.
     */
    redo() {
      if (state.redoStack.length === 0) return;
      const last = state.redoStack.pop();
      state.strokes.push(last);
    },

    /**
     * Clears the canvas by pushing a sentinel clear stroke onto strokes,
     * making the action undoable.
     */
    clearCanvas() {
      const clearStroke = createStroke('clear', '', 0, []);
      state.strokes.push(clearStroke);
    },

    /**
     * Sets the active drawing tool.
     *
     * @param {'pen' | 'eraser'} tool
     */
    setTool(tool) {
      state.activeTool = tool;
    },

    /**
     * Sets the stroke color for subsequent strokes.
     *
     * @param {string} color - CSS color string.
     */
    setColor(color) {
      state.strokeColor = color;
    },

    /**
     * Sets the stroke width for subsequent strokes.
     *
     * @param {number} width - Width in pixels.
     */
    setStrokeWidth(width) {
      state.strokeWidth = width;
    },
  };
}
