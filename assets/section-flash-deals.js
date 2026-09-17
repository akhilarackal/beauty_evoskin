/**
 * section-flash-deals.js
 * Handles:
 *   1. Product card slider (prev/next, optional autoplay, keyboard nav)
 *   2. AJAX Add-to-cart with loading state
 * 
 * No external libraries. Vanilla JS only.
 * Online Store 2.0 compatible — re-initialises on shopify:section:load.
 */

(function () {
  'use strict';

  /* ================================================================
     SLIDER
     Uses transform translateX for GPU-accelerated sliding.
     Falls back gracefully when slider is disabled (--grid mode).
  ================================================================ */

  const READY = new WeakSet();

  function getSlideCount(root) {
    return root.querySelectorAll('.fd-slide').length;
  }

  function getSlidesVisible(root) {
    // Always 2 visible on the left panel (desktop shows 2-up grid)
    // Slider shows 2 at a time
    return 2;
  }

  function updateSliderPosition(root) {
    const track   = root.querySelector('.fd-track');
    const prevBtn = root.querySelector('[data-fd-action="prev"]');
    const nextBtn = root.querySelector('[data-fd-action="next"]');
    if (!track) return;

    const idx    = parseInt(track.dataset.currentIndex || '0', 10);
    const total  = getSlideCount(root);
    const vis    = getSlidesVisible(root);
    const maxIdx = Math.max(0, total - vis);

    // Compute per-slide width including gap
    const firstSlide = track.querySelector('.fd-slide');
    if (!firstSlide) return;

    const gap       = parseFloat(getComputedStyle(track).gap) || 12;
    const slideW    = firstSlide.getBoundingClientRect().width;
    const offset    = idx * (slideW + gap);

    track.style.transform = `translateX(-${offset}px)`;

    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= maxIdx;
  }

  function slideTo(root, dir) {
    const track = root.querySelector('.fd-track');
    if (!track) return;

    const total  = getSlideCount(root);
    const vis    = getSlidesVisible(root);
    const maxIdx = Math.max(0, total - vis);
    let   idx    = parseInt(track.dataset.currentIndex || '0', 10);

    idx = Math.min(maxIdx, Math.max(0, idx + dir));
    track.dataset.currentIndex = idx;
    updateSliderPosition(root);
  }

  function initSlider(root) {
    const track = root.querySelector('.fd-track');
    if (!track) return;

    // If grid mode, no slider logic needed
    if (track.classList.contains('fd-track--grid')) return;

    track.dataset.currentIndex = '0';

    const prevBtn = root.querySelector('[data-fd-action="prev"]');
    const nextBtn = root.querySelector('[data-fd-action="next"]');

    if (prevBtn) {
      prevBtn.addEventListener('click', function () { slideTo(root, -1); });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () { slideTo(root, 1); });
    }

    // Keyboard nav on the track
    track.setAttribute('tabindex', '0');
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); slideTo(root, -1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); slideTo(root,  1); }
    });

    // Update on resize (layout reflow can change slide width)
    let resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { updateSliderPosition(root); }, 100);
    });

    updateSliderPosition(root);
    initAutoplay(root);
  }

  /* ================================================================
     AUTOPLAY
  ================================================================ */

  function initAutoplay(root) {
    const track     = root.querySelector('.fd-track');
    if (!track) return;

    const autoplay  = root.dataset.fdAutoplay === 'true';
    if (!autoplay) return;

    const speedMs   = (parseInt(root.dataset.fdSpeed || '4', 10)) * 1000;
    let   timer     = null;
    let   paused    = false;

    const total = getSlideCount(root);
    const vis   = getSlidesVisible(root);
    const max   = Math.max(0, total - vis);

    function goNext() {
      if (paused) return;
      const idx = parseInt(track.dataset.currentIndex || '0', 10);
      if (idx >= max) {
        track.dataset.currentIndex = '0';
      } else {
        track.dataset.currentIndex = String(idx + 1);
      }
      updateSliderPosition(root);
    }

    function start() { timer = setInterval(goNext, speedMs); }
    function stop()  { if (timer) { clearInterval(timer); timer = null; } }

    start();

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin',  function () { paused = true; });
    root.addEventListener('focusout', function () { paused = false; });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stop(); paused = true; }
      else { paused = false; start(); }
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) { stop(); paused = true; }
          else { paused = false; start(); }
        });
      }, { threshold: 0.2 });
      io.observe(root);
    }
  }

  /* ================================================================
     AJAX ADD-TO-CART
     Uses Shopify's /cart/add.js endpoint.
     Updates the cart icon bubble via cart-icon-bubble section re-render.
     Publishes PUB_SUB_EVENTS.cartUpdate when available (drawer sync).
  ================================================================ */

  function getCartConfig() {
    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json'
      }
    };
  }

  function updateCartBubble() {
    if (window.SmoorCart) {
      window.SmoorCart.updateBadge();
    }
  }

  function publishCartUpdate(variantId, quantity) {
    if (window.publish && window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) {
      window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
        source: 'flash-deals',
        productVariantId: variantId,
        cartData: null,
        quantity: quantity
      });
    }
  }

  function handleAddToCart(btn) {
    if (btn.disabled || btn.classList.contains('is-loading')) return;

    const variantId = btn.dataset.variantId;
    const quantity  = 1;
    if (!variantId) return;

    // Show loading state
    btn.classList.add('is-loading');
    btn.disabled = true;
    btn.setAttribute('aria-label', 'Adding to cart…');

    const body = JSON.stringify({ id: variantId, quantity: quantity });

    fetch(window.Shopify && Shopify.routes ? Shopify.routes.root + 'cart/add.js' : '/cart/add.js', {
      ...getCartConfig(),
      body: body
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (err) { throw new Error(err.description || 'Add to cart failed'); });
        }
        return response.json();
      })
      .then(function () {
        // Success — update bubble and broadcast
        updateCartBubble();
        publishCartUpdate(variantId, quantity);

        // Open cart drawer/notification for feedback
        if (window.SmoorCart) window.SmoorCart.openDrawer();

        // Brief success state (checkmark via CSS transition)
        btn.classList.remove('is-loading');
        btn.classList.add('is-added');
        btn.setAttribute('aria-label', 'Added to cart');

        setTimeout(function () {
          btn.classList.remove('is-added');
          btn.disabled = false;
          btn.setAttribute('aria-label', btn.dataset.originalLabel || 'Add to cart');
        }, 1600);
      })
      .catch(function (err) {
        console.error('[Flash Deals] Add to cart error:', err);
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.setAttribute('aria-label', btn.dataset.originalLabel || 'Add to cart');
      });
  }

  function initAddToCart(root) {
    root.querySelectorAll('.fd-card__add-btn').forEach(function (btn) {
      // Store original aria-label for reset after add
      btn.dataset.originalLabel = btn.getAttribute('aria-label') || 'Add to cart';

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        handleAddToCart(btn);
      });
    });
  }

  /* ================================================================
     INIT
  ================================================================ */

  function init(root) {
    if (READY.has(root)) return;
    READY.add(root);

    initSlider(root);
    initAddToCart(root);
  }

  function initAll() {
    document.querySelectorAll('.section-flash-deals').forEach(init);
  }

  if (document.readyState !== 'loading') {
    initAll();
  } else {
    document.addEventListener('DOMContentLoaded', initAll);
  }

  // Shopify Theme Editor — re-init on section reload
  document.addEventListener('shopify:section:load', function (e) {
    var root = e.target.querySelector('.section-flash-deals');
    if (root) {
      READY.delete(root); // allow re-init
      init(root);
    }
  });

  // Theme Editor — re-init on any setting change (section:reselect)
  document.addEventListener('shopify:section:select', function (e) {
    var root = e.target.querySelector('.section-flash-deals');
    if (root) updateSliderPosition(root);
  });

})();
