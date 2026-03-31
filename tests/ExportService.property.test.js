import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { createExportService } from '../src/ExportService.js';

// Feature: whiteboard-sketch-app, Property 8: Export preserves canvas dimensions

describe('ExportService property tests', () => {
  // **Validates: Requirements 7.3**
  it('Property 8: exportPNG uses the canvas toDataURL output as-is, preserving canvas dimensions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2000 }), // width
        fc.integer({ min: 1, max: 2000 }), // height
        (width, height) => {
          // Create a mock canvas that encodes its own dimensions in the data URL
          const canvas = {
            width,
            height,
            toDataURL(_type) {
              // Encode dimensions into the data URL so we can verify they pass through
              return `data:image/png;base64,${btoa(JSON.stringify({ w: width, h: height }))}`;
            },
          };

          // Capture the href set on the anchor element
          let capturedHref = null;
          const fakeDoc = {
            body: {
              appendChild() {},
              removeChild() {},
            },
            createElement(_tag) {
              return {
                set href(val) { capturedHref = val; },
                get href() { return capturedHref; },
                download: '',
                click() {},
              };
            },
          };

          const service = createExportService({ document: fakeDoc });
          service.exportPNG(canvas);

          // The data URL must be exactly what toDataURL returned (no transformation)
          const expectedUrl = `data:image/png;base64,${btoa(JSON.stringify({ w: width, h: height }))}`;
          if (capturedHref !== expectedUrl) return false;

          // Decode and verify the dimensions are preserved
          const base64Part = capturedHref.split(',')[1];
          const decoded = JSON.parse(atob(base64Part));
          return decoded.w === width && decoded.h === height;
        }
      ),
      { numRuns: 100 }
    );
  });
});
