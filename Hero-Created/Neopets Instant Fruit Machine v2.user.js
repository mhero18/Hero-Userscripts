// ==UserScript==
// @name         Neopets Instant Fruit Machine v2
// @version      2.0
// @author       Hero (special thanks to Flutterz for original)
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @description  Skips the Fruit Machine animation
// @match        *://*.neopets.com/desert/fruit/index.phtml*
// @grant        none
// @run-at       document-start
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Instant%20Fruit%20Machine%20v2.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Instant%20Fruit%20Machine%20v2.user.js
// ==/UserScript==


(function() {
    'use strict';

    function installInstantFruitMachine() {
        const fruitMachine = window.FruitMachine;
        if (!fruitMachine?.runReels) return false;
        if (fruitMachine.runReels.instantFruitMachinePatched) return true;

        function instantRunReels(mappedCards, done) {
            document.querySelectorAll('.fm-reel__strip').forEach((strip, index) => {
                const fruit = mappedCards[index];
                if (!Number.isFinite(fruit)) return;

                // show final reveal state immediately
                strip.style.animation = 'none';
                strip.style.transition = 'none';
                strip.style.transform = `translateY(-${(fruit * 100) / 7}%)`;
            });

            // Let Neopets run its normal result code immediately
            requestAnimationFrame(done);
        }

        instantRunReels.instantFruitMachinePatched = true;
        fruitMachine.runReels = instantRunReels;
        return true;
    }

    // FruitMachine is loaded after this userscript
    const installTimer = window.setInterval(() => {
        if (installInstantFruitMachine()) window.clearInterval(installTimer);
    }, 25);
})();
