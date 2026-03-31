import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { createStateManager } from '../src/StateManager.js';
import { createDrawingEngine } from '../src/DrawingEngine.js';
import { createDefaultAppState } from '../src/types.js';

// Arbitrary for a CSS hex color string
const hexColorArb = fc.hexaString({ minLength: 6, maxLength: 6 }).map((h) => `#${h}`);

// Arbitrary for a single Point
const pointArb = fc.record({
  x: fc.integer({ min: 0, max: 2000 }),
  y: fc.integer({ min: 0, max: 2000 }),
});

// Arbitrary for a points array with at least 2 points (distinct pointer-down and pointer-up events)
const pointsArb = fc.array(pointArb, { minLength: 2, maxLength: 30 });

// Arbitrary for a stroke width
const strokeWidthArb = fc.integer({ min: 1, max: 50 });

/**
 * Helper: simulate drawing a single stroke through the engine.
 * Returns the committed stroke (last entry in stateManager.getState().strokes).
 */
function drawStroke(engine, points) {
  engine.onPointerDown({ offsetX: points[0].x, offsetY: points[0].y });
  for (let i = 1; i < points.length - 1; i++) {
    engine.onPointerMove({ offsetX: points[i].x, offsetY: points[i].y });
  }
  engine.onPointerUp({ offsetX: points[points.length - 1].x, offsetY: points[points.length - 1].y });
}

describe('DrawingEngine property tests', () => {
  // Feature: whiteboard-sketch-app, Property 1: Stroke commitment captures tool, color, width, and points
  it('Property 1: committed stroke has the exact tool, color, width, and ordered points that were active at draw time', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('pen', 'eraser'),
        hexColorArb,
        fc.integer({ min: 1, max: 50 }),
        pointsArb,
        (tool, color, width, points) => {
          // Set up real StateManager with default state
          const initialState = createDefaultAppState();
          const stateManager = createStateManager(initialState);

          // Mock storageService and renderer
          const storageService = { save: () => {} };
          const renderer = { render: () => {} };

          const engine = createDrawingEngine({ stateManager, storageService, renderer });

          // Configure tool/color/width on state
          stateManager.setTool(tool);
          stateManager.setColor(color);
          stateManager.setStrokeWidth(width);

          // Simulate pointer-down with first point
          engine.onPointerDown({ offsetX: points[0].x, offsetY: points[0].y });

          // Simulate pointer-move for middle points (if any)
          for (let i = 1; i < points.length - 1; i++) {
            engine.onPointerMove({ offsetX: points[i].x, offsetY: points[i].y });
          }

          // Simulate pointer-up with last point
          const lastPoint = points[points.length - 1];
          engine.onPointerUp({ offsetX: lastPoint.x, offsetY: lastPoint.y });

          // Assert exactly one stroke was committed
          const strokes = stateManager.getState().strokes;
          if (strokes.length !== 1) return false;

          const committed = strokes[0];

          // Tool, color, width must match
          if (committed.tool !== tool) return false;
          if (committed.color !== color) return false;
          if (committed.width !== width) return false;

          // Points must match in order
          if (committed.points.length !== points.length) return false;
          for (let i = 0; i < points.length; i++) {
            if (committed.points[i].x !== points[i].x) return false;
            if (committed.points[i].y !== points[i].y) return false;
          }

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: whiteboard-sketch-app, Property 2: Option changes apply to all subsequent strokes
  it('Property 2: strokes before an option change keep the original color/width; strokes after carry the new values', () => {
    // Arbitrary for a sequence of at least 1 stroke (each stroke needs ≥2 points)
    const strokeSeqArb = fc.array(pointsArb, { minLength: 1, maxLength: 5 });

    fc.assert(
      fc.property(
        hexColorArb,           // initial color
        strokeWidthArb,        // initial width
        strokeSeqArb,          // strokes drawn BEFORE the change
        hexColorArb,           // new color (may coincidentally equal initial; property still holds)
        strokeWidthArb,        // new width
        strokeSeqArb,          // strokes drawn AFTER the change
        (initialColor, initialWidth, strokesBefore, newColor, newWidth, strokesAfter) => {
          const stateManager = createStateManager(createDefaultAppState());
          const storageService = { save: () => {} };
          const renderer = { render: () => {} };
          const engine = createDrawingEngine({ stateManager, storageService, renderer });

          // Apply initial options
          stateManager.setColor(initialColor);
          stateManager.setStrokeWidth(initialWidth);

          // Draw strokes before the change
          for (const points of strokesBefore) {
            drawStroke(engine, points);
          }

          const countBefore = strokesBefore.length;

          // Change color and width
          stateManager.setColor(newColor);
          stateManager.setStrokeWidth(newWidth);

          // Draw strokes after the change
          for (const points of strokesAfter) {
            drawStroke(engine, points);
          }

          const allStrokes = stateManager.getState().strokes;

          // Verify total stroke count
          if (allStrokes.length !== strokesBefore.length + strokesAfter.length) return false;

          // Strokes committed BEFORE the change must carry the original color/width
          for (let i = 0; i < countBefore; i++) {
            if (allStrokes[i].color !== initialColor) return false;
            if (allStrokes[i].width !== initialWidth) return false;
          }

          // Strokes committed AFTER the change must carry the new color/width
          for (let i = countBefore; i < allStrokes.length; i++) {
            if (allStrokes[i].color !== newColor) return false;
            if (allStrokes[i].width !== newWidth) return false;
          }

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});
