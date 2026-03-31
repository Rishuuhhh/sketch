import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExportService } from '../src/ExportService.js';

/**
 * Creates a minimal fake document for testing.
 * Tracks created <a> elements and their interactions.
 */
function createFakeDocument() {
  const bodyChildren = [];
  const createdElements = [];

  const body = {
    appendChild(el) { bodyChildren.push(el); },
    removeChild(el) {
      const idx = bodyChildren.indexOf(el);
      if (idx !== -1) bodyChildren.splice(idx, 1);
    },
    get children() { return bodyChildren; },
  };

  return {
    body,
    createdElements,
    createElement(tag) {
      const el = {
        tag,
        href: '',
        download: '',
        clicked: false,
        click() { this.clicked = true; },
      };
      createdElements.push(el);
      return el;
    },
  };
}

describe('ExportService', () => {
  let fakeDoc;
  let service;
  let canvas;

  beforeEach(() => {
    fakeDoc = createFakeDocument();
    service = createExportService({ document: fakeDoc });

    canvas = {
      toDataURL: vi.fn(() => 'data:image/png;base64,abc123'),
    };
  });

  it('calls toDataURL with image/png', () => {
    service.exportPNG(canvas);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('creates an <a> element with the data URL as href', () => {
    service.exportPNG(canvas);
    const a = fakeDoc.createdElements[0];
    expect(a.tag).toBe('a');
    expect(a.href).toBe('data:image/png;base64,abc123');
  });

  it('sets download attribute to sketch.png', () => {
    service.exportPNG(canvas);
    const a = fakeDoc.createdElements[0];
    expect(a.download).toBe('sketch.png');
  });

  it('clicks the anchor element to trigger download', () => {
    service.exportPNG(canvas);
    const a = fakeDoc.createdElements[0];
    expect(a.clicked).toBe(true);
  });

  it('removes the anchor from document.body after clicking', () => {
    service.exportPNG(canvas);
    expect(fakeDoc.body.children.length).toBe(0);
  });

  it('shows an alert and returns early when toDataURL throws', () => {
    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
    canvas.toDataURL.mockImplementation(() => { throw new Error('tainted canvas'); });

    service.exportPNG(canvas);

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Export failed'));
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('tainted canvas'));
    // No <a> element should have been created
    expect(fakeDoc.createdElements.length).toBe(0);

    alertSpy.mockRestore();
  });
});
