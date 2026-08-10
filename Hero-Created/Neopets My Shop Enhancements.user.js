// ==UserScript==
// @name         Neopets My Shop Enhancements
// @version      1.5
// @description  Enhances the new updated My Shop stock page.
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/market.phtml?type=your*
// @grant        GM_xmlhttpRequest
// @connect      itemdb.com.br
// @run-at       document-start
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20My%20Shop%20Enhancements.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20My%20Shop%20Enhancements.user.js
// ==/UserScript==

// Enhancements:
// - Hide item Type metadata
// - Remove the Description column so item names have more room
// - Add Max Quantity link under Remove steppers
// - Compact the shop navigation into one row
// - Remove the Jump to label
// - Add a toggle for compact shop stock rows
// - Show ItemDB prices under item names

(function () {
    'use strict';

    const STYLE_ID = 'hero-shop-enhancements-style';
    const MAX_LINK_CLASS = 'hero-shop-max-quantity';
    const PRICE_CLASS = 'hero-shop-itemdb-price';
    const COMPACT_CLASS = 'hero-shop-compact';
    const COMPACT_TOGGLE_CLASS = 'hero-shop-compact-toggle';
    const DESCRIPTION_CELL_CLASS = 'hero-shop-description-cell';
    const ENHANCED_STEPPER_ATTR = 'data-hero-shop-max-link';
    const ITEMDB_API = 'https://itemdb.com.br/api/v2/items/many';
    const ITEMDB_INTENT = 'pricer';
    const itemdbResults = new Map();
    const pendingPriceNames = new Map();
    let enhanceTimer = null;
    let priceFetchTimer = null;
    let internalMutation = false;
    let compactMode = true;

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
                align-items: flex-start !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 0 !important;
                min-width: 0 !important;
                text-align: left !important;
                width: 100% !important;
            }

            .market-your-item__name {
                display: block !important;
                line-height: 1.25 !important;
                max-width: none !important;
                white-space: normal !important;
                word-break: normal !important;
                overflow-wrap: anywhere !important;
                text-align: left !important;
                width: 100% !important;
            }

            .market-your-item__meta,
            .market-your__col-desc,
            .hero-shop-description-cell {
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

            .mkt-subnav__label {
                display: none !important;
            }

            .market-your-metarow {
                align-items: center !important;
                display: flex !important;
                flex-wrap: wrap !important;
                gap: 8px !important;
            }

            .hero-shop-compact-toggle {
                background: #ffffff;
                border: 1px solid #9ca3af;
                border-radius: 4px;
                color: #374151;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                line-height: 1.2;
                padding: 4px 8px;
                white-space: nowrap;
            }

            .hero-shop-compact-toggle[aria-pressed="true"] {
                background: #e7f1f8;
                border-color: #1f5f95;
                color: #16496f;
            }

            .hero-shop-compact-toggle:hover {
                border-color: #1f5f95;
            }

            .hero-shop-compact-toggle:focus-visible {
                outline: 2px solid #1f5f95;
                outline-offset: 2px;
            }

            .hero-shop-itemdb-price {
                align-self: stretch !important;
                color: #4b5563;
                display: block;
                font-size: 12px;
                font-weight: 400;
                line-height: 1.2;
                margin-top: 2px;
                text-align: left !important;
                width: 100% !important;
                white-space: nowrap;
            }

            .hero-shop-itemdb-price.is-loading,
            .hero-shop-itemdb-price.is-missing {
                color: #6b7280;
            }

            #market-your-app.hero-shop-compact .market-your-table .market-your__col-item {
                width: 48% !important;
            }

            #market-your-app.hero-shop-compact .market-your-table .market-your__col-stock {
                width: 8% !important;
            }

            #market-your-app.hero-shop-compact .market-your-table .market-your__col-cost {
                width: 26% !important;
            }

            #market-your-app.hero-shop-compact .market-your-table .market-your__col-rm {
                width: 18% !important;
            }

            #market-your-app.hero-shop-compact .market-your-table th,
            #market-your-app.hero-shop-compact .market-your-table td {
                padding: 6px 8px !important;
            }

            #market-your-app.hero-shop-compact .market-your-table .market-your-item__imgwrap,
            #market-your-app.hero-shop-compact .market-your-table .market-your-item__img {
                height: 48px !important;
                width: 48px !important;
            }

            #market-your-app.hero-shop-compact .market-your-table .market-your__cost-field input[data-money] {
                box-sizing: border-box !important;
                height: 30px !important;
                padding: 3px 6px !important;
                width: 100px !important;
            }

            #market-your-app.hero-shop-compact .market-your-table .market-your__price-hint {
                display: none !important;
            }

            #market-your-app.hero-shop-compact .market-your-table .mkt-stepper__btn,
            #market-your-app.hero-shop-compact .market-your-table .mkt-stepper__input {
                height: 28px !important;
            }

            #market-your-app.hero-shop-compact .market-your-table .mkt-stepper__btn {
                width: 28px !important;
            }

            #market-your-app.hero-shop-compact .market-your-table .mkt-stepper__input {
                width: 40px !important;
            }
            @media (max-width: 1024px) {
                .market-your-table {
                    table-layout: auto !important;
                }

                .market-your-table.np-table tbody td:nth-child(4) > span {
                    align-items: center !important;
                    display: flex !important;
                    flex-wrap: wrap !important;
                    gap: 6px !important;
                }

                .market-your-table.np-table tbody td:nth-child(4) .mkt-cell-label {
                    flex: 0 0 auto;
                }

                .market-your-table.np-table tbody td:nth-child(4) .market-your__cost-field {
                    align-items: center !important;
                    display: flex !important;
                    flex: 1 1 140px;
                    flex-wrap: wrap !important;
                    gap: 4px 6px !important;
                    min-width: 0;
                }

                .market-your-table.np-table tbody td:nth-child(4) input[data-money] {
                    max-width: 100% !important;
                }
            }

            @media (max-width: 900px) {
                .mkt-subnav {
                    justify-content: flex-start !important;
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
            addCompactToggle();
            removeJumpToLabel();
            removeDescriptionColumn();
            hideTypeMetadata();
            addMaxQuantityLinks();
            addItemdbPriceLines();
        } finally {
            requestAnimationFrame(() => {
                internalMutation = false;
            });
        }
    }

    function addCompactToggle() {
        const app = document.getElementById('market-your-app');
        app?.classList.toggle(COMPACT_CLASS, compactMode);

        const metaRow = document.querySelector('.market-your-metarow');
        if (!metaRow) return;

        let button = metaRow.querySelector('.' + COMPACT_TOGGLE_CLASS);
        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = COMPACT_TOGGLE_CLASS;
            button.addEventListener('click', event => {
                event.preventDefault();
                compactMode = !compactMode;
                addCompactToggle();
            });

            const feedMeta = metaRow.querySelector('.shop-feed-meta');
            if (feedMeta) {
                feedMeta.insertAdjacentElement('afterend', button);
            } else {
                metaRow.appendChild(button);
            }
        }

        const label = compactMode ? 'Compact: On' : 'Compact: Off';
        button.setAttribute('aria-pressed', String(compactMode));
        button.title = compactMode ? 'Use regular row spacing' : 'Use compact row spacing';
        if (button.textContent !== label) button.textContent = label;
    }
    function removeJumpToLabel() {
        document.querySelectorAll('.mkt-subnav .mkt-subnav__label').forEach(label => label.remove());
    }
    function removeDescriptionColumn() {
        document.querySelectorAll('table.market-your-table').forEach(table => {
            const headerCells = Array.from(table.querySelectorAll('thead th'));
            const descIndex = headerCells.findIndex(th => th.classList.contains('market-your__col-desc') || getText(th) === 'description');
            if (descIndex < 0) return;

            headerCells[descIndex].classList.add(DESCRIPTION_CELL_CLASS);
            table.querySelectorAll('tbody tr').forEach(row => {
                const cells = Array.from(row.children).filter(child => child.matches?.('td, th'));
                cells[descIndex]?.classList.add(DESCRIPTION_CELL_CLASS);
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

    function addItemdbPriceLines() {
        document.querySelectorAll('.market-your-table .market-your-item__name').forEach(nameEl => {
            const itemName = nameEl.textContent.replace(/\s+/g, ' ').trim();
            const infoEl = nameEl.closest('.market-your-item__info');
            if (!itemName || !infoEl) return;

            let priceEl = infoEl.querySelector(`.${PRICE_CLASS}`);
            if (!priceEl) {
                priceEl = document.createElement('span');
                priceEl.className = `${PRICE_CLASS} is-loading`;
                priceEl.textContent = 'itemdb: checking...';
                nameEl.insertAdjacentElement('afterend', priceEl);
            }

            const key = normalizeName(itemName);
            priceEl.dataset.itemdbName = key;

            if (itemdbResults.has(key)) {
                renderItemdbPrice(priceEl, itemdbResults.get(key));
            } else {
                pendingPriceNames.set(key, itemName);
            }
        });

        queueItemdbPriceFetch();
    }

    function queueItemdbPriceFetch() {
        if (!pendingPriceNames.size) return;

        clearTimeout(priceFetchTimer);
        priceFetchTimer = setTimeout(() => {
            const requestedNames = new Map(pendingPriceNames);
            pendingPriceNames.clear();

            fetchItemdbPrices(Array.from(requestedNames.values())).then(itemsByName => {
                requestedNames.forEach((itemName, key) => {
                    const item = itemsByName.get(key);
                    const rawValue = item?.price?.value;
                    const value = rawValue == null ? NaN : Number(rawValue);
                    const result = item && Number.isFinite(value)
                        ? { status: 'ready', value }
                        : { status: 'missing', value: null };

                    itemdbResults.set(key, result);
                    updateItemdbPriceElements(key, result);
                });
            }).catch(() => {
                requestedNames.forEach((itemName, key) => {
                    const result = { status: 'unavailable', value: null };
                    itemdbResults.set(key, result);
                    updateItemdbPriceElements(key, result);
                });
            });
        }, 150);
    }

    function fetchItemdbPrices(names) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: ITEMDB_API,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ type: 'name', data: names, intent: ITEMDB_INTENT }),
                responseType: 'json',
                timeout: 15000,
                onload(response) {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`ItemDB returned status ${response.status}`));
                        return;
                    }

                    try {
                        let data = response.response;
                        if (!data || typeof data !== 'object') {
                            data = JSON.parse(response.responseText || '{}');
                        }

                        const itemsByName = new Map();
                        Object.values(data || {}).forEach(item => {
                            if (item?.name) itemsByName.set(normalizeName(item.name), item);
                        });
                        resolve(itemsByName);
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: reject,
                ontimeout: reject
            });
        });
    }

    function updateItemdbPriceElements(key, result) {
        document.querySelectorAll(`.${PRICE_CLASS}`).forEach(priceEl => {
            if (priceEl.dataset.itemdbName === key) renderItemdbPrice(priceEl, result);
        });
    }

    function renderItemdbPrice(priceEl, result) {
        const isReady = result.status === 'ready';
        const className = isReady ? PRICE_CLASS : `${PRICE_CLASS} is-missing`;
        const text = isReady
            ? `itemdb: ${result.value.toLocaleString('en-US')} NPs`
            : result.status === 'unavailable'
                ? 'itemdb: unavailable'
                : 'itemdb: no price';

        if (priceEl.className === className && priceEl.textContent === text) return;
        priceEl.className = className;
        priceEl.textContent = text;
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

    function normalizeName(name) {
        return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
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
