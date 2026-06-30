// ==UserScript==
// @name         DTI Want Items Filter for Neopets Galleries and JN Wishlists
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @version      1.5
// @description  Save your DTI Items You Want items and filter Neopets galleries / JN lists to match.
// @match        *://impress.openneo.net/*
// @match        *://items.jellyneo.net/mywishes/*
// @match        *://*.neopets.com/gallery/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'dtiWantListItems';
    const HIDDEN_CLASS = 'dti-want-hidden-gallery-item';
    const MATCH_CLASS = 'dti-want-gallery-match';
    const QTY_HIDDEN_CLASS = 'dti-want-hidden-qty';
    const FILTER_BAR_ID = 'dti-want-gallery-filter';

    function normalizeName(name) {
        return (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function getSavedItems() {
        const saved = GM_getValue(STORAGE_KEY, []);
        if (Array.isArray(saved)) return saved;

        try {
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.warn('[DTI Want List] Could not parse saved list:', err);
            return [];
        }
    }

    function setSavedItems(items) {
        GM_setValue(STORAGE_KEY, items);
    }

    function addGlobalStyles() {
        if (document.getElementById('dti-want-list-styles')) return;

        const style = document.createElement('style');
        style.id = 'dti-want-list-styles';
        style.textContent = `
            #${FILTER_BAR_ID} {
                position: fixed;
                right: 18px;
                bottom: 32px;
                z-index: 99999;
                width: 260px;
                box-sizing: border-box;
                padding: 10px;
                border: 2px solid #355c3a;
                border-radius: 6px;
                background: #fff;
                color: #1d1d1d;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
                font: 13px/1.35 Arial, sans-serif;
            }
            #${FILTER_BAR_ID} button {
                width: 100%;
                box-sizing: border-box;
                margin: 4px 0;
                padding: 7px 8px;
                border: 1px solid #355c3a;
                border-radius: 4px;
                background: #efe;
                color: #17351b;
                cursor: pointer;
                font-weight: bold;
            }
            #${FILTER_BAR_ID} button.secondary {
                background: #fff;
                font-weight: normal;
            }
            #${FILTER_BAR_ID} .dti-want-status {
                margin-top: 6px;
                color: #333;
            }
            .${HIDDEN_CLASS} {
                display: none !important;
            }
            .${QTY_HIDDEN_CLASS} {
                display: none !important;
            }
            .${MATCH_CLASS} {
                background: #efe !important;
                outline: 2px solid #8ac78a !important;
                outline-offset: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    function findWantSection() {
        const explicit = document.querySelector('.closet-hangers-group[data-owned="false"], #closet-hangers-group-false');
        if (explicit) return explicit;

        return Array.from(document.querySelectorAll('.closet-hangers-group')).find(section => {
            const heading = section.querySelector('h3');
            return heading && normalizeName(heading.textContent) === 'items you want';
        }) || null;
    }

    function parseDtiWantItems() {
        const section = findWantSection();
        if (!section) return [];

        const itemsByName = new Map();
        section.querySelectorAll('.closet-list-hangers .object').forEach(object => {
            const name = object.querySelector('.name')?.textContent.trim();

            if (!name) return;

            itemsByName.set(normalizeName(name), {
                name
            });
        });

        return Array.from(itemsByName.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    function initDtiSaver() {
        const section = findWantSection();
        if (!section) return;

        addGlobalStyles();

        const panel = document.createElement('div');
        panel.id = FILTER_BAR_ID;

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.textContent = 'Save DTI Want List';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'secondary';
        copyButton.textContent = 'Copy Saved Names';

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'secondary';
        clearButton.textContent = 'Clear Saved List';

        const status = document.createElement('div');
        status.className = 'dti-want-status';

        function updateStatus(message) {
            const savedCount = getSavedItems().length;
            status.textContent = message || `${savedCount} saved want-list item${savedCount === 1 ? '' : 's'}.`;
        }

        saveButton.addEventListener('click', () => {
            const items = parseDtiWantItems();
            setSavedItems(items);
            updateStatus(`Saved ${items.length} item${items.length === 1 ? '' : 's'} from Items you want.`);
        });

        copyButton.addEventListener('click', async () => {
            const names = getSavedItems().map(item => item.name).join('\n');
            if (!names) {
                updateStatus('No saved items to copy yet.');
                return;
            }

            try {
                await navigator.clipboard.writeText(names);
                updateStatus('Copied saved item names.');
            } catch (err) {
                console.warn('[DTI Want List] Clipboard copy failed:', err);
                updateStatus('Copy failed; item names are still saved.');
            }
        });

        clearButton.addEventListener('click', () => {
            setSavedItems([]);
            updateStatus('Cleared saved DTI want-list items.');
        });

        panel.append(saveButton, copyButton, clearButton, status);
        document.body.appendChild(panel);
        updateStatus();
    }

    function getGalleryItemName(container, image) {
        const directName = container.querySelector('.item-name-text, .item-name')?.textContent.trim();
        if (directName) return directName;

        const boldName = Array.from(container.querySelectorAll('b'))
            .map(element => element.textContent.trim())
            .find(text => text && !/^qty:\s*\d+/i.test(text));
        if (boldName) return boldName;

        const imageName = image?.getAttribute('alt') || image?.getAttribute('title') || '';
        return imageName.replace(/^Thumbnail for\s+/i, '').trim();
    }

    function setQtyLabelsHidden(container, hidden) {
        if (!container) return;

        const candidates = Array.from(container.querySelectorAll('b, strong, span, small, div, font'))
            .filter(element => /^qty:\s*\d+\s*$/i.test(element.textContent.trim()))
            .filter(element => !element.querySelector('img[src*="/items/"]'));

        candidates.forEach(element => {
            element.classList.toggle(QTY_HIDDEN_CLASS, hidden);
        });
    }

    function setAllGalleryQtyRowsHidden(hidden) {
        document.querySelectorAll('#gallery_form font, #gallery_form td').forEach(element => {
            if (/^qty:\s*\d+\s*$/i.test(element.textContent.trim())) {
                element.classList.toggle(QTY_HIDDEN_CLASS, hidden);
            }
        });
    }

    function syncGalleryQtyRowsToMatches() {
        const rows = Array.from(document.querySelectorAll('#gallery_form tr'));

        rows.forEach((row, rowIndex) => {
            const itemCells = Array.from(row.children).filter(cell => cell.querySelector?.('img[src*="/items/"]'));
            if (!itemCells.length) return;

            const qtyRow = rows[rowIndex + 1];
            if (!qtyRow) return;

            const qtyCells = Array.from(qtyRow.children).filter(cell => /^qty:\s*\d+\s*$/i.test(cell.textContent.trim()));
            itemCells.forEach((itemCell, index) => {
                const qtyCell = qtyCells[index];
                if (!qtyCell) return;

                const isWanted = itemCell.classList.contains(MATCH_CLASS);
                qtyCell.classList.toggle(QTY_HIDDEN_CLASS, !isWanted);
            });
        });
    }

    function findGalleryContainer(image) {
        const specificContainer = image.closest('.item-card, .gallery-item, .item, li, td');
        if (specificContainer) return specificContainer;

        let node = image.parentElement;
        while (node && node !== document.body) {
            const hasItemImage = node.querySelector('img[src*="/items/"]');
            const hasItemText = node.querySelector('.item-name-text, .item-name, b') || node.textContent.trim();
            if (hasItemImage && hasItemText) return node;
            node = node.parentElement;
        }

        return image.parentElement;
    }

    function getGalleryItems() {
        const seen = new Set();
        return Array.from(document.querySelectorAll('img[src*="/items/"]'))
            .map(image => {
                const container = findGalleryContainer(image);
                if (!container || seen.has(container)) return null;
                seen.add(container);

                const name = getGalleryItemName(container, image);
                if (!name) return null;

                return {
                    container,
                    name,
                    normalizedName: normalizeName(name)
                };
            })
            .filter(Boolean);
    }

    function filterGallery(status) {
        const wantedNames = new Set(getSavedItems().map(item => normalizeName(item.name)).filter(Boolean));
        const galleryItems = getGalleryItems();

        if (!wantedNames.size) {
            status.textContent = 'No DTI want-list items saved yet. Visit your DTI closet first.';
            return;
        }

        let shown = 0;
        galleryItems.forEach(item => {
            const isWanted = wantedNames.has(item.normalizedName);
            item.container.classList.toggle(HIDDEN_CLASS, !isWanted);
            item.container.classList.toggle(MATCH_CLASS, isWanted);
            setQtyLabelsHidden(item.container, false);
            if (isWanted) shown += 1;
        });
        syncGalleryQtyRowsToMatches();

        status.textContent = `Showing ${shown} matching item${shown === 1 ? '' : 's'} out of ${galleryItems.length}.`;
    }

    function resetGallery(status) {
        getGalleryItems().forEach(item => {
            item.container.classList.remove(HIDDEN_CLASS, MATCH_CLASS);
            setQtyLabelsHidden(item.container, false);
        });
        setAllGalleryQtyRowsHidden(false);

        const savedCount = getSavedItems().length;
        status.textContent = `${savedCount} saved DTI want-list item${savedCount === 1 ? '' : 's'}.`;
    }

    function initGalleryFilter() {
        addGlobalStyles();

        const panel = document.createElement('div');
        panel.id = FILTER_BAR_ID;

        const filterButton = document.createElement('button');
        filterButton.type = 'button';
        filterButton.textContent = 'See Items I Want';

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'secondary';
        resetButton.textContent = 'Show All Gallery Items';

        const status = document.createElement('div');
        status.className = 'dti-want-status';

        filterButton.addEventListener('click', () => filterGallery(status));
        resetButton.addEventListener('click', () => resetGallery(status));

        panel.append(filterButton, resetButton, status);
        document.body.appendChild(panel);
        resetGallery(status);
    }

    function getJellyneoWishlistItems() {
        return Array.from(document.querySelectorAll('ul.item-block-grid li'))
            .map(container => {
                const links = Array.from(container.querySelectorAll('a.no-link-icon'));
                const nameLink = links.find(link => !link.querySelector('img') && link.textContent.trim());
                const name = nameLink?.textContent.trim();
                if (!name) return null;

                return {
                    container,
                    name,
                    normalizedName: normalizeName(name)
                };
            })
            .filter(Boolean);
    }

    function filterJellyneoWishlist(status) {
        const wantedNames = new Set(getSavedItems().map(item => normalizeName(item.name)).filter(Boolean));
        const wishlistItems = getJellyneoWishlistItems();

        if (!wantedNames.size) {
            status.textContent = 'No DTI want-list items saved yet. Visit your DTI closet first.';
            return;
        }

        let shown = 0;
        wishlistItems.forEach(item => {
            const isWanted = wantedNames.has(item.normalizedName);
            item.container.classList.toggle(HIDDEN_CLASS, !isWanted);
            item.container.classList.toggle(MATCH_CLASS, isWanted);
            if (isWanted) shown += 1;
        });

        status.textContent = `Showing ${shown} matching item${shown === 1 ? '' : 's'} out of ${wishlistItems.length}.`;
    }

    function resetJellyneoWishlist(status) {
        getJellyneoWishlistItems().forEach(item => {
            item.container.classList.remove(HIDDEN_CLASS, MATCH_CLASS);
        });

        const savedCount = getSavedItems().length;
        status.textContent = `${savedCount} saved DTI want-list item${savedCount === 1 ? '' : 's'}.`;
    }

    function initJellyneoWishlistFilter() {
        if (!document.querySelector('ul.item-block-grid li')) return;

        addGlobalStyles();

        const panel = document.createElement('div');
        panel.id = FILTER_BAR_ID;

        const filterButton = document.createElement('button');
        filterButton.type = 'button';
        filterButton.textContent = 'See Items I Want';

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'secondary';
        resetButton.textContent = 'Show All Wishlist Items';

        const status = document.createElement('div');
        status.className = 'dti-want-status';

        filterButton.addEventListener('click', () => filterJellyneoWishlist(status));
        resetButton.addEventListener('click', () => resetJellyneoWishlist(status));

        panel.append(filterButton, resetButton, status);
        document.body.appendChild(panel);
        resetJellyneoWishlist(status);
    }

    if (location.hostname.includes('openneo.net')) {
        initDtiSaver();
    } else if (location.hostname === 'www.neopets.com' && location.pathname === '/gallery/index.phtml') {
        initGalleryFilter();
    } else if (location.hostname === 'items.jellyneo.net' && location.pathname.startsWith('/mywishes/')) {
        initJellyneoWishlistFilter();
    }
})();
