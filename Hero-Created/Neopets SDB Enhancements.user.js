// ==UserScript==
// @name         Neopets SDB Enhancements
// @version      2.0
// @description  Enhances new SDB page.
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/safetydeposit.phtml*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      itemdb.com.br
// @run-at       document-start
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20SDB%20Enhancements.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20SDB%20Enhancements.user.js
// ==/UserScript==

// Enhancements:
// - Added SSW, Trading Post, Auction Genie, SDB, JellyNeo, ItemDB search icons
// - Pop up is kinda annoying so now only image / name click opens it
// - Hides Donate / Discard Options in dropdown
// - Add itemDB prices
// - Add SDB pin field for Remove 1 functionality


(function () {
    'use strict';

    const ITEMDB_API = 'https://itemdb.com.br/api/v1/items/many';
    const PRICE_CACHE_PREFIX = 'price_';
    const PRICE_CACHE_TTL = 12 * 60 * 60 * 1000;
    const SEARCH_HELPER_CLASS = 'sdb-search-helper';
    const PRICE_CLASS = 'sdb-itemdb-price';
    const PIN_INPUT_ID = 'hero-sdb-pin';
    const REMOVE_LINK_CLASS = 'hero-sdb-remove-one';
    const REMOVE_ERROR_CLASS = 'hero-sdb-remove-error';
    const ENHANCED_ROW_ATTR = 'data-hero-sdb-enhanced';
    const ENHANCED_GRID_ATTR = 'data-hero-sdb-grid-enhanced';
    const HIDDEN_ACTION_VALUES = new Set(['donate', 'discard']);
    const DETAIL_CLICK_TARGETS = '.sdb-item-img, .sdb-item-name, .sdb-item-view-details';
    const GRID_DETAIL_CLICK_TARGETS = '.sdb-grid-item-image, .sdb-grid-item-name';
    const SAFE_CLICK_TARGETS = [
        DETAIL_CLICK_TARGETS,
        `.${SEARCH_HELPER_CLASS}`,
        'a',
        'button',
        'input',
        'select',
        'textarea',
        'label',
        '.np-stepper',
        '.sdb-as'
    ].join(', ');

    let enhanceTimer = null;
    const pendingPriceNames = new Set();
    const sdbItemsByExactKey = new Map();
    const sdbItemsByName = new Map();
    let priceFetchTimer = null;

    function injectStyles() {
        if (document.getElementById('hero-sdb-enhancements-style')) return;

        const style = document.createElement('style');
        style.id = 'hero-sdb-enhancements-style';
        style.textContent = `
            .sdb-item-name-line {
                align-items: center;
                display: inline-flex;
                flex-wrap: wrap;
                gap: 5px;
                line-height: 1.2;
            }

            .${SEARCH_HELPER_CLASS} {
                align-items: center;
                display: inline-flex;
                flex-wrap: wrap;
                gap: 4px;
                margin: 0;
                vertical-align: middle;
            }

            .${SEARCH_HELPER_CLASS} a {
                display: inline-flex;
                height: 18px;
                width: 18px;
            }

            .${SEARCH_HELPER_CLASS} .searchimg {
                border: 0 !important;
                border-radius: 0 !important;
                cursor: pointer;
                height: 18px !important;
                max-height: 18px !important;
                max-width: 18px !important;
                object-fit: contain;
                opacity: 1 !important;
                transform: none !important;
                transition: none !important;
                vertical-align: middle;
                width: 18px !important;
            }

            .${SEARCH_HELPER_CLASS} a:hover .searchimg {
                opacity: 1 !important;
                transform: none !important;
            }

            .${PRICE_CLASS} {
                color: #365269;
                display: block;
                font-size: 12px;
                line-height: 1.35;
                margin-top: 2px;
            }

            .${PRICE_CLASS}.is-loading,
            .${PRICE_CLASS}.is-missing {
                color: #6b7280;
            }

            .sdb-grid-item .${SEARCH_HELPER_CLASS} {
                display: flex;
                justify-content: center;
                margin-top: 4px;
            }

            .sdb-grid-item .${PRICE_CLASS} {
                font-size: 11px;
                margin-top: 3px;
                text-align: center;
            }

            .sdb-header-bar.hero-sdb-has-pin {
                align-items: center;
                display: flex;
                gap: 10px;
            }

            .sdb-header-bar.hero-sdb-has-pin .sdb-header-totals {
                margin-right: auto;
            }

            .hero-sdb-pin-wrap {
                align-items: center;
                display: inline-flex;
                gap: 5px;
                margin-left: auto;
                white-space: nowrap;
            }

            .hero-sdb-pin-wrap label {
                color: #48330d;
                font-size: 12px;
                font-weight: 700;
            }

            #${PIN_INPUT_ID} {
                background: #fff;
                border: 1px solid #c3ad82;
                border-radius: 5px;
                box-sizing: border-box;
                font-size: 12px;
                color: black;
                height: 26px;
                padding: 3px 6px;
                width: 64px;
            }

            .${REMOVE_LINK_CLASS} {
                color: #1f5f95;
                cursor: pointer;
                display: inline-block;
                font-size: 12px;
                margin-top: 4px;
                text-decoration: underline;
            }

            .${REMOVE_ERROR_CLASS} {
                color: #a02518;
                display: block;
                font-size: 11px;
                line-height: 1.25;
                margin-top: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    function scheduleEnhance() {
        clearTimeout(enhanceTimer);
        enhanceTimer = setTimeout(enhanceRows, 80);
    }

    function enhanceRows() {
        injectStyles();
        addPinInput();
        hideUnsafeActionOptions();
        document.querySelectorAll('.sdb-item-cell').forEach(enhanceItemCell);
        document.querySelectorAll('.sdb-grid-item').forEach(enhanceGridItem);
        document.querySelectorAll('td.sdb-cell-action').forEach(addRemoveOneLink);
        queueMissingPrices();
    }

    function addPinInput() {
        if (document.getElementById(PIN_INPUT_ID)) return;

        const headerBar = document.querySelector('.sdb-header-bar');
        if (!headerBar) return;
        headerBar.classList.add('hero-sdb-has-pin');

        const wrap = document.createElement('span');
        wrap.className = 'hero-sdb-pin-wrap';
        wrap.innerHTML = `
            <label for="${PIN_INPUT_ID}">SDB PIN</label>
            <input id="${PIN_INPUT_ID}" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="0000">
        `;
        headerBar.appendChild(wrap);

        const input = wrap.querySelector(`#${PIN_INPUT_ID}`);
        input.addEventListener('input', () => {
            input.value = normalizeSdbPin(input.value);
        });
    }

    function hideUnsafeActionOptions() {
        document.querySelectorAll('select.sdb-action-select').forEach(select => {
            Array.from(select.options).forEach(option => {
                if (HIDDEN_ACTION_VALUES.has(option.value)) option.remove();
            });
        });
    }

    function enhanceItemCell(cell) {
        const nameEl = cell.querySelector('.sdb-item-name');
        const infoEl = cell.querySelector('.sdb-item-info');
        if (!nameEl || !infoEl) return;

        const itemName = getItemName(nameEl);
        if (!itemName) return;

        if (!cell.hasAttribute(ENHANCED_ROW_ATTR) || cell.dataset.heroSdbName !== itemName) {
            cell.setAttribute(ENHANCED_ROW_ATTR, 'true');
            cell.dataset.heroSdbName = itemName;
            addNameHelper(nameEl, itemName);
            addPriceLine(infoEl, itemName);
        }

        applyCachedPrice(cell, itemName);
    }

    function enhanceGridItem(gridItem) {
        const nameEl = gridItem.querySelector('.sdb-grid-item-name');
        const contentEl = gridItem.querySelector('.sdb-grid-item-content');
        const categoryEl = gridItem.querySelector('.sdb-grid-item-category');
        if (!nameEl || !contentEl) return;

        const itemName = getItemName(nameEl);
        if (!itemName) return;

        if (!gridItem.hasAttribute(ENHANCED_GRID_ATTR) || gridItem.dataset.heroSdbName !== itemName) {
            gridItem.setAttribute(ENHANCED_GRID_ATTR, 'true');
            gridItem.dataset.heroSdbName = itemName;
            addGridHelper(nameEl, itemName);
            addPriceLine(contentEl, itemName, categoryEl);
        }

        applyCachedPrice(gridItem, itemName);
    }

    function addRemoveOneLink(actionCell) {
        if (actionCell.querySelector(`.${REMOVE_LINK_CLASS}`)) return;

        const link = document.createElement('a');
        link.href = '#';
        link.className = REMOVE_LINK_CLASS;
        link.textContent = 'Remove 1';
        link.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            removeOneItem(actionCell, link);
        });
        actionCell.appendChild(link);
    }

    function getItemName(nameEl) {
        return (nameEl?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function addNameHelper(nameEl, itemName) {
        const oldHelper = nameEl.parentElement?.querySelector(`.${SEARCH_HELPER_CLASS}`);
        oldHelper?.remove();

        let line = nameEl.closest('.sdb-item-name-line');
        if (!line) {
            line = document.createElement('span');
            line.className = 'sdb-item-name-line';
            nameEl.insertAdjacentElement('beforebegin', line);
            line.appendChild(nameEl);
        }

        line.appendChild(buildSearchHelper(itemName));
    }

    function addGridHelper(nameEl, itemName) {
        const existingHelper = nameEl.parentElement?.querySelector(`.${SEARCH_HELPER_CLASS}`);
        existingHelper?.remove();
        nameEl.insertAdjacentElement('afterend', buildSearchHelper(itemName));
    }

    function buildSearchHelper(itemName) {
        const helper = document.createElement('span');
        helper.className = SEARCH_HELPER_CLASS;
        helper.dataset.itemName = itemName;
        helper.addEventListener('click', event => event.stopPropagation());

        helper.append(
            makeSswLink(itemName),
            makeSearchLink(
                'Trading Post',
                `https://www.neopets.com/island/tradingpost.phtml?type=browse&criteria=item_phrase&search_string=${encodeURIComponent(itemName)}&sort=newest`,
                'http://images.neopets.com/themes/h5/basic/images/tradingpost-icon.png'
            ),
            makeSearchLink(
                'Auction Genie',
                `/genie.phtml?type=process_genie&criteria=exact&auctiongenie=${encodeURIComponent(itemName)}`,
                'http://images.neopets.com/themes/h5/basic/images/auction-icon.png'
            ),
            makeSearchLink(
                'Safety Deposit Box',
                `https://www.neopets.com/safetydeposit.phtml?obj_name=${encodeURIComponent(itemName)}&category=0`,
                'https://images.neopets.com/images/emptydepositbox.gif'
            ),
            makeSearchLink(
                'JellyNeo',
                `https://items.jellyneo.net/search/?name=${encodeURIComponent(itemName)}&name_type=3`,
                'https://images.neopets.com/items/toy_plushie_negg_fish.gif'
            ),
            makeSearchLink(
                'ItemDB',
                `https://itemdb.com.br/item/${encodeURIComponent(itemName)}`,
                'https://images.neopets.com/themes/h5/basic/images/v3/quickstock-icon.svg'
            )
        );

        return helper;
    }

    function makeSearchLink(title, href, imgSrc) {
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = title;
        link.innerHTML = `<img src="${imgSrc}" class="searchimg" alt="">`;
        return link;
    }

    function makeSswLink(itemName) {
        const link = document.createElement('a');
        link.href = '#';
        link.title = 'Super Shop Wizard';
        link.innerHTML = '<img src="http://images.neopets.com/premium/shopwizard/ssw-icon.svg" class="searchimg" alt="">';
        link.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();

            document.querySelectorAll('.premium-widget__2024').forEach(widget => {
                widget.style.display = 'none';
            });
            if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.toggleWidget__2020 === 'function') {
                unsafeWindow.toggleWidget__2020('ssw');
            } else if (typeof toggleWidget__2020 === 'function') {
                toggleWidget__2020('ssw');
            }

            const criteriaInput = document.getElementById('ssw-criteria');
            const searchInput = document.getElementById('searchstr');
            const searchBtn = document.getElementById('ssw-button-new-search');

            if (criteriaInput) criteriaInput.value = 'exact';
            if (searchInput) searchInput.value = itemName;
            if (searchBtn) searchBtn.click();
        });
        return link;
    }

    function addPriceLine(infoEl, itemName, beforeEl = null) {
        const existing = infoEl.querySelector(`.${PRICE_CLASS}`);
        existing?.remove();

        const priceEl = document.createElement('span');
        priceEl.className = `${PRICE_CLASS} is-loading`;
        priceEl.dataset.itemName = itemName;
        priceEl.textContent = 'ItemDB: checking...';
        if (beforeEl?.parentElement === infoEl) {
            infoEl.insertBefore(priceEl, beforeEl);
        } else {
            infoEl.appendChild(priceEl);
        }
    }

    function applyCachedPrice(cell, itemName) {
        const priceEl = cell.querySelector(`.${PRICE_CLASS}`);
        if (!priceEl) return;

        const cached = getCachedPrice(itemName);
        if (!cached) {
            pendingPriceNames.add(itemName);
            return;
        }

        renderPrice(priceEl, cached.item, itemName, cached.isStale);
        if (cached.isStale) pendingPriceNames.add(itemName);
    }

    function queueMissingPrices() {
        if (!pendingPriceNames.size) return;

        clearTimeout(priceFetchTimer);
        priceFetchTimer = setTimeout(() => {
            const names = Array.from(pendingPriceNames);
            pendingPriceNames.clear();
            fetchItemdbPrices(names).then(itemsByName => {
                names.forEach(name => {
                    const item = itemsByName.get(normalizeName(name));
                    if (item) setCachedPrice(name, item);
                    document.querySelectorAll(`.${PRICE_CLASS}`).forEach(priceEl => {
                        if (priceEl.dataset.itemName !== name) return;
                        if (item) {
                            renderPrice(priceEl, item, name, false);
                        } else if (!getCachedPrice(name)) {
                            priceEl.className = `${PRICE_CLASS} is-missing`;
                            priceEl.textContent = 'ItemDB: not found';
                        }
                    });
                });
            });
        }, 150);
    }

    function getCachedPrice(itemName) {
        const raw = localStorage.getItem(PRICE_CACHE_PREFIX + itemName);
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            const item = parsed?.item || parsed?.data || parsed;
            const value = getItemPriceValue(item);
            if (value === null) return null;

            const cachedAt = Number(parsed.timestamp || parsed.__heroCachedAt || parsed.cachedAt || parsed.fetchedAt || parsed.ts || item.__heroCachedAt || item.fetchedAt || 0);
            return {
                item: { value },
                isStale: cachedAt ? Date.now() - cachedAt > PRICE_CACHE_TTL : false
            };
        } catch {
            const trimmed = raw.trim();
            if (!trimmed) return null;
            return {
                item: { name: itemName, cachedLabel: trimmed },
                isStale: false
            };
        }
    }

    function setCachedPrice(itemName, item) {
        const value = getItemPriceValue(item);
        if (value === null) return;

        try {
            localStorage.setItem(
                PRICE_CACHE_PREFIX + itemName,
                JSON.stringify({ value, timestamp: Date.now() })
            );
        } catch {
            // Storage may be full or blocked; the live row still gets updated.
        }
    }

    function getItemPriceValue(item) {
        const value = item?.price?.value ?? item?.value;
        return Number.isFinite(Number(value)) ? Number(value) : null;
    }

    function fetchItemdbPrices(names) {
        return new Promise(resolve => {
            const uniqueNames = Array.from(new Set(names.filter(Boolean)));
            if (!uniqueNames.length) {
                resolve(new Map());
                return;
            }

            const payload = {
                id: [],
                item_id: [],
                name: uniqueNames,
                image_id: [],
                name_image_id: []
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: ITEMDB_API,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(payload),
                onload(response) {
                    try {
                        const data = JSON.parse(response.responseText || '{}');
                        const itemsByName = new Map();
                        Object.values(data || {}).forEach(item => {
                            if (item?.name) itemsByName.set(normalizeName(item.name), item);
                        });
                        resolve(itemsByName);
                    } catch {
                        resolve(new Map());
                    }
                },
                onerror() {
                    resolve(new Map());
                }
            });
        });
    }

    function renderPrice(priceEl, item, itemName, isStale) {
        const label = formatPrice(item);
        const signature = JSON.stringify({
            label,
            isStale: Boolean(isStale)
        });
        if (priceEl.dataset.priceSignature === signature) return;

        priceEl.className = PRICE_CLASS;
        priceEl.dataset.priceSignature = signature;
        priceEl.textContent = `ItemDB: ${label}${isStale ? ' (cached)' : ''}`;
    }

    function formatPrice(item) {
        if (item.cachedLabel) return item.cachedLabel;
        if (String(item.status || '').toLowerCase() === 'no trade') return 'No Trade';
        if (item.isNC && item.owls?.value) return `${item.owls.value} Owls`;
        if (item.isNC) return 'NC';

        const value = item.price?.value ?? item.value;
        if (Number.isFinite(Number(value))) return `~ ${Number(value).toLocaleString('en-US')} NP`;
        return 'Unknown';
    }

    function normalizeName(name) {
        return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function normalizeSdbPin(pin) {
        return String(pin || '').replace(/\D/g, '').slice(0, 4);
    }

    function cacheSdbItems(payload) {
        const items = payload?.data?.items;
        if (!Array.isArray(items)) return;

        items.forEach(item => {
            const name = item?.obj_name;
            const id = item?.obj_info_id || item?.id;
            if (!name || !id) return;

            const record = {
                id: Number(id),
                name,
                filename: item.obj_filename || ''
            };
            sdbItemsByName.set(normalizeName(name), record);
            if (record.filename) sdbItemsByExactKey.set(`${normalizeName(name)}|${record.filename}`, record);
        });
    }

    function installSdbItemsInterceptor() {
        const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (targetWindow.__heroSdbItemsInterceptorInstalled) return;
        targetWindow.__heroSdbItemsInterceptorInstalled = true;

        const originalFetch = targetWindow.fetch;
        if (typeof originalFetch === 'function') {
            targetWindow.fetch = function (...args) {
                const responsePromise = originalFetch.apply(this, args);
                responsePromise.then(response => {
                    if (!isSdbGetItemsUrl(args[0])) return;
                    response.clone().text().then(cacheSdbItemsText).catch(() => {});
                }).catch(() => {});
                return responsePromise;
            };
        }

        const Xhr = targetWindow.XMLHttpRequest;
        if (typeof Xhr === 'function') {
            const originalOpen = Xhr.prototype.open;
            const originalSend = Xhr.prototype.send;

            Xhr.prototype.open = function (method, url, ...rest) {
                this.__heroSdbUrl = url;
                return originalOpen.call(this, method, url, ...rest);
            };

            Xhr.prototype.send = function (...args) {
                if (isSdbGetItemsUrl(this.__heroSdbUrl)) {
                    this.addEventListener('load', () => {
                        cacheSdbItemsText(this.responseText);
                    });
                }
                return originalSend.apply(this, args);
            };
        }
    }

    function isSdbGetItemsUrl(input) {
        const rawUrl = typeof input === 'string' ? input : input?.url;
        return String(rawUrl || '').includes('/np-templates/ajax/safetydeposit/get-items.php');
    }

    function cacheSdbItemsText(text) {
        try {
            cacheSdbItems(JSON.parse(text || '{}'));
        } catch {
            // Ignore non-JSON responses.
        }
    }

    async function removeOneItem(actionCell, link) {
        clearRemoveError(actionCell);

        const pin = getSdbPin();
        if (!pin) {
            showRemoveError(actionCell, 'Enter your SDB PIN first.');
            return;
        }

        const itemName = getActionCellItemName(actionCell);
        const item = getCachedSdbItem(actionCell, itemName);
        if (!item?.id) {
            showRemoveError(actionCell, 'Could not find this item ID yet. Refresh and try again.');
            return;
        }

        const refCk = getRefCk();
        if (!refCk) {
            showRemoveError(actionCell, 'Could not find _ref_ck for the SDB request.');
            return;
        }

        try {
            const response = await fetch('/np-templates/ajax/safetydeposit/move-items.php', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    moves: [{
                        obj_info_id: item.id,
                        quantity: 1,
                        action: 'inventory'
                    }],
                    pin,
                    _ref_ck: refCk
                })
            });
            const bodyText = await response.text();
            const result = parseSdbMoveItemsStatus(response, bodyText);
            if (!result.ok) {
                showRemoveError(actionCell, result.message);
                return;
            }
            window.location.reload();
        } catch (err) {
            showRemoveError(actionCell, err?.message || 'SDB request failed.');
        }
    }

    function getSdbPin() {
        return normalizeSdbPin(document.getElementById(PIN_INPUT_ID)?.value);
    }

    function getActionCellItemName(actionCell) {
        const row = actionCell.closest('tr');
        return getItemName(row?.querySelector('.sdb-item-name'));
    }

    function getCachedSdbItem(actionCell, itemName) {
        const row = actionCell.closest('tr');
        const img = row?.querySelector('.sdb-item-img');
        const filename = getItemFilename(img?.src);
        if (itemName && filename) {
            const exact = sdbItemsByExactKey.get(`${normalizeName(itemName)}|${filename}`);
            if (exact) return exact;
        }
        return sdbItemsByName.get(normalizeName(itemName));
    }

    function getItemFilename(src) {
        const match = String(src || '').match(/\/items\/([^/.]+)\./);
        return match?.[1] || '';
    }

    function getRefCk() {
        if (typeof window.getCK === 'function') return window.getCK();
        if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.getCK === 'function') return unsafeWindow.getCK();

        const scripts = Array.from(document.scripts).map(script => script.textContent || '').join('\n');
        const match = scripts.match(/_ref_ck["']?\s*[:=]\s*["']([^"']+)["']/) || scripts.match(/getCK\(\)\s*\{\s*return\s*["']([^"']+)["']/);
        return match?.[1] || '';
    }

    function parseSdbMoveItemsStatus(response, bodyText) {
        let payload = null;
        try {
            payload = JSON.parse(bodyText || '{}');
        } catch {
            payload = null;
        }

        const message = payload?.message || payload?.error || payload?.errors?.[0]?.message || bodyText || `Request failed (${response.status})`;
        return {
            ok: response.ok && payload?.success !== false,
            message: String(message || 'SDB request failed.')
        };
    }

    function showRemoveError(actionCell, message) {
        clearRemoveError(actionCell);
        const error = document.createElement('span');
        error.className = REMOVE_ERROR_CLASS;
        error.textContent = message;
        actionCell.appendChild(error);
    }

    function clearRemoveError(actionCell) {
        actionCell.querySelector(`.${REMOVE_ERROR_CLASS}`)?.remove();
    }

    function limitDetailsClickTargets() {
        document.addEventListener('click', event => {
            const cell = event.target.closest?.('.sdb-item-cell');
            if (cell) {
                if (event.target.closest(SAFE_CLICK_TARGETS)) return;

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return;
            }

            const gridItem = event.target.closest?.('.sdb-grid-item');
            if (!gridItem) return;
            if (gridItem.classList.contains('is-selection-mode')) return;
            if (event.target.closest('.sdb-tick-icon')) return;
            if (event.target.closest(GRID_DETAIL_CLICK_TARGETS)) return;
            if (event.target.closest(SAFE_CLICK_TARGETS)) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }, true);
    }

    function init() {
        limitDetailsClickTargets();
        enhanceRows();

        const observer = new MutationObserver(scheduleEnhance);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    installSdbItemsInterceptor();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
