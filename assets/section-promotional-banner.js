/**
 * section-promotional-banner.js
 * Handles: Countdown timer + Marquee seamless loop
 * No external libraries. Pure vanilla JS.
 * Online Store 2.0 compatible (re-initialises on section reload in editor).
 */

(function () {
  'use strict';

  /* ============================================================
     COUNTDOWN TIMER
     ============================================================ */

  /**
   * Parse "YYYY-MM-DDTHH:MM:SS" in a specific IANA timezone.
   * Falls back to UTC if the timezone is invalid or Intl is unavailable.
   */
  function parseEndTime(dateTimeStr, timezone) {
    if (!dateTimeStr || dateTimeStr === 'noneT') return null;
    try {
      // Build a formatter that can convert a UTC timestamp to the
      // merchant's chosen timezone, then binary-search for the UTC
      // timestamp whose local representation equals dateTimeStr.
      var fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      });

      // Parse the date string parts
      var parts = dateTimeStr.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/
      );
      if (!parts) return null;

      var year    = parseInt(parts[1], 10);
      var month   = parseInt(parts[2], 10) - 1; // JS months 0-based
      var day     = parseInt(parts[3], 10);
      var hour    = parseInt(parts[4], 10);
      var minute  = parseInt(parts[5], 10);
      var second  = parseInt(parts[6], 10);

      // Approximate UTC time, then refine via the formatter
      var approxUtc = Date.UTC(year, month, day, hour, minute, second);
      // Get the TZ offset at that approximate UTC time
      var tzParts = fmt.formatToParts(new Date(approxUtc));
      var tzMap   = {};
      tzParts.forEach(function (p) { tzMap[p.type] = parseInt(p.value, 10); });

      var tzUtc = Date.UTC(tzMap.year, tzMap.month - 1, tzMap.day,
                           tzMap.hour === 24 ? 0 : tzMap.hour,
                           tzMap.minute, tzMap.second);
      var offset = approxUtc - tzUtc; // ms offset
      return approxUtc + offset;
    } catch (e) {
      // Fallback: treat dateTimeStr as plain UTC
      return new Date(dateTimeStr.replace('T', ' ') + ' UTC').getTime();
    }
  }

  function pad(n) {
    return String(Math.max(0, Math.floor(n))).padStart(2, '0');
  }

  function initCountdown(wrapper) {
    var cdEl      = wrapper.querySelector('[id^="pb-countdown-"]');
    if (!cdEl) return;

    var endStr    = cdEl.dataset.end;
    var timezone  = cdEl.dataset.timezone || 'UTC';
    var onExpired = cdEl.dataset.expired   || 'hide';
    var sectionId = cdEl.dataset.section;

    var endTime   = parseEndTime(endStr, timezone);
    if (!endTime) return;

    var daysEl    = cdEl.querySelector('[data-unit="days"]');
    var hoursEl   = cdEl.querySelector('[data-unit="hours"]');
    var minsEl    = cdEl.querySelector('[data-unit="minutes"]');
    var secsEl    = cdEl.querySelector('[data-unit="seconds"]');
    var srEl      = cdEl.querySelector('.pb-countdown__sr');

    var originalDuration = endTime - Date.now();
    var tickId;

    function handleExpired() {
      clearInterval(tickId);

      if (onExpired === 'hide') {
        // Hide entire banner section
        wrapper.style.display = 'none';
        return;
      }

      if (onExpired === 'message') {
        cdEl.hidden = true;
        var msgEl = document.getElementById('pb-expired-' + sectionId);
        if (msgEl) msgEl.hidden = false;
        return;
      }

      if (onExpired === 'restart') {
        // Extend end time by the original duration from now
        endTime = Date.now() + originalDuration;
        tickId = setInterval(tick, 1000);
        return;
      }
    }

    function tick() {
      var remaining = endTime - Date.now();

      if (remaining <= 0) {
        // Clamp at zero
        if (daysEl)  daysEl.textContent  = '00';
        if (hoursEl) hoursEl.textContent = '00';
        if (minsEl)  minsEl.textContent  = '00';
        if (secsEl)  secsEl.textContent  = '00';
        handleExpired();
        return;
      }

      var totalSeconds = Math.floor(remaining / 1000);
      var d  = Math.floor(totalSeconds / 86400);
      var h  = Math.floor((totalSeconds % 86400) / 3600);
      var m  = Math.floor((totalSeconds % 3600)  / 60);
      var s  = totalSeconds % 60;

      if (daysEl)  daysEl.textContent  = pad(d);
      if (hoursEl) hoursEl.textContent = pad(h);
      if (minsEl)  minsEl.textContent  = pad(m);
      if (secsEl)  secsEl.textContent  = pad(s);

      // Update screen-reader text every 10 seconds
      if (s % 10 === 0 && srEl) {
        srEl.textContent = d + ' days, ' + h + ' hours, ' + m + ' minutes, ' + s + ' seconds remaining';
      }
    }

    // Run immediately then every second
    tick();
    tickId = setInterval(tick, 1000);

    // Clean up when section is removed (editor)
    if (window.Shopify && Shopify.designMode) {
      document.addEventListener('shopify:section:unload', function (e) {
        if (e.target.contains(wrapper)) clearInterval(tickId);
      });
    }
  }

  /* ============================================================
     MARQUEE — seamless CSS-animation-based infinite loop
     JS only measures content width to ensure the CSS animation
     covers exactly one content-copy, making the loop seamless
     at any viewport width.
     ============================================================ */

  function initMarquee(wrapper) {
    var marquee = wrapper.querySelector('[id^="pb-marquee-"]');
    if (!marquee) return;

    var track    = marquee.querySelector('.pb-marquee__track');
    var contents = marquee.querySelectorAll('.pb-marquee__content');
    if (!track || contents.length < 2) return;

    // Measure one content block
    var oneWidth = contents[0].scrollWidth;
    if (oneWidth === 0) return;

    // CSS animation uses -33.333% of the total width (3 copies).
    // This is already set in CSS. We only need to ensure the
    // track covers enough width for the animation. No JS needed
    // unless the merchant has very few items. The CSS handles it.

    // Pause on hover for accessibility
    marquee.addEventListener('mouseenter', function () {
      track.style.animationPlayState = 'paused';
    });
    marquee.addEventListener('mouseleave', function () {
      track.style.animationPlayState = 'running';
    });
  }

  /* ============================================================
     INIT — called on DOMContentLoaded and on Shopify editor events
     ============================================================ */

  function initBanner(sectionEl) {
    if (!sectionEl) return;

    var cdEnabled = sectionEl.dataset.countdownEnable;
    if (cdEnabled === 'true') {
      initCountdown(sectionEl);
    }

    initMarquee(sectionEl);
  }

  function initAll() {
    document.querySelectorAll('[data-section-type="promotional-banner"]').forEach(function (el) {
      initBanner(el);
    });
  }

  // Standard DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Shopify Theme Editor live reload support
  document.addEventListener('shopify:section:load', function (e) {
    var section = e.target.querySelector('[data-section-type="promotional-banner"]');
    if (section) initBanner(section);
  });

})();
