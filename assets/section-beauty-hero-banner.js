/**
 * Beauty Hero Banner — section-beauty-hero-banner.js
 * Minimal JS: handles Theme Editor lifecycle events for instant preview updates.
 */
(function () {
  'use strict';

  var SECTION_TYPE = 'beauty-hero-banner';

  function init(container) {
    if (!container) return;
    container.setAttribute('data-bhb-initialized', 'true');
  }

  /* Theme Editor: re-initialize on section load / select */
  if (window.Shopify && Shopify.designMode) {
    document.addEventListener('shopify:section:load', function (evt) {
      var section = evt.target.querySelector('[data-section-type="' + SECTION_TYPE + '"]');
      if (section) init(section);
    });

    document.addEventListener('shopify:section:select', function (evt) {
      var section = evt.target.querySelector('[data-section-type="' + SECTION_TYPE + '"]');
      if (section) init(section);
    });
  }

  /* Auto-init on DOMContentLoaded */
  document.addEventListener('DOMContentLoaded', function () {
    var sections = document.querySelectorAll('[data-section-type="' + SECTION_TYPE + '"]');
    sections.forEach(init);
  });
})();
