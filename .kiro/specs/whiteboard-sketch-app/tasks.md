# Implementation Plan: Whiteboard Sketch App

## Overview

Implement a browser-only whiteboard app using vanilla HTML5, CSS, and JavaScript. The architecture uses a central `AppState` object, replay-based rendering, and the Pointer Events API. No external dependencies except `fast-check` for property-based tests.

## Tasks

- [x] 1. Set up project structure and core data types
  - Create `index.html` with canvas element and toolbar placeholder
  - Create `src/types.js` (or inline JSDoc types) defining `Stroke`, `Point`, and `AppState` shapes
  - Set up `package.json` with `fast-check` and a test runner (e.g., vitest) as dev dependencies
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 2. Implement StateManager
  - [x] 2.1 Implement `StateManager` module with `getState`, `commitStroke`, `undo`, `redo`, `clearCanvas`, `setTool`, `setColor`, `setStrokeWidth`
    - `clearCanvas()` pushes a sentinel `{ tool: 'clear', points: [] }` stroke so the action is undoable
    - `commitStroke()` clears `redoStack` when tool is pen or eraser
    - _Requirements: 4.1, 4.2, 4.5, 5.2, 5.3_

  - [x] 2.2 Write property test for undo/redo round trip
    - **Property 3: Undo/redo round trip**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 2.3 Write property test for new stroke clears redo stack
    - **Property 5: New stroke after undo clears redo stack**
    - **Validates: Requirements 4.5**

  - [x] 2.4 Write property test for clear canvas undoability
    - **Property 6: Clear canvas is undoable**
    - **Validates: Requirements 5.2, 5.3**

  - [x] 2.5 Write unit tests for StateManager edge cases
    - Undo no-op when history is empty
    - Redo no-op when redo stack is empty
    - _Requirements: 4.3, 4.4_

- [x] 3. Implement StorageService
  - [x] 3.1 Implement `StorageService` with `save(strokes)` and `load()` using `localStorage` key `wsa_strokes`
    - `save()` catches `QuotaExceededError` and logs a warning without crashing
    - `load()` catches malformed JSON and returns `null`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 3.2 Write property test for persistence round trip
    - **Property 7: Persistence round trip**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 3.3 Write unit tests for StorageService edge cases
    - `load()` returns `null` when localStorage is empty → blank canvas
    - `load()` returns `null` on malformed JSON
    - _Requirements: 6.3_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Renderer
  - [x] 5.1 Implement `Renderer.render(state)` that clears the canvas and replays all strokes
    - Pen strokes use `lineTo` / `arc` with saved color and width
    - Eraser strokes use `ctx.globalCompositeOperation = 'destination-out'`
    - Clear sentinel strokes call `ctx.clearRect(...)` mid-replay
    - Render `activeStroke` on top if non-null
    - _Requirements: 1.1, 1.4, 2.2, 2.3_

  - [x] 5.2 Write unit tests for Renderer
    - Verify canvas is cleared before replay
    - Verify eraser uses `destination-out` composite operation
    - Verify clear sentinel triggers `clearRect` mid-replay
    - _Requirements: 2.2, 2.3, 5.2_

- [x] 6. Implement DrawingEngine
  - [x] 6.1 Implement `DrawingEngine` with `onPointerDown`, `onPointerMove`, `onPointerUp` handlers
    - `onPointerDown` creates a new `activeStroke` from current state
    - `onPointerMove` appends the point and triggers incremental render; guards against null `activeStroke`
    - `onPointerUp` commits `activeStroke` to `StateManager`, persists via `StorageService`, clears `activeStroke`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 6.2 Write property test for stroke commitment
    - **Property 1: Stroke commitment captures tool, color, width, and points**
    - **Validates: Requirements 1.1, 1.2, 2.2, 2.3**

  - [x] 6.3 Write property test for option changes apply to subsequent strokes
    - **Property 2: Option changes apply to all subsequent strokes**
    - **Validates: Requirements 3.3, 3.4**

- [x] 7. Implement ToolbarController and HTML toolbar
  - [x] 7.1 Build toolbar HTML with pen, eraser, color picker, stroke-width selector (≥3 sizes), clear, undo, redo, and export controls
    - Visually highlight the active tool
    - Disable undo button when `strokes` is empty; disable redo button when `redoStack` is empty
    - _Requirements: 2.1, 2.4, 3.1, 3.2, 4.3, 4.4, 5.1, 7.1_

  - [x] 7.2 Implement `ToolbarController` that wires toolbar DOM events to `StateManager` methods and updates button states on state changes
    - _Requirements: 2.4, 3.3, 3.4, 4.3, 4.4_

  - [x] 7.3 Write property test for empty history disables controls
    - **Property 4: Empty history disables undo/redo controls**
    - **Validates: Requirements 4.3, 4.4**

  - [x] 7.4 Write unit tests for ToolbarController
    - Toolbar renders pen, eraser, color picker, width options, clear, export, undo, redo controls
    - _Requirements: 2.1, 3.1, 3.2, 5.1, 7.1_

- [x] 8. Implement ExportService
  - [x] 8.1 Implement `ExportService.exportPNG(canvas)` using `canvas.toDataURL('image/png')` and a programmatic `<a download>` click
    - Catch `toDataURL` errors and show a user-facing alert
    - _Requirements: 7.2, 7.3_

  - [x] 8.2 Write property test for export preserves canvas dimensions
    - **Property 8: Export preserves canvas dimensions**
    - **Validates: Requirements 7.3**

  - [x] 8.3 Write unit tests for ExportService
    - Export triggers a download with a `.png` filename
    - _Requirements: 7.2_

- [x] 9. Wire everything together in `main.js`
  - [x] 9.1 Initialize `AppState`, instantiate all modules, attach `DrawingEngine` pointer listeners to the canvas, load persisted strokes via `StorageService`, and perform initial render
    - _Requirements: 1.3, 6.2, 6.3_

  - [x] 9.2 Write integration tests for full load/draw/persist cycle
    - Simulate pointer events → verify strokes committed and persisted
    - Reload state from storage → verify canvas restored
    - _Requirements: 6.1, 6.2_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per property
- Each property test must include the comment: `// Feature: whiteboard-sketch-app, Property <N>: <property_text>`
