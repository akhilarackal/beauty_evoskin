/**
 * Standard Actions configuration for Dawn.
 *
 * Storefront Renderer injects the Shopify Standard Actions bundle
 * (`window.Shopify.actions.{updateCart,openCart,getCart,…}`). This file
 * overrides the bundle's built-in Dawn refresh path with an explicit,
 * in-theme version so forks that change Dawn's cart contract keep
 * working. Remove this file and the built-in defaults take over.
 *
 *   - openCart   — opens <cart-drawer>; falls back to /cart.
 *   - updateCart — after the Storefront API mutation, refreshes the
 *     affected cart sections and publishes `cart-update` so Dawn's
 *     pubsub subscribers react.
 *   - other actions (getCart, etc.) keep the default implementation.
 */

// Cart custom elements that advertise sections via getSectionsToRender().
// If Dawn adds a new cart custom element, add its tag here.
const DAWN_CART_TAGS = ['cart-drawer', 'cart-items', 'cart-drawer-items', 'cart-notification'];

// Sections that Dawn's own pubsub subscribers refresh (cart.js's
// CartItems#onCartUpdate fetches and replaces these directly when
// cart-update fires; cart-drawer.js's renderContents handles the
// drawer body). We skip them here to avoid double-rendering.
// Format is '<element-tag>:<getSectionsToRender entry id>'.
// If you change which sections those subscribers refresh, update this set.
const DAWN_PUBSUB_REFRESHED_SECTIONS = new Set([
  'cart-drawer:cart-drawer',
  'cart-drawer-items:CartDrawer',
  'cart-items:main-cart-items',
]);

// Maximum number of times to retry a transient network failure before
// treating the fetch as fatal and skipping that section's DOM update.
const FETCH_RETRY_LIMIT = 1;

// Walk every mounted Dawn cart custom element, collect the sections it
// wants rendered, and dedupe. Returns a Map keyed by section id, each
// entry pointing at the DOM mount and the selector used to extract the
// fresh fragment.
//
// RESILIENCE: Each element is wrapped in its own try/catch so a bad
// getSectionsToRender() implementation (e.g. accessing a missing DOM node
// like `document.getElementById('main-cart-items').dataset.id` on pages
// where that element doesn't exist) cannot abort collection for the
// remaining elements.
function collectCartSections() {
  const sections = new Map();

  for (const el of document.querySelectorAll(DAWN_CART_TAGS.join(','))) {
    let entries;
    try {
      entries = el.getSectionsToRender?.();
    } catch (err) {
      // Log but continue — one broken element must not block others.
      console.warn(
        `[Dawn] collectCartSections: getSectionsToRender() threw on <${el.tagName.toLowerCase()}>. Skipping.`,
        err
      );
      continue;
    }

    const tag = el.tagName.toLowerCase();
    for (const entry of entries ?? []) {
      if (DAWN_PUBSUB_REFRESHED_SECTIONS.has(`${tag}:${entry.id}`)) continue;

      const sectionId = entry.section ?? entry.id;
      if (!sectionId || sections.has(sectionId)) continue;

      // Two patterns coexist in getSectionsToRender():
      //   - cart-items style: entry.section is the parent Liquid section
      //     id, entry.selector is a child node inside it.
      //   - cart-drawer / cart-notification style: entry.id IS the mount;
      //     there is no parent wrapper.
      //
      // RESILIENCE: cart-notification's getSectionsToRender() builds a
      // selector using `this.cartItemKey`, which is only set after
      // renderContents() has been called (i.e., after an add-to-cart).
      // Before that, the selector is `[id="cart-notification-product-undefined"]`,
      // which will NOT match any element — root.querySelector() returns null.
      // We check for null explicitly and skip the entry rather than letting
      // it fall back to `document` (which would wipe the entire page on
      // replaceChildren). The mount check below already guards against this,
      // but we add this comment to document the known edge case.
      const root = entry.section ? document.getElementById(entry.id) : document;
      if (!root) continue;

      const mount = entry.selector
        ? (root.querySelector(entry.selector) ?? (entry.section ? root : null))
        : document.getElementById(entry.id);

      // RESILIENCE: Explicitly guard against `document` being resolved as the
      // mount. If entry.selector is absent AND entry.id is falsy, or if root
      // IS document with no selector, mount would be `document` — calling
      // replaceChildren() on it wipes the page. We skip those entries.
      if (!mount || mount === document) continue;

      sections.set(sectionId, {
        mount,
        extractSelector: entry.selector || '.shopify-section',
      });
    }
  }

  return sections;
}

