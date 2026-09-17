/*
 * Bestsellers — quick add to cart from the card.
 * Adds the product, then lets the theme know so the header badge and the
 * floating cart bar both update.
 */
(function () {
  'use strict';

  function notifyThemeCartChanged(variantId, quantity) {
    if (window.SmoorCart && window.SmoorCart.updateBadge) {
      window.SmoorCart.updateBadge();
    }
    if (window.publish && window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) {
      window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
        source: 'bestsellers',
        productVariantId: variantId,
        cartData: null,
        quantity: quantity
      });
    }
  }

  function addToCart(btn) {
    var variantId = btn.dataset.bsAdd;
    if (!variantId) return;
    if (btn.disabled || btn.classList.contains('is-loading')) return;

    btn.classList.add('is-loading');
    btn.disabled = true;

    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root)
      ? window.Shopify.routes.root : '/';
    if (root.charAt(root.length - 1) !== '/') root += '/';

    fetch(root + 'cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ id: parseInt(variantId, 10), quantity: 1 })
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.description || err.message || 'Add to cart failed');
          });
        }
        return res.json();
      })
      .then(function () {
        notifyThemeCartChanged(variantId, 1);

        btn.classList.remove('is-loading');
        btn.classList.add('is-added');

        setTimeout(function () {
          btn.classList.remove('is-added');
          btn.disabled = false;
        }, 1600);
      })
      .catch(function (err) {
        console.error('[bestsellers] ' + err.message);
        btn.classList.remove('is-loading');
        btn.disabled = false;
      });
  }

  function init(root) {
    if (root.dataset.bsReady === 'true') return;
    root.dataset.bsReady = 'true';

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-bs-add]');
      if (!btn) return;
      // it is a <button>, so stop the click reaching the card link
      e.preventDefault();
      e.stopPropagation();
      addToCart(btn);
    });
  }

  function initAll() {
    document.querySelectorAll('[data-section-type="bestsellers"]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  if (window.Shopify && window.Shopify.designMode) {
    document.addEventListener('shopify:section:load', function (e) {
      var el = e.target.querySelector('[data-section-type="bestsellers"]');
      if (el) init(el);
    });
  }
})();
