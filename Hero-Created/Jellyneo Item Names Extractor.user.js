// ==UserScript==
// @name         Jellyneo Item Names Extractor
// @author       Hero
// @version      1.2
// @description  Extract all item names from Jellyneo result pages and show copyable list in right hand corner.
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://items.jellyneo.net/*
// @grant        none
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/blob/main/Hero-Created/Jellyneo%20Item%20Names%20Extractor.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/blob/main/Hero-Created/Jellyneo%20Item%20Names%20Extractor.user.js
// ==/UserScript==


/*
 * Summary:
 *  - Extracts all item names from Jellyneo result pages.
 *  - Displays a floating, copyable textarea in the bottom-right corner containing all item names.
 */

(function () {
    'use strict';

    window.addEventListener('load', () => {
        const itemNames = [];

        // Handle old UL-based layout
        document.querySelectorAll('ul.item-block-grid li').forEach(li => {
            const links = li.querySelectorAll('a.no-link-icon');
            if (links.length >= 2) {
                itemNames.push(links[1].textContent.trim());
            }
        });

        // Handle new DIV-based layout
        document.querySelectorAll('div.jnflex-grid > div').forEach(div => {
            const links = div.querySelectorAll('a.no-link-icon');
            if (links.length >= 2) {
                itemNames.push(links[1].textContent.trim());
            }
        });

        if (itemNames.length === 0) return;

        // Create and show the floating textarea
        const textarea = document.createElement('textarea');
        textarea.value = itemNames.join('\n');
        Object.assign(textarea.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '300px',
            height: '250px',
            zIndex: '9999',
            padding: '10px',
            border: '2px solid #333',
            background: '#fff',
            boxShadow: '0 0 8px rgba(0,0,0,0.3)',
            fontSize: '14px',
            fontFamily: 'monospace'
        });

        document.body.appendChild(textarea);
    });
})();
