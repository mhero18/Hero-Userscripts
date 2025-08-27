// ==UserScript==
// @name         Gallery Pricer
// @version      1.0.5
// @author       itemdb
// @namespace    itemdb
// @description  Shows the market price for your sdb and shop items (price multiplied by quantity) and displays a total summary.
// @website      https://itemdb.com.br
// @match        *://*.neopets.com/gallery/index.phtml*
// @match        *://*.neopets.com/gallery/quickremove.phtml*
// @icon         https://itemdb.com.br/favicon.ico
// @connect      itemdb.com.br
// @grant        GM_xmlhttpRequest
// @noframes
// ==/UserScript==

const isQuickRemoveForm = window.location.pathname.endsWith('/quickremove.phtml');
const quickRemoveFormTable = '#quickremove_form table:first';
const galleryFormTable = '#gallery_form table:first';

// For quick remove: iterate over rows (skip header/footer) and extract the item name from cell index 2.
const fetchIdsFromQuickRemove = () => {
  return $(`${quickRemoveFormTable} tr:not(:first):not(:last)`).map(function() {
    return $(this).find('td').eq(2).text().trim();
  }).get();
};

// For gallery view: iterate over TDs that contain an item image and extract the item name from the <b> element.
const fetchIdsFromGalleryView = () => {
  return $(`${galleryFormTable} tr td`).has('img.itemimg').map(function() {
    return $(this).find('b.textcolor').text().trim();
  }).get();
};

async function fetchPriceData() {
  const IDs = isQuickRemoveForm ? fetchIdsFromQuickRemove() : fetchIdsFromGalleryView();
  GM_xmlhttpRequest({
    method: 'POST',
    url: 'https://itemdb.com.br/api/v1/items/many',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ name: IDs }),
    onload: function (res) {
      if (res.status === 200) {
        const itemData = JSON.parse(res.responseText);
        priceGallery(itemData);
      } else {
        console.error('[itemdb] Failed to fetch price data', res);
      }
    }
  });
}

