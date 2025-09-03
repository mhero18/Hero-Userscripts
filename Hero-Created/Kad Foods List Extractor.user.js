// ==UserScript==
// @name         Kad Foods List Extractor
// @author       Hero
// @version      1.3
// @description  Collects food items from the Kadoatery page and displays them in a copyable textbox.
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/games/kadoatery*
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Kad%20Foods%20List%20Extractor.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Kad%20Foods%20List%20Extractor.user.js
// @grant        none
// ==/UserScript==

/*
 * - Parses the Kadoatery page for food items (after "You should give it").
 * - Stores the list in localStorage so it persists across page loads.
 * - Floating panel in bottom-right with:
 *    - Toggle button (minimized by default)
 *    - Copyable textarea of foods
 *    - Reset button to clear saved list (requires refresh to repopulate)
 */

(function() {
    'use strict';

    const STORAGE_KEY = "kadFoodList";

    // Load saved list
    let foodList = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    // If list is empty, parse the page
    if (foodList.length === 0) {
        const regex = /You should give it\s*<br><strong>(.*?)<\/strong>/gi;
        let match;
        const html = document.body.innerHTML;
        while ((match = regex.exec(html)) !== null) {
            let food = match[1].trim();
            foodList.push(food); // allow duplicates
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(foodList));
    }

    // Create floating UI container
    const container = document.createElement("div");
    Object.assign(container.style, {
        position: "fixed",
        bottom: "30px",
        right: "20px",
        zIndex: "9999",
        background: "#ffffff",
        border: "1px solid #ccc",
        padding: "10px",
        fontSize: "13px",
        maxWidth: "260px",
        boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
        borderRadius: "10px",
        fontFamily: "Arial, sans-serif"
    });

    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "Show Foods";
    Object.assign(toggleBtn.style, {
        display: "block",
        width: "100%",
        marginBottom: "8px",
        padding: "8px",
        background: "#4CAF50",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "bold",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
    });
    toggleBtn.addEventListener("mouseover", () => toggleBtn.style.background = "#45a049");
    toggleBtn.addEventListener("mouseout", () => toggleBtn.style.background = "#4CAF50");

    // Textbox
    const textarea = document.createElement("textarea");
    textarea.value = foodList.join("\n");
    Object.assign(textarea.style, {
        width: "240px",
        height: "120px",
        display: "none",
        resize: "none",
        borderRadius: "6px",
        border: "1px solid #bbb",
        padding: "6px",
        fontSize: "13px",
        fontFamily: "monospace"
    });

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.textContent = "Reset List";
    Object.assign(resetBtn.style, {
        marginTop: "8px",
        padding: "6px",
        background: "#e53935",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "bold",
        display: "none",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
    });
    resetBtn.addEventListener("mouseover", () => resetBtn.style.background = "#d32f2f");
    resetBtn.addEventListener("mouseout", () => resetBtn.style.background = "#e53935");

    // Toggle logic
    toggleBtn.addEventListener("click", () => {
        const isHidden = textarea.style.display === "none";
        textarea.style.display = isHidden ? "block" : "none";
        resetBtn.style.display = isHidden ? "block" : "none";
        toggleBtn.textContent = isHidden ? "Hide Foods" : "Show Foods";
    });

    // Reset logic
    resetBtn.addEventListener("click", () => {
        localStorage.removeItem(STORAGE_KEY);
        textarea.value = "";
        foodList = [];
    });

    // Append UI
    container.appendChild(toggleBtn);
    container.appendChild(textarea);
    container.appendChild(resetBtn);
    document.body.appendChild(container);


})();
