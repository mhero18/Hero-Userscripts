// ==UserScript==
// @name         Jellyneo Add DTI and ItemDB Links
// @version      1.1
// @description  Add Dress to Impress and ItemDB links to Jellyneo item pages
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @author       Hero
// @match        *://items.jellyneo.net/item/*
// ==/UserScript==
(function() {
    'use strict';

    // Get the item name
    const h1 = document.querySelector('h1');
    if (!h1) {
        return;
    }
    const itemName = h1.textContent.trim();

    // Find the sidebar list
    const sidebarList = document.querySelector('.find-this-item ul');
    if (!sidebarList) {
        return;
    }

    // Check if item is wearable
    const closetLi = document.querySelector('a[href*="closet.phtml"]')?.closest('li');
    const isWearable = !!closetLi;

    if (isWearable) {
        // Create the DTI link
        const dtiUrl = `https://impress.openneo.net/items?q=${encodeURIComponent(itemName)}`;
        const dtiImage = 'https://images.neopets.com/items/clo_shoyru_dappermon.gif';

        const dtiLi = document.createElement('li');
        const dtiImageLink = document.createElement('a');
        dtiImageLink.href = dtiUrl;
        dtiImageLink.className = 'no-link-icon';
        dtiImageLink.target = '_blank';
        dtiImageLink.rel = 'noopener noreferrer';
        const dtiImg = document.createElement('img');
        dtiImg.src = dtiImage;
        dtiImg.className = 'page-icon small';
        dtiImg.alt = 'View in Dress to Impress';
        dtiImg.title = 'View in Dress to Impress';
        dtiImageLink.appendChild(dtiImg);
        dtiLi.appendChild(dtiImageLink);
        const dtiTextLink = document.createElement('a');
        dtiTextLink.href = dtiUrl;
        dtiTextLink.target = '_blank';
        dtiTextLink.rel = 'noopener noreferrer';
        dtiTextLink.textContent = 'Dress to Impress';
        dtiLi.appendChild(dtiTextLink);

        sidebarList.appendChild(dtiLi);
    }

    // Create the ItemDB link
    const itemDbSlug = itemName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const itemDbUrl = `https://itemdb.com.br/item/${itemDbSlug}`;
    const itemDbImage = 'https://images.neopets.com/themes/h5/basic/images/v3/quickstock-icon.svg';

    const itemDbLi = document.createElement('li');
    const itemDbImageLink = document.createElement('a');
    itemDbImageLink.href = itemDbUrl;
    itemDbImageLink.className = 'no-link-icon';
    itemDbImageLink.target = '_blank';
    itemDbImageLink.rel = 'noopener noreferrer';
    const itemDbImg = document.createElement('img');
    itemDbImg.src = itemDbImage;
    itemDbImg.className = 'page-icon small';
    itemDbImg.alt = 'View in ItemDB';
    itemDbImg.title = 'View in ItemDB';
    itemDbImageLink.appendChild(itemDbImg);
    itemDbLi.appendChild(itemDbImageLink);
    const itemDbTextLink = document.createElement('a');
    itemDbTextLink.href = itemDbUrl;
    itemDbTextLink.target = '_blank';
    itemDbTextLink.rel = 'noopener noreferrer';
    itemDbTextLink.textContent = 'ItemDB';
    itemDbLi.appendChild(itemDbTextLink);

    sidebarList.appendChild(itemDbLi);
})();