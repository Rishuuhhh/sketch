/**
 * Bug Condition Exploration Test — Colour Panel Obscured by Canvas
 *
 * Property 1: Bug Condition — Colour Panel Obscured by Canvas
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * CRITICAL: This test is EXPECTED TO FAIL on unfixed code.
 * Failure confirms the bug exists (missing stacking context on #toolbar).
 * The test encodes the expected behavior — it will PASS after the fix is applied.
 *
 * Root cause under investigation:
 *   - #toolbar has no `position:relative; z-index:10`
 *   - .color-panel has `position:absolute; z-index:999` but its parent (#toolbar)
 *     does not form an isolated stacking context
 *   - #canvas-container follows #toolbar in DOM order and paints over it
 */

import { describe, it, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Set up the DOM to mirror the relevant structure from index.html.
 * Includes #toolbar with .color-panel children and #canvas-container with #canvas.
 */
function setupDOM() {
  document.head.innerHTML = `
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{display:flex;flex-direction:column;height:100vh;overflow:hidden}

      /* #toolbar — UNFIXED: no position:relative; z-index:10 */
      #toolbar{display:flex;align-items:center;gap:4px;padding:9px 14px;background:rgba(16,16,16,0.97);border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}

      .color-btn-wrap{position:relative}

      /* .color-panel — has z-index:999 but parent has no stacking context */
      .color-panel{position:absolute;top:calc(100% + 8px);left:0;z-index:999;background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px;width:220px;display:none;flex-direction:column;gap:12px}
      .color-panel.open{display:flex}

      /* #canvas-container — creates a stacking context via position:relative */
      #canvas-container{flex:1;display:flex;justify-content:center;align-items:center;overflow:hidden;position:relative}
      #canvas{display:block;touch-action:none}
    </style>
  `;

  document.body.innerHTML = `
    <div id="toolbar">
      <div class="color-btn-wrap" id="stroke-picker-wrap">
        <div class="color-btn" id="stroke-color-btn">Stroke</div>
        <div class="color-panel" id="stroke-panel"></div>
      </div>
      <div class="color-btn-wrap" id="bg-picker-wrap">
        <div class="color-btn" id="bg-color-btn">Background</div>
        <div class="color-panel" id="bg-panel"></div>
      </div>
    </div>
    <div id="canvas-container">
      <canvas id="canvas" width="800" height="600"></canvas>
    </div>
  `;
}

/**
 * Determine whether the panel element is effectively visible above the canvas.
 *
 * Strategy: inspect the actual CSS stylesheet rules for #toolbar to check whether
 * it has the stacking context properties (position:relative + z-index) required
 * to guarantee the colour panel paints above #canvas-container.
 *
 * jsdom's getComputedStyle does not fully compute CSS cascade values (returns ''
 * for unset properties instead of 'static'/'auto'), so we read the stylesheet
 * directly via document.styleSheets to get the declared CSS text for #toolbar.
 *
 * Bug condition (unfixed): #toolbar CSS rule does NOT contain both
 *   `position` and `z-index` declarations.
 * Fixed: #toolbar CSS rule DOES contain `position:relative` and `z-index:10`
 *   (or any numeric z-index), giving it a stacking context that isolates the
 *   colour panel above #canvas-container.
 *
 * @param {HTMLElement} panelEl - the .color-panel element
 * @returns {{ panelOpen: boolean, panelVisible: boolean, toolbarHasStackingContext: boolean }}
 */
function inspectPanelVisibility(panelEl) {
  const panelOpen = panelEl.classList.contains('open');

  // Read the declared CSS text for #toolbar from the stylesheet
  let toolbarCssText = '';
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText === '#toolbar') {
          toolbarCssText = rule.style.cssText;
          break;
        }
      }
    } catch (_) {
      // cross-origin sheets — skip
    }
    if (toolbarCssText) break;
  }

  // A stacking context requires both position (non-static) and a numeric z-index.
  // We check the declared style properties directly.
  const hasPosition = toolbarCssText.includes('position') &&
    !toolbarCssText.match(/position\s*:\s*static/);
  const hasZIndex = /z-index\s*:\s*\d/.test(toolbarCssText);
  const toolbarHasStackingContext = hasPosition && hasZIndex;

  // The panel is visible above the canvas only when the toolbar forms a stacking context
  const panelVisible = toolbarHasStackingContext;

  return { panelOpen, panelVisible, toolbarHasStackingContext, toolbarCssText };
}

describe('Property 1: Bug Condition — Colour Panel Obscured by Canvas', () => {
  beforeEach(() => {
    setupDOM();
  });

  /**
   * Scoped PBT: concrete failing cases — stroke panel open and background panel open.
   *
   * For any DOM state where a colour panel has the `open` class (panelOpen=true),
   * the panel's effective stacking order SHALL be above the canvas (panelVisible=true).
   *
   * On UNFIXED code: this test FAILS because #toolbar has no stacking context.
   * On FIXED code: this test PASSES because #toolbar gets position:relative; z-index:10.
   *
   * Validates: Requirements 1.1, 1.2, 1.3
   */
  it('Property 1a: stroke panel is visible above canvas when open (isBugCondition: panelOpen=true)', () => {
    fc.assert(
      fc.property(
        // Scoped to the concrete failing case: stroke panel is open
        fc.constant({ panelId: 'stroke-panel', isBugCondition: true }),
        ({ panelId }) => {
          setupDOM();

          const panel = document.getElementById(panelId);
          // Open the panel
          panel.classList.add('open');

          const { panelOpen, panelVisible } = inspectPanelVisibility(panel);

          // panelOpen must be true (sanity check)
          if (!panelOpen) return false;

          // The property: when the panel is open, it must be visible above the canvas
          return panelVisible === true;
        }
      ),
      { numRuns: 1 } // Scoped: single concrete case, deterministic
    );
  });

  it('Property 1b: background panel is visible above canvas when open (isBugCondition: panelOpen=true)', () => {
    fc.assert(
      fc.property(
        // Scoped to the concrete failing case: background panel is open
        fc.constant({ panelId: 'bg-panel', isBugCondition: true }),
        ({ panelId }) => {
          setupDOM();

          const panel = document.getElementById(panelId);
          // Open the panel
          panel.classList.add('open');

          const { panelOpen, panelVisible } = inspectPanelVisibility(panel);

          // panelOpen must be true (sanity check)
          if (!panelOpen) return false;

          // The property: when the panel is open, it must be visible above the canvas
          return panelVisible === true;
        }
      ),
      { numRuns: 1 } // Scoped: single concrete case, deterministic
    );
  });

  /**
   * Sanity check: when no panel is open, there is no bug condition.
   * This should PASS on both unfixed and fixed code.
   *
   * Validates: Requirements 1.1, 1.2, 1.3 (negative case)
   */
  it('Property 1c: no bug condition when panels are closed', () => {
    fc.assert(
      fc.property(
        fc.constant({ strokeOpen: false, bgOpen: false }),
        () => {
          setupDOM();

          const strokePanel = document.getElementById('stroke-panel');
          const bgPanel = document.getElementById('bg-panel');

          // Both panels closed — no bug condition
          const strokeResult = inspectPanelVisibility(strokePanel);
          const bgResult = inspectPanelVisibility(bgPanel);

          return strokeResult.panelOpen === false && bgResult.panelOpen === false;
        }
      ),
      { numRuns: 1 }
    );
  });
});
