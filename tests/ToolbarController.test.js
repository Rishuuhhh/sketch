import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createToolbarController } from '../src/ToolbarController.js';

function setupDOM() {
  document.body.innerHTML = `
    <button id="btn-pen" class="active"></button>
    <button id="btn-eraser"></button>
    <input id="color-picker" type="color" value="#000000" />
    <select id="stroke-width">
      <option value="2">S</option>
      <option value="6" selected>M</option>
      <option value="14">L</option>
    </select>
    <button id="btn-clear"></button>
    <button id="btn-undo"></button>
    <button id="btn-redo"></button>
    <button id="btn-export"></button>
    <canvas id="canvas"></canvas>
  `;
}

function createMockStateManager(overrides = {}) {
  return {
    getState: vi.fn(() => ({
      activeTool: 'pen',
      strokes: [],
      redoStack: [],
      strokeColor: '#000000',
      strokeWidth: 6,
      ...overrides,
    })),
    setTool: vi.fn(),
    setColor: vi.fn(),
    setStrokeWidth: vi.fn(),
    clearCanvas: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    commitStroke: vi.fn(),
  };
}

function createDeps(stateMgrOverrides = {}) {
  return {
    stateManager: createMockStateManager(stateMgrOverrides),
    exportService: { exportPNG: vi.fn() },
    renderer: { render: vi.fn() },
    storageService: { save: vi.fn() },
  };
}

describe('ToolbarController', () => {
  beforeEach(() => {
    setupDOM();
  });

  // 1. All required controls exist in the DOM
  it('renders all required toolbar controls', () => {
    expect(document.getElementById('btn-pen')).not.toBeNull();
    expect(document.getElementById('btn-eraser')).not.toBeNull();
    expect(document.getElementById('color-picker')).not.toBeNull();
    const select = document.getElementById('stroke-width');
    expect(select).not.toBeNull();
    expect(select.options.length).toBeGreaterThanOrEqual(3);
    expect(document.getElementById('btn-clear')).not.toBeNull();
    expect(document.getElementById('btn-undo')).not.toBeNull();
    expect(document.getElementById('btn-redo')).not.toBeNull();
    expect(document.getElementById('btn-export')).not.toBeNull();
  });

  // 2. Clicking pen calls stateManager.setTool('pen')
  it('clicking pen button calls stateManager.setTool("pen")', () => {
    const deps = createDeps();
    createToolbarController(deps);
    document.getElementById('btn-pen').click();
    expect(deps.stateManager.setTool).toHaveBeenCalledWith('pen');
  });

  // 3. Clicking eraser calls stateManager.setTool('eraser')
  it('clicking eraser button calls stateManager.setTool("eraser")', () => {
    const deps = createDeps();
    createToolbarController(deps);
    document.getElementById('btn-eraser').click();
    expect(deps.stateManager.setTool).toHaveBeenCalledWith('eraser');
  });

  // 4. Changing color picker calls stateManager.setColor(value)
  it('changing color picker calls stateManager.setColor with the new value', () => {
    const deps = createDeps();
    createToolbarController(deps);
    const picker = document.getElementById('color-picker');
    picker.value = '#ff0000';
    picker.dispatchEvent(new Event('change'));
    expect(deps.stateManager.setColor).toHaveBeenCalledWith('#ff0000');
  });

  // 5. Changing stroke width calls stateManager.setStrokeWidth(number)
  it('changing stroke width calls stateManager.setStrokeWidth with a number', () => {
    const deps = createDeps();
    createToolbarController(deps);
    const select = document.getElementById('stroke-width');
    select.value = '14';
    select.dispatchEvent(new Event('change'));
    expect(deps.stateManager.setStrokeWidth).toHaveBeenCalledWith(14);
  });

  // 6. Clicking clear calls stateManager.clearCanvas()
  it('clicking clear button calls stateManager.clearCanvas()', () => {
    const deps = createDeps();
    createToolbarController(deps);
    document.getElementById('btn-clear').click();
    expect(deps.stateManager.clearCanvas).toHaveBeenCalled();
  });

  // 7. Clicking undo calls stateManager.undo()
  it('clicking undo button calls stateManager.undo()', () => {
    const deps = createDeps({ strokes: [{ id: '1', tool: 'pen', color: '#000', width: 2, points: [] }] });
    createToolbarController(deps);
    document.getElementById('btn-undo').click();
    expect(deps.stateManager.undo).toHaveBeenCalled();
  });

  // 8. Clicking redo calls stateManager.redo()
  it('clicking redo button calls stateManager.redo()', () => {
    const deps = createDeps({ redoStack: [{ id: '1', tool: 'pen', color: '#000', width: 2, points: [] }] });
    createToolbarController(deps);
    document.getElementById('btn-redo').click();
    expect(deps.stateManager.redo).toHaveBeenCalled();
  });

  // 9. Clicking export calls exportService.exportPNG(canvas)
  it('clicking export button calls exportService.exportPNG with the canvas element', () => {
    const deps = createDeps();
    createToolbarController(deps);
    document.getElementById('btn-export').click();
    const canvas = document.getElementById('canvas');
    expect(deps.exportService.exportPNG).toHaveBeenCalledWith(canvas);
  });

  // 10. Active tool button has 'active' class; inactive does not
  it('active tool button has "active" class and inactive tool button does not', () => {
    const deps = createDeps({ activeTool: 'pen' });
    const controller = createToolbarController(deps);
    controller.updateButtonStates();
    expect(document.getElementById('btn-pen').classList.contains('active')).toBe(true);
    expect(document.getElementById('btn-eraser').classList.contains('active')).toBe(false);
  });

  it('switches active class to eraser when activeTool is "eraser"', () => {
    const deps = createDeps({ activeTool: 'eraser' });
    const controller = createToolbarController(deps);
    controller.updateButtonStates();
    expect(document.getElementById('btn-eraser').classList.contains('active')).toBe(true);
    expect(document.getElementById('btn-pen').classList.contains('active')).toBe(false);
  });
});
