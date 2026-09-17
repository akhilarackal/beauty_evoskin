/*
 * Premium Collection
 *  - Filter panel toggle with an active-filter count
 *  - Sort auto-submits the facet form
 *  - Grid density switch (remembered per browser)
 *  - Quick add to cart from the card, wired into the theme's cart events
 */
(function () {
  'use strict';

  function init(root) {
    if (root.dataset.pcolReady === 'true') return;
    root.dataset.pcolReady = 'true';

    var form = root.querySelector('[data-pcol-form]');
    var filters = root.querySelector('[data-pcol-filters]');
    var toggle = root.querySelector('[data-pcol-filter-toggle]');
    var badge = root.querySelector('[data-pcol-active-count]');
    var sort = root.querySelector('[data-pcol-sort]');
    var grid = root.querySelector('[data-pcol-grid]');

    /* ---------- filter panel ---------- */

    function activeCount() {
      if (!filters) return 0;
      var checked = filters.querySelectorAll('input[type="checkbox"]:checked').length;
      var priced = 0;
      filters.querySelectorAll('input[type="number"]').forEach(function (i) {
        if (i.value !== '') priced = 1;
      });
      return checked + priced;
    }

    function paintBadge() {
      if (!badge) return;
      var n = activeCount();
      badge.textContent = n;
      badge.toggleAttribute('hidden', n === 0);
    }

    if (toggle && filters) {
      // Open automatically when filters are already applied.
      if (activeCount() > 0) {
        filters.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
      }

      toggle.addEventListener('click', function () {
        var open = filters.hasAttribute('hidden');
        filters.toggleAttribute('hidden', !open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      filters.addEventListener('change', paintBadge);
      paintBadge();
    }

    /* ---------- sort ---------- */

    if (sort && form) {
      sort.addEventListener('change', function () {
        submitForm();
      });
    }

    // Keep empty price fields out of the query string.
    function submitForm() {
      if (!form) return;
      form.querySelectorAll('input[type="number"]').forEach(function (i) {
        if (i.value === '') i.disabled = true;
      });
      form.submit();
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        submitForm();
      });
    }

    /* ---------- grid density ---------- */

    var densityBtns = root.querySelectorAll('[data-pcol-density]');
    var STORE_KEY = 'pcol:density';

    function applyDensity(value) {
      if (!grid) return;
      grid.dataset.density = value;
      densityBtns.forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.pcolDensity === value);
      });
    }

    if (densityBtns.length && grid) {
      var allowed = Array.prototype.map.call(densityBtns, function (b) {
        return b.dataset.pcolDensity;
      });

      var saved = null;
      try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* private mode */ }
      // Ignore a stored value that no longer matches an available option.
      if (saved && allowed.indexOf(saved) !== -1) applyDensity(saved);

      densityBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var value = btn.dataset.pcolDensity;
          applyDensity(value);
          try { localStorage.setItem(STORE_KEY, value); } catch (e) { /* ignore */ }
        });
      });
    }

    /* ---------- quick add ---------- */

    function notifyCart(variantId, quantity) {
      if (window.SmoorCart && window.SmoorCart.updateBadge) window.SmoorCart.updateBadge();
      if (window.publish && window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) {
        window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
          source: 'premium-collection',
          productVariantId: variantId,
          cartData: null,
          quantity: quantity
        });
      }
    }

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-pcol-add]');
      if (!btn) return;

      var variantId = btn.dataset.pcolAdd;
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
          if (!r.ok) return r.json().then(function (err) { throw new Error(err.description || 'Add failed'); });
          return r.json();
        })
        .then(function () {
          notifyCart(variantId, 1);
          btn.classList.remove('is-loading');
          btn.classList.add('is-added');
          setTimeout(function () {
            btn.classList.remove('is-added');
            btn.disabled = false;
          }, 1500);
        })
        .catch(function (err) {
          console.error('[premium-collection] ' + err.message);
          btn.classList.remove('is-loading');
          btn.disabled = false;
        });
    });
  }

  function initAll() {
    document.querySelectorAll('[data-pcol]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  if (window.Shopify && window.Shopify.designMode) {
    document.addEventListener('shopify:section:load', function (e) {
      var el = e.target.querySelector('[data-pcol]');
      if (el) init(el);
    });
  }
})();
