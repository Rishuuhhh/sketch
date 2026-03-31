import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { createStateManager } from '../src/StateManager.js';
import { createDefaultAppState } from '../src/types.js';

// Arbitrary for a single Point
const pointArb = fc.record({
  x: fc.float({ min: 0, max: 2000, noNaN: true }),
  y: fc.float({ min: 0, max: 2000, noNaN: true }),
});

// Arbitrary for a single Stroke
const strokeArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  tool: fc.constantFrom('pen', 'eraser'),
  color: fc.constantFrom('#000000', '#ff0000', '#00ff00', '#0000ff', '#ffffff'),
  width: fc.integer({ min: 1, max: 50 }),
  points: fc.array(pointArb, { minLength: 1, maxLength: 20 }),
});

// Arbitrary for a non-empty strokes history
const nonEmptyStrokesArb = fc.array(strokeArb, { minLength: 1, maxLength: 20 });

describe('StateManager property tests', () => {
  // Feature: whiteboard-sketch-app, Property 5: New stroke after undo clears redo stack
  it('Property 5: committing a new pen or eraser stroke clears redoStack', () => {
    // Generate a history with at least one stroke, then undo to populate redoStack
    fc.assert(
      fc.property(
        nonEmptyStrokesArb,
        strokeArb,
        (historyStrokes, newStroke) => {
          // Build state with history
          const initialState = createDefaultAppState();
          initialState.strokes = historyStrokes.map((s) => ({ ...s }));

          const sm = createStateManager(initialState);

          // Undo at least once to populate redoStack
          sm.undo();

          // Verify redoStack is non-empty before committing
          if (sm.getState().redoStack.length === 0) return true; // skip degenerate case

          // Commit a new pen or eraser stroke
          const stroke = { ...newStroke, tool: newStroke.tool }; // tool is already 'pen' | 'eraser'
          sm.commitStroke(stroke);

          // redoStack must be empty after commit
          return sm.getState().redoStack.length === 0;
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: whiteboard-sketch-app, Property 6: Clear canvas is undoable
  it('Property 6: clearCanvas() then undo() restores strokes to original history H', () => {
    // Arbitrary for a strokes history (can be empty or non-empty)
    const strokesHistoryArb = fc.array(strokeArb, { minLength: 0, maxLength: 20 });

    fc.assert(
      fc.property(strokesHistoryArb, (historyStrokes) => {
        // Build initial state with history H
        const initialState = createDefaultAppState();
        initialState.strokes = historyStrokes.map((s) => ({ ...s }));

        const sm = createStateManager(initialState);

        // Snapshot H before clearCanvas
        const H = sm.getState().strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }));

        // Call clearCanvas() then undo()
        sm.clearCanvas();
        sm.undo();

        const restored = sm.getState().strokes;

        // Length must match H
        if (restored.length !== H.length) return false;

        // Each stroke must match H in id, tool, color, width, and points
        for (let i = 0; i < H.length; i++) {
          const orig = H[i];
          const rest = restored[i];

          if (orig.id !== rest.id) return false;
          if (orig.tool !== rest.tool) return false;
          if (orig.color !== rest.color) return false;
          if (orig.width !== rest.width) return false;
          if (orig.points.length !== rest.points.length) return false;

          for (let j = 0; j < orig.points.length; j++) {
            if (orig.points[j].x !== rest.points[j].x) return false;
            if (orig.points[j].y !== rest.points[j].y) return false;
          }
        }

        return true;
      }),
      { numRuns: 20 }
    );
  });

  // Feature: whiteboard-sketch-app, Property 3: Undo/redo round trip
  it('Property 3: undo() then redo() restores strokes to original contents and order', () => {
    fc.assert(
      fc.property(nonEmptyStrokesArb, (strokes) => {
        // Build initial state with the generated stroke history
        const initialState = createDefaultAppState();
        initialState.strokes = strokes.map((s) => ({ ...s }));

        const sm = createStateManager(initialState);

        // Capture the original strokes (snapshot by value)
        const originalStrokes = sm.getState().strokes.map((s) => ({ ...s }));
        const originalLength = originalStrokes.length;

        // Perform undo then redo
        sm.undo();
        sm.redo();

        const restoredStrokes = sm.getState().strokes;

        // Length must be identical
        if (restoredStrokes.length !== originalLength) return false;

        // Each stroke must match in id, tool, color, width, and points order
        for (let i = 0; i < originalLength; i++) {
          const orig = originalStrokes[i];
          const restored = restoredStrokes[i];

          if (orig.id !== restored.id) return false;
          if (orig.tool !== restored.tool) return false;
          if (orig.color !== restored.color) return false;
          if (orig.width !== restored.width) return false;
          if (orig.points.length !== restored.points.length) return false;

          for (let j = 0; j < orig.points.length; j++) {
            if (orig.points[j].x !== restored.points[j].x) return false;
            if (orig.points[j].y !== restored.points[j].y) return false;
          }
        }

        return true;
      }),
      { numRuns: 20 }
    );
  });
});
