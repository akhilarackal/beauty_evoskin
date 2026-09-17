/*
 * Premium Cart
 * Live quantity changes and line removal via the Cart AJAX API.
 * The page reloads once the cart is empty so the empty state renders.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-pcart]');
  if (!root) return;

  function changeLine(key, quantity, lineEl) {
    if (lineEl) lineEl.classList.add('is-busy');

    return fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: key, quantity: quantity })
    })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        // Totals, the shipping bar and the summary all shift together,
        // so a reload keeps every number consistent and correct.
        window.location.reload();
        return cart;
      })
      .catch(function (err) {
        console.error('[premium-cart] ' + err.message);
        if (lineEl) lineEl.classList.remove('is-busy');
      });
  }

  function lineFor(el) {
    return el.closest('[data-pcart-line]');
  }

  function qtyInputFor(lineEl) {
    return lineEl.querySelector('[data-pcart-qty-input]');
  }

  root.addEventListener('click', function (e) {
    var minus = e.target.closest('[data-pcart-minus]');
    var plus = e.target.closest('[data-pcart-plus]');
    var remove = e.target.closest('[data-pcart-remove]');

    if (!minus && !plus && !remove) return;

    var lineEl = lineFor(e.target);
    if (!lineEl) return;

    var key = lineEl.dataset.key;

    if (remove) {
      changeLine(key, 0, lineEl);
      return;
    }

    var input = qtyInputFor(lineEl);
    var current = parseInt(input ? input.value : '1', 10) || 1;
    var next = minus ? current - 1 : current + 1;

    if (next < 0) next = 0;
    changeLine(key, next, lineEl);
  });

  // Typing a quantity directly
  root.addEventListener('change', function (e) {
    var input = e.target.closest('[data-pcart-qty-input]');
    if (!input) return;

    var lineEl = lineFor(input);
    if (!lineEl) return;

    var value = parseInt(input.value, 10);
    if (isNaN(value) || value < 0) value = 0;

    changeLine(lineEl.dataset.key, value, lineEl);
  });
})();
