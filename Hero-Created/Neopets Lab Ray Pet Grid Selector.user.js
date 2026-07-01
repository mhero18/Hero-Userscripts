// ==UserScript==
// @name         Neopets Lab Ray Pet Grid Selector
// @version      1.5
// @description  Replace the Lab Ray pet dropdown with a visual pet grid
// @author       Hero (thanks to sn0tspoon /nadinejun0 for original)
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/lab.phtml*
// @grant        none
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Lab%20Ray%20Pet%20Grid%20Selector.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Lab%20Ray%20Pet%20Grid%20Selector.user.js
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        selectors: {
            app: '#lab-vue-app',
            content: '.lab-content',
            selectRow: '.lab-select-row',
            select: 'select.lab-select',
            triggerLabel: '.lab-as-trigger-label',
            actions: '.lab-actions',
            resultFiredPet: '.lab-result-fired b',
            resultPetImage: '.lab-pet-preview img'
        },
        grid: {
            columns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: '15px',
            maxWidth: '800px',
            padding: '15px',
            margin: '20px auto'
        },
        card: {
            width: '130px',
            height: '145px',
            padding: '10px',
            borderRadius: '3px',
            borderColor: '#4169E1',
            borderWidth: '2px',
            backgroundColor: '#F0F8FF',
            selectedBorderColor: '#FFD700',
            hoverBorderColor: '#9370DB',
            hoverBackgroundColor: '#E6E6FA'
        },
        colors: {
            neoText: '#000080'
        },
        delays: {
            init: 250
        }
    };

    const ZapAgain = {
        init() {
            const content = document.querySelector(CONFIG.selectors.content);
            if (!content || content.querySelector('#hero-lab-zap-again')) return;

            const petName = this.getResultPetName(content);
            const backAction = this.getBackToLabAction(content);
            if (!petName || !backAction) return;

            const action = document.createElement('div');
            action.className = 'lab-actions hero-zap-again-actions';

            const button = document.createElement('button');
            button.id = 'hero-lab-zap-again';
            button.className = 'np-button button-default__2020 button-yellow__2020';
            button.type = 'button';
            button.textContent = 'Zap Again';
            button.addEventListener('click', () => this.zapAgain(button, petName));

            action.appendChild(button);
            backAction.insertAdjacentElement('beforebegin', action);
        },

        getResultPetName(content) {
            const firedPet = content.querySelector(CONFIG.selectors.resultFiredPet);
            if (firedPet?.textContent.trim()) return firedPet.textContent.trim();

            const preview = content.querySelector(CONFIG.selectors.resultPetImage);
            return preview?.alt?.trim() || '';
        },

        getBackToLabAction(content) {
            return Array.from(content.querySelectorAll(CONFIG.selectors.actions))
                .find(action => action.textContent.includes('Back to the Lab'));
        },

        getRefCk() {
            const input = document.querySelector('input[name="_ref_ck"]');
            if (input?.value) return input.value;

            const meta = document.querySelector('meta[name="_ref_ck"], meta[name="ref_ck"]');
            if (meta?.content) return meta.content;

            const windowToken = window._ref_ck || window.ref_ck || window._refCk;
            if (windowToken) return windowToken;

            const pageHtml = document.documentElement.innerHTML;
            const match = pageHtml.match(/["']?_ref_ck["']?\s*[:=]\s*["']([^"']+)["']/);
            return match?.[1] || '';
        },

        async zapAgain(button, petName) {
            const refCk = this.getRefCk();
            if (!refCk) {
                window.alert('Could not find the Lab Ray request token. Please use Back to the Lab for this zap.');
                return;
            }

            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = 'Zapping...';

            try {
                const response = await fetch('/np-templates/ajax/labray/zap.php', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({
                        chosen: petName,
                        _ref_ck: refCk
                    })
                });

                const text = await response.text();
                if (!response.ok) throw new Error(`Zap request failed (${response.status})`);

                this.renderZapResponse(text);
            } catch (error) {
                console.error('Lab Ray Grid: Zap Again failed', error);
                button.disabled = false;
                button.textContent = originalText;
                window.alert('Zap Again failed. Please use Back to the Lab for this zap.');
            }
        },

        renderZapResponse(text) {
            let data = null;
            try {
                data = JSON.parse(text);
            } catch (error) {
                // The endpoint may return HTML instead of JSON.
            }

            if (data?.success === false || data?.error === true) {
                console.warn('Lab Ray Grid: Zap Again returned an error', data?.errMsg || data?.message || data);
                window.location.reload();
                return;
            }

            const content = document.querySelector(CONFIG.selectors.content);
            const html = data?.html || data?.content || data?.template || data?.body || (!data && text.includes('<') ? text : '');

            if (content && html) {
                content.innerHTML = html;
                this.init();
                return;
            }

            if (data?.redirect) {
                window.location.href = data.redirect;
                return;
            }

            if (data?.errMsg || data?.message) {
                window.alert(data.errMsg || data.message);
                return;
            }

            window.location.reload();
        }
    };
    const PetGrid = {
        selectedPet: '',
        cards: new Map(),

        init() {
            const content = document.querySelector(CONFIG.selectors.content);
            const selectRow = document.querySelector(CONFIG.selectors.selectRow);
            const select = document.querySelector(CONFIG.selectors.select);

            if (!content || !selectRow || !select || select.dataset.heroGridReady === 'true') return;

            const pets = this.getPets(select);
            if (pets.length === 0) return;

            select.dataset.heroGridReady = 'true';
            this.selectedPet = select.value;

            const grid = this.createGrid(pets, select);
            selectRow.style.display = 'none';
            selectRow.insertAdjacentElement('afterend', grid);

            select.addEventListener('change', () => {
                this.selectedPet = select.value;
                this.syncSelection(select.value);
            });

            this.syncSelection(select.value);
        },

        getPets(select) {
            return Array.from(select.options)
                .filter(option => option.value && !option.disabled)
                .map(option => ({
                    name: option.value,
                    label: option.textContent.trim() || option.value,
                    imageUrl: `https://pets.neopets.com/cpn/${encodeURIComponent(option.value)}/2/2.png`
                }));
        },

        createGrid(pets, select) {
            const grid = document.createElement('div');
            grid.id = 'hero-lab-ray-pet-grid';
            grid.style.cssText = `
                display: grid;
                grid-template-columns: ${CONFIG.grid.columns};
                gap: ${CONFIG.grid.gap};
                justify-content: center;
                padding: ${CONFIG.grid.padding};
                margin: ${CONFIG.grid.margin};
                max-width: ${CONFIG.grid.maxWidth};
            `;

            pets.forEach(pet => {
                const card = this.createCard(pet, select);
                this.cards.set(pet.name, card);
                grid.appendChild(card);
            });

            return grid;
        },

        createCard(pet, select) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'hero-lab-pet-card';
            card.dataset.petName = pet.name;
            card.setAttribute('aria-label', `Select ${pet.label}`);
            card.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: ${CONFIG.card.padding};
                border: ${CONFIG.card.borderWidth} solid ${CONFIG.card.borderColor};
                border-radius: ${CONFIG.card.borderRadius};
                cursor: pointer;
                transition: all 0.3s ease;
                background: linear-gradient(135deg, ${CONFIG.card.backgroundColor} 0%, #ffffff 100%);
                position: relative;
                width: ${CONFIG.card.width};
                height: ${CONFIG.card.height};
                font-family: Arial, sans-serif;
                box-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                box-sizing: border-box;
                appearance: none;
            `;

            const imageWrap = document.createElement('div');
            imageWrap.style.cssText = `
                width: 105px;
                height: 82px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 8px;
                pointer-events: none;
            `;

            const image = document.createElement('img');
            image.src = pet.imageUrl;
            image.alt = pet.label;
            image.loading = 'lazy';
            image.style.cssText = `
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
            `;

            const label = document.createElement('div');
            label.textContent = pet.label;
            label.style.cssText = `
                font-size: 11px;
                text-align: center;
                color: ${CONFIG.colors.neoText};
                font-weight: bold;
                line-height: 1.2;
                font-family: Arial, sans-serif;
                text-shadow: 1px 1px 0 rgba(255,255,255,0.8);
                overflow-wrap: anywhere;
                pointer-events: none;
            `;

            const overlay = document.createElement('div');
            overlay.className = 'hero-lab-selected-overlay';
            overlay.style.cssText = `
                position: absolute;
                top: -2px;
                left: -2px;
                right: -2px;
                bottom: -2px;
                border: 4px solid ${CONFIG.card.selectedBorderColor};
                border-radius: ${CONFIG.card.borderRadius};
                background-color: rgba(255, 215, 0, 0.1);
                display: none;
                box-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
                pointer-events: none;
            `;

            imageWrap.appendChild(image);
            card.appendChild(imageWrap);
            card.appendChild(label);
            card.appendChild(overlay);

            card.addEventListener('click', () => this.selectPet(pet.name, select));

            return card;
        },

        selectPet(petName, select) {
            select.value = petName;
            this.selectedPet = petName;
            this.syncSelectUi(petName);
            this.syncSelection(petName);

            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        },

        syncSelectUi(petName) {
            const triggerLabel = document.querySelector(CONFIG.selectors.triggerLabel);
            if (triggerLabel) {
                triggerLabel.textContent = petName || 'Select Pet';
                triggerLabel.classList.toggle('is-placeholder', !petName);
            }
        },

        syncSelection(petName) {
            this.cards.forEach((card, name) => {
                const selected = name === petName;
                const overlay = card.querySelector('.hero-lab-selected-overlay');

                card.classList.toggle('hero-lab-pet-card-selected', selected);
                card.setAttribute('aria-pressed', String(selected));

                if (overlay) overlay.style.display = selected ? 'block' : 'none';
                if (!selected) {
                    card.style.background = `linear-gradient(135deg, ${CONFIG.card.backgroundColor} 0%, #ffffff 100%)`;
                    card.style.borderColor = CONFIG.card.borderColor;
                }
            });
        },

        observe() {
            const app = document.querySelector(CONFIG.selectors.app) || document.body;
            const observer = new MutationObserver(() => {
                this.init();
                ZapAgain.init();
            });
            observer.observe(app, { childList: true, subtree: true });
        },

        addStyles() {
            if (document.getElementById('hero-lab-ray-pet-grid-style')) return;

            const style = document.createElement('style');
            style.id = 'hero-lab-ray-pet-grid-style';
            style.textContent = `
                .hero-lab-pet-card:hover,
                .hero-lab-pet-card:focus-visible {
                    border-color: ${CONFIG.card.hoverBorderColor} !important;
                    background: linear-gradient(135deg, ${CONFIG.card.hoverBackgroundColor} 0%, #ffffff 100%) !important;
                    outline: none;
                }

                .hero-lab-pet-card-selected {
                    background: linear-gradient(135deg, #FFFACD 0%, #ffffff 100%) !important;
                    border-color: ${CONFIG.card.selectedBorderColor} !important;
                }
            `;
            document.head.appendChild(style);
        },

        start() {
            this.addStyles();
            this.init();
            ZapAgain.init();
            this.observe();
        }
    };

    function initWhenReady() {
        window.setTimeout(() => PetGrid.start(), CONFIG.delays.init);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWhenReady);
    } else {
        initWhenReady();
    }
})();
