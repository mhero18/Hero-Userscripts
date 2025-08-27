// ==UserScript==
// @name         Neopets Trading Post Helper
// @version      1.4
// @description  Adds a "Neomail" button next to usernames and auto-selects "Newest" in search.
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @author       Hero
// @match        *://*.neopets.com/island/tradingpost.phtml*
// @grant        none
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Trading%20Post%20Helper.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Trading%20Post%20Helper.user.js
// ==/UserScript==


/*
 * Summary:
 *  - Finds all username links and adds a "Neomail" button next to it.
 *  - Button opens a new Neomail window addressed to that user.
 *  - Ensures the "Newest" radio option is always selected in search.
 *  - Uses MutationObserver to catch dynamically loaded content.
 *  - Retries selection on load until the radio button is available.
 */


(function () {
    'use strict';

    function addButtonsToUserLinks(root = document) {
        const links = root.querySelectorAll('a[href^="/randomfriend.phtml?user="]');
        links.forEach(link => {
            if (link.nextElementSibling?.classList.contains('custom-neopets-user-button')) return;

            const username = new URLSearchParams(link.href.split('?')[1]).get('user');
            if (!username) return;

            const btn = document.createElement('button');
            btn.textContent = 'Neomail';
            btn.className = 'custom-neopets-user-button';
            btn.style.marginLeft = '5px';
            btn.style.fontSize = '0.8em';
            btn.style.padding = '2px 6px';
            btn.style.cursor = 'pointer';

            btn.onclick = () => {
                window.open(`/neomessages.phtml?type=send&recipient=${encodeURIComponent(username)}`, '_blank');
            };

            link.insertAdjacentElement('afterend', btn);
        });
    }

    function checkNewestRadio() {
        const newest = document.querySelector('input[name="sort_by"][value="newest"]');
        if (newest && !newest.checked) {
            newest.checked = true;
        }
    }

    // Retry until radio exists (max ~2 seconds)
    function waitForRadioButton(retries = 20) {
        const newest = document.querySelector('input[name="sort_by"][value="newest"]');
        if (newest) {
            newest.checked = true;
        } else if (retries > 0) {
            setTimeout(() => waitForRadioButton(retries - 1), 100);
        }
    }

    window.addEventListener('load', () => {
        addButtonsToUserLinks();
        waitForRadioButton();
    });

    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (!(node instanceof HTMLElement)) return;
                addButtonsToUserLinks(node);
                checkNewestRadio();
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
