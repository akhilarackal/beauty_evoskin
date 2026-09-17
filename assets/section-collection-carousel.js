/*
 * Shop by Collections — Premium Carousel
 * Native horizontal scroll with drag, swipe, keyboard nav,
 * optional autoplay and edge-aware arrow states.
 */
(function () {
  'use strict';

  const READY = new WeakSet();

  function getCardWidth(track) {
    const slide = track.querySelector('.collection-carousel__slide');
    if (!slide) return 0;
    const gap = parseFloat(getComputedStyle(track).gap) || 24;
    return slide.getBoundingClientRect().width + gap;
  }

  function updateArrows(root) {
    const track = root.querySelector('.collection-carousel__track');
    const prev = root.querySelector('[data-action="prev"]');
    const next = root.querySelector('[data-action="next"]');
    if (!track) return;

    const maxScroll = track.scrollWidth - track.clientWidth - 2;
    if (prev) prev.disabled = track.scrollLeft <= 2;
    if (next) next.disabled = track.scrollLeft >= maxScroll;
  }

  function scrollByCards(root, dir) {
    const track = root.querySelector('.collection-carousel__track');
    if (!track) return;
    const cardW = getCardWidth(track);
    track.scrollBy({ left: dir * cardW, behavior: 'smooth' });
  }

  function initKeyboard(root) {
    const track = root.querySelector('.collection-carousel__track');
    if (!track) return;
    track.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          scrollByCards(root, -1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          scrollByCards(root, 1);
          break;
      }
    });
  }

  function initDrag(root) {
    const track = root.querySelector('.collection-carousel__track');
    if (!track || track.dataset.dragBound === '1') return;
    track.dataset.dragBound = '1';

    let isDown = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    track.addEventListener('pointerdown', (e) => {
      // Allow text selection on links / buttons inside
      if (e.target.closest('a, button')) return;
      isDown = true;
      moved = false;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.classList.add('is-dragging');
      try { track.setPointerCapture(e.pointerId); } catch (_) {}
    });

    track.addEventListener('pointermove', (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      track.scrollLeft = startScroll - dx;
    });

    const end = () => {
      if (!isDown) return;
      isDown = false;
      track.classList.remove('is-dragging');
    };

    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('pointerleave', end);

    // Prevent accidental click navigation after a drag
    track.addEventListener('click', (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    }, true);
  }

  function initAutoplay(root) {
    const track = root.querySelector('.collection-carousel__track');
    if (!track) return;
    const autoplay = root.dataset.autoplay === 'true';
    if (!autoplay) return;
    const speed = parseInt(root.dataset.speed || '5', 10) * 1000;

    let timer = null;
    let paused = false;

    const goNext = () => {
      if (paused) return;
      const maxScroll = track.scrollWidth - track.clientWidth - 2;
      if (track.scrollLeft >= maxScroll) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        scrollByCards(root, 1);
      }
    };

    const start = () => { timer = setInterval(goNext, speed); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    start();

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', () => { paused = true; });
    root.addEventListener('focusout', () => { paused = false; });
    document.addEventListener('visibilitychange', () => {
      paused = document.hidden;
    });

    // Pause when tabbed out of viewport
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          paused = !entry.isIntersecting;
          if (!entry.isIntersecting) stop(); else start();
        });
      }, { threshold: 0.25 });
      io.observe(root);
    }
  }

  function init(root) {
    if (READY.has(root)) return;
    READY.add(root);

    const prev = root.querySelector('[data-action="prev"]');
    const next = root.querySelector('[data-action="next"]');
    if (prev) prev.addEventListener('click', () => scrollByCards(root, -1));
    if (next) next.addEventListener('click', () => scrollByCards(root, 1));

    const track = root.querySelector('.collection-carousel__track');
    if (track) {
      track.addEventListener('scroll', () => updateArrows(root), { passive: true });
      window.addEventListener('resize', () => updateArrows(root));
    }

    initKeyboard(root);
    initDrag(root);
    initAutoplay(root);
    updateArrows(root);
  }

  function initAll() {
    document.querySelectorAll('.collection-carousel').forEach(init);
  }

  if (document.readyState !== 'loading') {
    initAll();
  } else {
    document.addEventListener('DOMContentLoaded', initAll);
  }

  // Shopify theme editor support
  document.addEventListener('shopify:section:load', (e) => {
    const root = e.target.querySelector('.collection-carousel');
    if (root) init(root);
  });
  document.addEventListener('shopify:block:select', (e) => {
    const root = e.target.closest('.collection-carousel');
    const slide = e.target;
    if (root && slide && slide.classList.contains('collection-carousel__slide')) {
      const track = root.querySelector('.collection-carousel__track');
      if (track) {
        track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: 'smooth' });
      }
    }
  });
})();
