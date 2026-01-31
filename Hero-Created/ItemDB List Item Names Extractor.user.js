// ==UserScript==
// @name         ItemDB List Item Names Extractor
// @author       Hero
// @version      1.1
// @description  Extract and display item names from ItemDB lists
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://itemdb.com.br/lists/*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Extract username and slug from URL
    const pathParts = window.location.pathname.split('/');
    const username = pathParts[2];
    const slug = pathParts[3];

    if (!username || !slug) {
        console.error('Could not extract username or slug from URL');
        return;
    }

    // Create textarea
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Loading items...';
    textarea.className = 'itemdb-extractor-textarea';
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
        fontFamily: 'monospace',
        color: '#000',
        overflowY: 'scroll'
    });

    // Add scrollbar styling
    const style = document.createElement('style');
    style.textContent = `
        .itemdb-extractor-textarea::-webkit-scrollbar {
            width: 12px;
        }
        .itemdb-extractor-textarea::-webkit-scrollbar-track {
            background: #f1f1f1;
        }
        .itemdb-extractor-textarea::-webkit-scrollbar-thumb {
            background: #888;
        }
        .itemdb-extractor-textarea::-webkit-scrollbar-thumb:hover {
            background: #555;
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(textarea);

    // Fetch data from API
    const apiUrl = `https://itemdb.com.br/api/v1/lists/${username}/${slug}/itemdata`;

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const itemNames = data.map(item => item.name);
            textarea.value = itemNames.join('\n');
            textarea.placeholder = '';
        })
        .catch(error => {
            console.error('Error fetching items:', error);
            textarea.value = `Error loading items: ${error.message}`;
            textarea.style.color = 'red';
        });
})();