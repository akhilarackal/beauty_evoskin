/**
 * Premium Header — Scroll effects, Dark Mode toggle, Cart badge animation
 */
(function () {
  'use strict';

  /* ========================================
     Scroll — sticky header effects
     ======================================== */
  const headerWrapper = document.querySelector('.header-wrapper');

  if (headerWrapper) {
    let ticking = false;

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          if (window.scrollY > 10) {
            headerWrapper.classList.add('is-scrolled');
          } else {
            headerWrapper.classList.remove('is-scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    // Run once on load in case page is already scrolled
    onScroll();
  }

  /* ========================================
     Dark Mode Toggle
     ======================================== */
  const STORAGE_KEY = 'smoor-dark-mode';
  const toggle = document.getElementById('HeaderDarkModeToggle');
  const mobileToggle = document.getElementById('MobileDrawerDarkModeToggle');

  function syncToggles(nowDark) {
    [toggle, mobileToggle].forEach(function (btn) {
      if (btn) btn.setAttribute('aria-pressed', nowDark ? 'true' : 'false');
    });
  }

  function handleDarkModeToggle() {
    const html = document.documentElement;
    const nowDark = html.classList.toggle('dark');
    syncToggles(nowDark);

    try {
      localStorage.setItem(STORAGE_KEY, nowDark ? 'dark' : 'light');
    } catch (e) {
      // Storage unavailable — fail silently
    }
  }

  // Set initial state
  const isDark = document.documentElement.classList.contains('dark');
  syncToggles(isDark);

  if (toggle) {
    toggle.addEventListener('click', handleDarkModeToggle);
  }

  if (mobileToggle) {
    mobileToggle.addEventListener('click', handleDarkModeToggle);
  }

  /* ========================================
     Cart Badge Animation
     ======================================== */
  const badge = document.getElementById('header-cart-badge');

  if (badge) {
    // Observe changes to the badge text for animation
    const observer = new MutationObserver(function () {
      badge.classList.add('is-animating');
      badge.addEventListener('animationend', function handler() {
        badge.classList.remove('is-animating');
        badge.removeEventListener('animationend', handler);
      });
    });

    observer.observe(badge, { childList: true, characterData: true, subtree: true });
  }

  /* ========================================
     Cart Badge Synchronization
     Bridges the premium header badge with Dawn's cart pub/sub system.
     Dawn re-renders #cart-icon-bubble via Section Rendering API,
     which doesn't exist in this header. Instead we fetch /cart.json
     and update the badge text directly.
     ======================================== */
  var pendingBadgeFetch = null;

  function updateCartBadge() {
    if (pendingBadgeFetch) return pendingBadgeFetch;
    pendingBadgeFetch = fetch((window.routes ? window.routes.cart_url : '/cart') + '.json')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        if (!cart || typeof cart.item_count === 'undefined') return;
        var b = document.getElementById('header-cart-badge');
        if (b) b.textContent = cart.item_count;
      })
      .catch(function () {})
      .finally(function () { pendingBadgeFetch = null; });
    return pendingBadgeFetch;
  }

  // Subscribe to Dawn's cartUpdate event — fires on every add/remove/quantity change
  if (typeof subscribe !== 'undefined' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, updateCartBadge);
  }

  /* ========================================
     Cart Drawer Wiring
     Dawn's cart-drawer.js looks for #cart-icon-bubble to attach
     click handlers. The premium header uses #header-cart-btn instead.
     ======================================== */
  var drawer = document.querySelector('cart-drawer');
  var cartBtn = document.getElementById('header-cart-btn');

  if (drawer && cartBtn) {
    cartBtn.setAttribute('role', 'button');
    cartBtn.setAttribute('aria-haspopup', 'dialog');
    cartBtn.addEventListener('click', function (e) {
      e.preventDefault();
      drawer.setActiveElement(cartBtn);
      drawer.open(cartBtn);
    });
    cartBtn.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        drawer.setActiveElement(cartBtn);
        drawer.open(cartBtn);
      }
    });
  }

  /* ========================================
     Global API for custom section scripts
     ======================================== */
  window.SmoorCart = {
    updateBadge: updateCartBadge,
    openDrawer: function () {
      var d = document.querySelector('cart-drawer');
      if (d) {
        d.classList.remove('is-empty');
        d.open();
      }
    }
  };
})();
