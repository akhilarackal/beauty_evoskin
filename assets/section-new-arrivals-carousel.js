/**
 * section-new-arrivals-carousel.js
 *
 * Handles:
 *   1. Category tab switching (instant, no page reload)
 *   2. Product carousel — prev/next arrows, infinite loop, optional autoplay
 *   3. Touch / mouse drag swipe
 *   4. Keyboard navigation (Arrow keys + Tab ARIA)
 *   5. AJAX Add-to-Cart with loading → success animation + cart bubble sync
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

  var SECTION_TYPE = 'new-arrivals-carousel';
  var READY = new WeakSet();

  /* ================================================================
     BREAKPOINT HELPERS
  ================================================================ */

  function getVisibleCols(root) {
    var w = window.innerWidth;
    if (w <= 599) return parseInt(root.dataset.nacColsMobile || '1', 10);
    if (w <= 989) return parseInt(root.dataset.nacColsTablet || '2', 10);
    return parseInt(root.dataset.nacColsDesktop || '4', 10);
  }

  /* ================================================================
     TRACK / STATE
  ================================================================ */

  function getActivePanel(root) {
    return root.querySelector('.nac-panel--active');
  }

  function getTrack(panel) {
    return panel ? panel.querySelector('.nac-track') : null;
  }

  function getSlides(panel) {
    var track = getTrack(panel);
    return track ? track.querySelectorAll('.nac-slide') : [];
  }

  function getCurrentIndex(panel) {
    var track = getTrack(panel);
    return track ? parseInt(track.dataset.currentIndex || '0', 10) : 0;
  }

  function setCurrentIndex(panel, idx) {
    var track = getTrack(panel);
    if (track) track.dataset.currentIndex = String(idx);
  }

  function getMaxIndex(root, panel) {
    var total = getSlides(panel).length;
    var vis = getVisibleCols(root);
    return Math.max(0, total - vis);
  }

  /* ================================================================
     POSITION — GPU-accelerated translateX
  ================================================================ */

  function updatePosition(root, panel, skipTransition) {
    var track = getTrack(panel);
    if (!track) return;

    var firstSlide = track.querySelector('.nac-slide');
    if (!firstSlide) return;

    var idx = getCurrentIndex(panel);
    var gap = parseFloat(getComputedStyle(track).gap) || 16;
    var slideW = firstSlide.getBoundingClientRect().width;
    var offset = idx * (slideW + gap);

    if (skipTransition) {
      track.classList.add('nac-track--no-transition');
    }

    track.style.transform = 'translateX(-' + offset + 'px)';

    if (skipTransition) {
      void track.offsetWidth;
      track.classList.remove('nac-track--no-transition');
    }

    // Update nav disabled states
    var max = getMaxIndex(root, panel);
    var prevBtn = root.querySelector('[data-nac-action="prev"]');
    var nextBtn = root.querySelector('[data-nac-action="next"]');
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= max;
  }

  /* ================================================================
     SLIDE TO
  ================================================================ */

  function slideTo(root, panel, delta, absolute) {
    var track = getTrack(panel);
    if (!track) return;

    var max = getMaxIndex(root, panel);
    var idx = getCurrentIndex(panel);

    if (absolute) {
      idx = delta;
    } else {
      idx = idx + delta;
    }

    // Clamp
    idx = Math.min(max, Math.max(0, idx));

    setCurrentIndex(panel, idx);
    updatePosition(root, panel);
  }

  /* ================================================================
     TAB SWITCHING
  ================================================================ */

  function initTabs(root) {
    var tabs = root.querySelectorAll('[data-nac-tab]');
    if (!tabs.length) return;

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        // Deactivate all tabs
        tabs.forEach(function (t) {
          t.classList.remove('nac-tab--active');
          t.setAttribute('aria-selected', 'false');
        });

        // Activate clicked tab
        tab.classList.add('nac-tab--active');
        tab.setAttribute('aria-selected', 'true');

        // Switch panels
        var panels = root.querySelectorAll('.nac-panel');
        panels.forEach(function (p) {
          p.classList.remove('nac-panel--active');
          p.setAttribute('hidden', '');
        });

        var targetId = tab.getAttribute('aria-controls');
        var targetPanel = root.querySelector('#' + targetId);
        if (targetPanel) {
          targetPanel.classList.add('nac-panel--active');
          targetPanel.removeAttribute('hidden');

          // Reset carousel to start & recalculate
          setCurrentIndex(targetPanel, 0);
          updatePosition(root, targetPanel, true);
        }
      });

      // Keyboard: left/right arrows between tabs
      tab.addEventListener('keydown', function (e) {
        var tabsArr = Array.from(tabs);
        var idx = tabsArr.indexOf(tab);

        if (e.key === 'ArrowRight') {
          e.preventDefault();
          var next = tabsArr[(idx + 1) % tabsArr.length];
          next.focus();
          next.click();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          var prev = tabsArr[(idx - 1 + tabsArr.length) % tabsArr.length];
          prev.focus();
          prev.click();
        }
      });
    });
  }

  /* ================================================================
     NAV BUTTONS
  ================================================================ */

  function initNav(root) {
    var prevBtn = root.querySelector('[data-nac-action="prev"]');
    var nextBtn = root.querySelector('[data-nac-action="next"]');

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        var panel = getActivePanel(root);
        if (panel) slideTo(root, panel, -1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        var panel = getActivePanel(root);
        if (panel) slideTo(root, panel, 1);
      });
    }
  }

  /* ================================================================
     KEYBOARD NAVIGATION on track
  ================================================================ */

  function initKeyboard(root) {
    root.querySelectorAll('.nac-track').forEach(function (track) {
      track.setAttribute('tabindex', '0');
      track.addEventListener('keydown', function (e) {
        var panel = track.closest('.nac-panel');
        if (!panel) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); slideTo(root, panel, -1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); slideTo(root, panel, 1); }
      });
    });
  }

  /* ================================================================
     TOUCH / MOUSE DRAG
  ================================================================ */

  function initDrag(root) {
    root.querySelectorAll('.nac-slider').forEach(function (slider) {
      var isDragging = false;
      var startX = 0;
      var startIdx = 0;
      var threshold = 50;

      function getPanel() {
        return slider.closest('.nac-panel');
      }

      function onStart(x) {
        var panel = getPanel();
        if (!panel) return;
        startX = x;
        startIdx = getCurrentIndex(panel);
        isDragging = true;
        var track = getTrack(panel);
        if (track) track.classList.add('nac-track--no-transition');
      }

      function onMove(x) {
        if (!isDragging) return;
        var panel = getPanel();
        if (!panel) return;
        var track = getTrack(panel);
        if (!track) return;
        var delta = x - startX;
        var gap = parseFloat(getComputedStyle(track).gap) || 16;
        var firstSlide = track.querySelector('.nac-slide');
        if (!firstSlide) return;
        var slideW = firstSlide.getBoundingClientRect().width;
        var baseOffset = startIdx * (slideW + gap);
        track.style.transform = 'translateX(-' + (baseOffset - delta) + 'px)';
      }

      function onEnd(x) {
        if (!isDragging) return;
        isDragging = false;
        var panel = getPanel();
        if (!panel) return;
        var track = getTrack(panel);
        if (track) track.classList.remove('nac-track--no-transition');
        var delta = x - startX;
        if (Math.abs(delta) >= threshold) {
          slideTo(root, panel, delta < 0 ? 1 : -1);
        } else {
          updatePosition(root, panel);
        }
      }

      // Mouse
      slider.addEventListener('mousedown', function (e) { onStart(e.clientX); });
      window.addEventListener('mousemove', function (e) {
        if (isDragging) { e.preventDefault(); onMove(e.clientX); }
      }, { passive: false });
      window.addEventListener('mouseup', function (e) { onEnd(e.clientX); });

      // Touch
      slider.addEventListener('touchstart', function (e) {
        onStart(e.touches[0].clientX);
      }, { passive: true });
      slider.addEventListener('touchmove', function (e) {
        if (isDragging) onMove(e.touches[0].clientX);
      }, { passive: true });
      slider.addEventListener('touchend', function (e) {
        onEnd(e.changedTouches[0].clientX);
      });
    });
  }

  /* ================================================================
     AUTOPLAY
  ================================================================ */

  function initAutoplay(root) {
    var autoplay = root.dataset.nacAutoplay === 'true';
    if (!autoplay) return;

    var speedMs = (parseInt(root.dataset.nacSpeed || '4', 10)) * 1000;
    var timer = null;
    var paused = false;

    function goNext() {
      if (paused) return;
      var panel = getActivePanel(root);
      if (!panel) return;
      var idx = getCurrentIndex(panel);
      var max = getMaxIndex(root, panel);
      if (idx >= max) {
        setCurrentIndex(panel, 0);
        updatePosition(root, panel);
      } else {
        slideTo(root, panel, 1);
      }
    }

    function start() { if (!timer) timer = setInterval(goNext, speedMs); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    start();

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', function () { paused = true; });
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

    document.addEventListener('shopify:section:unload', function (e) {
      if (e.target.contains(root)) stop();
    });
  }

  /* ================================================================
     RESIZE
  ================================================================ */

  function initResize(root) {
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var panel = getActivePanel(root);
        if (panel) updatePosition(root, panel, true);
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
        console.error('[New Arrivals Carousel] Add to cart error:', err);
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.setAttribute('aria-label', btn.dataset.originalLabel || 'Add to cart');
      });
  }

  function initAddToCart(root) {
    root.querySelectorAll('.nac-card__add-btn').forEach(function (btn) {
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

    initTabs(root);
    initNav(root);
    initKeyboard(root);
    initDrag(root);
    initResize(root);
    initAutoplay(root);
    initAddToCart(root);

    // Initial position on active panel
    var panel = getActivePanel(root);
    if (panel) {
      setCurrentIndex(panel, 0);
      updatePosition(root, panel, true);
    }
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

  // Theme Editor — section reload
  document.addEventListener('shopify:section:load', function (e) {
    var root = e.target.querySelector('[data-section-type="' + SECTION_TYPE + '"]');
    if (root) {
      READY.delete(root);
      init(root);
    }
  });

  // Theme Editor — settings changed
  document.addEventListener('shopify:section:select', function (e) {
    var root = e.target.querySelector('[data-section-type="' + SECTION_TYPE + '"]');
    if (root) {
      var panel = getActivePanel(root);
      if (panel) updatePosition(root, panel, true);
    }
  });

  // Theme Editor — block selected (switch to that tab)
  document.addEventListener('shopify:block:select', function (e) {
    var root = e.target.closest('[data-section-type="' + SECTION_TYPE + '"]');
    if (!root) return;
    var blockId = e.target.dataset.blockId || e.target.getAttribute('data-block-id');
    if (!blockId) {
      // Try to extract from shopify_attributes
      var panel = e.target.closest('.nac-panel');
      if (panel) blockId = panel.id.replace('nac-panel-', '');
    }
    if (!blockId) return;

    var tab = root.querySelector('[data-block-id="' + blockId + '"]');
    if (tab) tab.click();
  });

})();
