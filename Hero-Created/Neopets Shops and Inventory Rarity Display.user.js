// ==UserScript==
// @name         Neopets Shops and Inventory Rarity Display
// @version      2.0.1
// @description  Displays item rarities in both user shops and your inventory.
// @match        *://*.neopets.com/browseshop.phtml*
// @match        *://*.neopets.com/inventory.phtml
// @connect      itemdb.com.br
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/*
 *   • Collects item names.
 *   • Fetches rarity data from itemdb.com.br API.
 *   • Adds color-coded rarity overlays on each item.
 *
 * Rarity colors: r99=Green, r500=Gold, r180=Grey, r1–74=Yellow, r75–100=Light Green,
 * r101–104=Burgundy, r105–110=Orange, r111+=Red, default=Black.
 */

(function () {
    const url = window.location.href;

    if (url.includes('browseshop.phtml')) {
        handleShop();
    } else if (url.includes('inventory.phtml')) {
        handleInventory();
    }

    // ----- SHOP -----
    function handleShop() {
        const itemNames = Array.from(document.querySelectorAll('table[align="center"] td[width="120"][align="center"] b'))
            .map(el => el.textContent.trim())
            .filter(name => name);

        if (itemNames.length === 0) return;

        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://itemdb.com.br/api/v1/items/many',
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ name: itemNames }),
            onload: function (res) {
                if (res.status === 200) {
                    const itemData = JSON.parse(res.responseText);
                    applyShopRarities(itemData);
                }
            }
        });

        function applyShopRarities(itemData) {
            const items = Array.from(document.querySelectorAll('table[align="center"] td[width="120"][align="center"]'));
            for (const item of items) {
                if (item.querySelector('.rarity-display')) continue;
                const itemName = item.querySelector('b')?.textContent.trim();
                if (!itemName || !itemData[itemName] || !itemData[itemName].rarity) continue;
                addRarityDisplay(item, itemData[itemName].rarity);
            }
        }
    }

    // ----- INVENTORY -----
    async function handleInventory() {
        await addInventoryRarities();
        const toggleButton = document.querySelector('.nptoggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', async () => {
                await addInventoryRarities();
            });
        }

        async function addInventoryRarities() {
            await waitForInventoryLoaded();
            const items = Array.from(document.querySelectorAll(`[class*="item-img"]`));
            for (const item of items) {
                if (item.querySelector('.rarity-display')) continue;
                const rarity = item.dataset.rarity;
                if (!rarity) continue;
                addRarityDisplay(item, rarity);
            }
        }

        async function waitForInventoryLoaded() {
            await sleep(100);
            while (document.querySelector('.inv-loading-static')) {
                await sleep(1000);
            }
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    // ----- SHARED -----
    function addRarityDisplay(container, rarity) {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '0px';
        div.style.width = 'fit-content';
        div.style.color = 'white';
        div.style.fontFamily = 'MuseoSansRounded500';
        div.style.backgroundColor = getBackgroundColor(rarity);
        div.className = 'inv-menulinks rarity-display';
        div.innerText = 'r' + rarity;

        container.style.position = 'relative';
        container.appendChild(div);
    }

    function getBackgroundColor(rarity) {
        rarity = parseInt(rarity);
        return rarity == 99 ? 'green' :
            rarity == 500 ? 'gold' :
            rarity == 180 ? '#666666' :
            rarity < 75 ? '#dda713' :
            rarity >= 75 && rarity < 101 ? '#7ba515' :
            rarity >= 101 && rarity <= 104 ? '#aa4455' :
            rarity <= 105 && rarity < 111 ? 'orange' :
            rarity >= 111 ? 'red' : '#000';
    }
})();
