/**
 * Alarm Clock — New Tab page behaviour.
 *
 * Wires up the alarm form and list UI. All event handlers are attached
 * via addEventListener (no inline handlers) to comply with MV3 CSP.
 */

(function () {
  'use strict';

  /**
   * Initialises the New Tab alarm clock page.
   * Called on DOMContentLoaded.
   */
  function initNewTab() {
    // Placeholder — UI wiring will be added in later steps.
    var statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = '';
    }
  }

  document.addEventListener('DOMContentLoaded', initNewTab);
})();
