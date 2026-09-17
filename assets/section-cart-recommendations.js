/*
 * Cart Recommendations
 * Requests the Product Recommendations section markup for the first cart
 * item, then swaps it in. Also handles the quick-add plus button.
 */
(function () {
  'use strict';

  function load(root) {
    if (root.dataset.crecsLoaded === 'true') return;

    var productId = root.dataset.productId;
    var baseUrl = root.dataset.url;
    var sectionId = root.dataset.sectionId;
    var limit = root.dataset.limit || '4';
    var intent = root.dataset.intent || 'related';

    // Nothing in the cart to base a recommendation on.
    if (!productId || !baseUrl || !sectionId) return;

    root.dataset.crecsLoaded = 'true';

    var url = baseUrl +
      '?section_id=' + encodeURIComponent(sectionId) +
      '&product_id=' + encodeURIComponent(productId) +
      '&limit=' + encodeURIComponent(limit) +
      '&intent=' + encodeURIComponent(intent);

    fetch(url)
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var fresh = doc.querySelector('[data-cart-recs] .crecs__inner');
        var target = root.querySelector('.crecs__inner');
        if (fresh && target) {
          target.innerHTML = fresh.innerHTML;
        }
      })
      .catch(function (err) {
        console.error('[cart-recommendations] ' + err.message);
      });
  }

  function initQuickAdd(root) {
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-crecs-add]');
      if (!btn) return;

      var variantId = btn.dataset.crecsAdd;
      if (!variantId || btn.disabled || btn.classList.contains('is-loading')) return;

      btn.classList.add('is-loading');
      btn.disabled = true;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ id: parseInt(variantId, 10), quantity: 1 })
      })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (x) { throw new Error(x.description || 'Add failed'); });
          return r.json();
        })
        .then(function () {
          btn.classList.remove('is-loading');
          btn.classList.add('is-added');
          // The cart totals on this page are now stale, so refresh.
          setTimeout(function () { window.location.reload(); }, 600);
        })
        .catch(function (err) {
          console.error('[cart-recommendations] ' + err.message);
          btn.classList.remove('is-loading');
          btn.disabled = false;
        });
    });
  }

  function init() {
    document.querySelectorAll('[data-cart-recs]').forEach(function (root) {
      load(root);
      initQuickAdd(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
