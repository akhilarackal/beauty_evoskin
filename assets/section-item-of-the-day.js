/**
 * Section: Item of the Day
 * Handles: variant selection, qty counter, share button
 */
(function () {
  'use strict';

  class ItemOfTheDay {
    constructor(section) {
      this.section       = section;
      this.sectionId     = section.dataset.sectionId;
      this.form          = section.querySelector('.iotd-product-form');
      this.variantSelect = section.querySelector('[data-iotd-variant-select]');
      this.priceEl       = section.querySelector('[data-iotd-price]');
      this.comparePriceEl = section.querySelector('[data-iotd-compare-price]');
      this.inventoryEl   = section.querySelector('[data-iotd-inventory]');
      this.inventoryText = section.querySelector('[data-iotd-inventory-text]');
      this.atcBtn        = section.querySelector('[data-iotd-atc]');
      this.buyBtn        = section.querySelector('[data-iotd-buy]');
      this.qtyInput      = section.querySelector('[data-iotd-qty-input]');
      this.mainImg       = section.querySelector('#iotd-main-image-' + this.sectionId);
      this.shareBtn      = section.querySelector('[data-iotd-share]');

      this._bindQty();
      this._bindVariants();
      this._bindAddToCart();
      this._bindBuyNow();
      this._bindShare();
    }

    // ── Quantity stepper ──────────────────────────────────────────
    _bindQty() {
      const minusBtn = this.section.querySelector('[data-iotd-qty-minus]');
      const plusBtn  = this.section.querySelector('[data-iotd-qty-plus]');
      if (!this.qtyInput) return;

      if (minusBtn) {
        minusBtn.addEventListener('click', () => {
          const current = parseInt(this.qtyInput.value, 10) || 1;
          if (current > 1) this.qtyInput.value = current - 1;
        });
      }

      if (plusBtn) {
        plusBtn.addEventListener('click', () => {
          const current = parseInt(this.qtyInput.value, 10) || 1;
          this.qtyInput.value = current + 1;
        });
      }

      this.qtyInput.addEventListener('change', () => {
        const val = parseInt(this.qtyInput.value, 10);
        if (isNaN(val) || val < 1) this.qtyInput.value = 1;
      });
    }

    // ── Variant selection ─────────────────────────────────────────
    // AJAX add-to-cart keeps the customer on the current page.
    _bindAddToCart() {
      if (!this.form || !this.atcBtn) return;

      this.atcBtn.dataset.originalLabel = this.atcBtn.textContent.trim() || 'Add to Cart';

      this.form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (this.atcBtn.disabled || this.atcBtn.classList.contains('is-loading')) return;

        const variantId = this._currentVariantId();
        if (!variantId) return;

        const quantity = this._quantity();
        this._setAtcLoading(true, 'Adding...');

        fetch(this._cartRoot() + 'cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            Accept: 'application/json'
          },
          body: JSON.stringify({ id: parseInt(variantId, 10), quantity })
        })
          .then((response) => {
            if (!response.ok) {
              return response.json().then((err) => {
                throw new Error(err.description || err.message || 'Add to cart failed');
              });
            }
            return response.json();
          })
          .then(() => {
            this._notifyCartChanged(variantId, quantity);
            this.atcBtn.classList.remove('is-loading');
            this.atcBtn.classList.add('is-added');
            this.atcBtn.textContent = 'Added';

            setTimeout(() => {
              this.atcBtn.classList.remove('is-added');
              this._setAtcLoading(false, this.atcBtn.dataset.originalLabel || 'Add to Cart');
            }, 1600);
          })
          .catch((err) => {
            console.error('[Item of the Day] Add to cart error:', err);
            this._setAtcLoading(false, this.atcBtn.dataset.originalLabel || 'Add to Cart');
          });
      });
    }

    _bindBuyNow() {
      if (!this.buyBtn) return;

      this.buyBtn.addEventListener('click', (event) => {
        event.preventDefault();
        if (this.buyBtn.disabled || this.buyBtn.classList.contains('is-loading')) return;

        const variantId = this._currentVariantId();
        if (!variantId) return;

        this.buyBtn.classList.add('is-loading');
        this.buyBtn.disabled = true;
        window.location.href = this._cartRoot() + 'cart/' + parseInt(variantId, 10) + ':' + this._quantity();
      });
    }

    _bindVariants() {
      const optionInputs = this.section.querySelectorAll(
        '.iotd-swatch__input, .iotd-size-btn__input'
      );

      optionInputs.forEach((input) => {
        input.addEventListener('change', () => {
          // Update visual selected state
          const optionIndex = parseInt(input.dataset.optionIndex, 10);
          this._updateOptionUI(optionIndex, input.value);

          // Find the matching variant
          this._updateVariant();
        });
      });
    }

    _updateOptionUI(optionIndex, value) {
      // Update selected class on swatches / size buttons
      const siblings = this.section.querySelectorAll(
        `[data-option-index="${optionIndex}"] .iotd-swatch,
         [data-option-index="${optionIndex}"] .iotd-size-btn`
      );
      siblings.forEach((el) => el.classList.remove('is-selected'));

      const checkedInput = this.section.querySelector(
        `[data-option-index="${optionIndex}"] input[value="${CSS.escape(value)}"]`
      );
      if (checkedInput) {
        checkedInput.closest('.iotd-swatch, .iotd-size-btn')
          ?.classList.add('is-selected');
      }

      // Update the label display value
      const valueDisplay = this.section.querySelector(
        `[data-option-value-display="${optionIndex}"]`
      );
      if (valueDisplay) valueDisplay.textContent = value;
    }

    _updateVariant() {
      if (!this.variantSelect) return;

      // Collect current option values from checked inputs
      const selectedOptions = [];
      const maxOptions = 3;
      for (let i = 0; i < maxOptions; i++) {
        const checkedInput = this.section.querySelector(
          `[data-option-index="${i}"] input:checked`
        );
        if (checkedInput) {
          selectedOptions.push(checkedInput.value);
        }
      }

      // Find matching option in the native select
      const options = Array.from(this.variantSelect.options);
      const match = options.find((opt) => {
        const o1 = opt.dataset.option1 || '';
        const o2 = opt.dataset.option2 || '';
        const o3 = opt.dataset.option3 || '';
        if (selectedOptions.length === 1) return o1 === selectedOptions[0];
        if (selectedOptions.length === 2) return o1 === selectedOptions[0] && o2 === selectedOptions[1];
        if (selectedOptions.length === 3) return o1 === selectedOptions[0] && o2 === selectedOptions[1] && o3 === selectedOptions[2];
        return false;
      });

      if (match) {
        this.variantSelect.value = match.value;
        this._onVariantChange(match);
      }
    }

    _onVariantChange(selectedOption) {
      // Price
      if (this.priceEl) {
        const price = parseInt(selectedOption.dataset.price, 10);
        this.priceEl.textContent = this._formatMoney(price);
      }

      // Compare price
      if (this.comparePriceEl) {
        const compare = parseInt(selectedOption.dataset.comparePrice, 10);
        const current = parseInt(selectedOption.dataset.price, 10);
        if (compare && compare > current) {
          this.comparePriceEl.textContent = this._formatMoney(compare);
          this.comparePriceEl.style.display = '';
        } else {
          this.comparePriceEl.style.display = 'none';
        }
      }

      // Inventory
      if (this.inventoryEl) {
        const qty    = parseInt(selectedOption.dataset.inventory, 10);
        const policy = selectedOption.dataset.inventoryPolicy;
        if (policy === 'shopify' && qty > 0 && qty <= 10) {
          if (this.inventoryText) this.inventoryText.textContent = qty + ' Last Items';
          this.inventoryEl.classList.remove('iotd-inventory--hidden');
          this.inventoryEl.removeAttribute('aria-hidden');
        } else {
          this.inventoryEl.classList.add('iotd-inventory--hidden');
          this.inventoryEl.setAttribute('aria-hidden', 'true');
        }
      }

      // ATC button availability
      if (this.atcBtn) {
        const available = !selectedOption.disabled;
        this.atcBtn.disabled = !available;
        this.atcBtn.setAttribute('aria-disabled', String(!available));
        this.atcBtn.textContent = available ? 'Add to Cart' : 'Sold Out';
      }

      if (this.buyBtn) {
        const available = !selectedOption.disabled;
        this.buyBtn.disabled = !available;
        this.buyBtn.setAttribute('aria-disabled', String(!available));
      }
    }

    // ── Share button ──────────────────────────────────────────────
    _bindShare() {
      if (!this.shareBtn) return;

      this.shareBtn.addEventListener('click', async () => {
        const relativeUrl = this.shareBtn.dataset.iotdShare || '';
        const url = window.location.origin + relativeUrl;

        if (navigator.share) {
          try {
            await navigator.share({ url });
          } catch (err) {
            // User cancelled — no action needed
          }
        } else {
          // Fallback: copy to clipboard
          try {
            await navigator.clipboard.writeText(url);
            const original = this.shareBtn.innerHTML;
            this.shareBtn.textContent = 'Link copied!';
            setTimeout(() => {
              this.shareBtn.innerHTML = original;
            }, 2000);
          } catch (err) {
            // Silent fail
          }
        }
      });
    }

    // ── Money formatter ───────────────────────────────────────────
    _formatMoney(cents) {
      if (typeof Shopify !== 'undefined' && Shopify.formatMoney) {
        return Shopify.formatMoney(cents, '{{amount}}');
      }
      const symbol = (typeof Shopify !== 'undefined' && Shopify.currency && Shopify.currency.symbol) || '₹';
      return symbol + (cents / 100).toFixed(2);
    }

    _cartRoot() {
      let root = (window.Shopify && Shopify.routes && Shopify.routes.root) ? Shopify.routes.root : '/';
      if (root.charAt(root.length - 1) !== '/') root += '/';
      return root;
    }

    _currentVariantId() {
      return this.variantSelect ? this.variantSelect.value : '';
    }

    _quantity() {
      const quantity = this.qtyInput ? parseInt(this.qtyInput.value, 10) : 1;
      if (isNaN(quantity) || quantity < 1) return 1;
      return quantity;
    }

    _setAtcLoading(isLoading, label) {
      if (!this.atcBtn) return;
      this.atcBtn.classList.toggle('is-loading', isLoading);
      this.atcBtn.disabled = isLoading;
      this.atcBtn.setAttribute('aria-disabled', String(isLoading));
      if (label) this.atcBtn.textContent = label;
    }

    _notifyCartChanged(variantId, quantity) {
      if (window.SmoorCart && window.SmoorCart.updateBadge) {
        window.SmoorCart.updateBadge();
      }

      if (window.publish && window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) {
        window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
          source: 'item-of-the-day',
          productVariantId: variantId,
          cartData: null,
          quantity
        });
      }
    }
  }

  // ── Init all instances on the page ────────────────────────────
  function initAll() {
    document.querySelectorAll('[data-section-type="item-of-the-day"]').forEach((el) => {
      new ItemOfTheDay(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // ── Shopify theme editor live-reload support ───────────────────
  document.addEventListener('shopify:section:load', (event) => {
    const section = event.target.querySelector('[data-section-type="item-of-the-day"]');
    if (section) new ItemOfTheDay(section);
  });
})();
