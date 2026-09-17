/**
 * section-campaign-showcase.js
 *
 * Handles:
 *   1. Promo code copy to clipboard (Clipboard API with fallback)
 *   2. "Copied!" button text animation (2-second reset)
 *   3. Theme Editor compatibility — re-initialises on section reload
 *
 * No jQuery. No third-party libraries. Vanilla JS only.
 * Shopify Online Store 2.0 compatible.
 */

(function () {
  'use strict';

  /* ================================================================
     WeakSet guard — prevents double-binding on Theme Editor reloads
  ================================================================ */
  var READY = new WeakSet();

  /* ================================================================
     COPY PROMO CODE
     Uses the modern Clipboard API with a document.execCommand fallback
     for older browsers / non-HTTPS contexts.
  ================================================================ */

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for HTTP / older browsers
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) { resolve(); } else { reject(new Error('execCommand copy failed')); }
      } catch (err) {
        document.body.removeChild(ta);
        reject(err);
      }
    });
  }

  function handleCopyBtn(btn) {
    var code        = btn.dataset.csCopy;
    var copiedLabel = btn.dataset.csCopiedLabel || 'Copied!';
    var labelEl     = btn.querySelector('.cs-banner__copy-label');
    var originalLabel = labelEl ? labelEl.textContent : 'Copy Code';

    if (!code) return;

    copyToClipboard(code)
      .then(function () {
        // Success — show "Copied!" for 2 seconds
        btn.classList.add('is-copied');
        if (labelEl) labelEl.textContent = copiedLabel;
        btn.setAttribute('aria-label', copiedLabel + ' ' + code);

        setTimeout(function () {
          btn.classList.remove('is-copied');
          if (labelEl) labelEl.textContent = originalLabel;
          btn.setAttribute('aria-label', 'Copy promo code ' + code);
        }, 2000);
      })
      .catch(function (err) {
        console.warn('[Campaign Showcase] Clipboard copy failed:', err);
      });
  }

  /* ================================================================
     INIT — attach listeners to all copy buttons in a section root
  ================================================================ */

  function init(root) {
    if (READY.has(root)) return;
    READY.add(root);

    root.querySelectorAll('[data-cs-copy]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        handleCopyBtn(btn);
      });
    });
  }

  function initAll() {
    document.querySelectorAll('[data-section-type="campaign-showcase"]').forEach(init);
  }

  /* ================================================================
     Bootstrap
  ================================================================ */
  if (document.readyState !== 'loading') {
    initAll();
  } else {
    document.addEventListener('DOMContentLoaded', initAll);
  }

  /* Shopify Theme Editor — re-init when section is reloaded */
  document.addEventListener('shopify:section:load', function (e) {
    var root = e.target.querySelector('[data-section-type="campaign-showcase"]');
    if (root) {
      READY.delete(root);
      init(root);
    }
  });

  /* Theme Editor — re-attach on setting changes */
  document.addEventListener('shopify:section:select', function (e) {
    var root = e.target.querySelector('[data-section-type="campaign-showcase"]');
    if (root) {
      READY.delete(root);
      init(root);
    }
  });

})();