// Fetch a URL with one automatic retry on transient network failure.
// Returns null (never throws) so callers can skip gracefully on failure.
//
// WHY: A single dropped request (mobile network blip, CDN hiccup) was
// causing the outer catch to fire and reload the page. One retry covers
// the common transient case without masking real errors.
async function fetchWithRetry(url, options, attempt = 0) {
  try {
    const response = await fetch(url, options);
    if (response.ok) return response;

    // Non-2xx response from Shopify (rate limit, server error, etc.)
    console.warn(
      `[Dawn] fetchWithRetry: ${url} responded ${response.status} ${response.statusText}` +
        (attempt < FETCH_RETRY_LIMIT ? '; retrying…' : '; giving up.')
    );
    if (attempt < FETCH_RETRY_LIMIT) return fetchWithRetry(url, options, attempt + 1);
    return null;
  } catch (networkErr) {
    // Hard network failure (offline, CORS, DNS, etc.)
    console.warn(
      `[Dawn] fetchWithRetry: network error for ${url}` +
        (attempt < FETCH_RETRY_LIMIT ? '; retrying…' : '; giving up.'),
      networkErr
    );
    if (attempt < FETCH_RETRY_LIMIT) return fetchWithRetry(url, options, attempt + 1);
    return null;
  }
}

// After a Storefront API mutation, refresh every Dawn cart section
// that isn't already refreshed by Dawn's own pubsub subscribers, then
// publish 'cart-update' so the subscribers run.
//
// We always fetch /cart.js (with sections= when we have any) so that
// `cartData` is defined for subscribers. quick-add-bulk.js reads
// `event.cartData.items` unconditionally — publishing without cartData
// makes it throw, which propagates through pubsub's Promise.all() and
// back here as an unhandled rejection.
//
// RESILIENCE STRATEGY:
//   1. Fetch failures return null — we publish cartUpdate with no
//      cartData rather than crashing. Subscribers that need cartData
//      should guard against undefined themselves (see note below).
//   2. DOM update failures for individual sections are caught per-section
//      so one broken section cannot prevent the rest from updating.
//   3. The publish() call itself is wrapped — if a subscriber throws,
//      we log it but do NOT reload. The cart state was already updated
//      server-side; a reload would only be warranted if we cannot
//      determine the current cart state at all.
async function refreshDawnCartUI() {
  const sections = collectCartSections();
  const sectionsQuery = sections.size
    ? `?sections=${[...sections.keys()].join(',')}`
    : '';

  // `routes` is a Dawn global, but don't assume it's defined.
  const cartUrl = (typeof routes !== 'undefined' && routes?.cart_url) || '/cart';
  const url = `${cartUrl}.js${sectionsQuery}`;

  // Attempt the fetch with one retry for transient failures.
  const response = await fetchWithRetry(url, { headers: { Accept: 'application/json' } });

  let cartData = null;
  if (response) {
    try {
      cartData = await response.json();
    } catch (parseErr) {
      // Malformed JSON from Shopify CDN edge caches can happen occasionally.
      // Log it but do not abort — we will publish without section HTML.
      console.warn('[Dawn] refreshDawnCartUI: failed to parse /cart.js JSON response.', parseErr);
    }
  } else {
    console.warn('[Dawn] refreshDawnCartUI: /cart.js fetch failed after retry; skipping section DOM updates.');
  }

  // Apply section HTML to the DOM, one section at a time.
  // A failure in one section must not prevent others from updating.
  if (cartData?.sections) {
    for (const [id, { mount, extractSelector }] of sections) {
      const html = cartData.sections[id];
      if (!html) {
        // The section was requested but Shopify didn't return HTML for it.
        // This can happen when a section is not rendered on the current page
        // template. Skip it — the existing DOM is still valid.
        console.warn(`[Dawn] refreshDawnCartUI: no HTML returned for section "${id}"; skipping DOM update.`);
        continue;
      }

      try {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const source = parsed.querySelector(extractSelector);
        if (!source) {
          console.warn(
            `[Dawn] refreshDawnCartUI: selector "${extractSelector}" not found in rendered HTML for section "${id}".`
          );
          continue;
        }

        // RESILIENCE: Verify the mount is still attached to the document
        // before mutating it. Between the time collectCartSections() ran
        // and now, a quick-add modal or a theme app extension could have
        // removed and re-rendered the element.
        if (!document.contains(mount)) {
          console.warn(
            `[Dawn] refreshDawnCartUI: mount element for section "${id}" is no longer in the DOM; skipping.`
          );
          continue;
        }

        mount.replaceChildren(...source.childNodes);
      } catch (domErr) {
        // A DOM mutation error on one section must not crash the entire
        // refresh cycle. Log with context and move on to the next section.
        console.error(
          `[Dawn] refreshDawnCartUI: failed to update DOM for section "${id}" ` +
            `(selector: "${extractSelector}", mount: ${mount?.tagName ?? 'unknown'}).`,
          domErr
        );
      }
    }
  }

  // Hand off to Dawn's existing subscribers. cartData is the full
  // Cart Ajax payload (items, item_count, token, …) plus sections;
  // quick-add-bulk.js and price-per-item.js read it directly.
  //
  // WHY wrap publish() in try/catch:
  //   pubsub.js now uses Promise.allSettled(), so subscriber failures are
  //   isolated and the await below will not reject due to a subscriber error.
  //   This try/catch is therefore a last-resort guard for errors that occur
  //   OUTSIDE subscriber callbacks — for example, a ReferenceError if
  //   PUB_SUB_EVENTS is not defined, or a JS engine fault. It should not
  //   fire in normal operation.
  try {
    await publish(PUB_SUB_EVENTS.cartUpdate, {
      source: 'external-refresh',
      // Pass cartData only when it is a valid object; passing undefined
      // causes quick-add-bulk.js (which reads event.cartData.items
      // unconditionally) to throw inside the subscriber.
      ...(cartData && typeof cartData === 'object' ? { cartData } : {}),
    });
  } catch (pubsubErr) {
    // A subscriber error is not a reason to reload the page — the cart
    // was already updated server-side. Log for debugging and move on.
    console.error(
      '[Dawn] refreshDawnCartUI: a pubsub subscriber threw during cart-update event. ' +
        'Cart state on the server is correct but some UI components may not have refreshed.',
      pubsubErr
    );
  }
}

