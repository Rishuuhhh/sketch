/**
 * Viewport — tracks pan (offsetX, offsetY) and zoom for the infinite canvas.
 *
 * All stroke data lives in "world space".  The viewport transform maps world → screen:
 *   screenX = worldX * zoom + offsetX
 *   screenY = worldY * zoom + offsetY
 *
 * To go screen → world (for pointer events):
 *   worldX = (screenX - offsetX) / zoom
 *   worldY = (screenY - offsetY) / zoom
 */

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;

export function createViewport() {
  let offsetX = 0;
  let offsetY = 0;
  let zoom = 1;

  return {
    get offsetX() { return offsetX; },
    get offsetY() { return offsetY; },
    get zoom()    { return zoom; },

    /** Convert a screen-space point to world space. */
    toWorld(sx, sy) {
      return {
        x: (sx - offsetX) / zoom,
        y: (sy - offsetY) / zoom,
      };
    },

    /** Convert a world-space point to screen space. */
    toScreen(wx, wy) {
      return {
        x: wx * zoom + offsetX,
        y: wy * zoom + offsetY,
      };
    },

    /** Pan by (dx, dy) in screen pixels. */
    pan(dx, dy) {
      offsetX += dx;
      offsetY += dy;
    },

    /**
     * Zoom by `factor` keeping the screen point (cx, cy) fixed.
     * @param {number} factor  — multiply current zoom by this
     * @param {number} cx      — screen X of zoom pivot
     * @param {number} cy      — screen Y of zoom pivot
     */
    zoomAt(factor, cx, cy) {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
      const actualFactor = newZoom / zoom;
      // Adjust offset so the world point under (cx,cy) stays fixed
      offsetX = cx - (cx - offsetX) * actualFactor;
      offsetY = cy - (cy - offsetY) * actualFactor;
      zoom = newZoom;
    },

    /** Reset to origin, zoom 1. */
    reset() {
      offsetX = 0; offsetY = 0; zoom = 1;
    },

    /** Apply the transform to a 2D canvas context. */
    applyToContext(ctx) {
      ctx.setTransform(zoom, 0, 0, zoom, offsetX, offsetY);
    },
  };
}
