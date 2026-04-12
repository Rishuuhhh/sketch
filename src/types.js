/**
 * @fileoverview Core data type definitions for the Whiteboard Sketch App.
 * Uses JSDoc for type documentation (no TypeScript compilation required).
 */

/**
 * A single point on the canvas.
 *
 * @typedef {Object} Point
 * @property {number} x - Horizontal position in canvas pixels.
 * @property {number} y - Vertical position in canvas pixels.
 */

/**
 * A single continuous drawing action from pointer-down to pointer-up.
 *
 * @typedef {Object} Stroke
 * @property {string} id - Unique identifier (timestamp-based or UUID).
 * @property {'pen' | 'eraser' | 'clear'} tool - The tool used for this stroke.
 *   'clear' is a sentinel value representing a clear-canvas action.
 * @property {string} color - CSS color string (e.g. "#000000"). Ignored for eraser/clear.
 * @property {number} width - Stroke width in pixels. Ignored for clear.
 * @property {Point[]} points - Ordered list of pointer positions. Empty for clear sentinel.
 */

/**
 * Central application state object.
 *
 * @typedef {Object} AppState
 * @property {Stroke[]} strokes - Committed stroke history used for replay-based rendering.
 * @property {Stroke[]} redoStack - Strokes available for redo after an undo action.
 * @property {Stroke | null} activeStroke - The stroke currently being drawn, or null.
 * @property {'pen' | 'eraser' | 'lasso'} activeTool - The currently selected drawing tool.
 * @property {string} strokeColor - CSS color string for new strokes (e.g. "#000000").
 * @property {number} strokeWidth - Width in pixels for new strokes.
 * @property {Object} selection - Current selection state.
 * @property {string[]} selection.strokeIds - Selected stroke IDs.
 * @property {Object|null} selection.transform - Transform { dx, dy, scale } or null.
 */

/**
 * Creates a new default AppState.
 *
 * @returns {AppState}
 */
export function createDefaultAppState() {
  return {
    strokes: [],
    redoStack: [],
    activeStroke: null,
    activeTool: 'pen',
    strokeColor: '#ffffff',
    ghostColor: '#f97316',
    strokeWidth: 4,
    undoAvailable: false,
    selection: {
      strokeIds: [],
      transform: null
    }
  };
}

/**
 * Creates a new Point.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} [pressure] - Normalised pressure 0–1 (default 0.5)
 * @returns {Point}
 */
export function createPoint(x, y, pressure = 0.5) {
  return { x, y, pressure };
}

/**
 * Creates a new Stroke.
 *
 * @param {'pen' | 'eraser' | 'clear' | 'lasso'} tool
 * @param {string} color
 * @param {number} width
 * @param {Point[]} [points]
 * @returns {Stroke}
 */
export function createStroke(tool, color, width, points = []) {
  return {
    id: String(Date.now()) + Math.random().toString(36).slice(2),
    tool,
    color,
    width,
    points,
  };
}
