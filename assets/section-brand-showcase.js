/**
 * section-brand-showcase.js
 *
 * Handles:
 *   1. Theme Editor compatibility — re-initialises on section reload
 *   2. Minimal JS footprint — layout handled entirely by CSS Grid
 *
 * No jQuery. No third-party libraries. Vanilla JS only.
 * Shopify Online Store 2.0 compatible.
 */

(function () {
  'use strict';

  var SECTION_TYPE = 'brand-showcase';
  var READY = new WeakSet();

  /**
   * Initialize a brand showcase section instance.
   * Currently CSS-only layout; this stub ensures future interactivity
   * can be added without changing the Liquid template.
   */
  function init(root) {
    if (!root || READY.has(root)) return;
    READY.add(root);
    root.setAttribute('data-brs-initialized', 'true');
  }

  function initAll() {
    document.querySelectorAll('[data-section-type="' + SECTION_TYPE + '"]').forEach(init);
  }

  /* Bootstrap */
  if (document.readyState !== 'loading') {
    initAll();
  } else {
    document.addEventListener('DOMContentLoaded', initAll);
  }

  /* Shopify Theme Editor — re-init on section reload */
  document.addEventListener('shopify:section:load', function (e) {
    var root = e.target.querySelector('[data-section-type="' + SECTION_TYPE + '"]');
    if (root) {
      READY.delete(root);
      init(root);
    }
  });

  document.addEventListener('shopify:section:select', function (e) {
    var root = e.target.querySelector('[data-section-type="' + SECTION_TYPE + '"]');
    if (root) {
      READY.delete(root);
      init(root);
    }
  });

})();
