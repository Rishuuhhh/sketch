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
  const btnLasso = doc.getElementById('btn-lasso');
  const btnPan = doc.getElementById('btn-pan');

  // ... (keeping other variables same)
  const colorPicker = doc.getElementById('color-picker');
  const strokeWidth = doc.getElementById('stroke-width');
  const btnClear = doc.getElementById('btn-clear');
  const btnUndo = doc.getElementById('btn-undo');
  const btnRedo = doc.getElementById('btn-redo');
  const btnExport = doc.getElementById('btn-export');

  /** Updates active-tool highlight and undo/redo disabled states. */
  function updateButtonStates() {
    const state = stateManager.getState();

    btnUndo.disabled = !state.undoAvailable;
    btnRedo.disabled = state.redoStack.length === 0;

    const isPan = state.activeTool === 'pan';
    if (btnPan) {
      btnPan.classList.toggle('active', isPan);
    }
    
    btnPen.classList.toggle('active', state.activeTool === 'pen');
    btnEraser.classList.toggle('active', state.activeTool === 'eraser');
    if (btnLasso) btnLasso.classList.toggle('active', state.activeTool === 'lasso');
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

  if (btnLasso) {
    btnLasso.addEventListener('click', () => {
      stateManager.setTool('lasso');
      updateButtonStates();
    });
  }

  // --- Pan tool ---
  if (btnPan) {
    btnPan.addEventListener('click', () => {
      stateManager.setTool('pan');
      updateButtonStates();
    });
  }

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

  // Re-sync after every stroke commit (DrawingEngine fires this)
  document.addEventListener('stroke-committed', updateButtonStates);

  return { updateButtonStates };
}
