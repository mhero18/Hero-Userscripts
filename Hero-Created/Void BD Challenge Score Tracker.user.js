// ==UserScript==
// @name         Void BD Challenge Score Tracker
// @version      1.3
// @author       Hero
// @description  Calculates current BD Challenge score for The Void Within Battledome Challenge.
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/dome/record.phtml*
// @grant        none
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/blob/main/Hero-Created/Void%20BD%20Challenge%20Score%20Tracker.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/blob/main/Hero-Created/Void%20BD%20Challenge%20Score%20Tracker.user.js
// ==/UserScript==


/*
 * DEFINE YOUR STARTING_SCORE BELOW.
 * Get your starting score from your record.
 *
 * total points = current score - starting score
 */

(function () {
    'use strict';

    const STARTING_SCORE = 4224506 // <-- hardcode your starting score here
    const SCORE_ELEMENT_ID = "BDFR_totalScore";

    function waitForScore() {
        const scoreEl = document.getElementById(SCORE_ELEMENT_ID);
        const container = document.querySelector(".battledome-container");

        if (!scoreEl || !container) {
            requestAnimationFrame(waitForScore);
            return;
        }

        // Get current score
        let currentScore = parseInt(scoreEl.textContent.replace(/,/g, ''), 10);

        // Calculate earned points
        let totalPoints = currentScore - STARTING_SCORE;

        // Create display
        let display = document.createElement("div");
        display.style.textAlign = "center";
        display.style.fontWeight = "bold";
        display.style.fontSize = "16px";
        display.style.marginTop = "12px";
        display.style.color = "black";
        display.style.fontFamily = `"MuseoSansRounded500", "Arial", sans-serif`;
        display.innerHTML = `
            VOID PLOT BATTLEDOME CHALLENGE<br>
            Starting Score: ${STARTING_SCORE.toLocaleString()}<br>
            Current Score: ${currentScore.toLocaleString()}<br>
            <span style="color: green;">Total Points: ${totalPoints.toLocaleString()}</span>
        `;

        // Insert after container
        container.insertAdjacentElement("afterend", display);
    }

    waitForScore();
})();