async function priceGallery(itemData) {
  const intl = new Intl.NumberFormat();
  // Totals for summary
  let totalValue = 0;
  let totalCount = 0;    // Number of distinct items
  let totalQuantity = 0; // Sum of quantities

  // Array to hold details for the list display.
  let listEntries = [];

  // Helper to determine the plain text price display.
  function getPlainPrice(item, qty, displayPrice) {
    let plainPrice = "";
    if (!item || (item && item.status !== 'no trade' && !item.price?.value && !item.isNC)) {
      plainPrice = "???";
    } else if (item && item.status === 'no trade') {
      plainPrice = "No Trade";
    } else if (item && item.isNC && !item.owls) {
      plainPrice = "NC";
    } else if (item && item.isNC && item.owls) {
      plainPrice = item.owls.value;
    } else if (item && item.price?.value) {
      plainPrice = `≈ ${intl.format(displayPrice)} NP`;
    }
    if (item && item.isMissingInfo) {
      plainPrice += " (Info needed)";
    }
    return plainPrice;
  }

  if (isQuickRemoveForm) {
    // Add header for Price column
    $(`${quickRemoveFormTable} tr:first`).prepend(
      `<td align="center" class="contentModuleHeaderAlt" style="width:70px;">
         <img src="https://itemdb.com.br/logo_icon.svg" style="vertical-align:middle;" width="25px" />
         <b>Price</b>
       </td>`
    );

    // Process each row in quick remove view
    $(`${quickRemoveFormTable} tr:not(:first):not(:last)`).each(function () {
      totalCount++;
      const $tds = $(this).find('td');
      // Extract quantity from cell 0 (e.g. "Qty:1")
      let qty = 1;
      const qtyText = $tds.eq(0).text();
      const m = qtyText.match(/Qty:\s*(\d+)/i);
      if (m) {
        qty = parseInt(m[1], 10);
      }
      totalQuantity += qty;

      // Extract item name from cell 2
      const itemId = $tds.eq(2).text().trim();
      const item = itemData[itemId];
      let priceStr = '';
      let computedPrice = 0;
      try {
        if (!item || (item && item.status !== 'no trade' && !item.price?.value && !item.isNC)) {
          priceStr = `<a href="https://itemdb.com.br/item/${item?.slug}" target="_blank">???</a>`;
        } else if (item && item.status === 'no trade') {
          priceStr = `<a href="https://itemdb.com.br/item/${item.slug}" target="_blank">No Trade</a>`;
        } else if (item && item.isNC && !item.owls) {
          priceStr = `<a href="https://itemdb.com.br/item/${item.slug}" target="_blank">NC</a>`;
        } else if (item && item.isNC && item.owls) {
          priceStr = `<a href="https://itemdb.com.br/item/${item.slug}" target="_blank">${item.owls.value}</a>
                      <small><br/><a href="https://itemdb.com.br/articles/owls" target="_blank">Owls</a></small>`;
        } else if (item && item.price?.value) {
          computedPrice = item.price.value * qty;
          totalValue += computedPrice;
          priceStr = `<a href="https://itemdb.com.br/item/${item.slug}" target="_blank">≈ ${intl.format(computedPrice)} NP</a>`;
          priceStr += `<br/>r${item.rarity}`;
        }
        if (item && item.isMissingInfo) {
          priceStr += `<br/><small>
                        <a href="https://itemdb.com.br/contribute" target="_blank">
                          <i>We need info about this item<br/>Learn how to Help</i>
                        </a>
                      </small>`;
        }
      } catch (e) {
        priceStr = `<a>Not Found</a><br/><small>
                      <a href="https://itemdb.com.br/contribute" target="_blank">
                        <i>We need info about this item<br/>Learn how to Help</i>
                      </a>
                    </small>`;
      }
      $(this).prepend(`<td align="center" width="150px">${priceStr}</td>`);

      // Save this entry for the list.
      const plainPrice = getPlainPrice(item, qty, computedPrice);
      listEntries.push({ name: itemId, qty, price: plainPrice, totalPrice: computedPrice });
    });
  } else {
    // Process gallery view: For each cell with an item image.
    $(`${galleryFormTable} tr td`).has('img.itemimg').each(function () {
      totalCount++;
      const $td = $(this);
      // Extract item name from the <b> element within the same cell.
      const itemId = $td.find('b.textcolor').text().trim();
      let qty = 1;
      // The quantity is in the row immediately following the image row.
      const $imgRow = $td.closest('tr');
      const $qtyRow = $imgRow.next('tr');
      if ($qtyRow.length) {
        const colIndex = $td.index();
        const $qtyCell = $qtyRow.find('td').eq(colIndex);
        const qtyText = $qtyCell.text();
        const m = qtyText.match(/Qty:\s*(\d+)/i);
        if (m) {
          qty = parseInt(m[1], 10);
        }
      }
      totalQuantity += qty;

      const item = itemData[itemId];
      let priceStr = '';
      let computedPrice = 0;
      let unitPrice = 0;
      try {
        if (!item || (item && item.status !== 'no trade' && !item.price?.value && !item.isNC)) {
          priceStr = `<a href="https://itemdb.com.br/item/${item?.slug}" target="_blank">???</a>`;
        } else if (item && item.status === 'no trade') {
          priceStr = `<a href="https://itemdb.com.br/item/${item.slug}" target="_blank">No Trade</a>`;
        } else if (item && item.isNC && !item.owls) {
          priceStr = `<a href="https://itemdb.com.br/item/${item.slug}" target="_blank">NC</a>`;
        } else if (item && item.isNC && item.owls) {
          priceStr = `<a href="https://itemdb.com.br/item/${item.slug}" target="_blank">${item.owls.value}</a>
                      <small><br/><a href="https://itemdb.com.br/articles/owls" target="_blank">Owls</a></small>`;
        } else if (item && item.price?.value) {
          // Use unit price for display under the item name.
          unitPrice = item.price.value;
          computedPrice = unitPrice * qty; // computed total for summary and list
          totalValue += computedPrice;
          priceStr = `<a href="https://itemdb.com.br/item/${item.slug}" target="_blank">≈ ${intl.format(unitPrice)} NP</a>`;
          priceStr += `<br/>r${item.rarity}`;
        }
        if (item && item.isMissingInfo) {
          priceStr += `<br/><small>
                        <a href="https://itemdb.com.br/contribute" target="_blank">
                          <i>We need info about this item<br/>Learn how to Help</i>
                        </a>
                      </small>`;
        }
      } catch (e) {
        priceStr = `<a>Not Found</a><br/><small>
                      <a href="https://itemdb.com.br/contribute" target="_blank">
                        <i>We need info about this item<br/>Learn how to Help</i>
                      </a>
                    </small>`;
      }
      // Append the price info to the quantity cell.
      if ($qtyRow.length) {
        const colIndex = $td.index();
        const $qtyCell = $qtyRow.find('td').eq(colIndex);
        $qtyCell.append(`<div style="margin: 8px 0 -8px">${priceStr}</div>`);
      } else {
        $td.append(`<div style="margin: 8px 0 -8px">${priceStr}</div>`);
      }

      // Save this entry for the list.
      // Now using computedPrice for the list drop down, so it shows quantity * unit price.
      const plainPrice = getPlainPrice(item, qty, computedPrice);
      listEntries.push({ name: itemId, qty, price: plainPrice, totalPrice: computedPrice });
    });
  }

  // Create the summary string with a "List" button and a container for the list.
  const summaryStr = `<div style="padding:8px; background:#f9f9f9; border:1px solid #ccc; margin-bottom:8px; text-align: center;">
    <strong>Items:</strong> ${totalCount} &nbsp;|&nbsp;
    <strong>Qty:</strong> ${totalQuantity} &nbsp;|&nbsp;
    <strong>Total Value:</strong> ${intl.format(totalValue)} NP
    <br/><button id="listToggleBtn">List</button>
  </div>
  <div id="itemListDiv" style="display: none; padding:8px; background:#f9f9f9; border:1px solid #ccc; margin-bottom:8px; text-align: left;"></div>`;

  // Insert the summary after the navigation block.
  const $target = $('#header');
  if ($target.length) {
    $target.after(summaryStr);
  }

  // Attach click event to the "List" button to toggle the list display.
  document.getElementById('listToggleBtn').addEventListener('click', function () {
    const listDiv = document.getElementById('itemListDiv');
    if (listDiv.style.display === 'none') {
      // Sort entries from highest to lowest total price.
      listEntries.sort((a, b) => b.totalPrice - a.totalPrice);
      // Build the list content.
      let listHtml = '<strong>Item Name - Item Qty - Item Price</strong><br/><hr/>';
      listEntries.forEach(function(entry) {
        listHtml += `<b>${entry.name}</b> <em>x${entry.qty}</em> - <font color="green">${entry.price}</font><br/>`;
      });
      listDiv.innerHTML = listHtml;
      listDiv.style.display = 'block';
    } else {
      listDiv.style.display = 'none';
    }
  });
}

fetchPriceData();