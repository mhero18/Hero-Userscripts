// ==UserScript==
// @name         Neopets Sortable Shop Sales History Table
// @version      1.5
// @description  Make Shop Sales History Table sortable.
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @author       Hero
// @match        *://www.neopets.com/market.phtml?type=sales*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = "salesHistorySortState"; // saving last sort state

    function makeTableSortable(table) {
        // Grab headers and data rows
        const headerRow = table.querySelector("tr:first-child");
        const headers = Array.from(headerRow.querySelectorAll("td"));

        const rows = Array.from(table.querySelectorAll("tr"));
        const clearRow = rows[rows.length - 1]; // Last row is "Clear Sales History"
        const dataRows = rows.slice(1, -1); // All rows except header & clear row

        let currentState = null;

        // Add default double arrows to show sortability
        headers.forEach(header => {
            header.dataset.defaultText = header.innerText;
            header.innerText += " ▲▼";
            header.style.cursor = "pointer";
            header.title = "Click to sort";
        });

        // Parse cell value depending on column type (date, price, or text)
        function parseValue(text, index) {
            text = text.replace(/,/g, "").trim();
            if (index === 0) { // Date column
                const parts = text.split("/");
                if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
            }
            if (index === 3) { // Price column
                const num = parseInt(text.replace(/[^0-9]/g, ""), 10);
                if (!isNaN(num)) return num;
            }
            return text.toLowerCase(); // Default is regular text
        }

        // Append rows to table body, always pinning clear row at the bottom
        function renderRows(rowsToRender) {
            rowsToRender.forEach(r => table.tBodies[0].appendChild(r));
            table.tBodies[0].appendChild(clearRow);
        }

        // Reset all headers to default style & show double arrows
        function resetHeaders() {
            headers.forEach(h => {
                h.style.backgroundColor = "#dddd77";
                h.style.color = "";
                h.innerText = h.dataset.defaultText + " ▲▼";
            });
        }

        // Highlight currently sorted header and show its active order (▲ or ▼)
        function highlightHeader(header, mode) {
            header.style.backgroundColor = "#4a90e2";
            header.style.color = "#fff";
            header.innerText = header.dataset.defaultText + (mode === "asc" ? " ▲" : " ▼");
        }

        // Sort table by column and mode (asc/desc/original)
        function sortTable(index, mode, save = true) {
            let sortedRows;
            if (mode === "asc" || mode === "desc") {
                sortedRows = [...dataRows].sort((a, b) => {
                    const valA = parseValue(a.cells[index]?.innerText || "", index);
                    const valB = parseValue(b.cells[index]?.innerText || "", index);
                    if (typeof valA === "number" && typeof valB === "number") return mode === "asc" ? valA - valB : valB - valA;
                    return mode === "asc" ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
                });
            } else {
                sortedRows = [...dataRows]; // Original order
            }

            renderRows(sortedRows);
            resetHeaders();

            if (mode === "asc" || mode === "desc") highlightHeader(headers[index], mode);

            if (save) currentState = { index, mode };
            if (save) localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
        }

        // Attach click handlers to headers to cycle through sort modes
        headers.forEach((header, index) => {
            header.addEventListener("click", () => {
                let mode = "asc";
                if (currentState && currentState.index === index) {
                    if (currentState.mode === "asc") mode = "desc";
                    else if (currentState.mode === "desc") mode = "original";
                }
                sortTable(index, mode);
            });
        });

        // Restore previous sort state from localStorage, or default to ascending by date
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const { index, mode } = JSON.parse(saved);
                if (headers[index]) {
                    sortTable(index, mode, false);
                    return;
                }
            } catch (e) { console.warn("Bad saved state", e); }
        }
        sortTable(0, "asc", false); // Default sort oldest date first
    }

    // Find the Sales History table and make it sortable
    const salesTable = document.querySelector(
        "table[align='center'][width='530'][cellpadding='3'][cellspacing='0']"
    );
    if (salesTable) makeTableSortable(salesTable);

})();
