/**
 * @fileoverview ToolbarController wires toolbar DOM events to StateManager
 * methods and keeps button states in sync with app state.
 */

/**
 * Creates a ToolbarController that connects toolbar UI to the StateManager.
 *
 * @param {{
 *   stateManager: import('./StateManager.js').StateManager,
 *   exportService: { exportPNG(canvas: HTMLCanvasElement): void },
 *   renderer: { render(state: import('./types.js').AppState): void },
 *   storageService: { save(strokes: import('./types.js').Stroke[]): void },
 *   document?: Document,
 * }} deps
 * @returns {{ updateButtonStates(): void }}
 */
export function createToolbarController({
  stateManager,
  exportService,
  renderer,
  storageService,
  document: doc = globalThis.document,
}) {
  const btnPen = doc.getElementById('btn-pen');
  const btnEraser = doc.getElementById('btn-eraser');
  const colorPicker = doc.getElementById('color-picker');
  const strokeWidth = doc.getElementById('stroke-width');
  const btnClear = doc.getElementById('btn-clear');
  const btnUndo = doc.getElementById('btn-undo');
  const btnRedo = doc.getElementById('btn-redo');
  const btnExport = doc.getElementById('btn-export');

  /** Updates active-tool highlight and undo/redo disabled states. */
  function updateButtonStates() {
    const state = stateManager.getState();

    // Undo/redo enabled state
    btnUndo.disabled = state.strokes.length === 0;
    btnRedo.disabled = state.redoStack.length === 0;

    // Active tool highlight
    if (state.activeTool === 'pen') {
      btnPen.classList.add('active');
      btnEraser.classList.remove('active');
    } else {
      btnEraser.classList.add('active');
      btnPen.classList.remove('active');
    }
  }

  // --- Tool buttons ---
  btnPen.addEventListener('click', () => {
    stateManager.setTool('pen');
    updateButtonStates();
  });

  btnEraser.addEventListener('click', () => {
    stateManager.setTool('eraser');
    updateButtonStates();
  });

  // --- Color picker ---
  colorPicker.addEventListener('change', (event) => {
    stateManager.setColor(event.target.value);
  });

  // --- Stroke width ---
  strokeWidth.addEventListener('change', (event) => {
    stateManager.setStrokeWidth(Number(event.target.value));
  });

  // --- Clear ---
  btnClear.addEventListener('click', () => {
    stateManager.clearCanvas();
    const state = stateManager.getState();
    storageService.save(state.strokes);
    renderer.render(state);
    updateButtonStates();
  });

  // --- Undo ---
  btnUndo.addEventListener('click', () => {
    stateManager.undo();
    const state = stateManager.getState();
    storageService.save(state.strokes);
    renderer.render(state);
    updateButtonStates();
  });

  // --- Redo ---
  btnRedo.addEventListener('click', () => {
    stateManager.redo();
    const state = stateManager.getState();
    storageService.save(state.strokes);
    renderer.render(state);
    updateButtonStates();
  });

  // --- Export ---
  btnExport.addEventListener('click', () => {
    const canvas = doc.getElementById('canvas');
    exportService.exportPNG(canvas);
  });

  // Run once to sync initial state
  updateButtonStates();

  return { updateButtonStates };
}
