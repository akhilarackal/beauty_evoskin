/**
 * section-featured-collection-showcase.js
 *
 * Handles:
 *   1. Product carousel — prev/next arrows, infinite loop, optional autoplay
 *   2. Touch / mouse drag swipe
 *   3. Keyboard navigation (Arrow keys on focused track)
 *   4. AJAX Add-to-Cart with loading → success animation + cart bubble sync
 *
 * Architecture:
 *   - Pure vanilla JS, no jQuery, no third-party libraries
 *   - IIFE to avoid global scope pollution
 *   - WeakSet guard prevents double-initialisation
 *   - Multiple instances on one page fully supported
 *   - Proper cleanup on shopify:section:unload (Theme Editor)
 *   - Reinitialises on shopify:section:load (Theme Editor hot-reload)
 */

(function () {
  'use strict';

  /* ================================================================
     CONSTANTS
  ================================================================ */

  var SECTION_TYPE = 'featured-collection-showcase';
  var READY = new WeakSet();

  /* ================================================================
     BREAKPOINT HELPERS  — mirrors CSS breakpoints
  ================================================================ */

  function getVisibleCols(root) {
    var w = window.innerWidth;
    if (w <= 599) return parseInt(root.dataset.fcsColsMobile  || '1', 10);
    if (w <= 989) return parseInt(root.dataset.fcsColsTablet  || '2', 10);
    return parseInt(root.dataset.fcsColsDesktop || '3', 10);
  }

  /* ================================================================
     TRACK / STATE ACCESSORS
  ================================================================ */

  function getTrack(root) {
    return root.querySelector('.fcs-track');
  }

  function getSlides(root) {
    return root.querySelectorAll('.fcs-slide');
  }

  function getSlideCount(root) {
    return getSlides(root).length;
  }

  function getCurrentIndex(root) {
    var track = getTrack(root);
    return track ? parseInt(track.dataset.currentIndex || '0', 10) : 0;
  }

  function setCurrentIndex(root, idx) {
    var track = getTrack(root);
    if (track) track.dataset.currentIndex = String(idx);
  }

  function getMaxIndex(root) {
    var total = getSlideCount(root);
    var vis   = getVisibleCols(root);
    return Math.max(0, total - vis);
  }

  /* ================================================================
     POSITION — GPU-accelerated translateX
  ================================================================ */

  function updatePosition(root, skipTransition) {
    var track   = getTrack(root);
    var prevBtn = root.querySelector('[data-fcs-action="prev"]');
    var nextBtn = root.querySelector('[data-fcs-action="next"]');
    if (!track) return;

    var firstSlide = track.querySelector('.fcs-slide');
    if (!firstSlide) return;

    var idx    = getCurrentIndex(root);
    var gap    = parseFloat(getComputedStyle(track).gap) || 16;
    var slideW = firstSlide.getBoundingClientRect().width;
    var offset = idx * (slideW + gap);

    if (skipTransition) {
      track.classList.add('fcs-track--no-transition');
    }

    track.style.transform = 'translateX(-' + offset + 'px)';

    if (skipTransition) {
      void track.offsetWidth; // force reflow
      track.classList.remove('fcs-track--no-transition');
    }

    // Update disabled state
    var max = getMaxIndex(root);
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= max;
  }

  /* ================================================================
     SLIDE TO
  ================================================================ */

  function slideTo(root, delta, absolute) {
    var track = getTrack(root);
    if (!track) return;

    var total = getSlideCount(root);
    var max   = getMaxIndex(root);
    var idx   = getCurrentIndex(root);

    if (absolute) {
      idx = delta;
    } else {
      idx = idx + delta;
    }

    // Clamp (no infinite loop — wrapping would break with hero layout)
    idx = Math.min(max, Math.max(0, idx));

    setCurrentIndex(root, idx);
    updatePosition(root);
  }

  /* ================================================================
     NAV BUTTONS
  ================================================================ */

  function initNav(root) {
    var prevBtn = root.querySelector('[data-fcs-action="prev"]');
    var nextBtn = root.querySelector('[data-fcs-action="next"]');

    if (prevBtn) {
      prevBtn.addEventListener('click', function () { slideTo(root, -1); });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () { slideTo(root, 1); });
    }
  }

  /* ================================================================
     KEYBOARD NAVIGATION
  ================================================================ */

  function initKeyboard(root) {
    var track = getTrack(root);
    if (!track) return;

    track.setAttribute('tabindex', '0');
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); slideTo(root, -1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); slideTo(root,  1); }
    });
  }

  /* ================================================================
     TOUCH / MOUSE DRAG
  ================================================================ */

  function initDrag(root) {
    var slider = root.querySelector('.fcs-slider');
    var track  = getTrack(root);
    if (!slider || !track) return;

    var startX     = 0;
    var startIdx   = 0;
    var isDragging = false;
    var threshold  = 50; // px before committing a slide

    function onStart(x) {
      startX     = x;
      startIdx   = getCurrentIndex(root);
      isDragging = true;
      track.classList.add('fcs-track--no-transition');
    }

    function onMove(x) {
      if (!isDragging) return;
      var delta      = x - startX;
      var gap        = parseFloat(getComputedStyle(track).gap) || 16;
      var firstSlide = track.querySelector('.fcs-slide');
      if (!firstSlide) return;
      var slideW     = firstSlide.getBoundingClientRect().width;
      var baseOffset = startIdx * (slideW + gap);
      track.style.transform = 'translateX(-' + (baseOffset - delta) + 'px)';
    }

    function onEnd(x) {
      if (!isDragging) return;
      isDragging = false;
      track.classList.remove('fcs-track--no-transition');
      var delta = x - startX;
      if (Math.abs(delta) >= threshold) {
        slideTo(root, delta < 0 ? 1 : -1);
      } else {
        updatePosition(root); // snap back
      }
    }

    // Mouse drag
    slider.addEventListener('mousedown', function (e) { onStart(e.clientX); });
    window.addEventListener('mousemove', function (e) {
      if (isDragging) { e.preventDefault(); onMove(e.clientX); }
    }, { passive: false });
    window.addEventListener('mouseup', function (e) { onEnd(e.clientX); });

    // Touch swipe
    slider.addEventListener('touchstart', function (e) {
      onStart(e.touches[0].clientX);
    }, { passive: true });
    slider.addEventListener('touchmove', function (e) {
      if (isDragging) onMove(e.touches[0].clientX);
    }, { passive: true });
    slider.addEventListener('touchend', function (e) {
      onEnd(e.changedTouches[0].clientX);
    });
  }

  /* ================================================================
     AUTOPLAY
  ================================================================ */

  function initAutoplay(root) {
    var autoplay = root.dataset.fcsAutoplay === 'true';
    if (!autoplay) return;

    var speedMs  = (parseInt(root.dataset.fcsSpeed || '4', 10)) * 1000;
    var timer    = null;
    var paused   = false;

    function goNext() {
      if (paused) return;
      var idx = getCurrentIndex(root);
      var max = getMaxIndex(root);
      if (idx >= max) {
        setCurrentIndex(root, 0);
        updatePosition(root);
      } else {
        slideTo(root, 1);
      }
    }

    function start() {
      if (!timer) timer = setInterval(goNext, speedMs);
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }

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

    // Cleanup when Theme Editor unloads section
    document.addEventListener('shopify:section:unload', function (e) {
      if (e.target.contains(root)) stop();
    });
  }

  /* ================================================================
     RESIZE — recalculate offsets on viewport change
  ================================================================ */

  function initResize(root) {
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        updatePosition(root, true);
      }, 120);
    });
  }

  /* ================================================================
     AJAX ADD-TO-CART
  ================================================================ */

  function updateCartBubble() {
    if (window.SmoorCart) {
      window.SmoorCart.updateBadge();
    }
  }

  function publishCartUpdate(variantId, quantity) {
    if (window.publish && window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) {
      window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
        source: SECTION_TYPE,
        productVariantId: variantId,
        cartData: null,
        quantity: quantity
      });
    }
  }

  function handleAddToCart(btn) {
    if (btn.disabled || btn.classList.contains('is-loading')) return;

    var variantId = btn.dataset.variantId;
    if (!variantId) return;

    var quantity = 1;

    btn.classList.add('is-loading');
    btn.disabled = true;
    btn.setAttribute('aria-label', 'Adding to cart…');

    var cartRoot = (window.Shopify && window.Shopify.routes)
      ? window.Shopify.routes.root
      : '/';

    fetch(cartRoot + 'cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ id: parseInt(variantId, 10), quantity: quantity })
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
        updateCartBubble();
        publishCartUpdate(variantId, quantity);

        // Open cart drawer/notification for feedback
        if (window.SmoorCart) window.SmoorCart.openDrawer();

        btn.classList.remove('is-loading');
        btn.classList.add('is-added');
        btn.setAttribute('aria-label', 'Added to cart');

        setTimeout(function () {
          btn.classList.remove('is-added');
          btn.disabled = false;
          btn.setAttribute('aria-label', btn.dataset.originalLabel || 'Add to cart');
        }, 1800);
      })
      .catch(function (err) {
        console.error('[Featured Collection Showcase] Add to cart error:', err);
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.setAttribute('aria-label', btn.dataset.originalLabel || 'Add to cart');
      });
  }

  function initAddToCart(root) {
    root.querySelectorAll('.fcs-card__add-btn').forEach(function (btn) {
      btn.dataset.originalLabel = btn.getAttribute('aria-label') || 'Add to cart';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        handleAddToCart(btn);
      });
    });
  }

  /* ================================================================
     INIT  — single section instance
  ================================================================ */

  function init(root) {
    if (READY.has(root)) return;
    READY.add(root);

    var track = getTrack(root);
    if (!track) return;

    setCurrentIndex(root, 0);

    initNav(root);
    initKeyboard(root);
    initDrag(root);
    initResize(root);
    initAutoplay(root);
    initAddToCart(root);

    // Initial position without animation
    updatePosition(root, true);
  }

  function initAll() {
    document.querySelectorAll('[data-section-type="' + SECTION_TYPE + '"]').forEach(init);
  }

  /* ================================================================
     BOOT
  ================================================================ */

  if (document.readyState !== 'loading') {
    initAll();
  } else {
    document.addEventListener('DOMContentLoaded', initAll);
  }

  /* ── Theme Editor — section reload (full re-init) ── */
  document.addEventListener('shopify:section:load', function (e) {
    var root = e.target.querySelector('[data-section-type="' + SECTION_TYPE + '"]');
    if (root) {
      READY.delete(root);
      init(root);
    }
  });

  /* ── Theme Editor — setting change (re-render already happened, just fix position) ── */
  document.addEventListener('shopify:section:select', function (e) {
    var root = e.target.querySelector('[data-section-type="' + SECTION_TYPE + '"]');
    if (root) updatePosition(root, true);
  });

})();
