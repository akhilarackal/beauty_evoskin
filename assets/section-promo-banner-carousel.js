/**
 * section-promo-banner-carousel.js
 *
 * Handles the Promotional Banner Carousel:
 *   - Prev/next navigation
 *   - Touch & mouse drag with threshold snap
 *   - Keyboard navigation (ArrowLeft / ArrowRight)
 *   - Optional autoplay with IntersectionObserver pause
 *   - Infinite loop mode
 *   - Responsive column recalculation on resize
 *   - Shopify Theme Editor section:load / section:select events
 *
 * No external libraries. Pure vanilla JS.
 * Online Store 2.0 compatible.
 */

(function () {
  'use strict';

  /* ================================================================
     REGISTRY — prevent double-init
  ================================================================ */
  var READY = new WeakSet();

  /* ================================================================
     UTILITY — visible columns based on viewport
  ================================================================ */
  function getVisibleCols(root) {
    var w = window.innerWidth;
    if (w <= 767) return 1;
    if (w <= 1199) return 1.5;
    return parseInt(root.dataset.pbcColsDesktop || '2', 10);
  }

  /* ================================================================
     SLIDE COUNT
  ================================================================ */
  function getSlideCount(root) {
    return root.querySelectorAll('.pbc-slide').length;
  }

  /* ================================================================
     CURRENT INDEX — stored on track element
  ================================================================ */
  function getCurrentIndex(root) {
    var track = root.querySelector('.pbc-track');
    return track ? parseInt(track.dataset.currentIndex || '0', 10) : 0;
  }

  function setCurrentIndex(root, idx) {
    var track = root.querySelector('.pbc-track');
    if (track) track.dataset.currentIndex = String(idx);
  }

  /* ================================================================
     MAX SCROLLABLE INDEX
  ================================================================ */
  function getMaxIndex(root) {
    var total    = getSlideCount(root);
    var infinite = root.dataset.pbcInfinite === 'true';
    if (infinite) return total - 1;

    var cols = getVisibleCols(root);
    var visFloor = Math.floor(cols); // number of fully visible slides
    return Math.max(0, total - visFloor);
  }

  /* ================================================================
     POSITION UPDATE — GPU-accelerated translateX
  ================================================================ */
  function updatePosition(root, skipTransition) {
    var track   = root.querySelector('.pbc-track');
    var prevBtn = root.querySelector('[data-pbc-action="prev"]');
    var nextBtn = root.querySelector('[data-pbc-action="next"]');
    if (!track) return;

    var firstSlide = track.querySelector('.pbc-slide');
    if (!firstSlide) return;

    var idx      = getCurrentIndex(root);
    var gap      = parseFloat(getComputedStyle(track).gap) || 24;
    var slideW   = firstSlide.getBoundingClientRect().width;
    var offset   = idx * (slideW + gap);

    if (skipTransition) {
      track.classList.add('pbc-track--no-transition');
    }

    track.style.transform = 'translateX(-' + offset + 'px)';

    if (skipTransition) {
      void track.offsetWidth; // force reflow
      track.classList.remove('pbc-track--no-transition');
    }

    // Update arrow disabled states (non-infinite)
    var infinite = root.dataset.pbcInfinite === 'true';
    var max      = getMaxIndex(root);

    if (prevBtn && !infinite) prevBtn.disabled = idx <= 0;
    if (nextBtn && !infinite) nextBtn.disabled = idx >= max;
  }

  /* ================================================================
     SLIDE TO
  ================================================================ */
  function slideTo(root, targetOrDir, isAbsolute) {
    var total    = getSlideCount(root);
    var max      = getMaxIndex(root);
    var infinite = root.dataset.pbcInfinite === 'true';
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
     AUTOPLAY
  ================================================================ */
  function initAutoplay(root) {
    if (root.dataset.pbcAutoplay !== 'true') return;

    var speedMs = parseInt(root.dataset.pbcSpeed || '4', 10) * 1000;
    var timer   = null;
    var paused  = false;

    function goNext() {
      if (paused) return;
      var infinite = root.dataset.pbcInfinite === 'true';
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
    root.addEventListener('focusin',  function () { paused = true;  });
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
     TOUCH & MOUSE DRAG
  ================================================================ */
  function initDrag(root) {
    var slider = root.querySelector('.pbc-slider');
    var track  = root.querySelector('.pbc-track');
    if (!slider || !track) return;

    var startX     = 0;
    var startIdx   = 0;
    var isDragging = false;
    var hasMoved   = false;
    var THRESHOLD  = 50; // px before committing a slide change

    function onStart(x) {
      startX     = x;
      startIdx   = getCurrentIndex(root);
      isDragging = true;
      hasMoved   = false;
      track.classList.add('pbc-track--no-transition');
    }

    function onMove(x) {
      if (!isDragging) return;
      var delta     = x - startX;
      if (Math.abs(delta) > 4) hasMoved = true;
      var gap       = parseFloat(getComputedStyle(track).gap) || 24;
      var firstSlide = track.querySelector('.pbc-slide');
      if (!firstSlide) return;
      var slideW    = firstSlide.getBoundingClientRect().width;
      var baseOffset = startIdx * (slideW + gap);
      track.style.transform = 'translateX(-' + (baseOffset - delta) + 'px)';
    }

    function onEnd(x) {
      if (!isDragging) return;
      isDragging = false;
      track.classList.remove('pbc-track--no-transition');

      var delta = x - startX;
      if (Math.abs(delta) >= THRESHOLD) {
        slideTo(root, delta < 0 ? 1 : -1);
      } else {
        updatePosition(root);
      }
    }

    // Prevent link/button clicks after a drag
    slider.addEventListener('click', function (e) {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
        hasMoved = false;
      }
    }, true);

    // Mouse
    slider.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      onStart(e.clientX);
    });
    window.addEventListener('mousemove', function (e) {
      if (isDragging) { e.preventDefault(); onMove(e.clientX); }
    }, { passive: false });
    window.addEventListener('mouseup', function (e) {
      if (isDragging) onEnd(e.clientX);
    });

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
  }

  /* ================================================================
     KEYBOARD NAVIGATION
  ================================================================ */
  function initKeyboard(root) {
    var track = root.querySelector('.pbc-track');
    if (!track) return;
    track.setAttribute('tabindex', '0');
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); slideTo(root, -1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); slideTo(root,  1); }
    });
  }

  /* ================================================================
     RESIZE — recalculate on viewport change
  ================================================================ */
  function initResize(root) {
    var timer;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        updatePosition(root, true);
      }, 120);
    });
  }

  /* ================================================================
     NAV BUTTONS
  ================================================================ */
  function initNav(root) {
    var prevBtn = root.querySelector('[data-pbc-action="prev"]');
    var nextBtn = root.querySelector('[data-pbc-action="next"]');
    if (prevBtn) prevBtn.addEventListener('click', function () { slideTo(root, -1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { slideTo(root,  1); });
  }

  /* ================================================================
     INIT
  ================================================================ */
  function init(root) {
    if (READY.has(root)) return;
    READY.add(root);

    var track = root.querySelector('.pbc-track');
    if (!track) return;

    setCurrentIndex(root, 0);

    initNav(root);
    initKeyboard(root);
    initDrag(root);
    initResize(root);
    initAutoplay(root);

    updatePosition(root, true);
  }

  function initAll() {
    document.querySelectorAll('[data-section-type="promo-banner-carousel"]').forEach(init);
  }

  if (document.readyState !== 'loading') {
    initAll();
  } else {
    document.addEventListener('DOMContentLoaded', initAll);
  }

  // Shopify Theme Editor
  document.addEventListener('shopify:section:load', function (e) {
    var root = e.target.querySelector('[data-section-type="promo-banner-carousel"]');
    if (root) {
      READY.delete(root);
      init(root);
    }
  });

  document.addEventListener('shopify:section:select', function (e) {
    var root = e.target.querySelector('[data-section-type="promo-banner-carousel"]');
    if (root) updatePosition(root);
  });

  document.addEventListener('shopify:block:select', function (e) {
    var root  = e.target.closest('[data-section-type="promo-banner-carousel"]');
    var slide = e.target.closest('.pbc-slide');
    if (!root || !slide) return;

    var slides = Array.from(root.querySelectorAll('.pbc-slide'));
    var idx    = slides.indexOf(slide);
    if (idx >= 0) {
      setCurrentIndex(root, Math.min(idx, getMaxIndex(root)));
      updatePosition(root);
    }
  });

})();
