// ==UserScript==
// @name         Neopets Game Trophies Name Extractor
// @author       Hero
// @version      1.5
// @description  Extract game names from userlookup games trophies and displays in copyable textbox.
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        https://www.neopets.com/userlookup.phtml*
// @grant        none
// ==/UserScript==


/*
 * Summary:
 *  - Scans userlookup trophy table for game trophy names.
 *  - Extracts game names from text or bolded elements.
 *  - Cleans up extra text (e.g., "CHAMPION!!!").
 *  - Collects unique game names, sorts them alphabetically.
 *  - Displays results in a fixed, copyable textarea on the page.
 */


(function() {
    'use strict';

    window.addEventListener('load', () => {
        const trophyCells = document.querySelectorAll('td.trophy_cell');
        const games = new Set();

        trophyCells.forEach(cell => {
            const text = cell.innerText.trim();

            // Case 1: "place at \n Game Name!!"
            const match = text.match(/at\s+(.+?)(!+)?$/i);
            if (match && match[1]) {
                games.add(cleanTitle(match[1]));
            } else {
                // Case 2: bolded title like "Poetry Competition 6xCHAMPION!!!"
                const bold = cell.querySelector('b');
                if (bold) {
                    let boldText = bold.textContent;

                    // regex here
                    boldText = boldText.replace(/\d*x?CHAMPION!+$/i, '').trim();
                    if (boldText) games.add(cleanTitle(boldText));
                }
            }
        });

        const sorted = Array.from(games).sort();
        if (sorted.length > 0) {
            const textarea = document.createElement('textarea');
            textarea.id = 'game-name-box';
            textarea.value = sorted.join("\n");
            textarea.readOnly = true;
            textarea.style = `
                position: fixed;
                bottom: 10px;
                right: 10px;
                width: 250px;
                height: 200px;
                z-index: 9999;
                background: #fffbe7;
                border: 1px solid #aaa;
                border-radius: 6px;
                padding: 8px;
                font-size: 12px;
                font-family: monospace;
                box-shadow: 0 0 5px rgba(0,0,0,0.2);
                white-space: pre;
                overflow: auto;
            `;
            document.body.appendChild(textarea);
        }
    });

    function cleanTitle(title) {
        return title.replace(/!+$/, '').trim();
    }
})();
