// ==UserScript==
// @name         Neopets Closet Enhancements
// @version      2.9
// @description  Adds search helper links and small usability tweaks to the updated Closet page.
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/closet.phtml*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Closet%20Enhancements.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Closet%20Enhancements.user.js
// ==/UserScript==

// Enhancements:
// - Added SSW, Trading Post, Auction Genie, SDB, JellyNeo, ItemDB, and DTI links below closet item names
// - Added pagination above the item list as well
// - Hide the item category label
// - Only clicking on item image now brings up the remove item pop-up overlay instead of clicking anywhere
// - Added Paint Brush Clothing filter to the category dropdown
// - Added Neopoints item category
// - Added a persisted Hide PB Clothing toggle

(function () {
    'use strict';

    const PAINT_BRUSH_FILTER_VALUE = 'hero-paint-brush-clothing';
    const NEOPOINTS_FILTER_VALUE = 'hero-neopoints-items';
    const ALL_ITEMS_CATEGORY_VALUE = '';
    const PAINT_BRUSH_DESCRIPTION = 'This item is part of a deluxe paint brush set!';
    const STATE_HERO_FILTER = 'hero_closet_active_filter';
    const STATE_HIDE_PAINT_BRUSH = 'hero_closet_hide_paint_brush';
    const HELPER_METADATA_WAIT_MS = 600;

    const SELECTORS = {
        app: '#closet_app',
        item: '.closet-grid-item, .closet-list-row',
        itemImage: '.closet-item-image, .closet-list-image-wrap',
        itemName: '.closet-item-name, .closet-list-item-name',
        gridItemName: '.closet-grid-item .closet-item-name',
        listRow: '.closet-list-row',
        listAllowedTarget: '.closet-list-image-wrap, .search-helper, input, button, select, textarea, label, a',
        itemCategory: '.closet-item-category',
        itemDescription: '.closet-list-desc',
        categoryDropdown: '.closet-dropdown--category',
        pagination: '.closet-pagination',
        topPagination: '.hero-closet-top-pagination',
        hidePaintBrushToggle: '#hero-closet-hide-pb',
        helper: '.search-helper'
    };

    let observer = null;
    let scheduled = false;
    let internalMutation = false;
    let activeHeroFilter = [PAINT_BRUSH_FILTER_VALUE, NEOPOINTS_FILTER_VALUE].includes(localStorage.getItem(STATE_HERO_FILTER))
        ? localStorage.getItem(STATE_HERO_FILTER)
        : '';
    let hidePaintBrushItems = localStorage.getItem(STATE_HIDE_PAINT_BRUSH) === '1';
    let paintBrushItemNames = new Set();
    let itemMetaByName = new Map();
    let hasSeenClosetMetadata = false;
    let originalFetchForMetadata = null;

    function addStyles() {
        if (document.getElementById('hero-closet-enhancements-style')) return;

        const style = document.createElement('style');
        style.id = 'hero-closet-enhancements-style';
        style.textContent = `
            ${SELECTORS.itemCategory} {
                display: none !important;
            }

            .closet-grid-item-content {
                gap: 4px !important;
                padding-bottom: 10px !important;
            }

            .closet-item-name,
            .closet-list-item-name {
                cursor: default !important;
                margin-bottom: 0 !important;
            }

            .closet-list-row {
                cursor: default !important;
            }

            .closet-list-image-wrap {
                cursor: pointer !important;
            }

            .hero-closet-filter-hidden {
                display: none !important;
            }

            .hero-closet-toggle-wrap {
                align-items: center;
                color: #48330d;
                display: inline-flex;
                font-family: "Museo Sans Rounded", sans-serif;
                font-size: 14px;
                font-weight: 300;
                gap: 5px;
                line-height: 1.4;
                white-space: nowrap;
            }

            .hero-closet-toggle-wrap input {
                cursor: pointer;
                margin: 0;
            }

            .closet-search-helper {
                align-items: center;
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                justify-content: center;
                line-height: 1;
                margin: 4px 0 1px;
            }

            .closet-list-item .closet-search-helper {
                justify-content: flex-start;
                margin: 3px 0 0;
            }

            .closet-search-helper a {
                display: inline-flex;
                height: 18px;
                width: 18px;
            }

            .closet-search-helper .searchimg {
                border: 0 !important;
                border-radius: 0 !important;
                cursor: pointer;
                height: 18px !important;
                object-fit: contain;
                width: 18px !important;
            }

            .closet-search-helper a:hover .searchimg {
                opacity: 1 !important;
                transform: none !important;
            }

            .hero-closet-action-row {
                align-items: center !important;
                display: grid !important;
                gap: 10px 16px !important;
                grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important;
            }

            .hero-closet-top-pagination {
                grid-column: 2 !important;
                justify-self: center !important;
                margin: 0 !important;
            }

            .hero-closet-action-row .hero-closet-toggle-wrap {
                grid-column: 1 !important;
                justify-self: start !important;
            }

            .hero-closet-action-row > button {
                grid-column: 3 !important;
                justify-self: end !important;
            }

            .hero-closet-top-pagination .closet-pagination-buttons {
                flex-wrap: wrap;
            }

            @media (max-width: 640px) {
                .hero-closet-action-row {
                    grid-template-columns: 1fr !important;
                }

                .hero-closet-top-pagination,
                .hero-closet-action-row .hero-closet-toggle-wrap,
                .hero-closet-action-row > button {
                    grid-column: 1 !important;
                    justify-self: center !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function getItemName(nameEl, itemEl) {
        const textName = nameEl?.textContent?.replace(/\s+/g, ' ').trim();
        if (textName) return textName;

        return itemEl
            ?.querySelector(`${SELECTORS.itemImage} img[alt]`)
            ?.getAttribute('alt')
            ?.replace(/\s+/g, ' ')
            ?.trim() || '';
    }

    function normalizeItemName(name) {
        return (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function rememberClosetItems(items) {
        if (!Array.isArray(items)) return;

        hasSeenClosetMetadata = true;
        paintBrushItemNames = new Set(
            items
                .filter(item => item?.is_paintbrush)
                .map(item => normalizeItemName(item.obj_name))
                .filter(Boolean)
        );

        itemMetaByName = new Map(
            items
                .filter(item => item?.obj_name)
                .map(item => [normalizeItemName(item.obj_name), item])
        );

        scheduleEnhance();
    }

    function getClosetAjaxUrl(url) {
        try {
            const parsedUrl = new URL(url, location.origin);
            if (!parsedUrl.pathname.includes('/np-templates/ajax/closet/get-items.php')) return null;

            return parsedUrl;
        } catch {
            return null;
        }
    }

    function getCurrentClosetPageUrl() {
        const url = new URL('/np-templates/ajax/closet/get-items.php', location.origin);
        const activePage = document.querySelector('.closet-pagination-btn.active')?.textContent?.trim() || '1';
        const perPage = document.querySelector('.closet-dropdown--perpage')?.value || '30';
        const search = document.querySelector('.closet-search-field')?.value || '';
        const categoryDropdown = document.querySelector(SELECTORS.categoryDropdown);
        const selectedHeroFilter = categoryDropdown?.selectedOptions?.[0]?.dataset.heroFilter;
        const category = selectedHeroFilter ? ALL_ITEMS_CATEGORY_VALUE : (categoryDropdown?.value || '');

        url.searchParams.set('page', activePage);
        url.searchParams.set('per_page', perPage);
        url.searchParams.set('search', search);
        url.searchParams.set('category', category);
        return url;
    }

    function fetchCurrentClosetMetadata() {
        const fetcher = originalFetchForMetadata || window.fetch?.bind(window);
        if (typeof fetcher !== 'function') return;

        fetcher(getCurrentClosetPageUrl().href)
            .then(response => response.clone().json())
            .then(data => rememberClosetItems(data?.items))
            .catch(() => {});
    }

    async function fetchAllClosetItems(baseUrl, perPage, originalFetch) {
        const firstPageUrl = new URL(baseUrl.href);
        firstPageUrl.searchParams.set('page', '1');
        firstPageUrl.searchParams.set('per_page', String(perPage));

        const response = await originalFetch.call(window, firstPageUrl.href);
        const data = await response.clone().json();
        const totalPages = Math.max(Number(data?.total_pages) || 1, 1);
        const allItems = Array.isArray(data?.items) ? [...data.items] : [];

        if (totalPages > 1) {
            const pageResponses = await Promise.all(
                Array.from({ length: totalPages - 1 }, (_, index) => {
                    const pageUrl = new URL(firstPageUrl.href);
                    pageUrl.searchParams.set('page', String(index + 2));
                    return originalFetch.call(window, pageUrl.href)
                        .then(pageResponse => pageResponse.clone().json())
                        .catch(() => null);
                })
            );

            pageResponses.forEach(pageData => {
                if (Array.isArray(pageData?.items)) allItems.push(...pageData.items);
            });
        }

        return { response, data, allItems };
    }

    function buildFilteredResponse(sourceResponse, sourceData, filteredItems, page, perPage) {
        const start = (page - 1) * perPage;
        const pageItems = filteredItems.slice(start, start + perPage);
        const totalQty = filteredItems.reduce((sum, item) => sum + (Number(item?.qty) || 0), 0);

        const filteredData = {
            ...sourceData,
            items: pageItems,
            total: filteredItems.length,
            total_qty: totalQty,
            total_pages: Math.max(Math.ceil(filteredItems.length / perPage), 1)
        };

        rememberClosetItems(pageItems);

        return new Response(JSON.stringify(filteredData), {
            status: sourceResponse.status,
            statusText: sourceResponse.statusText,
            headers: sourceResponse.headers
        });
    }

    async function buildHeroClosetResponse(originalUrl, originalFetch) {
        const requestedUrl = getClosetAjaxUrl(originalUrl);
        const shouldShowPaintBrushOnly = activeHeroFilter === PAINT_BRUSH_FILTER_VALUE;
        const shouldShowNeopointsOnly = activeHeroFilter === NEOPOINTS_FILTER_VALUE;
        const shouldHidePaintBrush = hidePaintBrushItems && !shouldShowPaintBrushOnly;
        if (!requestedUrl || (!shouldShowPaintBrushOnly && !shouldShowNeopointsOnly && !shouldHidePaintBrush)) return null;

        const page = Math.max(parseInt(requestedUrl.searchParams.get('page') || '1', 10) || 1, 1);
        const perPage = Math.max(parseInt(requestedUrl.searchParams.get('per_page') || '30', 10) || 30, 1);

        const baseUrl = new URL(requestedUrl.href);
        if (shouldShowPaintBrushOnly || shouldShowNeopointsOnly) {
            baseUrl.searchParams.set('category', ALL_ITEMS_CATEGORY_VALUE);
        }

        const { response, data, allItems } = await fetchAllClosetItems(baseUrl, perPage, originalFetch);
        let filteredItems = allItems;

        if (shouldShowPaintBrushOnly) {
            filteredItems = filteredItems.filter(item => item?.is_paintbrush);
        } else if (shouldShowNeopointsOnly) {
            filteredItems = filteredItems.filter(item => item?.is_nc === false);
        }

        if (shouldHidePaintBrush) {
            filteredItems = filteredItems.filter(item => !item?.is_paintbrush);
        }

        return buildFilteredResponse(response, data, filteredItems, page, perPage);
    }

    function watchClosetAjax() {
        const originalFetch = window.fetch;
        if (typeof originalFetch === 'function') {
            originalFetchForMetadata = originalFetch.bind(window);
            window.fetch = function (...args) {
                const requestUrl = String(args[0]?.url || args[0] || '');

                return buildHeroClosetResponse(requestUrl, originalFetch)
                    .then(heroResponse => heroResponse || originalFetch.apply(this, args))
                    .then(response => {
                    if (requestUrl.includes('/np-templates/ajax/closet/get-items.php')) {
                        response.clone().json()
                            .then(data => rememberClosetItems(data?.items))
                            .catch(() => {});
                    }

                    return response;
                });
            };
        }

        const xhrProto = window.XMLHttpRequest?.prototype;
        if (!xhrProto?.open || xhrProto.open.__heroClosetPatched) return;

        const originalOpen = xhrProto.open;
        const originalSend = xhrProto.send;
        xhrProto.open = function (method, url, ...rest) {
            const requestUrl = String(url || '');
            this.__heroClosetRequestUrl = requestUrl;

            if (requestUrl.includes('/np-templates/ajax/closet/get-items.php')) {
                this.addEventListener('load', () => {
                    try {
                        rememberClosetItems(JSON.parse(this.responseText)?.items);
                    } catch {
                        // Ignore non-JSON responses.
                    }
                });
            }

            return originalOpen.call(this, method, url, ...rest);
        };

        xhrProto.send = function (...args) {
            if (
                typeof originalFetch === 'function' &&
                (activeHeroFilter === PAINT_BRUSH_FILTER_VALUE || activeHeroFilter === NEOPOINTS_FILTER_VALUE || hidePaintBrushItems) &&
                getClosetAjaxUrl(this.__heroClosetRequestUrl)
            ) {
                buildHeroClosetResponse(this.__heroClosetRequestUrl, originalFetch)
                    .then(response => response.text())
                    .then(text => {
                        Object.defineProperties(this, {
                            readyState: { value: 4, configurable: true },
                            status: { value: 200, configurable: true },
                            statusText: { value: 'OK', configurable: true },
                            response: { value: text, configurable: true },
                            responseText: { value: text, configurable: true }
                        });

                        this.dispatchEvent(new Event('readystatechange'));
                        this.dispatchEvent(new Event('load'));
                        this.dispatchEvent(new Event('loadend'));
                    })
                    .catch(() => originalSend.apply(this, args));
                return;
            }

            return originalSend.apply(this, args);
        };
        xhrProto.open.__heroClosetPatched = true;
    }

    function makeIcon(src, title) {
        const img = document.createElement('img');
        img.src = src;
        img.className = 'searchimg';
        img.alt = title;
        img.title = title;
        return img;
    }

    function makeSearchLink(title, href, iconSrc) {
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = title;
        link.appendChild(makeIcon(iconSrc, title));
        return link;
    }

    function makeSswLink(itemName) {
        const link = document.createElement('a');
        link.href = '#';
        link.title = 'Super Shop Wizard';
        link.appendChild(makeIcon('https://images.neopets.com/premium/shopwizard/ssw-icon.svg', 'SSW'));

        link.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();

            document.querySelectorAll('.premium-widget__2024').forEach(widget => {
                widget.style.display = 'none';
            });

            if (typeof window.toggleWidget__2020 === 'function') {
                window.toggleWidget__2020('ssw');
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

    function getSearchHelperType(itemName) {
        const itemMeta = itemMetaByName.get(normalizeItemName(itemName));
        if (itemMeta?.is_paintbrush) return 'paintbrush';
        if (itemMeta?.is_nc === true) return 'nc';
        return 'default';
    }

    function buildSearchHelper(itemName) {
        const helper = document.createElement('p');
        helper.className = 'search-helper closet-search-helper';
        helper.dataset.itemName = itemName;
        helper.dataset.helperType = getSearchHelperType(itemName);
        helper.addEventListener('click', event => {
            event.stopPropagation();
        });

        const ssw = makeSswLink(itemName);
        const tp = makeSearchLink(
            'Trading Post',
            `https://www.neopets.com/island/tradingpost.phtml?type=browse&criteria=item_phrase&search_string=${encodeURIComponent(itemName)}&sort=newest`,
            'https://images.neopets.com/themes/h5/basic/images/tradingpost-icon.png'
        );
        const auction = makeSearchLink(
            'Auction Genie',
            `/genie.phtml?type=process_genie&criteria=exact&auctiongenie=${encodeURIComponent(itemName)}`,
            'https://images.neopets.com/themes/h5/basic/images/auction-icon.png'
        );
        const sdb = makeSearchLink(
            'Safety Deposit Box',
            `https://www.neopets.com/safetydeposit.phtml?obj_name=${encodeURIComponent(itemName)}&category=0`,
            'https://images.neopets.com/images/emptydepositbox.gif'
        );
        const jellyneo = makeSearchLink(
            'JellyNeo',
            `https://items.jellyneo.net/search/?name=${encodeURIComponent(itemName)}&name_type=3`,
            'https://images.neopets.com/items/toy_plushie_negg_fish.gif'
        );
        const itemdb = makeSearchLink(
            'ItemDB',
            `https://itemdb.com.br/item/${encodeURIComponent(itemName)}`,
            'https://images.neopets.com/themes/h5/basic/images/v3/quickstock-icon.svg'
        );
        const dti = makeSearchLink(
            'View in Dress to Impress',
            `https://impress.openneo.net/items?q=${encodeURIComponent(itemName)}`,
            'https://images.neopets.com/items/clo_shoyru_dappermon.gif'
        );

        if (helper.dataset.helperType === 'paintbrush') {
            helper.append(jellyneo, itemdb, dti);
        } else if (helper.dataset.helperType === 'nc') {
            helper.append(sdb, jellyneo, itemdb, dti);
        } else {
            helper.append(ssw, tp, auction, sdb, jellyneo, itemdb, dti);
        }

        return helper;
    }

    function addSearchHelpers() {
        document.querySelectorAll(SELECTORS.item).forEach(itemEl => {
            const nameEl = itemEl.querySelector(SELECTORS.itemName);
            if (!nameEl) return;

            const itemName = getItemName(nameEl, itemEl);
            if (!itemName) return;

            const existingHelper = itemEl.querySelector(SELECTORS.helper);
            const helperType = getSearchHelperType(itemName);
            if (existingHelper?.dataset.itemName === itemName && existingHelper?.dataset.helperType === helperType) return;
            existingHelper?.remove();

            nameEl.insertAdjacentElement('afterend', buildSearchHelper(itemName));
        });
    }

    function addCustomCategoryOption() {
        const dropdown = document.querySelector(SELECTORS.categoryDropdown);
        if (!dropdown) return;

        let paintBrushOption = dropdown.querySelector(`option[data-hero-filter="${PAINT_BRUSH_FILTER_VALUE}"]`);
        if (!paintBrushOption) {
            const option = document.createElement('option');
            option.value = PAINT_BRUSH_FILTER_VALUE;
            option.dataset.heroFilter = PAINT_BRUSH_FILTER_VALUE;
            option.textContent = 'Paint Brush Clothing';
            dropdown.appendChild(option);
            paintBrushOption = option;
        }

        if (!dropdown.querySelector(`option[data-hero-filter="${NEOPOINTS_FILTER_VALUE}"]`)) {
            const option = document.createElement('option');
            option.value = NEOPOINTS_FILTER_VALUE;
            option.dataset.heroFilter = NEOPOINTS_FILTER_VALUE;
            option.textContent = 'Neopoints';
            paintBrushOption?.insertAdjacentElement('beforebegin', option) || dropdown.appendChild(option);
        }

        if (activeHeroFilter) {
            dropdown.value = activeHeroFilter;
        }
    }

    function addHidePaintBrushToggle() {
        if (document.querySelector(SELECTORS.hidePaintBrushToggle)) return;

        const actionRow = findRemoveItemRow();
        if (!actionRow) return;

        actionRow.classList.add('hero-closet-action-row');

        const label = document.createElement('label');
        label.className = 'hero-closet-toggle-wrap';
        label.title = 'Hide paint brush set clothing while browsing';

        const checkbox = document.createElement('input');
        checkbox.id = SELECTORS.hidePaintBrushToggle.slice(1);
        checkbox.type = 'checkbox';
        checkbox.checked = hidePaintBrushItems;

        const text = document.createElement('span');
        text.textContent = 'Hide PB Clothing';

        label.append(checkbox, text);
        actionRow.insertBefore(label, actionRow.firstElementChild);
    }

    function applyHeroFilter() {
        const items = Array.from(document.querySelectorAll(SELECTORS.item));
        const canFilterByDescription = items.some(itemEl => itemEl.querySelector(SELECTORS.itemDescription));

        items.forEach(itemEl => {
            if (activeHeroFilter !== PAINT_BRUSH_FILTER_VALUE) {
                itemEl.classList.remove('hero-closet-filter-hidden');
                return;
            }

            if (!canFilterByDescription) {
                const name = normalizeItemName(itemEl.querySelector(SELECTORS.itemName)?.textContent);
                itemEl.classList.toggle(
                    'hero-closet-filter-hidden',
                    !paintBrushItemNames.has(name)
                );
                return;
            }

            const description = itemEl
                .querySelector(SELECTORS.itemDescription)
                ?.textContent
                ?.replace(/\s+/g, ' ')
                ?.trim() || '';

            itemEl.classList.toggle(
                'hero-closet-filter-hidden',
                !description.includes(PAINT_BRUSH_DESCRIPTION)
            );
        });
    }

    function handleCategoryDropdownEvent(event) {
        const dropdown = event.target.closest(SELECTORS.categoryDropdown);
        if (!dropdown) return;

        const selectedHeroFilter = dropdown.selectedOptions[0]?.dataset.heroFilter || '';
        if ([PAINT_BRUSH_FILTER_VALUE, NEOPOINTS_FILTER_VALUE].includes(selectedHeroFilter)) {
            activeHeroFilter = selectedHeroFilter;
            localStorage.setItem(STATE_HERO_FILTER, selectedHeroFilter);
            setTimeout(() => scheduleEnhance(), 0);
            return;
        }

        activeHeroFilter = '';
        localStorage.removeItem(STATE_HERO_FILTER);
        applyHeroFilter();
    }

    function watchCategoryDropdown() {
        document.addEventListener('input', handleCategoryDropdownEvent, true);
        document.addEventListener('change', handleCategoryDropdownEvent, true);
    }

    function reloadCurrentClosetView() {
        const dropdown = document.querySelector(SELECTORS.categoryDropdown);
        if (!dropdown) {
            scheduleEnhance();
            return;
        }

        dropdown.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(() => scheduleEnhance(), 0);
    }

    function watchHidePaintBrushToggle() {
        document.addEventListener('change', event => {
            const checkbox = event.target.closest(SELECTORS.hidePaintBrushToggle);
            if (!checkbox) return;

            hidePaintBrushItems = checkbox.checked;
            if (hidePaintBrushItems) {
                localStorage.setItem(STATE_HIDE_PAINT_BRUSH, '1');
            } else {
                localStorage.removeItem(STATE_HIDE_PAINT_BRUSH);
            }

            reloadCurrentClosetView();
        }, true);
    }

    function findRemoveItemRow() {
        return Array.from(document.querySelectorAll('button'))
            .find(button => button.textContent.trim() === 'Remove Item')
            ?.parentElement || null;
    }

    function getBottomPagination() {
        return Array.from(document.querySelectorAll(SELECTORS.pagination))
            .find(pagination => !pagination.classList.contains('hero-closet-top-pagination')) || null;
    }

    function syncTopPagination() {
        const actionRow = findRemoveItemRow();
        const bottomPagination = getBottomPagination();
        const existingTopPagination = document.querySelector(SELECTORS.topPagination);

        if (!actionRow || !bottomPagination) {
            existingTopPagination?.remove();
            return;
        }

        actionRow.classList.add('hero-closet-action-row');
        if (existingTopPagination?.dataset.sourceHtml === bottomPagination.innerHTML) return;

        internalMutation = true;
        existingTopPagination?.remove();

        const topPagination = bottomPagination.cloneNode(true);
        topPagination.classList.add('hero-closet-top-pagination');
        topPagination.dataset.sourceHtml = bottomPagination.innerHTML;
        topPagination.querySelectorAll('button').forEach((button, index) => {
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();

                const realButton = getBottomPagination()?.querySelectorAll('button')[index];
                if (realButton && !realButton.disabled) realButton.click();
            });
        });

        actionRow.insertBefore(topPagination, actionRow.firstElementChild);
        requestAnimationFrame(() => {
            internalMutation = false;
        });
    }

    function stopUnwantedPopupClicks() {
        document.addEventListener('click', event => {
            const listRow = event.target.closest(SELECTORS.listRow);
            if (listRow) {
                if (event.target.closest(SELECTORS.listAllowedTarget)) return;

                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (event.target.closest(SELECTORS.gridItemName)) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
    }

    function scheduleEnhance() {
        if (scheduled) return;

        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            addStyles();
            addCustomCategoryOption();
            addHidePaintBrushToggle();
            const hideToggle = document.querySelector(SELECTORS.hidePaintBrushToggle);
            if (hideToggle) hideToggle.checked = hidePaintBrushItems;
            if (activeHeroFilter) {
                const dropdown = document.querySelector(SELECTORS.categoryDropdown);
                const option = dropdown?.querySelector(`option[data-hero-filter="${activeHeroFilter}"]`);
                if (dropdown && option) dropdown.value = activeHeroFilter;
            }
            if (hasSeenClosetMetadata) addSearchHelpers();
            syncTopPagination();
            applyHeroFilter();
        });
    }

    function observeCloset() {
        const app = document.querySelector(SELECTORS.app) || document.body;
        if (!app || observer) return;

        observer = new MutationObserver(mutations => {
            if (internalMutation) return;

            if (mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length)) {
                scheduleEnhance();
            }
        });

        observer.observe(app, {
            childList: true,
            subtree: true
        });
    }

    function init() {
        addStyles();
        watchClosetAjax();
        stopUnwantedPopupClicks();
        watchCategoryDropdown();
        watchHidePaintBrushToggle();
        observeCloset();
        scheduleEnhance();
        fetchCurrentClosetMetadata();
        setTimeout(() => {
            if (!hasSeenClosetMetadata) {
                hasSeenClosetMetadata = true;
                scheduleEnhance();
            }
        }, HELPER_METADATA_WAIT_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
