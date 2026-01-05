// ==UserScript==
// @name         Neopets Edit Pet Description Better View
// @author       Hero
// @version      1.2
// @description  Replace the pet carousel with a full grid and adds 'View Lookup' links.
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/neopet_desc.phtml*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    window.addEventListener("load", () => {
        const carousel = document.querySelector("#bxwrap");
        const petList = document.querySelector("#bxlist");
        if (!carousel || !petList) return;

        // Collect unique pet elements
        const petItems = [...petList.querySelectorAll("li")]
            .filter(li => !li.classList.contains("bx-clone"));

        // Create grid wrapper
        const grid = document.createElement("div");
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(160px, 1fr))";
        grid.style.gap = "20px";
        grid.style.justifyItems = "center";
        grid.style.margin = "20px 0";

        // Extract current pet from URL (?edit_petname=...)
        const currentPet = new URLSearchParams(window.location.search).get("edit_petname");

        petItems.forEach(li => {
            const anchor = li.querySelector("a");
            const img = li.querySelector("img");
            const nameDiv = li.querySelector("div");
            if (!anchor || !img || !nameDiv) return;

            const petName = nameDiv.textContent.trim();
            const petBox = document.createElement("div");
            petBox.style.textAlign = "center";

            // Recreate clickable pet link (to load editdesc page)
            const petLink = anchor.cloneNode(true);
            const petImg = petLink.querySelector("img");
            if (petImg) {
                petImg.style.border = "2px solid #ccc";
                petImg.style.borderRadius = "0";
            }
            petBox.appendChild(petLink);

            // Add "View Lookup" link
            const lookup = document.createElement("a");
            lookup.href = `https://www.neopets.com/petlookup.phtml?pet=${encodeURIComponent(petName)}`;
            lookup.textContent = "View Lookup";
            lookup.target = "_blank";
            lookup.rel = "noopener noreferrer";
            lookup.style.display = "inline-block";
            lookup.style.marginTop = "4px";
            lookup.style.fontSize = "0.9em";
            lookup.style.color = "#0077cc";
            lookup.style.textDecoration = "none";
            lookup.onmouseover = () => lookup.style.textDecoration = "underline";
            lookup.onmouseout = () => lookup.style.textDecoration = "none";
            petBox.appendChild(lookup);

            grid.appendChild(petBox);
        });

        // Replace carousel with the new grid
        carousel.replaceWith(grid);
    });
})();
