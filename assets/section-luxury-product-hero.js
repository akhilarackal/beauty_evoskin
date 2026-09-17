/**
 * section-luxury-product-hero.js
 * Handles:
 *   1. Gallery thumbnail switching
 *   2. Image zoom on hover (optional)
 *   3. Variant switching (updates price, image, availability)
 *   4. Quantity selector
 *   5. AJAX Add to Cart with loading + success states
 *
 * No jQuery. No third-party libraries.
 * Supports multiple instances. Online Store 2.0 compatible.
 */

(function () {
  'use strict';

  const READY = new WeakSet();

  /* ================================================================
     GALLERY
  ================================================================ */

  function initGallery(root) {
    const mainImg = root.querySelector('[data-lph-main-img]');
    const thumbs  = root.querySelectorAll('[data-lph-thumb]');
    if (!mainImg || !thumbs.length) return;

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        const src    = thumb.dataset.lphThumb;
        const srcset = thumb.dataset.lphSrcset || '';

        mainImg.src = src;
        if (srcset) mainImg.srcset = srcset;

        thumbs.forEach(function (t) { t.classList.remove('lph-gallery__thumb--active'); });
        thumb.classList.add('lph-gallery__thumb--active');

        // Announce for screen readers
        const alt = mainImg.alt;
        announceToSR(root, 'Viewing ' + alt);
      });

      // Keyboard support
      thumb.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          thumb.click();
        }
      });
    });
  }

  /* ================================================================
     IMAGE ZOOM
  ================================================================ */

  function initZoom(root) {
    const mainWrap = root.querySelector('[data-lph-zoom]');
    if (!mainWrap) return;

    const mainImg = mainWrap.querySelector('[data-lph-main-img]');
    if (!mainImg) return;

    mainWrap.classList.add('lph-gallery__main--zoom');

    mainWrap.addEventListener('click', function () {
      mainWrap.classList.toggle('lph-gallery__main--zoomed');
    });

    mainWrap.addEventListener('mousemove', function (e) {
      if (!mainWrap.classList.contains('lph-gallery__main--zoomed')) return;
      const rect = mainWrap.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      mainImg.style.transformOrigin = x + '% ' + y + '%';
    });

    mainWrap.addEventListener('mouseleave', function () {
      mainWrap.classList.remove('lph-gallery__main--zoomed');
      mainImg.style.transformOrigin = 'center center';
    });
  }

  /* ================================================================
     VARIANT SWITCHING
  ================================================================ */

  function initVariants(root) {
    const pills       = root.querySelectorAll('[data-lph-variant-value]');
    const variantJson = root.querySelector('[data-lph-variants-json]');
    if (!pills.length || !variantJson) return;

    let variants;
    try {
      variants = JSON.parse(variantJson.textContent);
    } catch (e) {
      return;
    }

    const form     = root.querySelector('[data-lph-form]');
    const idInput  = form ? form.querySelector('[name="id"]') : null;
    const priceEl  = root.querySelector('[data-lph-price]');
    const compareEl = root.querySelector('[data-lph-compare-price]');
    const discountEl = root.querySelector('[data-lph-discount]');
    const addBtn   = root.querySelector('[data-lph-add-btn]');
    const mainImg  = root.querySelector('[data-lph-main-img]');

    function getSelectedOptions() {
      const groups = root.querySelectorAll('[data-lph-option-group]');
      var options = [];
      groups.forEach(function (g) {
        const active = g.querySelector('.lph-variant-pill--active');
        if (active) options.push(active.dataset.lphVariantValue);
      });
      return options;
    }

    function findVariant(options) {
      return variants.find(function (v) {
        return v.options.every(function (opt, i) {
          return opt === options[i];
        });
      });
    }

    function updateUI(variant) {
      // Update hidden input
      if (idInput && variant) idInput.value = variant.id;

      // Update price
      if (priceEl && variant) {
        priceEl.textContent = formatMoney(variant.price);
      }

      // Update compare price
      if (compareEl && variant) {
        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
          compareEl.textContent = formatMoney(variant.compare_at_price);
          compareEl.style.display = '';
        } else {
          compareEl.style.display = 'none';
        }
      }

      // Update discount
      if (discountEl && variant) {
        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
          const pct = Math.round((1 - variant.price / variant.compare_at_price) * 100);
          discountEl.textContent = pct + '% OFF';
          discountEl.style.display = '';
        } else {
          discountEl.style.display = 'none';
        }
      }

      // Update add button
      if (addBtn) {
        if (!variant) {
          addBtn.disabled = true;
          addBtn.querySelector('.lph-add-btn__text').textContent = 'Unavailable';
        } else if (!variant.available) {
          addBtn.disabled = true;
          addBtn.querySelector('.lph-add-btn__text').textContent = 'Sold Out';
        } else {
          addBtn.disabled = false;
          addBtn.querySelector('.lph-add-btn__text').textContent = addBtn.dataset.lphAddText || 'ADD TO BAG';
        }
      }

      // Update featured image if variant has one
      if (mainImg && variant && variant.featured_image) {
        mainImg.src = variant.featured_image.src;
        mainImg.alt = variant.featured_image.alt || '';
      }

      // Announce change
      if (variant) {
        announceToSR(root, 'Selected variant: ' + variant.title + ', price: ' + formatMoney(variant.price));
      }
    }

    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        // Deactivate siblings
        const group = pill.closest('[data-lph-option-group]');
        group.querySelectorAll('.lph-variant-pill').forEach(function (p) {
          p.classList.remove('lph-variant-pill--active');
          p.setAttribute('aria-pressed', 'false');
        });

        pill.classList.add('lph-variant-pill--active');
        pill.setAttribute('aria-pressed', 'true');

        var options = getSelectedOptions();
        var variant = findVariant(options);
        updateUI(variant);
      });
    });
  }

  /* ================================================================
     QUANTITY SELECTOR
  ================================================================ */

  function initQuantity(root) {
    const wrap  = root.querySelector('[data-lph-quantity]');
    if (!wrap) return;

    const minus = wrap.querySelector('[data-lph-qty-minus]');
    const plus  = wrap.querySelector('[data-lph-qty-plus]');
    const input = wrap.querySelector('[data-lph-qty-input]');
    if (!minus || !plus || !input) return;

    function update(val, notify) {
      val = Math.max(1, Math.min(99, val));
      var changed = parseInt(input.value, 10) !== val;
      input.value = val;
      minus.disabled = val <= 1;
      // Let other UI (e.g. the sticky bar) mirror the change.
      if (notify && changed) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    minus.addEventListener('click', function () {
      update(parseInt(input.value, 10) - 1, true);
    });

    plus.addEventListener('click', function () {
      update(parseInt(input.value, 10) + 1, true);
    });

    input.addEventListener('change', function () {
      update(parseInt(input.value, 10) || 1);
    });

    update(parseInt(input.value, 10) || 1);
  }

  /* ================================================================
     AJAX ADD TO CART
  ================================================================ */

  /* ================================================================
     BUY NOW (direct checkout, bypasses viewing the cart)
  ================================================================ */

  function buyNow(root, triggerBtn) {
    const form = root.querySelector('[data-lph-form]');
    if (!form) return;

    const variantId = form.querySelector('[name="id"]').value;
    const qtyInput  = form.querySelector('[name="quantity"]');
    const quantity  = qtyInput ? parseInt(qtyInput.value, 10) : 1;
    if (!variantId) return;

    if (triggerBtn) {
      if (triggerBtn.disabled || triggerBtn.classList.contains('is-loading')) return;
      triggerBtn.classList.add('is-loading');
      triggerBtn.disabled = true;
    }

    // Direct checkout for ONLY this product+quantity, ignoring the cart:
    //   /cart/{variantId}:{quantity}
    var root_path = (window.Shopify && Shopify.routes && Shopify.routes.root) ? Shopify.routes.root : '/';
    if (root_path.charAt(root_path.length - 1) !== '/') root_path += '/';
    var url = root_path + 'cart/' + parseInt(variantId, 10) + ':' + quantity;
    window.location.href = url;
  }

  function initBuyNow(root) {
    const btn = root.querySelector('[data-lph-buy-now]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      buyNow(root, btn);
    });
  }

  // Expose so the sticky bar can trigger the same direct-checkout flow.
  window.LphBuyNow = buyNow;

  function initAddToCart(root) {
    const form = root.querySelector('[data-lph-form]');
    const btn  = root.querySelector('[data-lph-add-btn]');
    if (!form || !btn) return;

    btn.dataset.lphOriginalLabel = btn.getAttribute('aria-label') || 'Add to bag';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled || btn.classList.contains('is-loading')) return;

      const variantId = form.querySelector('[name="id"]').value;
      const qtyInput  = form.querySelector('[name="quantity"]');
      const quantity  = qtyInput ? parseInt(qtyInput.value, 10) : 1;

      if (!variantId) return;

      // Loading state
      btn.classList.add('is-loading');
      btn.disabled = true;
      btn.setAttribute('aria-label', 'Adding to cart…');

      var body = JSON.stringify({ id: parseInt(variantId, 10), quantity: quantity });

      fetch(window.Shopify && Shopify.routes ? Shopify.routes.root + 'cart/add.js' : '/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        },
        body: body
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json().then(function (err) {
              throw new Error(err.description || 'Add to cart failed');
            });
          }
          return response.json();
        })
        .then(function () {
          // Update cart bubble
          updateCartBubble();
          publishCartUpdate(variantId, quantity);

          // Open cart drawer/notification for feedback
          if (window.SmoorCart) window.SmoorCart.openDrawer();

          // Success state
          btn.classList.remove('is-loading');
          btn.classList.add('is-added');
          btn.setAttribute('aria-label', 'Added to cart');
          announceToSR(root, 'Item added to cart successfully');

          setTimeout(function () {
            btn.classList.remove('is-added');
            btn.disabled = false;
            btn.setAttribute('aria-label', btn.dataset.lphOriginalLabel || 'Add to bag');
          }, 1800);
        })
        .catch(function (err) {
          console.error('[Luxury Product Hero] Add to cart error:', err);
          btn.classList.remove('is-loading');
          btn.disabled = false;
          btn.setAttribute('aria-label', btn.dataset.lphOriginalLabel || 'Add to bag');
          announceToSR(root, 'Error adding to cart: ' + err.message);
        });
    });
  }

  /* ================================================================
     UTILITIES
  ================================================================ */

  function formatMoney(cents) {
    // Use Shopify's money format if available
    if (window.Shopify && window.Shopify.formatMoney) {
      return window.Shopify.formatMoney(cents);
    }
    // Fallback: assume INR or generic format
    var moneyFormat = window.theme && window.theme.moneyFormat
      ? window.theme.moneyFormat
      : '₹{{amount}}';

    var amount = (cents / 100).toFixed(2);
    return moneyFormat.replace(/\{\{\s*amount\s*\}\}/, amount)
                      .replace(/\{\{\s*amount_no_decimals\s*\}\}/, Math.round(cents / 100));
  }

  function updateCartBubble() {
    if (window.SmoorCart) {
      window.SmoorCart.updateBadge();
    }
  }

  function publishCartUpdate(variantId, quantity) {
    if (window.publish && window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) {
      window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
        source: 'luxury-product-hero',
        productVariantId: variantId,
        cartData: null,
        quantity: quantity
      });
    }
  }

  function announceToSR(root, message) {
    var live = root.querySelector('[data-lph-sr-announce]');
    if (!live) return;
    live.textContent = '';
    setTimeout(function () { live.textContent = message; }, 50);
  }

  /* ================================================================
     INIT
  ================================================================ */

  function init(root) {
    if (READY.has(root)) return;
    READY.add(root);

    initGallery(root);
    if (root.dataset.lphEnableZoom === 'true') initZoom(root);
    initVariants(root);
    initQuantity(root);
    initAddToCart(root);
    initBuyNow(root);
  }

  function initAll() {
    document.querySelectorAll('.section-lph').forEach(init);
  }

  // DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Theme Editor re-init
  if (window.Shopify && Shopify.designMode) {
    document.addEventListener('shopify:section:load', function (e) {
      var section = e.target.querySelector('.section-lph');
      if (section) {
        READY.delete(section);
        init(section);
      }
    });
  }
})();
