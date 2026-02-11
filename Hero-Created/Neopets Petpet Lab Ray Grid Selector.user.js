// ==UserScript==
// @name         Neopets Petpet Lab Ray Grid Selector
// @version      1.0
// @description  Replace the dropdown with a visual grid of petpets
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/petpetlab.phtml*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Wait for page to load
    function init() {
        const container = document.getElementById('PetPetLabContent');
        if (!container) return;

        // Find the dropdown
        const dropdown = container.querySelector('select.h5-input');
        if (!dropdown) return;

        // Find all hidden petpet divs
        const petpetDivs = container.querySelectorAll('.ppl-petpet.ppl-hidden');
        if (petpetDivs.length === 0) return;

        // Extract petpet data
        const petpets = Array.from(petpetDivs).map(div => {
            const img = div.querySelector('img');
            const id = div.id.replace('PPL', '');
            return {
                id: id,
                name: img.alt,
                imageUrl: img.src,
                sound: div.querySelector('p').textContent
            };
        });

        // Create grid container
        const gridContainer = document.createElement('div');
        gridContainer.id = 'petpet-grid-container';
        gridContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 10px;
            margin: 20px auto;
            max-width: 800px;
        `;

        // Create grid items
        petpets.forEach(petpet => {
            const gridItem = document.createElement('div');
            gridItem.className = 'petpet-grid-item';
            gridItem.dataset.petpetId = petpet.id;
            gridItem.style.cssText = `
                border: 3px solid #ccc;
                border-radius: 8px;
                padding: 10px;
                text-align: center;
                cursor: pointer;
                background: white;
            `;

            gridItem.innerHTML = `
                <img src="${petpet.imageUrl}" alt="${petpet.name}" style="max-width: 80px; max-height: 80px; display: block; margin: 0 auto 8px;">
                <div style="font-weight: bold; font-size: 12px; color: #333;">${petpet.name}</div>
                <div style="font-size: 10px; color: #666; font-style: italic;">${petpet.sound}</div>
            `;

            // Add click handler
            gridItem.addEventListener('click', function() {
                // Remove selection from all items
                document.querySelectorAll('.petpet-grid-item').forEach(item => {
                    item.classList.remove('selected');
                    item.style.borderColor = '#ccc';
                    item.style.backgroundColor = 'white';
                });

                // Select this item
                this.classList.add('selected');
                this.style.borderColor = '#00cc00';
                this.style.backgroundColor = '#f0fff0';

                // Update the hidden dropdown
                dropdown.value = petpet.id;

                // Trigger the change event to enable the zap button
                const event = new Event('change', { bubbles: true });
                dropdown.dispatchEvent(event);
            });

            gridContainer.appendChild(gridItem);
        });

        // Hide the original dropdown
        dropdown.style.display = 'none';

        // Insert grid before the dropdown
        dropdown.parentNode.insertBefore(gridContainer, dropdown);

        // Styling
        const style = document.createElement('style');
        style.textContent = `
            .petpet-grid-item {
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .petpet-grid-item.selected {
                box-shadow: 0 4px 12px rgba(0,200,0,0.3);
            }
        `;
        document.head.appendChild(style);
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();