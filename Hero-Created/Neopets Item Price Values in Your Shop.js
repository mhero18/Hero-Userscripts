// ==UserScript==
// @name         Neopets Item Price Values in Your Shop
// @author       Hero
// @version      1.0.1
// @description  Fetches prices from itemDB for the items in Your Shop.
// @match        *://www.neopets.com/market.phtml*
// @grant        GM_xmlhttpRequest
// @connect      itemdb.com.br
// ==/UserScript==

/*
 * Summary:
 *  - Collects all item IDs from "Your Shop" page.
 *  - Fetches current item prices from itemDB.com.br via API.
 *  - Displays each item's price below its name in red text.
 *  - Calculates and displays the total value of all shop items on that page.
 *  - Total is only for that page. Each page is its own sum.
 */

(function () {
  'use strict';

  // Get item IDs
  const idInputs = Array.from(document.querySelectorAll('input[name^="obj_id_"]'));
  const idToCellMap = {};

  idInputs.forEach(input => {
    const itemId = parseInt(input.value);
    const row = input.closest('tr');
    const nameCell = row?.querySelector('td b')?.parentElement;
    if (itemId && nameCell) {
      idToCellMap[itemId] = nameCell;
    }
  });

  const itemIds = Object.keys(idToCellMap).map(Number);
  if (itemIds.length === 0) return;

  // Fetch prices from ItemDB
  GM_xmlhttpRequest({
    method: 'POST',
    url: 'https://itemdb.com.br/api/v1/items/many',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ item_id: itemIds }),
    onload: function (res) {
      if (res.status !== 200) {
        console.error('[ItemDB] Failed to fetch price data', res);
        return;
      }

      const itemMap = JSON.parse(res.responseText);
      let total = 0;

      Object.entries(itemMap).forEach(([id, item]) => {
        const cell = idToCellMap[parseInt(id)];
        const price = item?.price?.value;

        if (cell && price) {
          total += price;
          const priceEl = document.createElement('div');
          priceEl.style.fontSize = 'small';
          priceEl.style.color = 'red';
          priceEl.textContent = `ItemDB: ${price.toLocaleString()} NP`;
          cell.appendChild(priceEl);
        }
      });

      // Sum up prices total
      const itemTable = idInputs[0]?.closest('table');
      if (itemTable && total > 0) {
        const totalDiv = document.createElement('div');
        totalDiv.style.margin = '16px 0';
        totalDiv.style.fontWeight = 'bold';
        totalDiv.style.color = '#004488';
        totalDiv.textContent = `💰 Total ItemDB Value: ${total.toLocaleString()} NP`;

        itemTable.parentNode.insertBefore(totalDiv, itemTable.nextSibling);
      }
    },
    onerror: function (err) {
      console.error('[ItemDB] API error', err);
    }
  });
})();