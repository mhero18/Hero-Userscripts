// ==UserScript==
// @name         Neopets Closet Enhancements
// @version      1.4
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
// - Add SSW, Trading Post, Auction Genie, SDB, JellyNeo, ItemDB, and DTI links below closet item names
// - Add pagination above the item list as well
// - Hide the item category label
// - Only clicking on item image now brings up the remove item pop-up overlay instead of clicking anywhere

(function () {
    'use strict';

    const SELECTORS = {
        app: '#closet_app',
        item: '.closet-grid-item, .closet-list-row',
        itemImage: '.closet-item-image, .closet-list-image-wrap',
        itemName: '.closet-item-name, .closet-list-item-name',
        gridItemName: '.closet-grid-item .closet-item-name',
        listRow: '.closet-list-row',
        listPopupTarget: '.closet-list-image-wrap',
        itemCategory: '.closet-item-category',
        pagination: '.closet-pagination',
        topPagination: '.hero-closet-top-pagination',
        helper: '.search-helper'
    };

    let observer = null;
    let scheduled = false;
    let internalMutation = false;

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

    function buildSearchHelper(itemName) {
        const helper = document.createElement('p');
        helper.className = 'search-helper closet-search-helper';
        helper.addEventListener('click', event => {
            event.stopPropagation();
        });

        helper.append(
            makeSswLink(itemName),
            makeSearchLink(
                'Trading Post',
                `https://www.neopets.com/island/tradingpost.phtml?type=browse&criteria=item_phrase&search_string=${encodeURIComponent(itemName)}&sort=newest`,
                'https://images.neopets.com/themes/h5/basic/images/tradingpost-icon.png'
            ),
            makeSearchLink(
                'Auction Genie',
                `/genie.phtml?type=process_genie&criteria=exact&auctiongenie=${encodeURIComponent(itemName)}`,
                'https://images.neopets.com/themes/h5/basic/images/auction-icon.png'
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
            ),
            makeSearchLink(
                'View in Dress to Impress',
                `https://impress.openneo.net/items?q=${encodeURIComponent(itemName)}`,
                'https://images.neopets.com/items/clo_shoyru_dappermon.gif'
            )
        );

        return helper;
    }

    function addSearchHelpers() {
        document.querySelectorAll(SELECTORS.item).forEach(itemEl => {
            const nameEl = itemEl.querySelector(SELECTORS.itemName);
            if (!nameEl || itemEl.querySelector(SELECTORS.helper)) return;

            const itemName = getItemName(nameEl, itemEl);
            if (!itemName) return;

            nameEl.insertAdjacentElement('afterend', buildSearchHelper(itemName));
        });
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
                if (event.target.closest(`${SELECTORS.listPopupTarget}, ${SELECTORS.helper}`)) return;

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
            addSearchHelpers();
            syncTopPagination();
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
        stopUnwantedPopupClicks();
        observeCloset();
        scheduleEnhance();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
