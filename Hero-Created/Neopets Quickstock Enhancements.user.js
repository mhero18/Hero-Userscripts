// ==UserScript==
// @name         Neopets Quickstock Enhancements
// @version      1.1
// @description  Enhances the new Quickstock page.
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/quickstock.phtml*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      itemdb.com.br
// ==/UserScript==

// Enhancements:
// - Adds item images column
// - Adds compact view
// - Adds Donate/Discard column visibility toggles
// - Mirrors the Check All row under the column headers
// - Mirrors pagination above the Quickstock table
// - Adds quick search links for SSW, TP, Auction Genie, SDB, JellyNeo, and ItemDB
// - Adds a navigation menu on empty quickstock page


(function () {
    'use strict';

    // --- Constants ----------------------------------------------------------------
    const CACHE_PREFIX = 'qs_img_';
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
    const ITEMDB_API = 'https://itemdb.com.br/api/v1/items/many';

    const STATE_COMPACT = 'qs_compact_view';
    const STATE_DONATE = 'qs_show_donate';
    const STATE_DISCARD = 'qs_show_discard';
    const MENU_LINK_HREFS = [
        '/inventory.phtml',
        '/closet.phtml',
        '/safetydeposit.phtml',
        '/dome/neopets.phtml',
        '/neohome/shed',
        '/gallery/index.phtml',
        '/stamps.phtml?type=album',
        '/tcg/album.phtml'
    ];

    // --- Cache helpers ------------------------------------------------------------
    function getCached(name) {
        try {
            const raw = localStorage.getItem(CACHE_PREFIX + name);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (!entry || !entry.ts || !entry.url) {
                localStorage.removeItem(CACHE_PREFIX + name);
                return null;
            }
            if (Date.now() - entry.ts > CACHE_TTL) {
                localStorage.removeItem(CACHE_PREFIX + name);
                return null;
            }
            return entry.url;
        } catch {
            return null;
        }
    }

    function setCache(name, url) {
        try {
            localStorage.setItem(
                CACHE_PREFIX + name,
                JSON.stringify({ url, ts: Date.now() })
            );
        } catch {
            // ignore storage issues
        }
    }

    function pruneExpiredCache() {
        try {
            const now = Date.now();
            Object.keys(localStorage)
                .filter(k => k.startsWith(CACHE_PREFIX))
                .forEach(k => {
                    try {
                        const entry = JSON.parse(localStorage.getItem(k));
                        if (!entry || !entry.ts || (now - entry.ts > CACHE_TTL)) {
                            localStorage.removeItem(k);
                        }
                    } catch {
                        localStorage.removeItem(k);
                    }
                });
        } catch {
            // ignore
        }
    }

    // --- Fetch item images --------------------------------------------------------
    function fetchItemImages(names) {
        return new Promise((resolve) => {
            if (!names.length) {
                resolve({});
                return;
            }

            const headers = { 'Content-Type': 'application/json' };

            GM_xmlhttpRequest({
                method: 'POST',
                url: ITEMDB_API,
                headers,
                data: JSON.stringify({ name: names }),
                onload(res) {
                    try {
                        resolve(JSON.parse(res.responseText));
                    } catch {
                        resolve({});
                    }
                },
                onerror() {
                    resolve({});
                }
            });
        });
    }

    // --- Styles -------------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('qs-enhancer-styles')) return;

        const s = document.createElement('style');
        s.id = 'qs-enhancer-styles';
        s.textContent = `
      #qs-toolbar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 0 0 10px 64px;
        align-items: center;
      }

      .qs-btn {
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
        border: 1px solid #aaa;
        border-radius: 4px;
        background: #f0f0f0;
        white-space: nowrap;
      }
      .qs-btn:hover { background: #ddd; }
      .qs-btn.active { background: #c8e6c9; border-color: #4caf50; }

      #qs-top-pagination {
        display: flex;
        justify-content: center;
        margin: 0 0 10px;
      }

      table.quickstock-table {
        width: 100% !important;
        table-layout: fixed;
        border-collapse: collapse;
      }

      table.quickstock-table th,
      table.quickstock-table td {
        vertical-align: middle;
      }

      table.quickstock-table thead th {
        white-space: nowrap;
        text-align: center;
      }

      .qs-img-col {
        width: 64px !important;
        min-width: 64px !important;
        max-width: 64px !important;
        text-align: center !important;
        padding: 8px 6px !important;
      }

      .qs-img-cell {
        text-align: center !important;
        padding: 8px 6px !important;
        width: 64px !important;
        min-width: 64px !important;
        max-width: 64px !important;
      }

      .qs-item-img {
        width: 40px;
        height: 40px;
        object-fit: contain;
        display: block;
        margin: 0 auto;
      }

      .qs-img-placeholder {
        width: 40px;
        height: 40px;
        background: #eee;
        border-radius: 4px;
        display: block;
        margin: 0 auto;
      }

      .qs-name-cell {
        min-width: 220px;
        text-align: left !important;
        word-break: break-word;
        line-height: 1.35;
      }

      .qs-name-text {
        display: block;
        margin-bottom: 4px;
      }

      .search-helper {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: 5px 0 0;
        line-height: 1;
      }

      .searchimg {
        width: 18px !important;
        height: 18px !important;
        object-fit: contain;
        vertical-align: middle;
        opacity: 1 !important;
        transition: none !important;
        filter: none !important;
        transform: none !important;
      }

      .search-helper a:hover .searchimg,
      .searchimg:hover {
        opacity: 1 !important;
        filter: none !important;
        transform: none !important;
      }

      body.qs-compact .np-table-row td,
      body.qs-compact table.quickstock-table td {
        padding-top: 4px !important;
        padding-bottom: 4px !important;
      }

      body.qs-compact .qs-img-cell,
      body.qs-compact .qs-img-col {
        width: 48px !important;
        min-width: 48px !important;
        max-width: 48px !important;
        padding: 4px !important;
      }

      body.qs-compact .qs-item-img,
      body.qs-compact .qs-img-placeholder {
        width: 28px !important;
        height: 28px !important;
      }

      body.qs-compact .search-helper {
        margin-top: 3px;
        gap: 3px;
      }

      body.qs-compact .searchimg {
        width: 15px !important;
        height: 15px !important;
      }

      body.qs-hide-donate [data-qs-action="donate"] { display: none !important; }
      body.qs-hide-discard [data-qs-action="discard"] { display: none !important; }

      .qs-top-checkall-row {
        background-color: #fde68a;
        font-weight: bold;
        border-top: 2px solid #c48a10;
      }

      .qs-top-checkall-row td {
        border-bottom: 1px solid #c48a10;
      }

      .qs-enhancer-page-header {
        box-sizing: border-box;
        width: min(100%, 980px);
        margin: 14px auto 16px;
        padding: 14px;
        border: 1px solid #d7dbe7;
        border-radius: 8px;
        background: #f8fafc;
        box-shadow: 0 4px 14px rgba(31, 41, 55, 0.08);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .qs-enhancer-page-header .qs-title-container {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 0 12px;
      }

      .qs-enhancer-page-header h1 {
        margin: 0;
        color: #1f2937;
        font-size: 24px;
        line-height: 1.2;
        font-weight: 800;
      }

      .qs-enhancer-menubar {
        display: flex;
        width: 100%;
        margin: 0;
      }

      .qs-enhancer-menubar .qs-menulinks {
        width: 100%;
        margin: 0;
        padding: 0;
        background: transparent;
        display: flex;
        justify-content: center;
        align-items: center;
        list-style: none;
        gap: 8px;
        box-sizing: border-box;
        flex-wrap: wrap;
      }

      .qs-enhancer-menubar .qs-menulinks li {
        margin: 0;
        padding: 0;
      }

      .qs-enhancer-menubar .qs-menulinks a {
        box-sizing: border-box;
        display: flex;
        min-height: 32px;
        align-items: center;
        justify-content: center;
        padding: 7px 11px;
        border: 1px solid #cfd6e3;
        border-radius: 999px;
        background: #ffffff;
        color: #374151;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        text-decoration: none;
        transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
      }

      .qs-enhancer-menubar .qs-menulinks a:hover {
        border-color: #7aa2d6;
        background: #eef6ff;
        color: #1d4f8f;
      }

      .qs-enhancer-menubar .qs-menulinks.mobile {
        display: none;
      }

      .qs-enhancer-menubar .qs-menulinks.mobile img {
        display: block;
        width: 22px;
        height: 22px;
      }

      @media (max-width: 700px) {
        .qs-enhancer-page-header {
          margin: 10px auto 14px;
          padding: 12px;
        }

        .qs-enhancer-page-header h1 {
          font-size: 21px;
        }

        .qs-enhancer-menubar .qs-menulinks:not(.mobile) {
          display: none;
        }

        .qs-enhancer-menubar .qs-menulinks.mobile {
          display: grid;
          grid-template-columns: repeat(4, minmax(42px, 1fr));
          gap: 8px;
        }

        .qs-enhancer-menubar .qs-menulinks.mobile a {
          min-height: 42px;
          padding: 8px;
          border-radius: 8px;
        }
      }

    `;
        document.head.appendChild(s);
    }

    // --- Toolbar state ------------------------------------------------------------
    function toggleCompact(btn, silent = false) {
        const on = document.body.classList.toggle('qs-compact');
        btn.classList.toggle('active', on);
        btn.textContent = on ? 'Regular View' : 'Compact View';
        if (!silent) GM_setValue(STATE_COMPACT, on);
    }

    function toggleDonate(btn, silent = false) {
        const hidden = document.body.classList.toggle('qs-hide-donate');
        btn.classList.toggle('active', !hidden);
        btn.textContent = hidden ? 'Show Donate' : 'Hide Donate';
        if (!silent) GM_setValue(STATE_DONATE, !hidden);
    }

    function toggleDiscard(btn, silent = false) {
        const hidden = document.body.classList.toggle('qs-hide-discard');
        btn.classList.toggle('active', !hidden);
        btn.textContent = hidden ? 'Show Discard' : 'Hide Discard';
        if (!silent) GM_setValue(STATE_DISCARD, !hidden);
    }

    function buildToolbar(table) {
        if (document.getElementById('qs-toolbar')) return;

        const bar = document.createElement('div');
        bar.id = 'qs-toolbar';

        const btnCompact = document.createElement('button');
        btnCompact.type = 'button';
        btnCompact.className = 'qs-btn';
        btnCompact.textContent = 'Compact View';
        btnCompact.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleCompact(btnCompact);
        });

        const btnDonate = document.createElement('button');
        btnDonate.type = 'button';
        btnDonate.className = 'qs-btn active';
        btnDonate.textContent = 'Hide Donate';
        btnDonate.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleDonate(btnDonate);
        });

        const btnDiscard = document.createElement('button');
        btnDiscard.type = 'button';
        btnDiscard.className = 'qs-btn active';
        btnDiscard.textContent = 'Hide Discard';
        btnDiscard.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleDiscard(btnDiscard);
        });

        bar.append(btnCompact, btnDonate, btnDiscard);

        const container = table.closest('#quickstock-table-container');
        if (container) {
            container.before(bar);
        } else {
            table.parentNode.insertBefore(bar, table);
        }

        if (GM_getValue(STATE_COMPACT, false)) toggleCompact(btnCompact, true);
        if (!GM_getValue(STATE_DONATE, true)) toggleDonate(btnDonate, true);
        if (!GM_getValue(STATE_DISCARD, true)) toggleDiscard(btnDiscard, true);
    }

    // --- Top pagination mirror ----------------------------------------------------
    function ensureTopPagination(table) {
        const tableContainer = table.closest('#quickstock-table-container');
        const bottomPagination = document.querySelector('#quickstock-pagination .np-pagination');
        let topPagination = document.getElementById('qs-top-pagination');

        if (!bottomPagination) {
            topPagination?.remove();
            return;
        }

        if (!topPagination) {
            topPagination = document.createElement('div');
            topPagination.id = 'qs-top-pagination';
            topPagination.addEventListener('click', e => {
                const button = e.target.closest('button');
                if (!button || !topPagination.contains(button)) return;

                e.preventDefault();
                e.stopPropagation();

                const topButtons = [...topPagination.querySelectorAll('button')];
                const buttonIndex = topButtons.indexOf(button);
                const bottomButtons = [...document.querySelectorAll('#quickstock-pagination .np-pagination button')];
                const matchingButton = bottomButtons[buttonIndex];

                if (matchingButton && !matchingButton.disabled) {
                    matchingButton.click();
                }
            });

            if (tableContainer) {
                tableContainer.before(topPagination);
            } else {
                table.parentNode.insertBefore(topPagination, table);
            }
        }

        const nextHtml = bottomPagination.outerHTML;
        if (topPagination.dataset.paginationHtml !== nextHtml) {
            topPagination.innerHTML = nextHtml;
            topPagination.dataset.paginationHtml = nextHtml;
        }
    }

    // --- Nav bar ------------------------------------------------------------------
    function normalizeMenuHref(anchor) {
        const rawHref = anchor.getAttribute('href');
        if (!rawHref) return '';

        try {
            const url = new URL(rawHref, location.origin);
            if (url.origin === location.origin) {
                return `${url.pathname}${url.search}`;
            }
        } catch {
            // Fall through to the raw href.
        }

        return rawHref;
    }

    function hasExistingQuickstockMenu(root = document) {
        if (root.querySelector('.qs-menubar:not(.qs-enhancer-menubar)')) return true;

        const expectedLinks = new Set(MENU_LINK_HREFS);
        const possibleMenus = root.querySelectorAll(
            'nav, [role="navigation"], ul, .menubar, .menu, .nav, .navsub, .nav-menu, #nav, #navigation'
        );

        return [...possibleMenus].some(menu => {
            const foundLinks = [...menu.querySelectorAll('a[href]')]
                .map(normalizeMenuHref)
                .filter(href => expectedLinks.has(href));

            return new Set(foundLinks).size >= 3;
        });
    }

    function removeFallbackMenuIfOriginalExists() {
        if (!document.querySelector('.qs-menubar:not(.qs-enhancer-menubar)')) return false;

        document.querySelectorAll('.qs-enhancer-page-header').forEach(header => header.remove());
        document.querySelectorAll('.qs-enhancer-menubar').forEach(nav => nav.remove());
        return true;
    }

    function findEmptyQuickstockMessage() {
        return [...document.querySelectorAll('center, b, p, div')]
            .find(el => el.textContent.includes('You do not have any items :('));
    }

    function getQuickstockContentRoot(tableContainer, table, emptyMessage) {
        return tableContainer?.parentElement ||
            table?.parentElement ||
            emptyMessage?.closest('#container__2020, #content td.content, .content, #main') ||
            document.querySelector('#container__2020') ||
            document.querySelector('#content td.content') ||
            document.querySelector('.content') ||
            document.querySelector('#main') ||
            document.body;
    }

    function ensureMenuBar() {
        if (removeFallbackMenuIfOriginalExists()) return;

        const tableContainer = document.querySelector('#quickstock-table-container');
        const table = document.querySelector('table.quickstock-table');
        const emptyMessage = findEmptyQuickstockMessage();
        const hasQuickstockTable = !!table;
        const hasNoItemsMessage = !!emptyMessage;

        if (!hasQuickstockTable && !hasNoItemsMessage) return;

        const contentRoot = getQuickstockContentRoot(tableContainer, table, emptyMessage);

        if (hasExistingQuickstockMenu(contentRoot)) return;

        const header = document.createElement('div');
        header.className = 'qs-page-header qs-enhancer-page-header';
        header.innerHTML = `
    <div class="qs-title-container">
      <h1 class="!text-black">Quick Stock</h1>
    </div>

    <div class="qs-menubar qs-enhancer-menubar">
      <ul class="qs-menulinks">
        <li><a href="/inventory.phtml">Inventory</a></li>
        <li><a href="/closet.phtml">Closet</a></li>
        <li><a href="/safetydeposit.phtml">Safety Deposit Box</a></li>
        <li><a href="/dome/neopets.phtml">Equipment</a></li>
        <li><a href="/neohome/shed">Shed</a></li>
        <li><a href="/gallery/index.phtml">Gallery</a></li>
        <li><a href="/stamps.phtml?type=album">Stamps</a></li>
        <li><a href="/tcg/album.phtml">TCG</a></li>
      </ul>
      <ul class="qs-menulinks mobile">
        <li><a href="/inventory.phtml"><img alt="Inventory" src="https://images.neopets.com/themes/h5/basic/images/v3/inventory-icon.svg"></a></li>
        <li><a href="/closet.phtml"><img alt="Closet" src="https://images.neopets.com/themes/h5/basic/images/v3/customise-icon.svg"></a></li>
        <li><a href="/safetydeposit.phtml"><img alt="Safety Deposit Box" src="https://images.neopets.com/themes/h5/basic/images/v3/safetydeposit-icon.svg"></a></li>
        <li><a href="/dome/neopets.phtml"><img alt="Equipment" src="https://images.neopets.com/themes/h5/basic/images/v3/inventory-icon.svg"></a></li>
        <li><a href="/neohome/shed"><img alt="Shed" src="https://images.neopets.com/themes/h5/basic/images/v3/neohome-icon.svg"></a></li>
        <li><a href="/gallery/index.phtml"><img alt="Gallery" src="https://images.neopets.com/themes/h5/basic/images/v3/gallery-icon.svg"></a></li>
        <li><a href="/stamps.phtml?type=album"><img alt="Stamps" src="https://images.neopets.com/themes/h5/basic/images/v3/stamps-icon.svg"></a></li>
        <li><a href="/tcg/album.phtml"><img alt="TCG" src="https://images.neopets.com/themes/h5/basic/images/v3/tradingcards-icon.svg"></a></li>
      </ul>
    </div>
  `;

        if (tableContainer) {
            tableContainer.before(header);
        } else if (emptyMessage) {
            const navBuffer = contentRoot.querySelector('#navsub-buffer__2020');
            if (navBuffer?.parentElement === contentRoot) {
                navBuffer.after(header);
            } else {
                emptyMessage.before(header);
            }
        } else {
            contentRoot.prepend(header);
        }
    }

    // --- Table helpers ------------------------------------------------------------
    function markActionElement(el, action) {
        el.dataset.qsAction = action;
    }

    function clearActionMarks(el) {
        delete el.dataset.qsAction;
    }

    function markColumns(thead, tbody) {
        const ths = [...thead.querySelectorAll('th')];
        const donateIdx = ths.findIndex(th => th.textContent.trim() === 'Donate');
        const discardIdx = ths.findIndex(th => th.textContent.trim() === 'Discard');

        ths.forEach(th => {
            clearActionMarks(th);
        });

        if (donateIdx >= 0) markActionElement(ths[donateIdx], 'donate');
        if (discardIdx >= 0) markActionElement(ths[discardIdx], 'discard');

        [...tbody.querySelectorAll('tr')].forEach(tr => {
            const tds = [...tr.querySelectorAll('td')];
            tds.forEach(clearActionMarks);

            if (donateIdx >= 0 && tds[donateIdx]) {
                markActionElement(tds[donateIdx], 'donate');
            }
            if (discardIdx >= 0 && tds[discardIdx]) {
                markActionElement(tds[discardIdx], 'discard');
            }
        });
    }

    function addImgHeader(thead) {
        if (thead.querySelector('th.qs-img-col')) return;

        const th = document.createElement('th');
        th.className = 'qs-img-col';
        th.textContent = 'Image';

        const firstTh = thead.querySelector('tr th:first-child');
        if (firstTh) firstTh.before(th);
    }

    function addImgCell(tr) {
        if (tr.querySelector('td.qs-img-cell')) return;

        const text = tr.textContent.replace(/\u00a0/g, ' ').trim();
        const firstCell = tr.querySelector('td:first-child');
        if (!firstCell) return;

        if (firstCell.colSpan > 1) {
            if (!tr.dataset.qsImgColspanAdjusted) {
                firstCell.colSpan += 1;
                tr.dataset.qsImgColspanAdjusted = 'true';
            }
            return;
        }

        const td = document.createElement('td');
        td.className = 'qs-img-cell';

        if (text) {
            const ph = document.createElement('span');
            ph.className = 'qs-img-placeholder';
            td.appendChild(ph);
        }

        tr.prepend(td);

        if (!text) return;

        const nameTd = tr.querySelector('td:nth-child(2)');
        if (nameTd) {
            nameTd.classList.add('qs-name-cell');

            const firstSpan = nameTd.querySelector('span:first-child');
            if (firstSpan) firstSpan.classList.add('qs-name-text');
        }
    }

    function fixCheckAllRow(tbody) {
        const checkAllRow = [...tbody.querySelectorAll('tr:not(.qs-top-checkall-row)')].find(
            tr => tr.querySelector('td strong')?.textContent.trim() === 'Check All'
        );
        if (!checkAllRow) return;

        if (!checkAllRow.querySelector('.qs-img-cell')) {
            const imgTd = document.createElement('td');
            imgTd.className = 'qs-img-cell';
            checkAllRow.prepend(imgTd);
        }
    }

    function getOriginalCheckAllRow(tbody) {
        return [...tbody.querySelectorAll('tr:not(.qs-top-checkall-row)')].find(
            tr => tr.querySelector('td strong')?.textContent.trim() === 'Check All'
        );
    }

    function syncTopCheckAllRow(tbody) {
        const originalRow = getOriginalCheckAllRow(tbody);
        let topRow = tbody.querySelector('tr.qs-top-checkall-row');

        if (!originalRow) {
            topRow?.remove();
            return;
        }

        const firstBodyRow = tbody.querySelector('tr:not(.qs-top-checkall-row)');
        if (!topRow) {
            topRow = originalRow.cloneNode(true);
            topRow.classList.add('qs-top-checkall-row');
            topRow.querySelectorAll('input').forEach(input => {
                input.removeAttribute('onclick');
                input.removeAttribute('name');
            });
            tbody.insertBefore(topRow, firstBodyRow);
        } else if (topRow.nextElementSibling !== firstBodyRow) {
            tbody.insertBefore(topRow, firstBodyRow);
        }

        const originalInputs = [...originalRow.querySelectorAll('input')];
        const topInputs = [...topRow.querySelectorAll('input')];

        topInputs.forEach((input, index) => {
            const originalInput = originalInputs[index];
            input.checked = !!originalInput?.checked;
            input.disabled = !originalInput || originalInput.disabled;
        });

        if (!topRow.dataset.qsTopCheckAllBound) {
            topRow.addEventListener('click', e => {
                const input = e.target.closest('input');
                if (!input || !topRow.contains(input)) return;

                e.preventDefault();
                e.stopPropagation();

                const currentTopInputs = [...topRow.querySelectorAll('input')];
                const inputIndex = currentTopInputs.indexOf(input);
                const currentOriginalRow = getOriginalCheckAllRow(tbody);
                const matchingInput = currentOriginalRow?.querySelectorAll('input')[inputIndex];

                if (matchingInput && !matchingInput.disabled) {
                    matchingInput.click();
                    input.checked = matchingInput.checked;
                    scheduleEnhance();
                }
            });
            topRow.dataset.qsTopCheckAllBound = 'true';
        }
    }

    // --- Search helpers -----------------------------------------------------------
    function addSearchHelpers(tbody) {
        tbody.querySelectorAll('tr').forEach(tr => {
            if (tr.querySelector('td strong')?.textContent.trim() === 'Check All') return;

            const nameCell = tr.querySelector('td.qs-name-cell, td:nth-child(2)');
            if (!nameCell) return;

            const nameEl = nameCell.querySelector('.qs-name-text, span:first-child');
            if (!nameEl) return;

            const itemName = nameEl.textContent.trim();
            if (!itemName) return;

            if (nameCell.querySelector('.search-helper')) return;

            const helper = document.createElement('p');
            helper.className = 'search-helper';

            const sswLink = document.createElement('a');
            sswLink.href = '#';
            sswLink.title = 'Super Shop Wizard';
            sswLink.addEventListener('click', e => {
                e.preventDefault();
                document.querySelectorAll('.premium-widget__2024').forEach(w => {
                    w.style.display = 'none';
                });
                if (typeof toggleWidget__2020 === 'function') toggleWidget__2020('ssw');

                const criteriaInput = document.getElementById('ssw-criteria');
                const searchInput = document.getElementById('searchstr');
                const searchBtn = document.getElementById('ssw-button-new-search');

                if (criteriaInput) criteriaInput.value = 'exact';
                if (searchInput) searchInput.value = itemName;
                if (searchBtn) searchBtn.click();
            });
            sswLink.innerHTML = '<img src="http://images.neopets.com/premium/shopwizard/ssw-icon.svg" class="searchimg" title="SSW">';

            const tpLink = document.createElement('a');
            tpLink.href = `https://www.neopets.com/island/tradingpost.phtml?type=browse&criteria=item_phrase&search_string=${encodeURIComponent(itemName)}&sort=newest`;
            tpLink.target = '_blank';
            tpLink.title = 'Trading Post';
            tpLink.innerHTML = '<img src="http://images.neopets.com/themes/h5/basic/images/tradingpost-icon.png" class="searchimg">';

            const auctLink = document.createElement('a');
            auctLink.href = `/genie.phtml?type=process_genie&criteria=exact&auctiongenie=${encodeURIComponent(itemName)}`;
            auctLink.target = '_blank';
            auctLink.title = 'Auction Genie';
            auctLink.innerHTML = '<img src="http://images.neopets.com/themes/h5/basic/images/auction-icon.png" class="searchimg">';

            const sdbLink = document.createElement('a');
            sdbLink.href = `https://www.neopets.com/safetydeposit.phtml?obj_name=${encodeURIComponent(itemName)}&category=0`;
            sdbLink.target = '_blank';
            sdbLink.title = 'Safety Deposit Box';
            sdbLink.innerHTML = '<img src="https://images.neopets.com/images/emptydepositbox.gif" class="searchimg">';

            const jnLink = document.createElement('a');
            jnLink.href = `https://items.jellyneo.net/search/?name=${encodeURIComponent(itemName)}&name_type=3`;
            jnLink.target = '_blank';
            jnLink.title = 'JellyNeo';
            jnLink.innerHTML = '<img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT2dQNzqsjgXfIRB9FaJwx4yMVjEAskB_2jxr_H8wzOX0EqADa46TRv&s" class="searchimg">';

            const idbLink = document.createElement('a');
            idbLink.href = `https://itemdb.com.br/item/${encodeURIComponent(itemName)}`;
            idbLink.target = '_blank';
            idbLink.title = 'ItemDB';
            idbLink.innerHTML = '<img src="https://images.neopets.com/themes/h5/basic/images/v3/quickstock-icon.svg" class="searchimg">';

            helper.append(sswLink, tpLink, auctLink, sdbLink, jnLink, idbLink);
            nameEl.insertAdjacentElement('afterend', helper);
        });
    }

    // --- Images -------------------------------------------------------------------
    function setImg(tds, url) {
        tds.forEach(td => {
            td.innerHTML = '';
            const img = document.createElement('img');
            img.className = 'qs-item-img';
            img.src = url;
            img.alt = '';
            td.appendChild(img);
        });
    }

    async function loadImages(tbody) {
        const nameMap = new Map();

        tbody.querySelectorAll('tr').forEach(tr => {
            if (tr.querySelector('td strong')?.textContent.trim() === 'Check All') return;

            const text = tr.textContent.replace(/\u00a0/g, ' ').trim();
            if (!text) return;

            const imgTd = tr.querySelector('td.qs-img-cell');
            const nameTd = tr.querySelector(
                'td.qs-name-cell .qs-name-text, td:nth-child(2) .qs-name-text, td:nth-child(2) span:first-child'
            );

            if (!imgTd || !nameTd) return;
            if (imgTd.querySelector('img.qs-item-img')) return;

            const name = nameTd.textContent.trim();
            if (!name) return;

            if (!nameMap.has(name)) nameMap.set(name, []);
            nameMap.get(name).push(imgTd);
        });

        const toFetch = [];

        nameMap.forEach((tds, name) => {
            const cached = getCached(name);
            if (cached) {
                setImg(tds, cached);
            } else {
                toFetch.push(name);
            }
        });

        if (!toFetch.length) return;

        const unique = [...new Set(toFetch)];
        const result = await fetchItemImages(unique);

        const imgByName = {};
        Object.values(result || {}).forEach(item => {
            if (item?.name && item?.image) {
                imgByName[item.name] = item.image;
            }
        });

        unique.forEach(name => {
            const url = imgByName[name];
            if (url) {
                setCache(name, url);
                setImg(nameMap.get(name) || [], url);
            }
        });
    }

    // --- Enhancement pass ---------------------------------------------------------
    function enhanceQuickstockTable() {
        injectStyles();
        ensureMenuBar();

        const table = document.querySelector('table.quickstock-table');
        if (!table) return;

        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        if (!thead || !tbody) return;

        buildToolbar(table);
        ensureTopPagination(table);
        addImgHeader(thead);

        tbody.querySelectorAll('tr').forEach(tr => {
            if (tr.querySelector('td strong')?.textContent.trim() === 'Check All') return;
            addImgCell(tr);
        });

        fixCheckAllRow(tbody);
        syncTopCheckAllRow(tbody);
        markColumns(thead, tbody);

        addSearchHelpers(tbody);
        loadImages(tbody);
    }

    // --- Reactive watcher for Vue pagination / view updates -----------------------
    pruneExpiredCache();

    let qsEnhanceTimer = null;

    function scheduleEnhance() {
        clearTimeout(qsEnhanceTimer);
        qsEnhanceTimer = setTimeout(() => {
            enhanceQuickstockTable();
        }, 80);
    }

    scheduleEnhance();

    const observer = new MutationObserver((mutations) => {
        let shouldEnhance = false;

        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                if (mutation.addedNodes.length || mutation.removedNodes.length) {
                    shouldEnhance = true;
                    break;
                }
            }

            if (mutation.type === 'characterData') {
                shouldEnhance = true;
                break;
            }
        }

        if (shouldEnhance) {
            scheduleEnhance();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
})();
