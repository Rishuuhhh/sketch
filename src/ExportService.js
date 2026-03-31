/**
 * @fileoverview ExportService — exports the canvas as a PNG file download.
 */

/**
 * Creates an ExportService instance.
 *
 * @param {Object} [options]
 * @param {Document} [options.document] - The document object to use (defaults to globalThis.document).
 * @returns {{ exportPNG(canvas: HTMLCanvasElement): void }}
 */
export function createExportService({ document: doc = globalThis.document } = {}) {
  return {
    /**
     * Exports the given canvas as a PNG download.
     *
     * @param {HTMLCanvasElement} canvas
     */
    exportPNG(canvas) {
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/png');
      } catch (err) {
        alert(`Export failed: ${err.message}`);
        return;
      }

      const a = doc.createElement('a');
      a.href = dataUrl;
      a.download = 'sketch.png';
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
    },
  };
}
