// ==UserScript==
// @name         Neopets Auctions Enhancements
// @version      1.0
// @description  Adds auction search/user helper links and display options for the new Auctions pages.
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/auctions.phtml*
// @match        *://*.neopets.com/genie.phtml*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-start
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Auctions%20Enhancements.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Auctions%20Enhancements.user.js
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_PREFIX = 'ahx_';
    const SETTINGS = {
        compact: 'compact',
        hideNotice: 'hide_notice',
        hideView: 'hide_view',
        theme: 'theme',
    };

    const THEMES = {
        default: { label: 'Default' },
        blue: { label: 'Soft Blue' },
        mint: { label: 'Mint' },
        lavender: { label: 'Lavender' },
        gray: { label: 'Soft Gray' },
        dark: { label: 'Dark' }
    };

    const ICONS = {
        ssw: 'https://images.neopets.com/premium/shopwizard/ssw-icon.svg',
        tp: 'https://images.neopets.com/themes/h5/basic/images/tradingpost-icon.png',
        auctions: 'https://images.neopets.com/themes/h5/basic/images/auction-icon.png',
        sdb: 'https://images.neopets.com/images/emptydepositbox.gif',
        jellyneo: 'https://images.neopets.com/items/toy_plushie_negg_fish.gif',
        itemdb: 'https://images.neopets.com/themes/h5/basic/images/v3/quickstock-icon.svg',
        neomail: 'https://images.neopets.com/themes/h5/basic/images/v3/neomail-icon.svg'
    };

    function getValue(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') {
                return GM_getValue(STORAGE_PREFIX + key, fallback);
            }
            const raw = localStorage.getItem(STORAGE_PREFIX + key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    function setValue(key, value) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(STORAGE_PREFIX + key, value);
                return;
            }
            localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
        } catch {
            // Ignore storage failures.
        }
    }

    function slugify(itemName) {
        return itemName
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]+/g, '')
            .replace(/--+/g, '-');
    }

    function openSSW(itemName) {
        document.querySelectorAll('.premium-widget__2024').forEach(widget => {
            widget.style.display = 'none';
        });

        if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.toggleWidget__2020 === 'function') {
            unsafeWindow.toggleWidget__2020('ssw');
        } else if (typeof toggleWidget__2020 === 'function') {
            toggleWidget__2020('ssw');
        }

        const criteria = document.getElementById('ssw-criteria');
        const search = document.getElementById('searchstr');
        const button = document.getElementById('ssw-button-new-search');

        if (criteria) criteria.value = 'exact';
        if (search) {
            search.value = itemName;
            search.focus();
        }
        if (button) button.click();
    }

    function makeIconLink(href, icon, title) {
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.title = title;

        const img = document.createElement('img');
        img.src = icon;
        img.alt = title;
        img.className = 'ahx-icon';

        link.appendChild(img);
        return link;
    }

    function makeSearchLinks(itemName) {
        const helper = document.createElement('p');
        helper.className = 'ahx-search-helper';

        const ssw = makeIconLink('#', ICONS.ssw, 'Super Shop Wizard');
        ssw.target = '';
        ssw.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openSSW(itemName);
        });

        helper.append(
            ssw,
            makeIconLink(`https://www.neopets.com/island/tradingpost.phtml?type=browse&criteria=item_exact&sort_by=newest&search_string=${encodeURIComponent(itemName)}`, ICONS.tp, 'Trading Post'),
            makeIconLink(`https://www.neopets.com/genie.phtml?type=process_genie&criteria=exact&auctiongenie=${encodeURIComponent(itemName)}`, ICONS.auctions, 'Auction Genie'),
            makeIconLink(`https://www.neopets.com/safetydeposit.phtml?obj_name=${encodeURIComponent(itemName)}&category=0`, ICONS.sdb, 'Safety Deposit Box'),
            makeIconLink(`https://items.jellyneo.net/search/?name=${encodeURIComponent(itemName)}&name_type=3`, ICONS.jellyneo, 'JellyNeo'),
            makeIconLink(`https://itemdb.com.br/item/${slugify(itemName)}`, ICONS.itemdb, 'ItemDB')
        );

        return helper;
    }

    function cleanUsername(username) {
        return (username || '').replace(/[^a-zA-Z0-9_ -]+/g, '').trim();
    }

    function getUserFromLink(link) {
        try {
            const url = new URL(link.href, location.origin);
            return cleanUsername(url.searchParams.get('user') || '');
        } catch {
            return '';
        }
    }

    function makeUserLinks(username) {
        const cleanUser = cleanUsername(username);
        if (!cleanUser) return null;

        const encodedUser = encodeURIComponent(cleanUser);
        const actions = document.createElement('span');
        actions.className = 'ahx-user-actions';
        actions.append(
            makeIconLink(`/neomessages.phtml?type=send&recipient=${encodedUser}`, ICONS.neomail, 'Send Neomail'),
            makeIconLink(`/island/tradingpost.phtml?type=browse&criteria=owner&search_string=${encodedUser}`, ICONS.tp, 'View Trading Post'),
            makeIconLink(`/genie.phtml?type=find_user&auction_username=${encodedUser}`, ICONS.auctions, 'View Auctions')
        );
        return actions;
    }

    function addUserActionsAfter(target, username) {
        if (!target || target.parentElement?.querySelector('.ahx-user-actions')) return;

        const actions = makeUserLinks(username);
        if (actions) target.insertAdjacentElement('afterend', actions);
    }

    function enhanceAuctionRows() {
        document.querySelectorAll('.ah2_list .ah2_row').forEach(row => {
            const ownerLink = row.querySelector('td[data-label="Owner"] a[href*="user="]');
            if (ownerLink) addUserActionsAfter(ownerLink, getUserFromLink(ownerLink));

            const itemCell = row.querySelectorAll('td')[2];
            if (!itemCell || itemCell.querySelector('.ahx-search-helper')) return;

            const itemLink = itemCell.querySelector('a[href*="type=bids"][href*="auction_id="]');
            const itemName = itemLink?.textContent.trim();
            if (!itemName) return;

            const rarity = itemCell.querySelector('.auction-rarity');
            (rarity || itemLink).insertAdjacentElement('afterend', makeSearchLinks(itemName));
        });
    }

    function enhanceAuctionCards() {
        document.querySelectorAll('.ah2_card_body .ah2_owner').forEach(owner => {
            const match = owner.textContent.match(/owner:\s*([a-zA-Z0-9_ -]+)/i);
            if (match) addUserActionsAfter(owner, match[1]);
        });

        document.querySelectorAll('.ah2_card_body .ah2_itemname').forEach(itemNameEl => {
            if (itemNameEl.parentElement?.querySelector('.ahx-search-helper')) return;

            const itemName = itemNameEl.textContent.trim();
            if (itemName) itemNameEl.insertAdjacentElement('afterend', makeSearchLinks(itemName));
        });
    }

    function applySettings() {
        const roots = [document.documentElement, document.body].filter(Boolean);
        const compact = !!getValue(SETTINGS.compact, false);
        const hideNotice = !!getValue(SETTINGS.hideNotice, false);
        const hideView = !!getValue(SETTINGS.hideView, false);
        const theme = getValue(SETTINGS.theme, 'default');

        roots.forEach(root => {
            root.classList.toggle('ahx-compact', compact);
            root.classList.toggle('ahx-hide-notice', hideNotice);
            root.classList.toggle('ahx-hide-view', hideView);

            Object.keys(THEMES).forEach(themeName => {
                root.classList.remove(`ahx-theme-${themeName}`);
            });
            if (theme !== 'default' && THEMES[theme]) {
                root.classList.add(`ahx-theme-${theme}`);
            }
        });
    }

    function injectStyles() {
        if (document.getElementById('ahx-styles')) return;

        const style = document.createElement('style');
        style.id = 'ahx-styles';
        style.textContent = `
            .ahx-search-helper,
            .ahx-user-actions {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 4px;
                margin: 4px 0 0;
                line-height: 1;
            }

            .ahx-user-actions {
                display: block;
            }

            .ahx-user-actions a {
                display: inline-block;
                margin-right: 4px;
            }

            .ahx-icon {
                width: 20px !important;
                height: 20px !important;
                object-fit: contain;
                vertical-align: middle;
                border: 0 !important;
                border-radius: 0 !important;
            }

            :is(html, body).ahx-compact .ah2_table_wrapper,
            :is(html, body).ahx-compact .ah2_card_body {
                font-size: 12px !important;
            }

            :is(html, body).ahx-compact .ah2_list th,
            :is(html, body).ahx-compact .ah2_list td {
                padding: 3px 5px !important;
                line-height: 1.2 !important;
            }

            :is(html, body).ahx-compact .ah2_thumb {
                width: 38px !important;
                height: 38px !important;
                object-fit: contain;
            }

            :is(html, body).ahx-compact .ahx-search-helper,
            :is(html, body).ahx-compact .ahx-user-actions {
                margin-top: 2px;
                gap: 2px;
            }

            :is(html, body).ahx-compact .ahx-icon {
                width: 16px !important;
                height: 16px !important;
            }

            :is(html, body).ahx-compact .ah2_card_body {
                padding: 8px !important;
            }

            :is(html, body).ahx-compact .ah2_item {
                gap: 8px !important;
                margin: 6px 0 !important;
            }

            :is(html, body).ahx-compact .ah2_item br {
                display: none !important;
            }

            :is(html, body).ahx-hide-notice .ah2_notice {
                display: none !important;
            }

            :is(html, body).ahx-hide-view .ah2_list th:last-child,
            :is(html, body).ahx-hide-view .ah2_list td:last-child {
                display: none !important;
            }

            :is(html, body).ahx-theme-blue .ah2_list tbody tr.ah2_row { background: #f4f9ff !important; }
            :is(html, body).ahx-theme-blue .ah2_list tbody tr.ah2_row:nth-child(even) { background: #e8f2ff !important; }
            :is(html, body).ahx-theme-mint .ah2_list tbody tr.ah2_row { background: #f3fbf6 !important; }
            :is(html, body).ahx-theme-mint .ah2_list tbody tr.ah2_row:nth-child(even) { background: #e7f7ee !important; }
            :is(html, body).ahx-theme-lavender .ah2_list tbody tr.ah2_row { background: #f8f5ff !important; }
            :is(html, body).ahx-theme-lavender .ah2_list tbody tr.ah2_row:nth-child(even) { background: #eee8fb !important; }
            :is(html, body).ahx-theme-gray .ah2_list tbody tr.ah2_row { background: #f8fafc !important; }
            :is(html, body).ahx-theme-gray .ah2_list tbody tr.ah2_row:nth-child(even) { background: #eef2f7 !important; }

            :is(html, body).ahx-theme-blue .ah2_card_body { background: #f4f9ff !important; }
            :is(html, body).ahx-theme-mint .ah2_card_body { background: #f3fbf6 !important; }
            :is(html, body).ahx-theme-lavender .ah2_card_body { background: #f8f5ff !important; }
            :is(html, body).ahx-theme-gray .ah2_card_body { background: #f8fafc !important; }

            :is(html, body).ahx-theme-dark .ah2_table_wrapper,
            :is(html, body).ahx-theme-dark .ah2_card_body {
                background: #151922 !important;
                color: #e5e7eb !important;
            }

            :is(html, body).ahx-theme-dark .ah2_list {
                color: #e5e7eb !important;
            }

            :is(html, body).ahx-theme-dark .ah2_list thead th {
                background: #252b36 !important;
                color: #f8fafc !important;
                border-color: #3b4252 !important;
            }

            :is(html, body).ahx-theme-dark .ah2_list tbody tr.ah2_row {
                background: #1d2430 !important;
                color: #e5e7eb !important;
            }

            :is(html, body).ahx-theme-dark .ah2_list tbody tr.ah2_row:nth-child(even) {
                background: #242c3a !important;
            }

            :is(html, body).ahx-theme-dark .ah2_list td,
            :is(html, body).ahx-theme-dark .ah2_bidtable th,
            :is(html, body).ahx-theme-dark .ah2_bidtable td {
                border-color: #3b4252 !important;
                color: #e5e7eb !important;
            }

            :is(html, body).ahx-theme-dark .ah2_list a,
            :is(html, body).ahx-theme-dark .ah2_card_body a {
                color: #93c5fd !important;
            }

            :is(html, body).ahx-theme-dark .itemdb-price,
            :is(html, body).ahx-theme-dark .ah2_owner,
            :is(html, body).ahx-theme-dark .ah2_timeleft,
            :is(html, body).ahx-theme-dark .ah2_notice {
                color: #cbd5e1 !important;
            }

            :is(html, body).ahx-theme-dark .ah2_rule {
                border-color: #3b4252 !important;
            }

            :is(html, body).ahx-theme-dark #ahx-options {
                background: #1d2430 !important;
                border-color: #4b5563 !important;
                box-shadow: 0 2px 7px rgba(0, 0, 0, 0.38);
                color: #e5e7eb !important;
            }

            :is(html, body).ahx-theme-dark #ahx-options select {
                background: #111827 !important;
                border-color: #4b5563 !important;
                color: #e5e7eb !important;
            }
            #ahx-options {
                background: #fffdf7;
                border: 1px solid #c3ad82;
                border-radius: 6px;
                box-shadow: 0 2px 7px rgba(72, 51, 13, 0.16);
                color: #48330d;
                float: right;
                font: 14px/1.35 Arial, sans-serif;
                margin-right: -198px;
                padding: 10px;
                position: sticky;
                top: 200px;
                width: 174px;
                z-index: 100;
            }

            #ahx-options strong {
                display: block;
                font-size: 13px;
                margin-bottom: 7px;
            }

            #ahx-options label {
                align-items: center;
                cursor: pointer;
                display: flex;
                gap: 6px;
                line-height: 1.25;
                margin-top: 6px;
            }

            #ahx-options input {
                margin: 0;
            }

            #ahx-options select {
                background: #fff;
                border: 1px solid #c3ad82;
                border-radius: 5px;
                box-sizing: border-box;
                color: #48330d;
                font: inherit;
                margin-top: 4px;
                padding: 3px 5px;
                width: 100%;
            }

            .ahx-theme-row {
                display: block !important;
                margin-top: 8px !important;
            }

            @media (max-width: 1580px) {
                #ahx-options {
                    float: none;
                    margin: 0 0 12px auto;
                    position: static;
                }
            }
        `;
        document.head.appendChild(style);
    }


    function isAuctionBidPage() {
        const params = new URLSearchParams(location.search);
        return location.pathname.includes('/auctions.phtml') && params.get('type') === 'bids' && params.has('auction_id');
    }

    function shouldShowOptionsPanel() {
        return !isAuctionBidPage() && (location.pathname.includes('/auctions.phtml') || location.pathname.includes('/genie.phtml'));
    }

    function makeCheckbox(label, key) {
        const wrap = document.createElement('label');
        wrap.className = 'ahx-option';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!getValue(key, false);
        input.addEventListener('change', () => {
            setValue(key, input.checked);
            applySettings();
        });

        const text = document.createElement('span');
        text.textContent = label;

        wrap.append(input, text);
        return wrap;
    }

    function buildOptionsPanel() {
        const existingPanel = document.getElementById('ahx-options');
        if (!shouldShowOptionsPanel()) {
            existingPanel?.remove();
            return;
        }
        if (existingPanel || !document.body) return;

        const panel = document.createElement('aside');
        panel.id = 'ahx-options';

        const title = document.createElement('strong');
        title.textContent = 'Auction Options';

        panel.append(
            title,
            makeCheckbox('Compact layout', SETTINGS.compact),
            makeCheckbox('Hide NF/GM notice', SETTINGS.hideNotice),
            makeCheckbox('Hide View column', SETTINGS.hideView)
        );

        const themeRow = document.createElement('label');
        themeRow.className = 'ahx-theme-row';

        const themeLabel = document.createElement('span');
        themeLabel.textContent = 'Theme';

        const themeSelect = document.createElement('select');
        Object.entries(THEMES).forEach(([value, meta]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = meta.label;
            themeSelect.appendChild(option);
        });
        const savedTheme = getValue(SETTINGS.theme, 'default');
        themeSelect.value = THEMES[savedTheme] ? savedTheme : 'default';
        themeSelect.addEventListener('change', () => {
            setValue(SETTINGS.theme, themeSelect.value);
            applySettings();
        });

        themeRow.append(themeLabel, themeSelect);
        panel.append(themeRow);

        const tabs = document.querySelector('.ah2_tabs');
        const anchor = tabs || document.querySelector('.ah2_table_wrapper, .ah2_card_body');
        if (tabs) {
            tabs.insertAdjacentElement('afterend', panel);
        } else if (anchor) {
            anchor.insertAdjacentElement('beforebegin', panel);
        } else {
            document.body.appendChild(panel);
        }
    }
    injectStyles();
    applySettings();

    let enhanceTimer = null;
    let internalMutation = false;

    function enhanceAuctions() {
        if (!document.body) return;

        internalMutation = true;
        try {
            injectStyles();
            applySettings();
            buildOptionsPanel();
            enhanceAuctionRows();
            enhanceAuctionCards();
        } finally {
            requestAnimationFrame(() => {
                internalMutation = false;
            });
        }
    }

    function scheduleEnhance() {
        clearTimeout(enhanceTimer);
        enhanceTimer = setTimeout(enhanceAuctions, 80);
    }

    const observer = new MutationObserver(() => {
        if (!internalMutation) scheduleEnhance();
    });

    function start() {
        if (!document.body) return;
        scheduleEnhance();
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    }
})();
