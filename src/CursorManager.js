/**
 * CursorManager — dot cursors for pen and eraser.
 *
 * Pen   → small filled circle in the current stroke colour.
 * Eraser → hollow circle sized to the eraser width.
 */

function svgUri(svg, hx, hy) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, crosshair`;
}

function penCursor(color) {
  const size = 24, c = 12, arm = 6, gap = 3, r = 2.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <!-- shadow dot -->
    <circle cx="${c}" cy="${c}" r="${r + 1}" fill="rgba(0,0,0,0.45)"/>
    <!-- colour dot -->
    <circle cx="${c}" cy="${c}" r="${r}" fill="${color}"/>
  </svg>`;
  return svgUri(svg, c, c);
}

function eraserCursor(strokeWidth, zoom) {
  const r = Math.max(6, Math.min(48, (strokeWidth / 2) * zoom));
  const size = r * 2 + 6;
  const c = r + 3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="rgba(255,255,255,0.06)" stroke="rgba(0,0,0,0.6)" stroke-width="3"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-dasharray="4 3"/>
  </svg>`;
  return svgUri(svg, c, c);
}

export function createCursorManager(canvas, stateManager, viewport) {
  let last = {};

  function update() {
    const { activeTool, strokeWidth, strokeColor } = stateManager.getState();
    const zoom = viewport ? viewport.zoom : 1;

    if (activeTool === last.tool && strokeWidth === last.width &&
        zoom === last.zoom && strokeColor === last.color) return;

    last = { tool: activeTool, width: strokeWidth, zoom, color: strokeColor };

    canvas.style.cursor = activeTool === 'eraser'
      ? eraserCursor(strokeWidth, zoom)
      : penCursor(strokeColor);
  }

  return { update };
}
