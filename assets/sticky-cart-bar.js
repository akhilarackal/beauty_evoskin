/*
 * Sticky Cart Bar — global floating bottom bar (Zomato-style).
 *
 * Behaviour
 *  - Shows on every page whenever the cart has items.
 *  - On product pages it always shows, with a quantity stepper and
 *    "Add to cart" for the current product.
 *  - The tab above the bar expands a mini cart: change quantities,
 *    remove lines, see the total, and go to checkout.
 */
(function () {
  'use strict';

  var bar = document.querySelector('[data-zcart]');
  if (!bar) return;

  var isProductPage = bar.dataset.isProduct === 'true';
  var moneyFormat = bar.dataset.moneyFormat || '${{amount}}';
  var cartUrl = bar.dataset.cartUrl || '/cart';

  var tab = bar.querySelector('[data-zcart-tab]');
  var tabLabel = bar.querySelector('[data-zcart-tab-label]');
  var list = bar.querySelector('[data-zcart-list]');
  var totalEl = bar.querySelector('[data-zcart-total]');
  var divider = bar.querySelector('[data-zcart-divider]');
  var thumb = bar.querySelector('[data-zcart-thumb]');
  var meta = bar.querySelector('[data-zcart-meta]');
  var titleEl = bar.querySelector('[data-zcart-title]');
  var subText = bar.querySelector('[data-zcart-sub-text]');
  var closeBtn = bar.querySelector('[data-zcart-close]');

  var qtyInput = bar.querySelector('[data-zcart-qty-input]');
  var minusBtn = bar.querySelector('[data-zcart-minus]');
  var plusBtn = bar.querySelector('[data-zcart-plus]');
  var addBtn = bar.querySelector('[data-zcart-add]');
  var buyBtn = bar.querySelector('[data-zcart-buy]');

  // Optional: the product hero on the product page, for variant/qty sync.
  var heroSection = document.querySelector('.section-lph');
  var heroForm = heroSection ? heroSection.querySelector('[data-lph-form]') : null;
  var heroQty = heroSection ? heroSection.querySelector('[data-lph-qty-input]') : null;
  var heroAddBtn = heroSection ? heroSection.querySelector('[data-lph-add-btn]') : null;

  var dismissed = false;
  var cartState = null;
  var lastAddedKey = null;
  var lastAddedVariantId = null;

  /* ---------------- helpers ---------------- */

  function formatMoney(cents) {
    var value = (cents || 0) / 100;
    function withDelimiters(num, precision, thousands, decimal) {
      num = num.toFixed(precision);
      var parts = num.split('.');
      var int = parts[0].replace(/(\d)(?=(\d{3})+$)/g, '$1' + thousands);
      var dec = parts[1] ? decimal + parts[1] : '';
      return int + dec;
    }
    return moneyFormat.replace(/\{\{\s*(\w+)\s*\}\}/g, function (_m, name) {
      switch (name) {
        case 'amount':
          return withDelimiters(value, 2, ',', '.');
        case 'amount_no_decimals':
          return withDelimiters(value, 0, ',', '.');
        case 'amount_with_comma_separator':
          return withDelimiters(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator':
          return withDelimiters(value, 0, '.', ',');
        default:
          return withDelimiters(value, 2, ',', '.');
      }
    });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function itemsLabel(count) {
    return count === 1 ? '1 item' : count + ' items';
  }

  function sizedImage(src, size) {
    if (!src) return '';
    return src.replace(/(\.(?:png|jpe?g|gif|webp))(\?|$)/i, '_' + size + 'x$1$2');
  }

  function rememberAddedItem(item) {
    if (!item) return;
    lastAddedKey = item.key || lastAddedKey;
    lastAddedVariantId = item.variant_id || item.id || lastAddedVariantId;
  }

  function rememberAddedVariant(variantId) {
    if (!variantId) return;
    lastAddedVariantId = parseInt(variantId, 10) || lastAddedVariantId;
  }

  function thumbItems(items) {
    if (!items || !items.length) return [];

    var ordered = items.slice();
    var addedIndex = ordered.findIndex(function (item) {
      if (lastAddedKey && item.key === lastAddedKey) return true;
      return lastAddedVariantId && parseInt(item.variant_id, 10) === parseInt(lastAddedVariantId, 10);
    });

    if (addedIndex >= 0) {
      var addedItem = ordered.splice(addedIndex, 1)[0];
      ordered = ordered.slice(0, 3);
      ordered.push(addedItem);
    }

    return ordered;
  }

  function visibleThumbItems(items) {
    return thumbItems(items).filter(function (item) { return item.image; }).slice(0, 4);
  }

  function renderThumbStack(visibleItems) {
    if (visibleItems.length === 1) {
      return '<img src="' + escapeHtml(sizedImage(visibleItems[0].image, 120)) + '" alt="" width="44" height="44" loading="lazy">';
    }

    return (
      '<span class="zcart__thumb-stack" aria-hidden="true">' +
        visibleItems.map(function (item, index) {
          return (
            '<span class="zcart__thumb-img zcart__thumb-img--' + (index + 1) + '">' +
              '<img src="' + escapeHtml(sizedImage(item.image, 120)) + '" alt="" width="44" height="44" loading="lazy">' +
            '</span>'
          );
        }).join('') +
      '</span>'
    );
  }

  /* ---------------- cart data ---------------- */

  function fetchCart() {
    return fetch('/cart.js', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); });
  }

  function refresh() {
    return fetchCart().then(function (cart) {
      cartState = cart;
      render();
      return cart;
    }).catch(function () { /* keep last known state */ });
  }

  /* ---------------- rendering ---------------- */

  function render() {
    var count = cartState ? cartState.item_count : 0;
    var hasItems = count > 0;

    // Bar visibility: product pages always show; elsewhere only with items.
    var shouldShow = !dismissed && (isProductPage || hasItems);
    bar.toggleAttribute('hidden', !shouldShow);
    if (!shouldShow) {
      bar.classList.remove('is-open');
      return;
    }

    // Expander tab + panel only make sense when there are items.
    if (tab) {
      tab.toggleAttribute('hidden', !hasItems);
      if (tabLabel) tabLabel.textContent = itemsLabel(count);
    }
    if (!hasItems) {
      bar.classList.remove('is-open');
      if (tab) tab.setAttribute('aria-expanded', 'false');
    }
    if (divider) divider.toggleAttribute('hidden', !bar.classList.contains('is-open'));

    // On non-product pages the row summarises the order.
    if (!isProductPage && hasItems) {
      var first = cartState.items[0];
      if (thumb) {
        var visibleItems = visibleThumbItems(cartState.items);
        thumb.dataset.stackCount = String(visibleItems.length || 1);
        thumb.innerHTML = visibleItems.length ? renderThumbStack(visibleItems) : '';
      }
      if (titleEl) {
        titleEl.textContent = count > 1
          ? itemsLabel(count) + ' in your cart'
          : first.product_title;
      }
      if (subText) subText.textContent = formatMoney(cartState.total_price) + ' total';
      if (meta) meta.setAttribute('href', cartUrl);
    }

    if (totalEl) totalEl.textContent = formatMoney(cartState ? cartState.total_price : 0);

    renderLines();
  }

  function renderLines() {
    if (!list || !cartState) return;
    if (!cartState.items.length) {
      list.innerHTML = '';
      return;
    }
    var html = cartState.items.map(function (item) {
      return (
        '<li class="zcart__line" data-key="' + escapeHtml(item.key) + '">' +
          '<span class="zcart__line-img">' +
            (item.image ? '<img src="' + escapeHtml(sizedImage(item.image, 80)) + '" alt="" width="40" height="40" loading="lazy">' : '') +
          '</span>' +
          '<span class="zcart__line-info">' +
            '<span class="zcart__line-name">' + escapeHtml(item.product_title) + '</span>' +
            '<span class="zcart__line-price">' + formatMoney(item.final_line_price) + '</span>' +
          '</span>' +
          '<span class="zcart__line-side">' +
            '<span class="zcart__qty">' +
              '<button class="zcart__qty-btn" type="button" data-line-minus aria-label="Decrease quantity">&minus;</button>' +
              '<span class="zcart__qty-val">' + item.quantity + '</span>' +
              '<button class="zcart__qty-btn" type="button" data-line-plus aria-label="Increase quantity">+</button>' +
            '</span>' +
            '<button class="zcart__line-remove" type="button" data-line-remove aria-label="Remove item">' +
              '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
            '</button>' +
          '</span>' +
        '</li>'
      );
    }).join('');
    list.innerHTML = html;
  }

  /* ---------------- cart mutations ---------------- */

  function changeLine(key, quantity) {
    return fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: key, quantity: quantity })
    })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        cartState = cart;
        render();
        notifyThemeCartChanged();
      });
  }

  function addToCart(variantId, quantity) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: parseInt(variantId, 10), quantity: quantity })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.description || 'Add failed'); });
      return r.json();
    });
  }

  function notifyThemeCartChanged() {
    if (window.SmoorCart && window.SmoorCart.updateBadge) window.SmoorCart.updateBadge();
  }

  /* ---------------- interactions ---------------- */

  if (tab) {
    tab.addEventListener('click', function () {
      var open = bar.classList.toggle('is-open');
      tab.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (divider) divider.toggleAttribute('hidden', !open);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      dismissed = true;
      bar.classList.remove('is-open');
      bar.setAttribute('hidden', '');
    });
  }

  // Mini cart line controls (delegated).
  if (list) {
    list.addEventListener('click', function (e) {
      var line = e.target.closest('.zcart__line');
      if (!line) return;
      var key = line.dataset.key;
      var item = cartState && cartState.items.find(function (i) { return i.key === key; });
      if (!item) return;

      if (e.target.closest('[data-line-plus]')) {
        changeLine(key, item.quantity + 1);
      } else if (e.target.closest('[data-line-minus]')) {
        changeLine(key, item.quantity - 1);
      } else if (e.target.closest('[data-line-remove]')) {
        changeLine(key, 0);
      }
    });
  }

  /* ---------------- product page: stepper + add ---------------- */

  function clampQty(v) {
    v = parseInt(v, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > 99) v = 99;
    return v;
  }

  function setQty(v, pushToHero) {
    if (!qtyInput) return;
    qtyInput.value = clampQty(v);
    if (pushToHero && heroQty) {
      heroQty.value = qtyInput.value;
      heroQty.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  if (minusBtn) minusBtn.addEventListener('click', function () { setQty(clampQty(qtyInput.value) - 1, true); });
  if (plusBtn) plusBtn.addEventListener('click', function () { setQty(clampQty(qtyInput.value) + 1, true); });
  if (qtyInput) qtyInput.addEventListener('change', function () { setQty(qtyInput.value, true); });

  // Mirror the hero's quantity so both steppers always match.
  if (heroQty && qtyInput) {
    setQty(heroQty.value, false);
    heroQty.addEventListener('change', function () { setQty(heroQty.value, false); });
  }

  function currentVariantId() {
    if (heroForm) {
      var input = heroForm.querySelector('[name="id"]');
      if (input && input.value) return input.value;
    }
    return bar.dataset.variantId;
  }

  if (addBtn) {
    addBtn.addEventListener('click', function () {
      if (addBtn.disabled || addBtn.classList.contains('is-loading')) return;
      var variantId = currentVariantId();
      if (!variantId) return;

      addBtn.classList.add('is-loading');
      addToCart(variantId, clampQty(qtyInput ? qtyInput.value : 1))
        .then(function (item) {
          rememberAddedItem(item);
          notifyThemeCartChanged();
          return refresh();
        })
        .then(function () {
          // Reveal the mini cart so the new item is visible right away.
          if (tab && !tab.hasAttribute('hidden')) {
            bar.classList.add('is-open');
            tab.setAttribute('aria-expanded', 'true');
            if (divider) divider.removeAttribute('hidden');
          }
        })
        .catch(function (err) { console.error('[zcart] ' + err.message); })
        .finally(function () { addBtn.classList.remove('is-loading'); });
    });
  }

  // Buy it now — checkout with ONLY this product, ignoring the cart.
  if (buyBtn) {
    buyBtn.addEventListener('click', function () {
      if (buyBtn.disabled || buyBtn.classList.contains('is-loading')) return;
      var variantId = currentVariantId();
      if (!variantId) return;

      buyBtn.classList.add('is-loading');
      var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root)
        ? window.Shopify.routes.root : '/';
      if (root.charAt(root.length - 1) !== '/') root += '/';
      var qty = clampQty(qtyInput ? qtyInput.value : 1);
      window.location.href = root + 'cart/' + parseInt(variantId, 10) + ':' + qty;
    });
  }

  // Keep availability in step with the hero's variant picker.
  if (heroAddBtn && addBtn) {
    heroSection.addEventListener('click', function (e) {
      if (e.target.closest('[data-lph-variant-value]')) {
        window.requestAnimationFrame(function () {
          addBtn.disabled = heroAddBtn.disabled;
          addBtn.textContent = heroAddBtn.disabled ? 'Sold out' : 'Add to cart';
          if (buyBtn) buyBtn.disabled = heroAddBtn.disabled;
        });
      }
    });
  }

  /* ---------------- external cart updates ---------------- */

  // Bring the bar back and refresh it. Called whenever the cart changes
  // from anywhere on the page.
  function onCartChanged(reveal) {
    if (reveal) dismissed = false;
    return refresh();
  }

  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined' && PUB_SUB_EVENTS.cartUpdate) {
    subscribe(PUB_SUB_EVENTS.cartUpdate, function (event) {
      if (event) rememberAddedVariant(event.productVariantId || event.variantId);
      onCartChanged(true);
    });
  }

  /* Global cart request interceptor.
     Sections publish cartUpdate inconsistently (Bestsellers, for one,
     does not) and all of them guard on window.publish existing. Watching
     the cart endpoints directly means the bar reacts to every add,
     change or remove, including ones made by apps. */
  (function interceptCartRequests() {
    var CART_WRITE = /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/i;

    if (window.fetch) {
      var nativeFetch = window.fetch;
      window.fetch = function (input, init) {
        var url = '';
        try {
          url = typeof input === 'string' ? input : (input && input.url) || '';
        } catch (e) { /* ignore */ }

        var promise = nativeFetch.apply(this, arguments);
        if (url && CART_WRITE.test(url)) {
          promise.then(function (res) {
            if (res && res.ok) {
              var remember = Promise.resolve();
              if (/\/cart\/add(\.js)?(\?|$)/i.test(url) && res.clone) {
                remember = res.clone().json().then(rememberAddedItem).catch(function () { /* not JSON */ });
              }
              remember.finally(function () {
                // let the responding script finish its own work first
                setTimeout(function () { onCartChanged(true); }, 60);
              });
            }
          }).catch(function () { /* leave the bar as it is */ });
        }
        return promise;
      };
    }

    // Some older code paths still use XHR
    if (window.XMLHttpRequest) {
      var open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        if (url && CART_WRITE.test(String(url))) {
          this.addEventListener('load', function () {
            if (this.status >= 200 && this.status < 300) {
              setTimeout(function () { onCartChanged(true); }, 60);
            }
          });
        }
        return open.apply(this, arguments);
      };
    }
  })();

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refresh();
  });

  refresh();
})();
