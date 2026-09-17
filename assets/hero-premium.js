/**
 * Hero Premium Slider
 * Lightweight vanilla JS slider with autoplay, swipe, keyboard navigation,
 * and Theme Editor integration.
 */

(function () {
  'use strict';

  const SELECTORS = {
    slide: '.hero-premium__slide',
    indicator: '.hero-premium__indicator',
    prev: '[data-action="prev"]',
    next: '[data-action="next"]',
    copyBtn: '.hero-premium__copy-btn',
    track: '.hero-premium__track',
  };

  const CLASSES = {
    active: 'is-active',
    copied: 'is-copied',
  };

  class HeroPremiumSlider {
    constructor(container) {
      this.container = container;
      this.track = container.querySelector(SELECTORS.track);
      this.slides = Array.from(container.querySelectorAll(SELECTORS.slide));
      this.indicators = Array.from(container.querySelectorAll(SELECTORS.indicator));
      this.prevBtn = container.querySelector(SELECTORS.prev);
      this.nextBtn = container.querySelector(SELECTORS.next);

      this.currentIndex = 0;
      this.totalSlides = this.slides.length;
      this.autoplay = container.dataset.autoplay === 'true';
      this.speed = (parseInt(container.dataset.speed, 10) || 5) * 1000;
      this.pauseOnFocus = container.dataset.pauseOnFocus !== 'false';
      this.autoplayTimer = null;
      this.isPaused = false;
      this.isFocused = false;
      this.isTouchActive = false;

      this.touchStartX = 0;
      this.touchEndX = 0;

      this._boundKeyHandler = this._onKeydown.bind(this);
      this._boundFocusIn = this._onFocusIn.bind(this);
      this._boundFocusOut = this._onFocusOut.bind(this);

      this._copyTimers = new Map();

      if (this.totalSlides <= 1) return;

      this._init();
    }

    _init() {
      this._bindEvents();
      this._initCopyButtons();

      if (this.autoplay) {
        this._startAutoplay();
      }
    }

    _bindEvents() {
      if (this.prevBtn) {
        this.prevBtn.addEventListener('click', () => this.prev(true));
      }

      if (this.nextBtn) {
        this.nextBtn.addEventListener('click', () => this.next(true));
      }

      this.indicators.forEach((indicator) => {
        indicator.addEventListener('click', () => {
          const index = parseInt(indicator.dataset.slideIndex, 10);
          this.goTo(index, true);
        });
      });

      this.container.addEventListener('keydown', this._boundKeyHandler);

      if (this.autoplay) {
        this.container.addEventListener('mouseenter', () => this._pauseAutoplay());
        this.container.addEventListener('mouseleave', () => this._resumeAutoplay());

        if (this.pauseOnFocus) {
          this.container.addEventListener('focusin', this._boundFocusIn);
          this.container.addEventListener('focusout', this._boundFocusOut);
        }
      }

      this.track.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
      this.track.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: true });
      this.track.addEventListener('touchend', () => this._onTouchEnd());
    }

    _onKeydown(e) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prev(true);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.next(true);
      }
    }

    _onFocusIn() {
      this.isFocused = true;
      this._pauseAutoplay();
    }

    _onFocusOut(e) {
      if (!this.container.contains(e.relatedTarget)) {
        this.isFocused = false;
        this._resumeAutoplay();
      }
    }

    goTo(index, userInitiated) {
      if (index === this.currentIndex) return;
      if (index < 0 || index >= this.totalSlides) return;

      const prevSlide = this.slides[this.currentIndex];
      const nextSlide = this.slides[index];

      if (prevSlide) {
        prevSlide.classList.remove(CLASSES.active);
        prevSlide.setAttribute('aria-hidden', 'true');
        prevSlide.setAttribute('tabindex', '-1');
        prevSlide.removeAttribute('aria-current');
      }

      if (this.indicators[this.currentIndex]) {
        this.indicators[this.currentIndex].classList.remove(CLASSES.active);
        this.indicators[this.currentIndex].setAttribute('aria-selected', 'false');
        this.indicators[this.currentIndex].setAttribute('tabindex', '-1');
      }

      this.currentIndex = index;

      if (nextSlide) {
        nextSlide.classList.add(CLASSES.active);
        nextSlide.setAttribute('aria-hidden', 'false');
        nextSlide.setAttribute('tabindex', '0');
        nextSlide.setAttribute('aria-current', 'true');
      }

      if (this.indicators[this.currentIndex]) {
        this.indicators[this.currentIndex].classList.add(CLASSES.active);
        this.indicators[this.currentIndex].setAttribute('aria-selected', 'true');
        this.indicators[this.currentIndex].setAttribute('tabindex', '0');
        if (userInitiated) {
          this.indicators[this.currentIndex].focus();
        }
      }

      this._resetAutoplay();
    }

    next(userInitiated) {
      const nextIndex = (this.currentIndex + 1) % this.totalSlides;
      this.goTo(nextIndex, !!userInitiated);
    }

    prev(userInitiated) {
      const prevIndex = (this.currentIndex - 1 + this.totalSlides) % this.totalSlides;
      this.goTo(prevIndex, !!userInitiated);
    }

    _startAutoplay() {
      this._stopAutoplay();
      this.autoplayTimer = setInterval(() => {
        if (!this.isPaused && !this.isFocused && !this.isTouchActive) {
          this.next();
        }
      }, this.speed);
    }

    _stopAutoplay() {
      if (this.autoplayTimer) {
        clearInterval(this.autoplayTimer);
        this.autoplayTimer = null;
      }
    }

    _resetAutoplay() {
      if (this.autoplay) {
        this._stopAutoplay();
        this._startAutoplay();
      }
    }

    _pauseAutoplay() {
      this.isPaused = true;
    }

    _resumeAutoplay() {
      if (!this.isFocused && !this.isTouchActive) {
        this.isPaused = false;
      }
    }

    _onTouchStart(e) {
      this.touchStartX = e.changedTouches[0].screenX;
      this.isTouchActive = true;
      this._pauseAutoplay();
    }

    _onTouchMove(e) {
      this.touchEndX = e.changedTouches[0].screenX;
    }

    _onTouchEnd() {
      this.isTouchActive = false;
      const diff = this.touchStartX - this.touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          this.next(true);
        } else {
          this.prev(true);
        }
      }
      this._resumeAutoplay();
    }

    _initCopyButtons() {
      const copyBtns = this.container.querySelectorAll(SELECTORS.copyBtn);
      copyBtns.forEach((btn) => {
        btn.addEventListener('click', () => this._handleCopy(btn));
      });
    }

    _handleCopy(btn) {
      const code = btn.dataset.code;
      if (!code) return;

      if (this._copyTimers.has(btn)) {
        clearTimeout(this._copyTimers.get(btn));
      }

      const doCopy = async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(code);
          } else {
            this._fallbackCopy(code);
          }
          btn.classList.add(CLASSES.copied);
          const timer = setTimeout(() => {
            btn.classList.remove(CLASSES.copied);
            this._copyTimers.delete(btn);
          }, 2000);
          this._copyTimers.set(btn, timer);
        } catch (err) {
          this._fallbackCopy(code);
          btn.classList.add(CLASSES.copied);
          const timer = setTimeout(() => {
            btn.classList.remove(CLASSES.copied);
            this._copyTimers.delete(btn);
          }, 2000);
          this._copyTimers.set(btn, timer);
        }
      };

      doCopy();
    }

    _fallbackCopy(text) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      textArea.setAttribute('aria-hidden', 'true');
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        // Silent fail
      }
      document.body.removeChild(textArea);
    }

    selectSlideByBlockId(blockId) {
      const index = this.slides.findIndex(
        (slide) => slide.getAttribute('data-block-id') === blockId
      );
      if (index !== -1) {
        this.goTo(index);
      }
    }

    destroy() {
      this._stopAutoplay();
      this.container.removeEventListener('keydown', this._boundKeyHandler);
      this.container.removeEventListener('focusin', this._boundFocusIn);
      this.container.removeEventListener('focusout', this._boundFocusOut);

      this._copyTimers.forEach((timer) => clearTimeout(timer));
      this._copyTimers.clear();
    }
  }

  const sliderInstances = new WeakMap();

  function initHeroSliders() {
    const containers = document.querySelectorAll('.hero-premium');
    containers.forEach((container) => {
      if (sliderInstances.has(container)) return;

      const slider = new HeroPremiumSlider(container);
      sliderInstances.set(container, slider);
      container._slider = slider;
    });
  }

  function destroyHeroSliders() {
    const containers = document.querySelectorAll('.hero-premium');
    containers.forEach((container) => {
      if (sliderInstances.has(container)) {
        sliderInstances.get(container).destroy();
        sliderInstances.delete(container);
        container._slider = null;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroSliders);
  } else {
    initHeroSliders();
  }

  if (typeof Shopify !== 'undefined' && Shopify.designMode) {
    document.addEventListener('shopify:block:select', (e) => {
      const section = e.target.closest('.section-hero-premium');
      if (!section) return;

      const container = section.querySelector('.hero-premium');
      if (!container) return;

      const slider = sliderInstances.get(container);
      if (!slider) return;

      const blockId = e.target.getAttribute('data-block-id');
      if (blockId) {
        slider.selectSlideByBlockId(blockId);
      }

      slider._pauseAutoplay();
    });

    document.addEventListener('shopify:block:deselect', (e) => {
      const section = e.target.closest('.section-hero-premium');
      if (!section) return;

      const container = section.querySelector('.hero-premium');
      if (!container) return;

      const slider = sliderInstances.get(container);
      if (slider) {
        slider._resumeAutoplay();
      }
    });

    document.addEventListener('shopify:section:unload', (e) => {
      if (!e.target.classList.contains('section-hero-premium')) return;

      const container = e.target.querySelector('.hero-premium');
      if (container && sliderInstances.has(container)) {
        sliderInstances.get(container).destroy();
        sliderInstances.delete(container);
        container._slider = null;
      }
    });

    document.addEventListener('shopify:section:load', (e) => {
      if (!e.target.classList.contains('section-hero-premium')) return;
      initHeroSliders();
    });
  }
})();
