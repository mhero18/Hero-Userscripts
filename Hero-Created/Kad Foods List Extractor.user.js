// ==UserScript==
// @name         Kad Foods List Extractor
// @author       Hero
// @version      1.5
// @description  Collects food items from the Kadoatery page and displays them in a copyable panel with manual collection button.
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/games/kadoatery*
// @grant        none
// ==/UserScript==

/*
 * - Manual "Collect Foods" button to parse current hungry Kads on screen.
 *   Clears previous list and adds everything visible on the page.
 * - Stores the list in localStorage so it persists across page loads.
 * - Floating panel in bottom-right with:
 *    - Toggle button (closed by default)
 *    - Copyable textarea of foods
 *    - Collect Foods button to refresh the list
 */

(function() {
    'use strict';

    const STORAGE_KEY = "kadFoodList";

    // Load saved list
    let foodList = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

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

    // Textarea
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

    // Collect Foods button
    const collectBtn = document.createElement("button");
    collectBtn.textContent = "Collect Foods";
    Object.assign(collectBtn.style, {
        marginTop: "6px",
        padding: "6px",
        background: "#2196F3",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "bold",
        display: "none",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
    });
    collectBtn.addEventListener("mouseover", () => collectBtn.style.background = "#1976D2");
    collectBtn.addEventListener("mouseout", () => collectBtn.style.background = "#2196F3");

    collectBtn.addEventListener("click", () => {
        // Clear previous list and parse new
        foodList = [];
        const regex = /You should give it\s*<br><strong>(.*?)<\/strong>/gi;
        let match;
        const html = document.body.innerHTML;
        while ((match = regex.exec(html)) !== null) {
            let food = match[1].trim();
            foodList.push(food);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(foodList));
        textarea.value = foodList.join("\n");
    });

    // Toggle logic
    toggleBtn.addEventListener("click", () => {
        const isHidden = textarea.style.display === "none";
        textarea.style.display = isHidden ? "block" : "none";
        collectBtn.style.display = isHidden ? "block" : "none";
        toggleBtn.textContent = isHidden ? "Hide Foods" : "Show Foods";
    });

    // Append UI
    container.appendChild(toggleBtn);
    container.appendChild(textarea);
    container.appendChild(collectBtn);
    document.body.appendChild(container);

})();
