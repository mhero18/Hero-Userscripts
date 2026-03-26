// ==UserScript==
// @name         Neopets Trading Post Helper v2
// @version      3.1
// @description  Adds user action buttons and search helper icons. 
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @author       Hero
// @match        *://*.neopets.com/island/tradingpost.phtml*
// @grant        none
// @run-at       document-start
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%Trading%Post%20Helper.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%Trading%Post%20Helper.user.js
// ==/UserScript==

(function () {
    'use strict';

    let scriptInitialized = false;

    /********************
     * INJECT CSS STYLES
     ********************/
    function injectStyles() {
        if (document.getElementById('tp-helper-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'tp-helper-styles';
        styles.textContent = `
            .user-actions {
                display: inline-flex;
                gap: 4px;
                margin-left: 6px;
                vertical-align: middle;
                align-items: center;
            }

            .actionbtn {
                display: inline-flex;
                cursor: pointer;
                margin: 0;
                vertical-align: middle;
                align-items: center;
                justify-content: center;
            }

            .actionbtn img {
                height: 18px;
                width: 18px;
                vertical-align: middle;
            }

            .actionbtn a {
                text-decoration: none;
                display: inline-flex;
                vertical-align: middle;
                align-items: center;
            }

            .search-helper {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-top: 2px;
                flex-wrap: nowrap;
            }

            .search-helper .searchimg {
                height: 18px;
                width: 18px;
                vertical-align: middle;
            }
        `;
        document.head.appendChild(styles);
    }

    /********************
     * CORE HELPERS
     ********************/

    function addButtonsToUserLinks(root = document) {
        const links = root.querySelectorAll('a[href*="/userlookup.phtml?user="]');
        links.forEach(link => {
            if (link.parentElement?.querySelector('.user-actions')) return;

            try {
                const url = new URL(link.href, location.origin);
                const username = url.searchParams.get('user');
                if (!username) return;

                const cleanUser = username.replace(/[^a-zA-Z0-9_ -]+/g, '');

                const actionContainer = document.createElement('span');
                actionContainer.className = 'user-actions';
                actionContainer.innerHTML = `
                    <a href="/neomessages.phtml?type=send&recipient=${encodeURIComponent(cleanUser)}" target="_blank" title="Send Neomail">
                        <div class="actionbtn" style="cursor:pointer;">
                            <img src="http://images.neopets.com/themes/h5/basic/images/v3/neomail-icon.svg" style="height:20px; width:20px;" alt="Neomail">
                        </div>
                    </a>
                    <a href="/island/tradingpost.phtml?type=browse&criteria=owner&search_string=${encodeURIComponent(cleanUser)}" target="_blank" title="View Trading Post">
                        <div class="actionbtn">
                            <img src="http://images.neopets.com/themes/h5/basic/images/tradingpost-icon.png" alt="Trading Post">
                        </div>
                    </a>
                    <a href="/genie.phtml?type=find_user&auction_username=${encodeURIComponent(cleanUser)}" target="_blank" title="View Auctions">
                        <div class="actionbtn">
                            <img src="http://images.neopets.com/themes/h5/basic/images/auction-icon.png" alt="Auctions">
                        </div>
                    </a>
                `;

                link.insertAdjacentElement('afterend', actionContainer);
            } catch (e) {
                console.warn('[TP Helper] Error adding buttons:', e);
            }
        });
    }

    function addSearchHelperIcons(root = document) {
        const items = root.querySelectorAll('.item-name-text');
        items.forEach(itemEl => {
            const itemName = itemEl.textContent.trim();
            if (!itemName) return;

            if (itemEl.nextElementSibling?.classList.contains('search-helper')) return;

            const helper = document.createElement('p');
            helper.className = 'search-helper';

            // Super Shop Wizard (SSW)
            const sswLink = document.createElement('a');
            sswLink.href = '#';
            sswLink.title = 'Search Super Shop Wizard';
            sswLink.addEventListener('click', (e) => {
                e.preventDefault();
                const widgets = document.querySelectorAll('.premium-widget__2024');
                widgets.forEach(w => w.style.display = 'none');

                if (typeof toggleWidget__2020 === 'function') {
                    toggleWidget__2020('ssw');
                }

                const criteriaInput = document.getElementById('ssw-criteria');
                const searchInput = document.getElementById('searchstr');
                const searchButton = document.getElementById('ssw-button-new-search');

                if (criteriaInput) criteriaInput.value = 'exact';
                if (searchInput) searchInput.value = itemName;
                if (searchButton) searchButton.click();
            });
            const sswImg = document.createElement('img');
            sswImg.src = 'http://images.neopets.com/premium/shopwizard/ssw-icon.svg';
            sswImg.className = 'searchimg';
            sswLink.appendChild(sswImg);

            // Trading Post
            const tpLink = document.createElement('a');
            const encodedName = encodeURIComponent(itemName);
            const plusName = itemName.replace(/ /g, '+');
            tpLink.href = `https://www.neopets.com/island/tradingpost.phtml?type=browse&criteria=item_phrase&search_string=${encodedName}&sort=newest#/?type=browse&criteria=item_phrase&search_string=${plusName}&sort=newest`;
            tpLink.target = '_blank';
            tpLink.title = 'Search Trading Post';
            const tpImg = document.createElement('img');
            tpImg.src = 'http://images.neopets.com/themes/h5/basic/images/tradingpost-icon.png';
            tpImg.className = 'searchimg';
            tpLink.appendChild(tpImg);

            // Auction Genie
            const auctionLink = document.createElement('a');
            auctionLink.href = `/genie.phtml?type=process_genie&criteria=exact&auctiongenie=${encodeURIComponent(itemName)}`;
            auctionLink.target = '_blank';
            auctionLink.title = 'Search Auctions';
            const auctionImg = document.createElement('img');
            auctionImg.src = 'http://images.neopets.com/themes/h5/basic/images/auction-icon.png';
            auctionImg.className = 'searchimg';
            auctionLink.appendChild(auctionImg);

            // Safety Deposit Box
            const sdbLink = document.createElement('a');
            sdbLink.href = `https://www.neopets.com/safetydeposit.phtml?obj_name=${encodeURIComponent(itemName)}&category=0`;
            sdbLink.target = '_blank';
            sdbLink.title = 'Search SDB';
            const sdbImg = document.createElement('img');
            sdbImg.src = 'https://images.neopets.com/images/emptydepositbox.gif';
            sdbImg.className = 'searchimg';
            sdbLink.appendChild(sdbImg);

            // JellyNeo
            const jnLink = document.createElement('a');
            jnLink.href = `https://items.jellyneo.net/search/?name=${encodeURIComponent(itemName)}&name_type=3`;
            jnLink.target = '_blank';
            jnLink.title = 'Search JellyNeo';
            const jnImg = document.createElement('img');
            jnImg.src = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT2dQNzqsjgXfIRB9FaJwx4yMVjEAskB_2jxr_H8wzOX0EqADa46TRv&s';
            jnImg.className = 'searchimg';
            jnLink.appendChild(jnImg);

            // ItemDB
            const itemdbLink = document.createElement('a');
            itemdbLink.href = `https://itemdb.com.br/item/${encodeURIComponent(itemName)}`;
            itemdbLink.target = '_blank';
            itemdbLink.title = 'Search ItemDB';
            const itemdbImg = document.createElement('img');
            itemdbImg.src = 'https://images.neopets.com/themes/h5/basic/images/v3/quickstock-icon.svg';
            itemdbImg.className = 'searchimg';
            itemdbLink.appendChild(itemdbImg);

            helper.append(sswLink, tpLink, auctionLink, sdbLink, jnLink, itemdbLink);
            itemEl.insertAdjacentElement('afterend', helper);
        });
    }

    /********************
     * INITIALIZATION
     ********************/
    function initialize() {
        if (scriptInitialized) {
            console.log("[TP Helper] Already initialized, skipping.");
            return;
        }

        scriptInitialized = true;

        console.log("[TP Helper] Initializing script...");

        injectStyles();
        addButtonsToUserLinks();
        addSearchHelperIcons();

        const lotContainer = document.querySelector('#content') || document.body;

        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;

                    if (node.querySelector?.('a[href*="/userlookup.phtml?user="]')) {
                        addButtonsToUserLinks(node);
                    }

                    if (node.querySelector?.('.item-name-text')) {
                        addSearchHelperIcons(node);
                    }
                }
            }
        });

        observer.observe(lotContainer, { childList: true, subtree: true });

        setTimeout(() => {
            addSearchHelperIcons();
        }, 500);
    }

    /********************
     * MULTIPLE EVENT LISTENERS FOR RELIABILITY
     ********************/
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    window.addEventListener('load', () => {
        setTimeout(initialize, 100);
    });

    setTimeout(() => {
        if (!scriptInitialized) {
            console.log("[TP Helper] Fallback initialization triggered.");
            initialize();
        }
    }, 1000);

})();