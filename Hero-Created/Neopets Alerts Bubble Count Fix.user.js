// ==UserScript==
// @name         Neopets Alerts Bubble Count Fix
// @author       Hero
// @version      1.4
// @description  Fix alerts bubble count on page load without flashing wrong number.
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/*
// @grant        none
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Training%20Schools%20Helper.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Training%20Schools%20Helper.user.js
// ==/UserScript==

/*
 * - Shows correct count on page load
 * - Hides flash of incorrect number
 * - Updates immediately when alerts list appears
 */

(function() {
    'use strict';

    const notif = document.getElementById("NavAlertsNotif");
    if (!notif) return;

    // Hide bubble immediately to prevent flash
    notif.style.visibility = "hidden";

    function updateCount() {
        const alertsContainer = document.querySelector("#alerts ul");
        if (!alertsContainer) return;

        const count = alertsContainer.querySelectorAll("li").length;
        if (count > 0) {
            notif.textContent = count;
            notif.style.display = "block";
        } else {
            notif.textContent = "";
            notif.style.display = "none";
        }

        notif.style.visibility = "visible"; // show bubble after correct count
    }

    // Observe the document for the alerts list to appear
    const observer = new MutationObserver(() => {
        const alertsContainer = document.querySelector("#alerts ul");
        if (alertsContainer) {
            updateCount();
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
