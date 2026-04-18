// ==UserScript==
// @name         Neopets Quickstock Enhancements
// @version      3.1
// @description  Enhances the new Quickstock page.
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/quickstock.phtml*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      itemdb.com.br
// @run-at       document-start
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Quickstock%20Enhancements.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Quickstock%20Enhancements.user.js
// ==/UserScript==

// Enhancements:
// - Adds item images column
// - Adds compact view
// - Adds Donate/Discard column and instructions visibility toggles
// - Adds section Check rows in configurable groups (default 20)
// - Keeps the Check All row sticky while scrolling
// - Mirrors pagination above the Quickstock table
// - Adds quick search links for SSW, TP, Auction Genie, SDB, JellyNeo, and ItemDB
// - Add My Shop link to the nav bar


(function () {
    'use strict';

    // --- Constants ----------------------------------------------------------------
    const CACHE_PREFIX = 'qs_img_';
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
    const ITEMDB_API = 'https://itemdb.com.br/api/v1/items/many';
    const ACTIONS = ['stock', 'deposit', 'donate', 'discard', 'gallery', 'closet', 'shed', 'chamber'];

    const STATE_COMPACT = 'qs_compact_view';
    const STATE_DONATE = 'qs_show_donate';
    const STATE_DISCARD = 'qs_show_discard';
    const STATE_INSTRUCTIONS = 'qs_show_instructions';
    const STATE_SECTION_SIZE = 'qs_section_size';
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

      .qs-inline-control {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #374151;
      }

      .qs-inline-control input[type="number"] {
        width: 58px;
        padding: 4px 6px;
        font-size: 12px;
        border: 1px solid #aaa;
        border-radius: 4px;
        background: #fff;
      }

      .qs-inline-note {
        font-size: 11px;
        color: #6b7280;
      }

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

      .qs-section-check-row {
        background: #f7f0c6 !important;
        border-top: 1px solid #d7c580;
        border-bottom: 1px solid #d7c580;
      }

      .qs-section-check-row td {
        font-weight: 700;
      }

      .qs-section-check-row input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: #c48a10;
      }

      #quickstock-table-container {
        overflow: unset !important;
      }

      table.quickstock-table tbody tr:last-of-type {
        inset-block-end: 0;
        position: sticky;
        z-index: 100;
      }

    `;
        document.head.appendChild(s);
    }

    // --- Toolbar state ------------------------------------------------------------
    function toggleCompact(btn, silent = false) {
        const on = document.body.classList.toggle('qs-compact');
        btn.classList.toggle('active', !on);
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

    function setInstructionsVisibility(btn = null, show = true, silent = false) {
        const instructions = document.getElementById('qs-instructions');
        if (instructions) {
            instructions.style.display = show ? '' : 'none';
        }
        if (btn) {
            btn.classList.toggle('active', show);
            btn.textContent = show ? 'Hide Instructions' : 'Show Instructions';
        }
        if (!silent) GM_setValue(STATE_INSTRUCTIONS, show);
    }

    function getSectionSize() {
        const raw = Number(GM_getValue(STATE_SECTION_SIZE, 20));
        if (!Number.isFinite(raw)) return 20;
        return Math.max(1, Math.min(100, Math.floor(raw)));
    }

    function buildToolbar(table) {
        if (document.getElementById('qs-toolbar')) return;

        const bar = document.createElement('div');
        bar.id = 'qs-toolbar';

        const btnCompact = document.createElement('button');
        btnCompact.type = 'button';
        btnCompact.className = 'qs-btn active';
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

        const btnInstructions = document.createElement('button');
        btnInstructions.type = 'button';
        btnInstructions.className = 'qs-btn active';
        btnInstructions.textContent = 'Hide Instructions';
        btnInstructions.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const show = btnInstructions.textContent === 'Show Instructions';
            setInstructionsVisibility(btnInstructions, show);
        });

        const sectionSizeWrap = document.createElement('label');
        sectionSizeWrap.className = 'qs-inline-control';
        sectionSizeWrap.innerHTML = `
          <span>Section Size</span>
          <input type="number" id="qs-section-size-input" min="1" max="100" step="1">
          <span class="qs-inline-note">Reload to apply</span>
        `;

        const sectionSizeInput = sectionSizeWrap.querySelector('input');
        sectionSizeInput.value = String(getSectionSize());
        sectionSizeInput.addEventListener('change', () => {
            const nextValue = Math.max(1, Math.min(100, Math.floor(Number(sectionSizeInput.value) || 20)));
            sectionSizeInput.value = String(nextValue);
            GM_setValue(STATE_SECTION_SIZE, nextValue);
        });

        bar.append(btnCompact, btnDonate, btnDiscard, btnInstructions, sectionSizeWrap);

        const filterBar = document.getElementById('qs-filter-bar');
        const container = table.closest('#quickstock-table-container');
        if (filterBar?.parentNode) {
            filterBar.parentNode.insertBefore(bar, filterBar);
        } else if (container) {
            container.before(bar);
        } else {
            table.parentNode.insertBefore(bar, table);
        }

        if (GM_getValue(STATE_COMPACT, false)) toggleCompact(btnCompact, true);
        if (!GM_getValue(STATE_DONATE, true)) toggleDonate(btnDonate, true);
        if (!GM_getValue(STATE_DISCARD, true)) toggleDiscard(btnDiscard, true);
        setInstructionsVisibility(btnInstructions, GM_getValue(STATE_INSTRUCTIONS, true), true);
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
        const checkAllRow = [...tbody.querySelectorAll('tr')].find(
            tr => tr.querySelector('td strong')?.textContent.trim() === 'Check All'
        );
        if (!checkAllRow) return;

        if (!checkAllRow.querySelector('.qs-img-cell')) {
            const imgTd = document.createElement('td');
            imgTd.className = 'qs-img-cell';
            checkAllRow.prepend(imgTd);
        }
    }

    function getItemRows(tbody) {
        return [...tbody.querySelectorAll('tr')].filter(tr => {
            if (tr.classList.contains('qs-section-check-row')) return false;
            if (tr.querySelector('td strong')?.textContent.trim() === 'Check All') return false;
            return !!tr.querySelector('input[type="radio"][name^="qs_"]');
        });
    }

    function getRowRadiosByAction(row) {
        const radios = new Map();
        row.querySelectorAll('input[type="radio"][name^="qs_"]').forEach(radio => {
            if (!radio.disabled && radio.offsetParent !== null) {
                radios.set(radio.value, radio);
            }
        });
        return radios;
    }

    function setRowAction(row, action) {
        const target = getRowRadiosByAction(row).get(action);
        if (target && !target.checked) {
            target.click();
        }
    }

    function updateSectionCheckboxStates(tbody) {
        tbody.querySelectorAll('tr.qs-section-check-row').forEach(sectionRow => {
            const start = Number(sectionRow.dataset.startIndex || 0);
            const end = Number(sectionRow.dataset.endIndex || 0);
            const rows = getItemRows(tbody).slice(start, end);

            sectionRow.querySelectorAll('input[type="checkbox"][data-action]').forEach(checkbox => {
                const action = checkbox.dataset.action;
                const eligibleRows = rows.filter(row => getRowRadiosByAction(row).has(action));
                checkbox.checked = eligibleRows.length > 0 && eligibleRows.every(row => {
                    const radio = getRowRadiosByAction(row).get(action);
                    return !!radio?.checked;
                });
            });
        });
    }

    function addSectionCheckRows(thead, tbody) {
        const itemRows = getItemRows(tbody);
        if (!itemRows.length) return;
        const sectionSize = getSectionSize();

        const headers = [...thead.querySelectorAll('th')];
        const actionHeaders = headers.map(th => th.textContent.trim().toLowerCase());
        const expectedRanges = [];

        for (let start = 0; start < itemRows.length; start += sectionSize) {
            const end = Math.min(start + sectionSize, itemRows.length);
            expectedRanges.push(`${start}:${end}`);
        }

        const existingRows = [...tbody.querySelectorAll('tr.qs-section-check-row')];
        const existingRanges = existingRows.map(row => `${row.dataset.startIndex || ''}:${row.dataset.endIndex || ''}`);
        if (existingRows.length && existingRanges.join('|') === expectedRanges.join('|')) {
            updateSectionCheckboxStates(tbody);
            return;
        }

        existingRows.forEach(row => row.remove());

        for (let start = 0; start < itemRows.length; start += sectionSize) {
            const end = Math.min(start + sectionSize, itemRows.length);
            const anchorRow = itemRows[start];
            if (!anchorRow) continue;

            const sectionRow = document.createElement('tr');
            sectionRow.className = 'qs-section-check-row';
            sectionRow.dataset.startIndex = String(start);
            sectionRow.dataset.endIndex = String(end);
            sectionRow.innerHTML = headers.map((th, index) => {
                const headerText = actionHeaders[index] || '';
                if (index === 0) return '<td class="qs-img-cell"></td>';
                if (index === 1) return `<td><strong>Check ${start + 1}-${end}</strong></td>`;
                if (ACTIONS.includes(headerText)) {
                    return `<td><input type="checkbox" data-action="${headerText}"></td>`;
                }
                return '<td></td>';
            }).join('');

            sectionRow.querySelectorAll('input[type="checkbox"][data-action]').forEach(checkbox => {
                const action = checkbox.dataset.action;
                checkbox.addEventListener('click', () => {
                    if (!checkbox.checked) {
                        setTimeout(() => updateSectionCheckboxStates(tbody), 0);
                        return;
                    }

                    sectionRow.querySelectorAll('input[type="checkbox"][data-action]').forEach(other => {
                        if (other !== checkbox) other.checked = false;
                    });

                    const sectionRows = getItemRows(tbody).slice(start, end);
                    sectionRows.forEach(row => setRowAction(row, action));
                    setTimeout(() => updateSectionCheckboxStates(tbody), 0);
                });
            });

            anchorRow.before(sectionRow);
        }

        updateSectionCheckboxStates(tbody);
    }

    // --- Search helpers -----------------------------------------------------------
    function addSearchHelpers(tbody) {
        tbody.querySelectorAll('tr').forEach(tr => {
            if (tr.querySelector('td strong')?.textContent.trim() === 'Check All') return;

            const nameCell = tr.querySelector('td.qs-name-cell, td:nth-child(2)');
            if (!nameCell) return;

            const nameEl = nameCell.querySelector('.qs-name-text, span:first-child');
            if (!nameEl) return;

            const itemName = getBaseItemName(nameEl);
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

            const name = getBaseItemName(nameTd);
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

    function getBaseItemName(nameEl) {
        if (!nameEl) return '';

        const clone = nameEl.cloneNode(true);
        clone.querySelectorAll('.qs-count-badge').forEach(el => el.remove());
        return clone.textContent.replace(/\u00d7\d+\s*$/, '').trim();
    }

    function ensureQuickstockNavLinks() {
        const desktopMenu = document.querySelector('.qs-menubar .qs-menulinks:not(.mobile)');
        if (desktopMenu && !desktopMenu.querySelector('a[href="/market.phtml?type=your"]')) {
            const item = document.createElement('li');
            item.innerHTML = '<a href="/market.phtml?type=your">Shop</a>';
            const inventoryItem = desktopMenu.querySelector('a[href="/inventory.phtml"]')?.closest('li');
            if (inventoryItem?.parentNode === desktopMenu) {
                inventoryItem.insertAdjacentElement('afterend', item);
            } else {
                desktopMenu.appendChild(item);
            }
        }

        const mobileMenu = document.querySelector('.qs-menubar .qs-menulinks.mobile');
        if (mobileMenu && !mobileMenu.querySelector('a[href="/market.phtml?type=your"]')) {
            const item = document.createElement('li');
            item.innerHTML = '<a href="/market.phtml?type=your"><img alt="Shop" src="https://images.neopets.com/themes/h5/basic/images/myshop-icon.png"></a>';
            const inventoryItem = mobileMenu.querySelector('a[href="/inventory.phtml"]')?.closest('li');
            if (inventoryItem?.parentNode === mobileMenu) {
                inventoryItem.insertAdjacentElement('afterend', item);
            } else {
                mobileMenu.appendChild(item);
            }
        }
    }

    // --- Enhancement pass ---------------------------------------------------------
    function enhanceQuickstockTable() {
        qsInternalMutation = true;
        try {
            injectStyles();
            setInstructionsVisibility(null, GM_getValue(STATE_INSTRUCTIONS, true), true);
            ensureQuickstockNavLinks();

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
            addSectionCheckRows(thead, tbody);
            markColumns(thead, tbody);

            addSearchHelpers(tbody);
            loadImages(tbody);
        } finally {
            requestAnimationFrame(() => {
                qsInternalMutation = false;
            });
        }
    }

    // --- Reactive watcher for Vue pagination / view updates -----------------------
    let qsEnhanceTimer = null;
    let qsStarted = false;
    let qsInternalMutation = false;

    function scheduleEnhance() {
        clearTimeout(qsEnhanceTimer);
        qsEnhanceTimer = setTimeout(() => {
            enhanceQuickstockTable();
        }, 80);
    }

    const observer = new MutationObserver((mutations) => {
        if (qsInternalMutation) return;

        let shouldEnhance = false;

        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                const relevantNodes = [...mutation.addedNodes, ...mutation.removedNodes].filter(node => {
                    return !(node.nodeType === 1 && node.classList?.contains('qs-section-check-row'));
                });

                if (relevantNodes.length) {
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

    function startEnhancer() {
        if (qsStarted || !document.body) return;
        qsStarted = true;

        pruneExpiredCache();
        scheduleEnhance();

        document.body.addEventListener('change', event => {
            if (!event.target.matches('input[type="radio"][name^="qs_"]')) return;
            const tbody = event.target.closest('tbody');
            if (tbody) updateSectionCheckboxStates(tbody);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    if (document.body) {
        startEnhancer();
    } else {
        document.addEventListener('DOMContentLoaded', startEnhancer, { once: true });
    }
})();