function initStandardActions() {
  const actions = window.Shopify?.actions;
  if (!actions) return;

  actions.openCart.configure({
    async handler(defaultHandler) {
      const drawer = document.querySelector('cart-drawer');
      if (drawer && typeof drawer.open === 'function') {
        drawer.open();
        return;
      }
      return defaultHandler();
    },
  });

  actions.updateCart.configure({
    // Dawn doesn't currently listen for shopify:cart:* events, but the
    // bundle requires an eventTarget. document is the conventional root.
    eventTarget: () => document,
    async handler(defaultHandler) {
      const result = await defaultHandler();

      try {
        await refreshDawnCartUI();
      } catch (error) {
        // refreshDawnCartUI() is designed to be internally resilient and
        // should not reach here under normal circumstances. This catch
        // is the final safety net for truly unexpected failures (e.g.
        // a JS engine error, a missing global like `publish` or
        // `PUB_SUB_EVENTS`).
        //
        // We reload only as a last resort because the cart state on the
        // server has been updated (defaultHandler succeeded) but our UI
        // is in an unknown state. A reload ensures the customer sees
        // accurate cart contents.
        console.error(
          '[Dawn] Standard Actions cart refresh encountered an unrecoverable error. ' +
            'This indicates a missing global (publish, PUB_SUB_EVENTS) or a JS engine fault. ' +
            'Reloading to restore consistent cart state.',
          error
        );
        window.location.reload();
      }

      return result;
    },
  });
}

// Run immediately if the standard-actions bundle has already attached
// `Shopify.actions`; otherwise wait for DOMContentLoaded, which fires after
// all module scripts have executed regardless of document order.
if (window.Shopify?.actions) {
  initStandardActions();
} else {
  document.addEventListener('DOMContentLoaded', initStandardActions, { once: true });
}
