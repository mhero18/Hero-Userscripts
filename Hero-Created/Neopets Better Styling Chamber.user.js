// ==UserScript==
// @name         Neopets Better Styling Chamber
// @version      2.2
// @description  Redesigns the Style Chamber layout: paginated pet grid, styles panel full-width below
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/stylingchamber*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    .stylechamber-container {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 12px !important;
    }

    .sc-top-row {
      display: flex !important;
      flex-direction: row !important;
      gap: 12px !important;
      align-items: flex-start !important;
    }

    .stylechamber-pets {
      flex: 0 0 50% !important;
      min-width: 0 !important;
      max-width: 50% !important;
      box-sizing: border-box !important;
    }

    .sc-pet-list {
      display: none !important;
    }

    /* Paginated pet grid */
    .sc-pet-grid {
      display: grid !important;
      grid-template-columns: repeat(3, 1fr) !important;
      gap: 4px !important;
      margin-top: 8px !important;
    }

    .sc-pet-grid-item {
      cursor: pointer !important;
      border-radius: 4px !important;
      overflow: hidden !important;
      border: 2px solid transparent !important;
      box-sizing: border-box !important;
    }

    .sc-pet-grid-item:hover {
      border-color: #aaa !important;
    }

    .sc-pet-grid-item.active {
      border-color: #f5a623 !important;
    }

    .sc-pet-grid-item img {
      width: 100% !important;
      height: auto !important;
      display: block !important;
    }

    /* Pagination controls */
    .sc-pagination {
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      gap: 8px !important;
      margin-top: 6px !important;
      font-size: 13px !important;
    }

    .sc-pagination button {
      cursor: pointer !important;
      padding: 2px 10px !important;
      border-radius: 4px !important;
      border: 1px solid #ccc !important;
      background: #f0f0f0 !important;
      font-size: 13px !important;
    }

    .sc-pagination button:disabled {
      opacity: 0.4 !important;
      cursor: default !important;
    }

    /* Pet preview */
    .stylechamber-petview {
      flex: 0 0 50% !important;
      position: sticky !important;
      top: 0 !important;
      align-self: flex-start !important;
      box-sizing: border-box !important;
    }

    /* Styles panel full width below */
    .stylechamber-styles {
      width: 100% !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      box-sizing: border-box !important;
    }

    .sc-styles {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }

    .sc-style-list {
      display: flex !important;
      flex-wrap: wrap !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      gap: 6px !important;
    }

    .sc-item {
      flex: 0 0 calc(10% - 6px) !important;
      min-width: 80px !important;
      max-width: 120px !important;
      box-sizing: border-box !important;
    }
  `);

  const PAGE_SIZE = 9;

  function buildPetGrid(petsSection) {
    if (petsSection.querySelector('.sc-pet-grid')) return;

    const slides = [...petsSection.querySelectorAll('.carousel__slide:not(.carousel__slide--clone)')];
    if (!slides.length) return;

    let page = 0;
    const totalPages = Math.ceil(slides.length / PAGE_SIZE);

    const grid = document.createElement('div');
    grid.className = 'sc-pet-grid';

    const pagination = document.createElement('div');
    pagination.className = 'sc-pagination';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '←';
    const pageLabel = document.createElement('span');
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '→';

    pagination.appendChild(prevBtn);
    pagination.appendChild(pageLabel);
    pagination.appendChild(nextBtn);

    function render() {
      grid.innerHTML = '';
      const start = page * PAGE_SIZE;
      const pageSlides = slides.slice(start, start + PAGE_SIZE);

      pageSlides.forEach(slide => {
        const origImg = slide.querySelector('img.sc-pet');
        if (!origImg) return;

        const item = document.createElement('div');
        item.className = 'sc-pet-grid-item' + (origImg.classList.contains('selected') ? ' active' : '');
        item.title = origImg.alt;

        const img = document.createElement('img');
        img.src = origImg.src;
        img.alt = origImg.alt;

        item.addEventListener('click', () => {
          origImg.click();
          petsSection.querySelectorAll('.sc-pet-grid-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
        });

        item.appendChild(img);
        grid.appendChild(item);
      });

      pageLabel.textContent = `${page + 1} / ${totalPages}`;
      prevBtn.disabled = page === 0;
      nextBtn.disabled = page === totalPages - 1;
    }

    prevBtn.addEventListener('click', () => { page--; render(); });
    nextBtn.addEventListener('click', () => { page++; render(); });

    const header = petsSection.querySelector('.sc-section-header');
    header ? header.after(grid, pagination) : petsSection.append(grid, pagination);

    render();
  }

  function restructure() {
    const container = document.querySelector('.stylechamber-container');
    if (!container) return;

    if (!container.querySelector('.sc-top-row')) {
      const pets = container.querySelector('.stylechamber-pets');
      const petview = container.querySelector('.stylechamber-petview');
      if (!pets || !petview) return;

      const topRow = document.createElement('div');
      topRow.className = 'sc-top-row';
      container.insertBefore(topRow, pets);
      topRow.appendChild(pets);
      topRow.appendChild(petview);
    }

    const petsSection = container.querySelector('.stylechamber-pets');
    if (petsSection) buildPetGrid(petsSection);
  }

  const observer = new MutationObserver(() => restructure());
  observer.observe(document.body, { childList: true, subtree: true });
  restructure();

})();