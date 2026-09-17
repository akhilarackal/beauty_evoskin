/**
 * section-sale-carousel.js
 * Handles:
 *   1. Horizontal product carousel — prev/next, touch drag, optional autoplay,
 *      optional infinite loop, keyboard navigation, pagination dots
 *   2. AJAX Add-to-cart with loading → success animation + cart drawer sync
 *
 * No external libraries. Pure vanilla JS.
 * Online Store 2.0 compatible — re-initialises on shopify:section:load.
 */

(function () {
  'use strict';

  /* ================================================================
     UTILITY
  ================================================================ */

  var READY = new WeakSet();

  /* ================================================================
     COLUMNS — how many slides are visible at this viewport width
  ================================================================ */

  function getVisibleCols(root) {
    var w = window.innerWidth;
    if (w <= 389) return parseInt(root.dataset.scColsMobileSm || '1', 10);
    if (w <= 599) return parseInt(root.dataset.scColsMobile   || '2', 10);
    if (w <= 989) return parseInt(root.dataset.scColsTablet   || '3', 10);
    return parseInt(root.dataset.scColsDesktop || '5', 10);
  }

  /* ================================================================
     TRACK STATE
  ================================================================ */

  function getTrack(root) {
    return root.querySelector('.sc-track');
  }

  function getCurrentIndex(root) {
    var track = getTrack(root);
    return track ? parseInt(track.dataset.currentIndex || '0', 10) : 0;
  }

  function setCurrentIndex(root, idx) {
    var track = getTrack(root);
    if (track) track.dataset.currentIndex = String(idx);
  }

  function getSlideCount(root) {
    return root.querySelectorAll('.sc-slide').length;
  }

  function getMaxIndex(root) {
    var total = getSlideCount(root);
    var vis   = getVisibleCols(root);
    var infinite = root.dataset.scInfinite === 'true';
    if (infinite) return total - 1;
    return Math.max(0, total - vis);
  }

  /* ================================================================
     OVERFLOW — is there anything to scroll to?
     When every product already fits on screen the arrows and dots
     serve no purpose, so they are removed from the layout.
  ================================================================ */

  function hasOverflow(root) {
    return getSlideCount(root) > getVisibleCols(root);
  }

  function updateNavVisibility(root) {
    var overflow = hasOverflow(root);
    var nav = root.querySelector('.sc-nav');
    var dots = root.querySelector('.sc-pagination');

    root.classList.toggle('sc-no-overflow', !overflow);

    if (nav) nav.hidden = !overflow;
    if (dots) dots.hidden = !overflow;

    // Nothing to scroll to, so reset any offset the track may hold.
    if (!overflow) {
      var track = getTrack(root);
      setCurrentIndex(root, 0);
      if (track) track.style.transform = 'translateX(0)';
    }
  }

  /* ================================================================
     POSITION UPDATE — GPU-accelerated translateX
  ================================================================ */

  function updatePosition(root, skipTransition) {
    var track    = getTrack(root);
    var prevBtn  = root.querySelector('[data-sc-action="prev"]');
    var nextBtn  = root.querySelector('[data-sc-action="next"]');
    if (!track) return;

    var firstSlide = track.querySelector('.sc-slide');
    if (!firstSlide) return;

    var idx      = getCurrentIndex(root);
    var gap      = parseFloat(getComputedStyle(track).gap) || 16;
    var slideW   = firstSlide.getBoundingClientRect().width;
    var offset   = idx * (slideW + gap);

    if (skipTransition) {
      track.classList.add('sc-track--no-transition');
    }

    track.style.transform = 'translateX(-' + offset + 'px)';

    if (skipTransition) {
      // Force reflow then restore transition
      void track.offsetWidth;
      track.classList.remove('sc-track--no-transition');
    }

    var infinite = root.dataset.scInfinite === 'true';
    var max      = getMaxIndex(root);

    if (prevBtn && !infinite) prevBtn.disabled = idx <= 0;
    if (nextBtn && !infinite) nextBtn.disabled = idx >= max;

    updateDots(root, idx);
  }

  /* ================================================================
     SLIDE TO  (direction: -1 | +1 | absolute index)
  ================================================================ */

  function slideTo(root, targetOrDir, isAbsolute) {
    var track    = getTrack(root);
    if (!track) return;

    // Nothing to slide to when all products fit on screen
    if (!hasOverflow(root)) return;

    var total    = getSlideCount(root);
    var vis      = getVisibleCols(root);
    var max      = getMaxIndex(root);
    var infinite = root.dataset.scInfinite === 'true';
    var idx      = getCurrentIndex(root);

    if (isAbsolute) {
      idx = targetOrDir;
    } else {
      idx = idx + targetOrDir;
    }

    if (infinite) {
      idx = ((idx % total) + total) % total;
    } else {
      idx = Math.min(max, Math.max(0, idx));
    }

    setCurrentIndex(root, idx);
    updatePosition(root);
  }

  /* ================================================================
     PAGINATION DOTS
  ================================================================ */

  function buildDots(root) {
    var pagination = root.querySelector('.sc-pagination');
    if (!pagination) return;

    var show = root.dataset.scShowPagination === 'true';
    if (!show) {
      pagination.style.display = 'none';
      return;
    }

    var total = getSlideCount(root);
    var vis   = getVisibleCols(root);
    var pages = Math.max(1, total - vis + 1);

    pagination.innerHTML = '';

    for (var i = 0; i < pages; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sc-dot' + (i === 0 ? ' is-active' : '');
      btn.setAttribute('aria-label', 'Go to slide ' + (i + 1));
      btn.dataset.idx = String(i);
      pagination.appendChild(btn);
    }

    pagination.addEventListener('click', function (e) {
      var dot = e.target.closest('.sc-dot');
      if (!dot) return;
      slideTo(root, parseInt(dot.dataset.idx, 10), true);
    });
  }

  function updateDots(root, idx) {
    var dots = root.querySelectorAll('.sc-dot');
    dots.forEach(function (dot, i) {
      dot.classList.toggle('is-active', i === idx);
    });
  }

  /* ================================================================
     AUTOPLAY
  ================================================================ */

  function initAutoplay(root) {
    var autoplay = root.dataset.scAutoplay === 'true';
    if (!autoplay) return;

    var speedMs  = (parseInt(root.dataset.scSpeed || '4', 10)) * 1000;
    var timer    = null;
    var paused   = false;

    function goNext() {
      if (paused) return;
      var infinite = root.dataset.scInfinite === 'true';
      var idx      = getCurrentIndex(root);
      var max      = getMaxIndex(root);

      if (!infinite && idx >= max) {
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

    // Clean up on section unload (editor)
    document.addEventListener('shopify:section:unload', function (e) {
      if (e.target.contains(root)) stop();
    });
  }

  /* ================================================================
     TOUCH / DRAG
  ================================================================ */

  function initDrag(root) {
    var drag = root.dataset.scDragEnabled === 'true';
    if (!drag) return;

    var slider   = root.querySelector('.sc-slider');
    var track    = getTrack(root);
    if (!slider || !track) return;

    var startX   = 0;
    var startIdx = 0;
    var isDragging = false;
    var threshold  = 50; // px before triggering a slide

    function onStart(x) {
      startX   = x;
      startIdx = getCurrentIndex(root);
      isDragging = true;
      track.classList.add('sc-track--no-transition');
    }

    function onMove(x) {
      if (!isDragging) return;
      var delta     = x - startX;
      var gap       = parseFloat(getComputedStyle(track).gap) || 16;
      var firstSlide = track.querySelector('.sc-slide');
      if (!firstSlide) return;
      var slideW    = firstSlide.getBoundingClientRect().width;
      var baseOffset = startIdx * (slideW + gap);
      track.style.transform = 'translateX(-' + (baseOffset - delta) + 'px)';
    }

    function onEnd(x) {
      if (!isDragging) return;
      isDragging = false;
      track.classList.remove('sc-track--no-transition');

      var delta = x - startX;
      if (Math.abs(delta) >= threshold) {
        slideTo(root, delta < 0 ? 1 : -1);
      } else {
        // Snap back
        updatePosition(root);
      }
    }

    // Mouse
    slider.addEventListener('mousedown', function (e) { onStart(e.clientX); });
    window.addEventListener('mousemove', function (e) { if (isDragging) { e.preventDefault(); onMove(e.clientX); } }, { passive: false });
    window.addEventListener('mouseup',   function (e) { onEnd(e.clientX); });

    // Touch
    slider.addEventListener('touchstart', function (e) { onStart(e.touches[0].clientX); }, { passive: true });
    slider.addEventListener('touchmove',  function (e) { if (isDragging) onMove(e.touches[0].clientX); }, { passive: true });
    slider.addEventListener('touchend',   function (e) { onEnd(e.changedTouches[0].clientX); });
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
     RESIZE — recalculate position when viewport width changes
  ================================================================ */

  function initResize(root) {
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        buildDots(root);
        // Column count changes with width, so re-check overflow first.
        updateNavVisibility(root);
        updatePosition(root, true);
      }, 120);
    });
  }

  /* ================================================================
     NAV BUTTONS
  ================================================================ */

  function initNav(root) {
    var prevBtn = root.querySelector('[data-sc-action="prev"]');
    var nextBtn = root.querySelector('[data-sc-action="next"]');

    if (prevBtn) {
      prevBtn.addEventListener('click', function () { slideTo(root, -1); });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () { slideTo(root, 1); });
    }
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
        source: 'sale-carousel',
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

    var root = btn.closest('[data-section-type="sale-carousel"]');
    var ajaxEnabled = root ? root.dataset.scAjaxCart === 'true' : true;
    if (!ajaxEnabled) {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      return;
    }

    var cartRoot = (window.Shopify && Shopify.routes) ? Shopify.routes.root : '/';

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
        console.error('[Sale Carousel] Add to cart error:', err);
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.setAttribute('aria-label', btn.dataset.originalLabel || 'Add to cart');
      });
  }

  function initAddToCart(root) {
    root.querySelectorAll('.sc-card__add-btn').forEach(function (btn) {
      btn.dataset.originalLabel = btn.getAttribute('aria-label') || 'Add to cart';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
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

    var track = getTrack(root);
    if (!track) return;

    // Reset index
    setCurrentIndex(root, 0);

    // Build UI
    buildDots(root);
    initNav(root);
    initKeyboard(root);
    initDrag(root);
    initResize(root);
    initAutoplay(root);
    initAddToCart(root);

    // Hide the arrows and dots when everything already fits
    updateNavVisibility(root);

    // Initial position (no animation)
    updatePosition(root, true);
  }

  function initAll() {
    document.querySelectorAll('[data-section-type="sale-carousel"]').forEach(init);
  }

  // Standard DOM ready
  if (document.readyState !== 'loading') {
    initAll();
  } else {
    document.addEventListener('DOMContentLoaded', initAll);
  }

  // Shopify Theme Editor — re-init on section reload
  document.addEventListener('shopify:section:load', function (e) {
    var root = e.target.querySelector('[data-section-type="sale-carousel"]');
    if (root) {
      READY.delete(root);
      init(root);
    }
  });

  // Theme Editor — reselect (settings changed)
  document.addEventListener('shopify:section:select', function (e) {
    var root = e.target.querySelector('[data-section-type="sale-carousel"]');
    if (root) updatePosition(root);
  });

})();
