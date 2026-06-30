// ==UserScript==
// @name         Neopets My Shop Enhancements
// @version      1.0
// @description  Enhances the new updated My Shop stock page.
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/market.phtml?type=your*
// @grant        none
// @run-at       document-start
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20My%20Shop%20Enhancements.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20My%20Shop%20Enhancements.user.js
// ==/UserScript==

// Enhancements:
// - Hide item Type metadata
// - Remove the Description column so item names have more room
// - Add Max Quantity link under Remove steppers
// - Compact the shop navigation into one row

(function () {
    'use strict';

    const STYLE_ID = 'hero-shop-enhancements-style';
    const MAX_LINK_CLASS = 'hero-shop-max-quantity';
    const ENHANCED_STEPPER_ATTR = 'data-hero-shop-max-link';
    let enhanceTimer = null;
    let internalMutation = false;

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .mkt-subnav {
                align-items: center !important;
                display: flex !important;
                flex-wrap: nowrap !important;
                gap: 5px !important;
                justify-content: center !important;
                overflow-x: auto !important;
                padding-left: 6px !important;
                padding-right: 6px !important;
                white-space: nowrap !important;
            }

            .mkt-subnav__label,
            .mkt-subnav__link {
                flex: 0 0 auto !important;
                font-size: 13px !important;
                line-height: 1.2 !important;
                margin: 0 !important;
                padding: 5px 7px !important;
                white-space: nowrap !important;
            }

            .mkt-subnav__label {
                padding-left: 0 !important;
                padding-right: 1px !important;
            }

            .market-your-table {
                table-layout: fixed !important;
                width: 100% !important;
            }

            .market-your-table .market-your__col-item {
                width: 44% !important;
            }

            .market-your-table .market-your__col-stock {
                width: 10% !important;
            }

            .market-your-table .market-your__col-cost {
                width: 25% !important;
            }

            .market-your-table .market-your__col-rm {
                width: 21% !important;
            }

            .market-your-table td {
                vertical-align: middle !important;
            }

            .market-your-item {
                align-items: center !important;
                display: flex !important;
                gap: 10px !important;
                min-width: 0 !important;
            }

            .market-your-item__info {
                min-width: 0 !important;
                width: 100% !important;
            }

            .market-your-item__name {
                display: block !important;
                line-height: 1.25 !important;
                max-width: none !important;
                white-space: normal !important;
                word-break: normal !important;
                overflow-wrap: anywhere !important;
            }

            .market-your-item__meta {
                display: none !important;
            }

            .market-your-table .search-helper {
                display: flex !important;
                flex-wrap: wrap !important;
                gap: 4px !important;
                margin: 4px 0 0 !important;
            }

            .${MAX_LINK_CLASS} {
                color: #1f5f95;
                cursor: pointer;
                display: block;
                font-size: 12px;
                line-height: 1.2;
                margin-top: 5px;
                text-align: center;
                text-decoration: underline;
                white-space: nowrap;
            }

            .market-your-table .mkt-stepper {
                margin-left: auto;
                margin-right: auto;
            }

            @media (max-width: 900px) {
                .mkt-subnav {
                    justify-content: flex-start !important;
                }

                .market-your-table {
                    table-layout: auto !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function scheduleEnhance() {
        clearTimeout(enhanceTimer);
        enhanceTimer = setTimeout(enhanceShopPage, 80);
    }

    function enhanceShopPage() {
        if (!document.body) return;

        internalMutation = true;
        try {
            injectStyles();
            removeDescriptionColumn();
            hideTypeMetadata();
            addMaxQuantityLinks();
        } finally {
            requestAnimationFrame(() => {
                internalMutation = false;
            });
        }
    }

    function removeDescriptionColumn() {
        document.querySelectorAll('table.market-your-table').forEach(table => {
            const headerCells = Array.from(table.querySelectorAll('thead th'));
            const descIndex = headerCells.findIndex(th => th.classList.contains('market-your__col-desc') || getText(th) === 'description');
            if (descIndex < 0) return;

            headerCells[descIndex].remove();
            table.querySelectorAll('tbody tr').forEach(row => {
                const cells = Array.from(row.children).filter(child => child.matches?.('td, th'));
                cells[descIndex]?.remove();
            });
        });
    }

    function hideTypeMetadata() {
        document.querySelectorAll('.market-your-item__meta').forEach(meta => {
            meta.hidden = true;
        });
    }

    function addMaxQuantityLinks() {
        document.querySelectorAll('.market-your-table .mkt-stepper').forEach(stepper => {
            if (stepper.hasAttribute(ENHANCED_STEPPER_ATTR)) return;

            const input = stepper.querySelector('.mkt-stepper__input[data-rm], input[name^="back_to_inv["]');
            if (!input) return;

            const max = getStepperMax(stepper, input);
            if (!Number.isFinite(max) || max < 1) return;

            stepper.setAttribute(ENHANCED_STEPPER_ATTR, 'true');

            const link = document.createElement('a');
            link.href = '#';
            link.className = MAX_LINK_CLASS;
            link.textContent = 'Max Quantity';
            link.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                setInputValue(input, String(max));
            });

            stepper.insertAdjacentElement('afterend', link);
        });
    }

    function getStepperMax(stepper, input) {
        const max = Number.parseInt(stepper.dataset.max || input.max || '', 10);
        if (Number.isFinite(max)) return max;

        const row = stepper.closest('tr');
        const stockText = row?.querySelector('.market-your__col-stock, td:nth-child(2)')?.textContent || '';
        const stock = Number.parseInt(stockText.replace(/\D+/g, ''), 10);
        return Number.isFinite(stock) ? stock : NaN;
    }

    function setInputValue(input, value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) {
            setter.call(input, value);
        } else {
            input.value = value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function getText(element) {
        return (element?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function startEnhancer() {
        enhanceShopPage();

        const observer = new MutationObserver(() => {
            if (!internalMutation) scheduleEnhance();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startEnhancer, { once: true });
    } else {
        startEnhancer();
    }
})();
