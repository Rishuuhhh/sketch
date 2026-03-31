// Feature: whiteboard-sketch-app, Property 4: Empty history disables undo/redo controls

import { describe, it, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { createToolbarController } from '../src/ToolbarController.js';
import { createStateManager } from '../src/StateManager.js';
import { createDefaultAppState } from '../src/types.js';

// Minimal DOM setup required by ToolbarController
function setupDOM() {
  document.body.innerHTML = `
    <button id="btn-pen" class="active"></button>
    <button id="btn-eraser"></button>
    <input id="color-picker" type="color" value="#000000" />
    <select id="stroke-width"><option value="6" selected>M</option></select>
    <button id="btn-clear"></button>
    <button id="btn-undo"></button>
    <button id="btn-redo"></button>
    <button id="btn-export"></button>
    <canvas id="canvas"></canvas>
  `;
}

// Minimal stub dependencies (renderer, exportService, storageService)
const noopRenderer = { render: () => {} };
const noopExport = { exportPNG: () => {} };
const noopStorage = { save: () => {} };

// Arbitrary for a single stroke (pen or eraser, non-empty points)
const strokeArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  tool: fc.constantFrom('pen', 'eraser'),
  color: fc.constantFrom('#000000', '#ff0000', '#00ff00'),
  width: fc.integer({ min: 1, max: 50 }),
  points: fc.array(
    fc.record({
      x: fc.float({ min: 0, max: 800, noNaN: true }),
      y: fc.float({ min: 0, max: 600, noNaN: true }),
    }),
    { minLength: 1, maxLength: 10 }
  ),
});

describe('ToolbarController property tests', () => {
  beforeEach(() => {
    setupDOM();
  });

  /**
   * Validates: Requirements 4.3, 4.4
   *
   * Property 4: Empty history disables undo/redo controls
   */
  it('Property 4a: btn-undo is disabled when strokes is empty', () => {
    fc.assert(
      fc.property(
        // Generate a redoStack that may be empty or non-empty — irrelevant for this sub-property
        fc.array(strokeArb, { minLength: 0, maxLength: 10 }),
        (redoStrokes) => {
          setupDOM();

          const initialState = createDefaultAppState();
          initialState.strokes = [];           // always empty
          initialState.redoStack = redoStrokes.map((s) => ({ ...s }));

          const sm = createStateManager(initialState);
          const controller = createToolbarController({
            stateManager: sm,
            exportService: noopExport,
            renderer: noopRenderer,
            storageService: noopStorage,
          });

          controller.updateButtonStates();

          const btnUndo = document.getElementById('btn-undo');
          return btnUndo.disabled === true;
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Property 4b: btn-redo is disabled when redoStack is empty', () => {
    fc.assert(
      fc.property(
        // Generate a strokes array that may be empty or non-empty — irrelevant for this sub-property
        fc.array(strokeArb, { minLength: 0, maxLength: 10 }),
        (strokes) => {
          setupDOM();

          const initialState = createDefaultAppState();
          initialState.strokes = strokes.map((s) => ({ ...s }));
          initialState.redoStack = [];         // always empty

          const sm = createStateManager(initialState);
          const controller = createToolbarController({
            stateManager: sm,
            exportService: noopExport,
            renderer: noopRenderer,
            storageService: noopStorage,
          });

          controller.updateButtonStates();

          const btnRedo = document.getElementById('btn-redo');
          return btnRedo.disabled === true;
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Property 4c: btn-undo is enabled when strokes is non-empty', () => {
    fc.assert(
      fc.property(
        fc.array(strokeArb, { minLength: 1, maxLength: 10 }),
        (strokes) => {
          setupDOM();

          const initialState = createDefaultAppState();
          initialState.strokes = strokes.map((s) => ({ ...s }));
          initialState.redoStack = [];

          const sm = createStateManager(initialState);
          const controller = createToolbarController({
            stateManager: sm,
            exportService: noopExport,
            renderer: noopRenderer,
            storageService: noopStorage,
          });

          controller.updateButtonStates();

          const btnUndo = document.getElementById('btn-undo');
          return btnUndo.disabled === false;
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Property 4d: btn-redo is enabled when redoStack is non-empty', () => {
    fc.assert(
      fc.property(
        fc.array(strokeArb, { minLength: 1, maxLength: 10 }),
        (redoStrokes) => {
          setupDOM();

          const initialState = createDefaultAppState();
          initialState.strokes = [];
          initialState.redoStack = redoStrokes.map((s) => ({ ...s }));

          const sm = createStateManager(initialState);
          const controller = createToolbarController({
            stateManager: sm,
            exportService: noopExport,
            renderer: noopRenderer,
            storageService: noopStorage,
          });

          controller.updateButtonStates();

          const btnRedo = document.getElementById('btn-redo');
          return btnRedo.disabled === false;
        }
      ),
      { numRuns: 20 }
    );
  });
});
