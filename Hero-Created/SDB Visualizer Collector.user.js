// ==UserScript==
// @name        SDB Visualizer Collector
// @author      Hero (special thanks to NeoQuest.Guide & itemDB)
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @version     2026.03.30
// @match       *://*.neopets.com/safetydeposit.phtml*
// @connect     itemdb.com.br
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_setClipboard
// @grant       GM_xmlhttpRequest
// @description Collects SDB data for the SDB Visualizer, updates itemdb data, fetches wearable zones data, and exports JSON.
// @license     MIT
// ==/UserScript==

const STORAGE_KEYS = {
  allItems: "allSDBItems",
  visitedPages: "visitedSDBPages",
  itemDatabase: "itemDatabase",
  scanMeta: "sdbVisualizerScanMeta",
  exportBaselineItems: "sdbVisualizerExportBaselineItems",
  helpCollapsed: "sdbVisualizerHelpCollapsed",
};

const ITEMDB_CHUNK_DELAY_MS = 1000;
const ITEMDB_CHUNK_SIZE = 1000;
const ITEMDB_REFRESH_AFTER_MS = 1000 * 60 * 60 * 24 * 7;
const PRICE_REFRESH_AFTER_MS = 1000 * 60 * 60 * 24;
const ITEMDB_RATE_LIMIT_COOLDOWN_MS = 1000 * 60 * 30;
const PAGE_SCAN_DELAY_MIN_MS = 400;
const PAGE_SCAN_DELAY_MAX_MS = 700;
const PAGE_SCAN_RETRY_LIMIT = 3;
const WEARABLE_ZONE_DELAY_MS = 200;
const WEARABLE_ZONE_CONCURRENCY = 5;
const WEARABLE_ZONE_RETRY_LIMIT = 3;
const EXPORT_FILE_THRESHOLD_BYTES = 900000;
const VISUALIZER_URL = "https://sdbvisualizer.pages.dev";
const MAX_RENDERED_PENDING_DIFF_LINES = 100;
let hasLoggedWearableApiSample = false;

const scriptVersion = GM_info?.script?.version || "unknown";
console.log("NQ.G/NEOPETS: SDB Visualizer Collector version:", scriptVersion);

const currentPageMeta = getCurrentPageMeta(document);
recordCurrentPage(document, currentPageMeta.currentPage);
renderCollectorUI();

function renderCollectorUI() {
  const host = document.createElement("div");
  host.id = "sdbVisualizerCollector";
  const isMainSdbPage = currentPageMeta.currentPage === 1;
  host.innerHTML = isMainSdbPage
    ? `
    <div class="sdbvc-panel">
      <div class="sdbvc-header">
        <div>
          <div class="sdbvc-title">SDB Visualizer Collector</div>
          <div class="sdbvc-subtitle">Use these buttons to collect your SDB data and paste it into the SDB Visualizer.</div>
        </div>
      </div>
      <div class="sdbvc-help">
        <div class="sdbvc-helpHeader">
          <div class="sdbvc-helpTitle">How to use this!</div>
          <button type="button" id="sdbvcHelpToggle" class="sdbvc-helpToggle" aria-expanded="false">Expand</button>
        </div>
        <div id="sdbvcHelpContent">
          <ol class="sdbvc-helpList">
            <li>Move this page to another window, NOT another tab. That way it can run while you do other stuff.</li>
            <li>First time setup: click <strong>Scan Full SDB Automatically</strong>. This visits every SDB page in the background and builds your full box data.</li>
            <li>Then click <strong>Update itemdb Data</strong> to add prices, rarity, item categories, and other extra item details.</li>
            <li>If you just want updated price data later, click <strong>Refresh Prices</strong>. This uses your saved item ids and does not require a new full SDB scan.</li>
            <li>Optional: click <strong>Update Wearable Zoning Data</strong> if you want wearable zone info.</li>
            <li>Click <strong>Copy Full JSON Export</strong> after a full scan. Small exports copy to your clipboard, and large exports download as a JSON file.</li>
            <li>Later on, if you only revisit a few SDB pages, click <strong>Copy Partial JSON Export</strong> to update just the items from the pages you saw recently.</li>
            <li><strong>Clear Zoning Cache Only</strong> removes saved wearable zoning results so you can fetch again without deleting your scans or itemdb data.</li>
            <li><strong>Clear ALL Data</strong> wipes the saved collector data if you want to start over from scratch.</li>
          </ol>
        </div>
      </div>
      <div class="sdbvc-status" id="sdbvcStatus"></div>
      <div class="sdbvc-actions">
        <button type="button" id="sdbvcScanButton" class="sdbvc-btn scan">Scan Full SDB Automatically</button>
        <button type="button" id="sdbvcItemdbButton" class="sdbvc-btn itemdb">Update itemdb Data</button>
        <button type="button" id="sdbvcRefreshPricesButton" class="sdbvc-btn prices">Refresh Prices</button>
        <button type="button" id="sdbvcZonesButton" class="sdbvc-btn zones">Update Wearable Zoning Data</button>
        <button type="button" id="sdbvcClearZonesButton" class="sdbvc-btn danger-soft">Clear Zoning Cache Only</button>
        <button type="button" id="sdbvcExportFullButton" class="sdbvc-btn export">Copy Full JSON Export</button>
        <button type="button" id="sdbvcExportPartialButton" class="sdbvc-btn export-secondary">Copy Partial JSON Export</button>
        <button type="button" id="sdbvcClearButton" class="danger">Clear ALL Data</button>
        <button type="button" id="sdbvcOpenVisualizerButton" class="sdbvc-btn visualizer">Open Visualizer Site</button>
      </div>
      <div class="sdbvc-meta" id="sdbvcMeta"></div>
    </div>
  `
    : `
    <div class="sdbvc-panel sdbvc-panel-compact">
      <div class="sdbvc-status" id="sdbvcStatus"></div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #sdbVisualizerCollector {
      border: 1px solid #aaa;
      padding: 8px;
      margin: 12px 0;
      background: #fff;
    }
    .sdbvc-panel {
      font-family: Arial, sans-serif;
    }
    .sdbvc-panel-compact {
      padding: 2px 0;
    }
    .sdbvc-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      margin-bottom: 8px;
    }
    .sdbvc-title {
      font-size: 16px;
      font-weight: bold;
    }
    .sdbvc-subtitle {
      font-size: 12px;
      color: #666;
      margin-top: 2px;
    }
    .sdbvc-help {
      margin: 10px 0 8px;
      padding: 10px 12px;
      border: 1px solid #d8d8d8;
      background: #faf8f3;
      border-radius: 8px;
    }
    .sdbvc-helpHeader {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }
    .sdbvc-helpTitle {
      font-size: 13px;
      font-weight: bold;
    }
    .sdbvc-helpToggle {
      cursor: pointer;
      padding: 4px 9px;
      border: 1px solid #c9b49a;
      border-radius: 999px;
      background: #efe6d7;
      color: #5a4637;
      font-size: 11px;
      font-weight: bold;
    }
    .sdbvc-helpList {
      margin: 8px 0 0;
      padding-left: 20px;
      font-size: 12px;
      line-height: 1.45;
      color: #333;
    }
    .sdbvc-helpList li + li {
      margin-top: 4px;
    }
    .sdbvc-status, .sdbvc-meta {
      font-size: 12px;
      margin: 6px 0;
      color: #333;
    }
    .sdbvc-status {
      font-weight: bold;
      color: #20424f;
    }
    .sdbvc-status.is-error {
      color: #b42318;
    }
    .sdbvc-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 8px 0;
    }
    .sdbvc-actions button {
      cursor: pointer;
      padding: 6px 10px;
      border: 1px solid #999;
      border-radius: 4px;
      font-size: 12px;
      color: #3a2b24;
      font-weight: bold;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.45);
    }
    .sdbvc-btn.scan {
      background: #dbe7ff;
      border-color: #98b7f5;
    }
    .sdbvc-btn.itemdb {
      background: #d9f3e7;
      border-color: #8dc9ac;
    }
    .sdbvc-btn.zones {
      background: #eadffd;
      border-color: #b89add;
    }
    .sdbvc-btn.prices {
      background: #dff1ff;
      border-color: #94bfeb;
    }
    .sdbvc-btn.visualizer {
      background: #dff5f2;
      border-color: #98cfc8;
    }
    .sdbvc-btn.export {
      background: #fde7cf;
      border-color: #dfb181;
    }
    .sdbvc-btn.export-secondary {
      background: #efe6d7;
      border-color: #c9b49a;
    }
    .sdbvc-btn.danger-soft,
    .sdbvc-actions button.danger {
      background: #ffe1e4;
      border-color: #de9ca4;
    }
    .sdbvc-actions button:hover:not(:disabled) {
      filter: brightness(0.98);
    }
    .sdbvc-actions button:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    .is-hidden {
      display: none !important;
    }
    #sdbvcPendingDiffs {
      position: fixed;
      right: 16px;
      bottom: 30px;
      width: min(360px, calc(100vw - 24px));
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid #ccb893;
      background: rgba(255, 250, 240, 0.96);
      box-shadow: 0 14px 38px rgba(33, 23, 10, 0.22);
      z-index: 999997;
      color: #4a372a;
      font-size: 12px;
      line-height: 1.35;
      backdrop-filter: blur(4px);
      max-height: min(60vh, 520px);
      overflow-y: auto;
    }
    .sdbvc-diffTitle {
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 6px;
    }
    .sdbvc-diffSubtitle {
      color: #7b5e4d;
      margin-bottom: 8px;
    }
    .sdbvc-diffList {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .sdbvc-diffRow {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .sdbvc-diffName {
      min-width: 0;
      flex: 1 1 auto;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sdbvc-diffDelta {
      flex: 0 0 auto;
      font-weight: bold;
    }
    .sdbvc-diffDelta.is-positive {
      color: #18794e;
    }
    .sdbvc-diffDelta.is-negative {
      color: #b42318;
    }
    .sdbvc-diffEmpty {
      color: #7b5e4d;
    }
    .sdbvc-diffRow.is-page-note .sdbvc-diffName {
      white-space: normal;
    }
    #sdbvcOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.72);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: Arial, sans-serif;
    }
    .sdbvc-overlayCard {
      width: min(520px, calc(100% - 32px));
      background: #181818;
      border: 1px solid #555;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.4);
    }
    .sdbvc-overlayTitle {
      font-size: 18px;
      font-weight: bold;
    }
    .sdbvc-overlayText {
      margin-top: 10px;
      font-size: 14px;
      line-height: 1.4;
    }
    .sdbvc-progressBar {
      height: 12px;
      border-radius: 999px;
      background: #333;
      overflow: hidden;
      margin-top: 14px;
    }
    .sdbvc-progressFill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #5ec8ff, #75ffb5);
      transition: width 0.15s ease;
    }
    .sdbvc-progressMeta {
      margin-top: 10px;
      font-size: 12px;
      color: #d0d0d0;
    }
  `;

  document.head.appendChild(style);
  document.querySelector(".content").insertBefore(host, document.querySelector(".content").firstChild);

  const statusEl = host.querySelector("#sdbvcStatus");
  const pendingDiffHost = document.createElement("aside");
  pendingDiffHost.id = "sdbvcPendingDiffs";
  document.body.appendChild(pendingDiffHost);
  if (!isMainSdbPage) {
    setCompactStatus(statusEl);
    renderPendingDiffPreview(pendingDiffHost);
    return;
  }

  const metaEl = host.querySelector("#sdbvcMeta");
  const helpToggle = host.querySelector("#sdbvcHelpToggle");
  const helpContent = host.querySelector("#sdbvcHelpContent");
  let isHelpCollapsed = GM_getValue(STORAGE_KEYS.helpCollapsed, true);
  const buttons = {
    scan: host.querySelector("#sdbvcScanButton"),
    itemdb: host.querySelector("#sdbvcItemdbButton"),
    refreshPrices: host.querySelector("#sdbvcRefreshPricesButton"),
    zones: host.querySelector("#sdbvcZonesButton"),
    openVisualizer: host.querySelector("#sdbvcOpenVisualizerButton"),
    clearZones: host.querySelector("#sdbvcClearZonesButton"),
    exportFull: host.querySelector("#sdbvcExportFullButton"),
    exportPartial: host.querySelector("#sdbvcExportPartialButton"),
    clear: host.querySelector("#sdbvcClearButton"),
  };

  function syncHelpVisibility() {
    helpContent?.classList.toggle("is-hidden", isHelpCollapsed);
    if (helpToggle) {
      helpToggle.textContent = isHelpCollapsed ? "Expand" : "Collapse";
      helpToggle.setAttribute("aria-expanded", String(!isHelpCollapsed));
    }
  }

  syncHelpVisibility();

  helpToggle?.addEventListener("click", () => {
    isHelpCollapsed = !isHelpCollapsed;
    GM_setValue(STORAGE_KEYS.helpCollapsed, isHelpCollapsed);
    syncHelpVisibility();
  });

  function refreshMeta() {
    const items = getStoredItems();
    const itemDatabase = getItemDatabase();
    const visitedPages = getVisitedPages();
    const scanMeta = getScanMeta();
    const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
    const zonesCheckedCount = Object.values(itemDatabase).filter((item) => item?.zonesFetchedAt).length;
    const zonesCount = Object.values(itemDatabase).filter((item) => {
      const zones = item?.zones || [];
      return Array.isArray(zones) && zones.length > 0;
    }).length;
    const lastFullScan = scanMeta.lastFullScanAt ? new Date(scanMeta.lastFullScanAt).toLocaleString() : "Never";
    const lastPricesRefreshed = scanMeta.priceRefreshLastCompletedAt
      ? new Date(scanMeta.priceRefreshLastCompletedAt).toLocaleString()
      : "Never";
    const pendingItemdb = Array.isArray(scanMeta.itemdbPendingIds) ? scanMeta.itemdbPendingIds.length : 0;
    const pendingPrices = Array.isArray(scanMeta.priceRefreshPendingIds) ? scanMeta.priceRefreshPendingIds.length : 0;
    const resumeAt = scanMeta.itemdbResumeAfter ? new Date(scanMeta.itemdbResumeAfter).toLocaleString() : "Ready now";
    const priceResumeAt = scanMeta.priceRefreshResumeAfter ? new Date(scanMeta.priceRefreshResumeAfter).toLocaleString() : "Ready now";
    metaEl.style.whiteSpace = "pre";
    metaEl.textContent =
      `Scope: ${currentPageMeta.scopeLabel}\n` +
      `Logged ${items.length.toLocaleString("en-US")} unique items / ${totalQty.toLocaleString("en-US")} total quantity \n` +
      `Visited pages: ${visitedPages.length}/${currentPageMeta.totalPages}\n` +
      `itemdb entries: ${Object.keys(itemDatabase).length.toLocaleString("en-US")}\n` +
      `Wearables checked for zones: ${zonesCheckedCount.toLocaleString("en-US")} | With zones found: ${zonesCount.toLocaleString("en-US")}\n` +
      `itemdb remaining: ${pendingItemdb.toLocaleString("en-US")} | Resume: ${resumeAt}\n` +
      `price refresh remaining: ${pendingPrices.toLocaleString("en-US")} | Resume: ${priceResumeAt}\n` +
      `Last prices refreshed: ${lastPricesRefreshed}\n` +
      `Last full scan: ${lastFullScan}`;
    renderPendingDiffPreview(pendingDiffHost);
  }

  function setStatus(message) {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", /failed|error|warning|rate limit|429|502|503|504|stopped/i.test(message));
    refreshMeta();
  }

  async function runTask(button, fn) {
    const allButtons = Object.values(buttons);
    allButtons.forEach((entry) => {
      entry.disabled = true;
    });
    try {
      await fn();
    } finally {
      allButtons.forEach((entry) => {
        entry.disabled = false;
      });
      refreshMeta();
    }
  }

  buttons.scan.addEventListener("click", () => {
    runTask(buttons.scan, async () => {
      setStatus("Starting automatic full SDB scan...");
      const result = await scanEntireSdb({
        onProgress(progress) {
          const attemptLabel = progress.attempt ? ` (attempt ${progress.attempt}/${progress.attempts})` : "";
          setStatus(`Scanning page ${progress.pageIndex}/${progress.totalPages}${attemptLabel}...`);
          showOverlay({
            title: "Scanning Safety Deposit Box",
            text: `Fetching page ${progress.pageIndex} of ${progress.totalPages}${attemptLabel} in the background. Please wait until the scan finishes.`,
            current: progress.pageIndex,
            total: progress.totalPages,
          });
        },
      });
      hideOverlay();
      if (result.failedPages.length) {
        const listedPages = result.failedPages.slice(0, 12).map((page) => page.pageIndex).join(", ");
        const moreLabel = result.failedPages.length > 12 ? ", ..." : "";
        setStatus(
          `Full SDB scan finished with ${result.failedPages.length} failed page(s). Saved all successful pages. Please manually visit page(s): ${listedPages}${moreLabel}.`,
        );
      } else {
        setStatus("Full SDB scan complete.");
      }
    }).catch((error) => {
      hideOverlay();
      setStatus(`Full SDB scan failed: ${error.message}`);
    });
  });

  buttons.itemdb.addEventListener("click", () => {
    runTask(buttons.itemdb, async () => {
      await updateItemdbData({
        mode: "itemdb",
        onProgress(progress) {
          setStatus(`Updating itemdb chunk ${progress.chunkIndex}/${progress.totalChunks}...`);
          showOverlay({
            title: "Updating itemdb data",
            text: `Requesting chunk ${progress.chunkIndex} of ${progress.totalChunks}.`,
            current: progress.chunkIndex,
            total: progress.totalChunks,
          });
        },
      });
      hideOverlay();
      setStatus("itemdb data update complete.");
    }).catch((error) => {
      hideOverlay();
      setStatus(`itemdb update failed: ${error.message}`);
    });
  });

  buttons.refreshPrices.addEventListener("click", () => {
    runTask(buttons.refreshPrices, async () => {
      await updateItemdbData({
        mode: "prices",
        onProgress(progress) {
          setStatus(`Refreshing price chunk ${progress.chunkIndex}/${progress.totalChunks}...`);
          showOverlay({
            title: "Refreshing prices",
            text: `Requesting price refresh chunk ${progress.chunkIndex} of ${progress.totalChunks}.`,
            current: progress.chunkIndex,
            total: progress.totalChunks,
          });
        },
      });
      hideOverlay();
      setStatus("Price refresh complete.");
    }).catch((error) => {
      hideOverlay();
      setStatus(`Price refresh failed: ${error.message}`);
    });
  });

  buttons.zones.addEventListener("click", () => {
    runTask(buttons.zones, async () => {
      await updateWearableZones({
        onProgress(progress) {
          setStatus(`Fetching Zones ${progress.current}/${progress.total}...`);
          showOverlay({
            title: "Fetching wearable Zoning data",
            text: `Checking wearable ${progress.current} of ${progress.total}.`,
            current: progress.current,
            total: progress.total,
          });
        },
      });
      hideOverlay();
      setStatus("Wearable Zoning data update complete.");
    }).catch((error) => {
      hideOverlay();
      setStatus(`Wearable Zoning data update failed: ${error.message}`);
    });
  });

  buttons.exportFull.addEventListener("click", () => {
    if (!hasAuthoritativeFullScan()) {
      setStatus("Full export requires a completed full SDB scan on the unfiltered SDB view first.");
      return;
    }
    const payload = buildVisualizerExportPayload({ snapshotMode: "full" });
    const result = exportVisualizerPayload(payload, "sdb-visualizer-full");
    commitExportBaseline("full", payload.pagesImported, payload.items);
    setStatus(result.message);
  });

  buttons.exportPartial.addEventListener("click", () => {
    const payload = buildVisualizerExportPayload({ snapshotMode: "partial" });
    if (!payload.items.length) {
      setStatus("There are no new page changes waiting for a partial export.");
      return;
    }
    const result = exportVisualizerPayload(payload, "sdb-visualizer-partial");
    commitExportBaseline("partial", payload.pagesImported, payload.items);
    if (currentPageMeta.isDefaultScope) {
      clearAllPendingPartialExportPages();
    } else {
      clearPendingPartialExportPages(payload.pagesImported);
    }
    setStatus(result.message);
  });

  buttons.openVisualizer.addEventListener("click", () => {
    window.open(VISUALIZER_URL, "_blank", "noopener,noreferrer");
  });

  buttons.clearZones.addEventListener("click", () => {
    if (!confirm("Clear only the saved wearable zoning cache? This will keep your SDB scan data and itemdb data, but wearable zone lookups will need to be fetched again.")) {
      return;
    }
    clearZoningCache();
    setStatus("Wearable zoning cache cleared.");
  });

  buttons.clear.addEventListener("click", () => {
    if (!confirm("Warning: this will permanently delete ALL saved scan progress, itemdb data, and cached zoning data for the collector. Continue?")) {
      return;
    }
    clearAllStoredData();
    recordCurrentPage(document, currentPageMeta.currentPage);
    setStatus("All collector data cleared.");
  });

  refreshMeta();
  setStatus(`Current page recorded: ${currentPageMeta.currentPage}/${currentPageMeta.totalPages}.`);
}

function setCompactStatus(statusEl) {
  if (!statusEl) return;
  statusEl.textContent = `Current page recorded: ${currentPageMeta.currentPage}/${currentPageMeta.totalPages}.`;
  statusEl.classList.remove("is-error");
}

function getStoredItems() {
  return JSON.parse(GM_getValue(STORAGE_KEYS.allItems, "[]"));
}

function setStoredItems(items) {
  GM_setValue(STORAGE_KEYS.allItems, JSON.stringify(items));
}

function safeParseJson(rawValue, fallbackValue) {
  try {
    const parsed = JSON.parse(rawValue);
    return parsed == null ? fallbackValue : parsed;
  } catch {
    return fallbackValue;
  }
}

function getCurrentScopeKey() {
  return currentPageMeta.scopeKey || "browse";
}

function getVisitedPages() {
  const raw = safeParseJson(GM_getValue(STORAGE_KEYS.visitedPages, "null"), null);
  const scopeKey = getCurrentScopeKey();
  if (Array.isArray(raw)) {
    return currentPageMeta.isDefaultScope ? raw : [];
  }
  if (raw?.__scoped && typeof raw.scopes === "object") {
    return Array.isArray(raw.scopes[scopeKey]) ? raw.scopes[scopeKey] : [];
  }
  return [];
}

function setVisitedPages(pages) {
  const normalizedPages = [...new Set((pages || []).map((page) => Number(page)).filter((page) => Number.isFinite(page) && page > 0))]
    .sort((a, b) => a - b);
  const raw = safeParseJson(GM_getValue(STORAGE_KEYS.visitedPages, "null"), null);
  const scopeKey = getCurrentScopeKey();
  const scopes = raw?.__scoped && typeof raw.scopes === "object"
    ? { ...raw.scopes }
    : Array.isArray(raw) && currentPageMeta.isDefaultScope
      ? { [scopeKey]: raw }
      : {};
  scopes[scopeKey] = normalizedPages;
  GM_setValue(STORAGE_KEYS.visitedPages, JSON.stringify({ __scoped: true, scopes }));
}

function getItemDatabase() {
  return JSON.parse(GM_getValue(STORAGE_KEYS.itemDatabase, "{}"));
}

function setItemDatabase(itemDatabase) {
  GM_setValue(STORAGE_KEYS.itemDatabase, JSON.stringify(itemDatabase));
}

function getExportBaselineItems() {
  return safeParseJson(GM_getValue(STORAGE_KEYS.exportBaselineItems, "{}"), {});
}

function setExportBaselineItems(itemsById) {
  GM_setValue(STORAGE_KEYS.exportBaselineItems, JSON.stringify(itemsById || {}));
}

function getScanMeta() {
  const raw = safeParseJson(GM_getValue(STORAGE_KEYS.scanMeta, "null"), null);
  const scopeKey = getCurrentScopeKey();
  if (raw && !Array.isArray(raw) && !raw.__scoped) {
    return currentPageMeta.isDefaultScope ? raw : {};
  }
  if (raw?.__scoped && typeof raw.scopes === "object") {
    return raw.scopes[scopeKey] && typeof raw.scopes[scopeKey] === "object" ? raw.scopes[scopeKey] : {};
  }
  return {};
}

function getAllScanMetaScopes() {
  const raw = safeParseJson(GM_getValue(STORAGE_KEYS.scanMeta, "null"), null);
  if (raw?.__scoped && typeof raw.scopes === "object") {
    return raw.scopes;
  }
  if (raw && !Array.isArray(raw) && typeof raw === "object") {
    return { browse: raw };
  }
  return {};
}

function setScanMeta(scanMeta) {
  const raw = safeParseJson(GM_getValue(STORAGE_KEYS.scanMeta, "null"), null);
  const scopeKey = getCurrentScopeKey();
  const scopes = raw?.__scoped && typeof raw.scopes === "object"
    ? { ...raw.scopes }
    : raw && !Array.isArray(raw) && currentPageMeta.isDefaultScope
      ? { [scopeKey]: raw }
      : {};
  scopes[scopeKey] = scanMeta;
  GM_setValue(STORAGE_KEYS.scanMeta, JSON.stringify({ __scoped: true, scopes }));
}

function clearAllStoredData() {
  Object.values(STORAGE_KEYS).forEach((key) => GM_deleteValue(key));
}

function clearZoningCache() {
  const itemDatabase = getItemDatabase();
  Object.keys(itemDatabase).forEach((id) => {
    if (!itemDatabase[id]) return;
    itemDatabase[id] = {
      ...itemDatabase[id],
      zones: [],
      zonesFetchedAt: null,
    };
  });
  setItemDatabase(itemDatabase);
}

function hasAuthoritativeFullScan() {
  if (!currentPageMeta.isDefaultScope) {
    return false;
  }
  const scanMeta = getScanMeta();
  const visitedPages = getVisitedPages();
  const totalPages = scanMeta.totalPages || currentPageMeta.totalPages || 0;
  const hasFailedPages = Array.isArray(scanMeta.failedScanPages) && scanMeta.failedScanPages.length > 0;
  return Boolean(scanMeta.lastFullScanAt) && totalPages > 0 && visitedPages.length >= totalPages && !hasFailedPages;
}

function getCurrentPageMeta(doc) {
  const searchInput = doc.querySelector("input[name='obj_name']");
  const categorySelect = doc.querySelector("select[name='category']");
  const searchTerm = normalizeScopeSearchTerm(searchInput?.value || new URLSearchParams(location.search).get("obj_name") || "");
  const categoryValue = String(categorySelect?.value || new URLSearchParams(location.search).get("category") || "0");
  const isDefaultScope = !searchTerm && (categoryValue === "0" || categoryValue === "");
  const scopeKey = isDefaultScope
    ? "browse"
    : `filter:${categoryValue || "0"}:${searchTerm.toLowerCase()}`;
  const pageSelect = doc.querySelector("select[name='offset']");
  const totalPages = pageSelect ? pageSelect.options.length : 1;
  const currentOffset = pageSelect ? parseInt(pageSelect.value || "0", 10) : 0;
  const currentPage = pageSelect ? Math.floor(currentOffset / 30) + 1 : 1;
  const totalsText = doc.querySelector(".content > table")?.textContent.replace(/,/g, "") || "";
  const totalsMatch = totalsText.match(/Items:\s*(\d+)\s*\|\s*Qty:\s*(\d+)/);
  const username =
    doc.querySelector("td.user a[href*='/userlookup.phtml?user=']")?.textContent?.trim() ||
    doc.querySelector("a[href*='/userlookup.phtml?user=']")?.textContent?.trim() ||
    null;

  return {
    currentPage,
    totalPages,
    totalItems: totalsMatch ? parseInt(totalsMatch[1], 10) : null,
    totalQuantity: totalsMatch ? parseInt(totalsMatch[2], 10) : null,
    username,
    searchTerm,
    categoryValue,
    isDefaultScope,
    scopeKey,
    scopeLabel: buildScopeLabel({ searchTerm, categoryValue, isDefaultScope }),
  };
}

function normalizeScopeSearchTerm(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildScopeLabel({ searchTerm, categoryValue, isDefaultScope }) {
  if (isDefaultScope) {
    return "Full SDB";
  }
  if (searchTerm) {
    return `Search: ${searchTerm}${categoryValue && categoryValue !== "0" ? ` | Category ${categoryValue}` : ""}`;
  }
  return `Category ${categoryValue}`;
}

function parseSdbRows(doc) {
  const table = findSdbItemsTable(doc);
  if (!table) {
    return [];
  }

  return Array.from(table.querySelectorAll("tr[bgcolor]"))
    .filter((row) => row.getAttribute("bgcolor")?.toUpperCase() !== "#E4E4E4")
    .filter((row) => row.querySelector("input[name^='back_to_inv[']"))
    .map((row) => {
      const cells = row.querySelectorAll("td");
      const input = row.querySelector("input[name^='back_to_inv[']");
      const idMatch = input?.name?.match(/\[(\d+)\]/);
      const name = cells[1]?.querySelector("b")?.childNodes?.[0]?.textContent?.trim() || "";
      let qty = parseInt(cells[4]?.textContent.replace(/[^\d]/g, "") || "0", 10);
      if ((cells[4]?.textContent || "").includes("NP")) {
        qty = parseInt(cells[5]?.textContent.replace(/[^\d]/g, "") || "0", 10);
      }

      return {
        id: parseInt(idMatch?.[1] || "0", 10),
        name,
        qty,
        image: cells[0]?.querySelector("img")?.getAttribute("src") || "",
        description: cells[2]?.textContent.trim() || "",
        sdbType: cells[3]?.textContent.trim() || "",
      };
    })
    .filter((item) => Number.isFinite(item.id) && item.id > 0);
}

function findSdbItemsTable(doc) {
  const candidateTables = Array.from(doc.querySelectorAll(".content form table, .content table"));
  return candidateTables.find((table) => table.querySelector("input[name^='back_to_inv[']")) || null;
}

function mergeItemsById(existingItems, nextItems) {
  const byId = new Map(existingItems.map((item) => [item.id, item]));
  nextItems.forEach((item) => {
    byId.set(item.id, {
      ...(byId.get(item.id) || {}),
      ...item,
    });
  });
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeStoredItem(item) {
  return {
    id: Number(item?.id || 0),
    name: item?.name || "Unknown Item",
    qty: Math.max(0, Number(item?.qty || 0)),
    image: item?.image || "",
    description: item?.description || "",
    sdbType: item?.sdbType || "",
  };
}

function buildPageItemsMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object") return {};
  return Object.fromEntries(
    Object.entries(rawMap).map(([pageNumber, items]) => [
      String(pageNumber),
      Array.isArray(items) ? items.map(normalizeStoredItem).filter((item) => item.id > 0) : [],
    ]),
  );
}

function buildStoredItemsFromPageSnapshots(pageSnapshotsByPage) {
  return mergeItemsById([], Object.values(pageSnapshotsByPage).flat().map(normalizeStoredItem));
}

function buildItemsByIdMap(items) {
  const mapped = {};
  (items || []).forEach((item) => {
    if (!item || !Number.isFinite(Number(item.id)) || Number(item.id) <= 0) return;
    mapped[String(item.id)] = normalizeStoredItem(item);
  });
  return mapped;
}

function buildGlobalPendingExportItems(itemDatabase) {
  const currentItemsById = buildItemsByIdMap(getStoredItems());
  const exportBaselineItems = getExportBaselineItems();
  const allIds = new Set([...Object.keys(currentItemsById), ...Object.keys(exportBaselineItems)]);
  return Array.from(allIds)
    .map((id) => {
      const currentItem = currentItemsById[id];
      const baselineItem = exportBaselineItems[id];
      const currentQty = Number(currentItem?.qty || 0);
      const baselineQty = Number(baselineItem?.qty || 0);
      if (currentQty === baselineQty) {
        return null;
      }
      const exportItem = currentItem || { ...baselineItem, qty: 0 };
      return {
        ...normalizeStoredItem(exportItem),
        itemdb: normalizeItemdbForExport(itemDatabase[Number(id)]) || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildGlobalPendingQuantityDiffs() {
  const currentItemsById = buildItemsByIdMap(getStoredItems());
  const exportBaselineItems = getExportBaselineItems();
  const scanMeta = getScanMeta();
  const pageSnapshotsByPage = buildPageItemsMap(scanMeta.pageSnapshotsByPage);
  const newDefaultPageIds = new Set(
    getPendingPageNotes().flatMap((entry) => (pageSnapshotsByPage[String(entry.pageNumber)] || []).map((item) => String(item.id))),
  );
  const allIds = new Set([...Object.keys(currentItemsById), ...Object.keys(exportBaselineItems)]);
  return Array.from(allIds)
    .filter((id) => !newDefaultPageIds.has(String(id)))
    .map((id) => {
      const currentItem = currentItemsById[id];
      const baselineItem = exportBaselineItems[id];
      const delta = Number(currentItem?.qty || 0) - Number(baselineItem?.qty || 0);
      if (!delta) return null;
      return {
        id: Number(id),
        name: currentItem?.name || baselineItem?.name || `Item ${id}`,
        delta,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const byMagnitude = Math.abs(b.delta) - Math.abs(a.delta);
      if (byMagnitude !== 0) return byMagnitude;
      return a.name.localeCompare(b.name);
    });
}

function recordCurrentPage(doc, pageNumber) {
  const items = parseSdbRows(doc);
  const scanMeta = getScanMeta();
  const pageSnapshotsByPage = buildPageItemsMap(scanMeta.pageSnapshotsByPage);
  pageSnapshotsByPage[String(pageNumber)] = items.map(normalizeStoredItem);
  setStoredItems(mergeItemsById(getStoredItems(), items));

  const visitedPages = getVisitedPages();
  if (!visitedPages.includes(pageNumber)) {
    visitedPages.push(pageNumber);
    visitedPages.sort((a, b) => a - b);
    setVisitedPages(visitedPages);
  }

  const pageMeta = getCurrentPageMeta(doc);
  const pageItemIds = buildPageItemIdsMap(pageSnapshotsByPage);
  const failedScanPages = Array.isArray(scanMeta.failedScanPages)
    ? scanMeta.failedScanPages.filter((page) => page.pageIndex !== pageNumber)
    : [];
  const pagesChangedSinceFullScan = Array.isArray(scanMeta.pagesChangedSinceFullScan)
    ? [...new Set([...scanMeta.pagesChangedSinceFullScan, pageNumber])].sort((a, b) => a - b)
    : [pageNumber];
  setScanMeta({
    ...scanMeta,
    totalPages: pageMeta.totalPages,
    totalItems: pageMeta.totalItems,
    totalQuantity: pageMeta.totalQuantity,
    username: pageMeta.username || scanMeta.username || null,
    lastPageRecordedAt: new Date().toISOString(),
    lastObservedPage: pageNumber,
    pageSnapshotsByPage,
    pageItemIdsByPage: pageItemIds,
    pagesChangedSinceFullScan,
    failedScanPages,
    lastFailedScanAt: failedScanPages.length ? scanMeta.lastFailedScanAt || new Date().toISOString() : null,
  });
}

async function scanEntireSdb({ onProgress } = {}) {
  const pageMeta = getCurrentPageMeta(document);
  const offsets = Array.from({ length: pageMeta.totalPages }, (_, index) => index * 30);
  const failedPages = [];
  const pageSnapshotsByPage = {};

  for (let index = 0; index < offsets.length; index += 1) {
    const offset = offsets[index];
    const scanResult = await fetchAndParseSdbPage({
      offset,
      pageIndex: index + 1,
      totalPages: offsets.length,
      onProgress,
    });
    if (scanResult.valid) {
      pageSnapshotsByPage[String(index + 1)] = scanResult.items.map(normalizeStoredItem);
    }
    if (!scanResult.valid) {
      failedPages.push({
        pageIndex: index + 1,
        offset,
        reason: scanResult.reason,
      });
    }
    await delay(randomBetween(PAGE_SCAN_DELAY_MIN_MS, PAGE_SCAN_DELAY_MAX_MS));
  }

  if (pageMeta.isDefaultScope) {
    setStoredItems(buildStoredItemsFromPageSnapshots(pageSnapshotsByPage));
  } else {
    setStoredItems(mergeItemsById(getStoredItems(), Object.values(pageSnapshotsByPage).flat()));
  }
  const failedPageNumbers = new Set(failedPages.map((page) => page.pageIndex));
  setVisitedPages(Array.from({ length: offsets.length }, (_, index) => index + 1).filter((pageNumber) => !failedPageNumbers.has(pageNumber)));
  const pageItemIdsByPage = buildPageItemIdsMap(pageSnapshotsByPage);
  const existingScanMeta = getScanMeta();
  const nextScanMeta = {
    ...existingScanMeta,
    totalPages: pageMeta.totalPages,
    totalItems: pageMeta.totalItems,
    totalQuantity: pageMeta.totalQuantity,
    username: pageMeta.username || existingScanMeta.username || null,
    lastFullScanAt: new Date().toISOString(),
    lastObservedPage: 1,
    pageSnapshotsByPage,
    pageItemIdsByPage,
    pagesChangedSinceFullScan: [],
    failedScanPages: failedPages,
    lastFailedScanAt: failedPages.length ? new Date().toISOString() : null,
  };
  if (!existingScanMeta.exportBaselinePageSnapshotsByPage || !Object.keys(existingScanMeta.exportBaselinePageSnapshotsByPage).length) {
    nextScanMeta.exportBaselinePageSnapshotsByPage = structuredClone(pageSnapshotsByPage);
  }
  setScanMeta(nextScanMeta);
  return { failedPages };
}

async function fetchAndParseSdbPage({ offset, pageIndex, totalPages, onProgress }) {
  const url = buildSdbPageUrl(offset);
  let lastReason = "Unknown validation failure";

  for (let attempt = 1; attempt <= PAGE_SCAN_RETRY_LIMIT; attempt += 1) {
    onProgress?.({
      pageIndex,
      totalPages,
      offset,
      attempt,
      attempts: PAGE_SCAN_RETRY_LIMIT,
    });

    const responseText = await fetchSdbPage(url);
    const doc = new DOMParser().parseFromString(responseText, "text/html");
    const validation = validateSdbPage(doc, pageIndex, totalPages);
    if (validation.valid) {
      return {
        valid: true,
        items: validation.items,
      };
    }
    lastReason = validation.reason;
    if (attempt < PAGE_SCAN_RETRY_LIMIT) {
      await delay(800 * attempt);
    }
  }

  return {
    valid: false,
    items: [],
    reason: lastReason,
  };
}

function validateSdbPage(doc, pageIndex, totalPages) {
  const pageMeta = getCurrentPageMeta(doc);
  const items = parseSdbRows(doc);
  const hasOffsetSelect = Boolean(doc.querySelector("select[name='offset']"));
  const hasTotals = pageMeta.totalItems != null && pageMeta.totalQuantity != null;
  const expectedRows = pageIndex < totalPages ? 30 : null;

  if (!hasOffsetSelect) {
    return { valid: false, items, reason: "Missing page selector" };
  }
  if (!hasTotals) {
    return { valid: false, items, reason: "Missing SDB totals block" };
  }
  if (!items.length && pageMeta.totalItems > 0) {
    return { valid: false, items, reason: "No SDB rows found" };
  }
  if (expectedRows && items.length !== expectedRows) {
    return { valid: false, items, reason: `Expected ${expectedRows} rows but found ${items.length}` };
  }

  return { valid: true, items };
}

function buildSdbPageUrl(offset) {
  const params = new URLSearchParams();
  if (currentPageMeta.categoryValue && currentPageMeta.categoryValue !== "0") {
    params.set("category", currentPageMeta.categoryValue);
  } else if (!currentPageMeta.isDefaultScope) {
    params.set("category", currentPageMeta.categoryValue || "0");
  }
  if (currentPageMeta.searchTerm) {
    params.set("obj_name", currentPageMeta.searchTerm);
  } else if (!currentPageMeta.isDefaultScope) {
    params.set("obj_name", "");
  }
  if (offset > 0) {
    params.set("offset", String(offset));
  }
  const query = params.toString();
  if (!query) {
    return `${location.origin}/safetydeposit.phtml`;
  }
  return `${location.origin}/safetydeposit.phtml?${query}`;
}

async function fetchSdbPage(url) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

function buildVisualizerExportPayload({ snapshotMode = "partial" } = {}) {
  const pageMeta = getCurrentPageMeta(document);
  const scanMeta = getScanMeta();
  const itemDatabase = getItemDatabase();
  const items = getStoredItems();
  const exportBaselineItems = getExportBaselineItems();
  const visitedPages = getVisitedPages();
  const totalPages = scanMeta.totalPages || pageMeta.totalPages;
  const pageSnapshotsByPage = buildPageItemsMap(scanMeta.pageSnapshotsByPage);
  const baselinePageSnapshotsByPage = buildPageItemsMap(scanMeta.exportBaselinePageSnapshotsByPage);
  const pageItemIdsByPage = buildPageItemIdsMap(pageSnapshotsByPage);
  const pagesImported = snapshotMode === "full"
    ? visitedPages
    : getPartialExportPages(scanMeta, pageMeta.currentPage, visitedPages, pageItemIdsByPage);
  const pageCoverage = totalPages > 0 ? pagesImported.length / totalPages : 0;
  const exportItems = snapshotMode === "full"
    ? items
    : pageMeta.isDefaultScope
      ? buildGlobalPendingExportItems(itemDatabase)
    : !pageMeta.isDefaultScope
      ? buildScopedPartialExportItems({
          pagesImported,
          pageSnapshotsByPage,
          exportBaselineItems,
          itemDatabase,
        })
    : buildPartialExportItems({
        pagesImported,
        pageSnapshotsByPage,
        baselinePageSnapshotsByPage,
        itemDatabase,
      });
  const categoryOptions = Array.from(document.querySelectorAll("select[name='category'] option"))
    .map((option) => ({
      value: option.value,
      label: option.textContent.trim(),
    }))
    .filter((option) => option.label && option.label !== "Select a Category");

  return {
    source: "nqg-sdb-visualizer-collector",
    collectorVersion: scriptVersion,
    exportedAt: new Date().toISOString(),
    username: scanMeta.username || pageMeta.username || null,
    snapshotMode,
    isAuthoritative: snapshotMode === "full" && hasAuthoritativeFullScan(),
    currentPage: pageMeta.currentPage,
    totalPages,
    pagesImported,
    pageCoverage,
    totalItems: scanMeta.totalItems ?? pageMeta.totalItems,
    totalQuantity: scanMeta.totalQuantity ?? pageMeta.totalQuantity,
    lastFullScanAt: scanMeta.lastFullScanAt || null,
    lastPageRecordedAt: scanMeta.lastPageRecordedAt || null,
    lastObservedPage: scanMeta.lastObservedPage || pageMeta.currentPage,
    categoryOptions,
    items: snapshotMode === "full"
      ? exportItems.map((item) => ({
          ...item,
          itemdb: normalizeItemdbForExport(itemDatabase[item.id]) || null,
        }))
      : exportItems,
  };
}

function normalizeItemdbForExport(itemdbEntry) {
  if (!itemdbEntry) return null;
  const zones = Array.isArray(itemdbEntry.zones) && itemdbEntry.zones.length
    ? itemdbEntry.zones
    : Array.isArray(itemdbEntry.occupies)
      ? itemdbEntry.occupies
      : [];
  const zonesFetchedAt = itemdbEntry.zonesFetchedAt || itemdbEntry.occupiesFetchedAt || null;
  return {
    ...itemdbEntry,
    zones,
    zonesFetchedAt,
  };
}

function buildPageItemIdsMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object") return {};
  return Object.fromEntries(
    Object.entries(rawMap).map(([pageNumber, ids]) => [
      String(pageNumber),
      Array.isArray(ids)
        ? ids
            .map((entry) => typeof entry === "object" && entry !== null ? Number(entry.id) : Number(entry))
            .filter((id) => Number.isFinite(id) && id > 0)
        : [],
    ]),
  );
}

function buildPartialExportItems({ pagesImported, pageSnapshotsByPage, baselinePageSnapshotsByPage, itemDatabase }) {
  const exportById = new Map();
  pagesImported.forEach((pageNumber) => {
    const pageKey = String(pageNumber);
    const currentItems = pageSnapshotsByPage[pageKey] || [];
    const baselineItems = baselinePageSnapshotsByPage[pageKey] || [];
    const currentById = new Map(currentItems.map((item) => [item.id, normalizeStoredItem(item)]));
    const baselineById = new Map(baselineItems.map((item) => [item.id, normalizeStoredItem(item)]));
    const pageIds = new Set([...currentById.keys(), ...baselineById.keys()]);
    pageIds.forEach((id) => {
      const currentItem = currentById.get(id);
      const baselineItem = baselineById.get(id);
      const exportItem = currentItem || { ...baselineItem, qty: 0 };
      exportById.set(id, {
        ...exportItem,
        itemdb: normalizeItemdbForExport(itemDatabase[id]) || null,
      });
    });
  });
  return Array.from(exportById.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildScopedPartialExportItems({ pagesImported, pageSnapshotsByPage, exportBaselineItems, itemDatabase }) {
  const exportById = new Map();
  pagesImported.forEach((pageNumber) => {
    const pageKey = String(pageNumber);
    const currentItems = pageSnapshotsByPage[pageKey] || [];
    currentItems.forEach((item) => {
      const normalized = normalizeStoredItem(item);
      const baselineItem = exportBaselineItems[String(normalized.id)];
      const baselineQty = baselineItem ? Number(baselineItem.qty || 0) : 0;
      if (normalized.qty === baselineQty) {
        return;
      }
      exportById.set(normalized.id, {
        ...normalized,
        itemdb: normalizeItemdbForExport(itemDatabase[normalized.id]) || null,
      });
    });
  });
  return Array.from(exportById.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getPartialExportPages(scanMeta, currentPage, visitedPages, pageItemIdsByPage) {
  const changedPages = Array.isArray(scanMeta.pagesChangedSinceFullScan)
    ? scanMeta.pagesChangedSinceFullScan.map((page) => Number(page)).filter((page) => Number.isFinite(page) && page > 0)
    : [];
  if (changedPages.length) {
    return [...new Set(changedPages)].sort((a, b) => a - b);
  }

  const mappedPages = Object.keys(pageItemIdsByPage)
    .map((page) => Number(page))
    .filter((page) => Number.isFinite(page) && page > 0);
  if (!scanMeta.lastFullScanAt && mappedPages.length) {
    return [...new Set(mappedPages)].sort((a, b) => a - b);
  }

  if (visitedPages.includes(currentPage)) {
    return [currentPage];
  }
  return [];
}

function clearPendingPartialExportPages(exportedPages) {
  if (!Array.isArray(exportedPages) || !exportedPages.length) return;
  const exportedPageSet = new Set(
    exportedPages.map((page) => Number(page)).filter((page) => Number.isFinite(page) && page > 0),
  );
  const scanMeta = getScanMeta();
  const remainingPages = Array.isArray(scanMeta.pagesChangedSinceFullScan)
    ? scanMeta.pagesChangedSinceFullScan
        .map((page) => Number(page))
        .filter((page) => Number.isFinite(page) && page > 0 && !exportedPageSet.has(page))
        .sort((a, b) => a - b)
    : [];

  setScanMeta({
    ...scanMeta,
    pagesChangedSinceFullScan: remainingPages,
  });
}

function clearAllPendingPartialExportPages() {
  const raw = safeParseJson(GM_getValue(STORAGE_KEYS.scanMeta, "null"), null);
  if (raw?.__scoped && typeof raw.scopes === "object") {
    const scopes = Object.fromEntries(
      Object.entries(raw.scopes).map(([scopeKey, scopeMeta]) => [
        scopeKey,
        {
          ...(scopeMeta || {}),
          pagesChangedSinceFullScan: [],
        },
      ]),
    );
    GM_setValue(STORAGE_KEYS.scanMeta, JSON.stringify({ __scoped: true, scopes }));
    return;
  }
  if (raw && !Array.isArray(raw) && typeof raw === "object") {
    GM_setValue(STORAGE_KEYS.scanMeta, JSON.stringify({
      ...raw,
      pagesChangedSinceFullScan: [],
    }));
  }
}

function commitExportBaseline(snapshotMode, exportedPages, exportedItems = []) {
  const scanMeta = getScanMeta();
  const pageSnapshotsByPage = buildPageItemsMap(scanMeta.pageSnapshotsByPage);
  const baselinePageSnapshotsByPage = buildPageItemsMap(scanMeta.exportBaselinePageSnapshotsByPage);
  const exportBaselineItems = getExportBaselineItems();
  const exportedItemsById = buildItemsByIdMap(exportedItems);
  if (snapshotMode === "full") {
    setExportBaselineItems(exportedItemsById);
    setScanMeta({
      ...scanMeta,
      exportBaselinePageSnapshotsByPage: structuredClone(pageSnapshotsByPage),
      exportBaselineUpdatedAt: new Date().toISOString(),
    });
    return;
  }

  const nextBaseline = structuredClone(baselinePageSnapshotsByPage);
  exportedPages.forEach((pageNumber) => {
    nextBaseline[String(pageNumber)] = structuredClone(pageSnapshotsByPage[String(pageNumber)] || []);
  });
  const nextExportBaselineItems = { ...exportBaselineItems };
  (exportedItems || []).forEach((item) => {
    const normalized = normalizeStoredItem(item);
    if (normalized.qty <= 0) {
      delete nextExportBaselineItems[String(normalized.id)];
      return;
    }
    nextExportBaselineItems[String(normalized.id)] = normalized;
  });
  setExportBaselineItems(nextExportBaselineItems);
  setScanMeta({
    ...scanMeta,
    exportBaselinePageSnapshotsByPage: nextBaseline,
    exportBaselineUpdatedAt: new Date().toISOString(),
  });
}

function getPendingQuantityDiffs() {
  const scanMeta = getScanMeta();
  const pageSnapshotsByPage = buildPageItemsMap(scanMeta.pageSnapshotsByPage);
  const baselinePageSnapshotsByPage = buildPageItemsMap(scanMeta.exportBaselinePageSnapshotsByPage);
  const exportBaselineItems = getExportBaselineItems();
  const changedPages = Array.isArray(scanMeta.pagesChangedSinceFullScan)
    ? [...new Set(scanMeta.pagesChangedSinceFullScan.map((page) => Number(page)).filter((page) => Number.isFinite(page) && page > 0))]
    : [];
  const diffById = new Map();

  changedPages.forEach((pageNumber) => {
    const pageKey = String(pageNumber);
    if (!currentPageMeta.isDefaultScope) {
      (pageSnapshotsByPage[pageKey] || []).forEach((item) => {
        const normalized = normalizeStoredItem(item);
        const baselineItem = exportBaselineItems[String(normalized.id)];
        const delta = normalized.qty - Number(baselineItem?.qty || 0);
        if (!delta) return;
        diffById.set(normalized.id, {
          id: normalized.id,
          name: normalized.name || baselineItem?.name || `Item ${normalized.id}`,
          delta,
        });
      });
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(baselinePageSnapshotsByPage, pageKey)) {
      return;
    }
    const currentById = new Map((pageSnapshotsByPage[pageKey] || []).map((item) => [item.id, normalizeStoredItem(item)]));
    const baselineById = new Map((baselinePageSnapshotsByPage[pageKey] || []).map((item) => [item.id, normalizeStoredItem(item)]));
    const ids = new Set([...currentById.keys(), ...baselineById.keys()]);
    ids.forEach((id) => {
      const currentItem = currentById.get(id);
      const baselineItem = baselineById.get(id);
      const delta = (currentItem?.qty || 0) - (baselineItem?.qty || 0);
      if (!delta) return;
      const existing = diffById.get(id);
      diffById.set(id, {
        id,
        name: currentItem?.name || baselineItem?.name || `Item ${id}`,
        delta: (existing?.delta || 0) + delta,
      });
    });
  });

  return Array.from(diffById.values())
    .filter((entry) => entry.delta !== 0)
    .sort((a, b) => {
      const byMagnitude = Math.abs(b.delta) - Math.abs(a.delta);
      if (byMagnitude !== 0) return byMagnitude;
      return a.name.localeCompare(b.name);
    });
}

function getPendingPageNotes() {
  if (!currentPageMeta.isDefaultScope) {
    return [];
  }
  const scanMeta = getScanMeta();
  const pageSnapshotsByPage = buildPageItemsMap(scanMeta.pageSnapshotsByPage);
  const baselinePageSnapshotsByPage = buildPageItemsMap(scanMeta.exportBaselinePageSnapshotsByPage);
  const changedPages = Array.isArray(scanMeta.pagesChangedSinceFullScan)
    ? [...new Set(scanMeta.pagesChangedSinceFullScan.map((page) => Number(page)).filter((page) => Number.isFinite(page) && page > 0))]
    : [];

  return changedPages
    .filter((pageNumber) => !Object.prototype.hasOwnProperty.call(baselinePageSnapshotsByPage, String(pageNumber)))
    .filter((pageNumber) => (pageSnapshotsByPage[String(pageNumber)] || []).length > 0)
    .sort((a, b) => a - b)
    .map((pageNumber) => ({
      type: "page-note",
      pageNumber,
      text: `Page ${pageNumber} added to tracking`,
    }));
}

function renderPendingDiffPreview(host) {
  if (!host) return;
  const pageNotes = getPendingPageNotes();
  const diffs = currentPageMeta.isDefaultScope ? buildGlobalPendingQuantityDiffs() : getPendingQuantityDiffs();
  const scanMeta = getScanMeta();
  const changedPages = currentPageMeta.isDefaultScope
    ? Object.values(getAllScanMetaScopes()).reduce((sum, scopeMeta) => {
        const count = Array.isArray(scopeMeta?.pagesChangedSinceFullScan) ? scopeMeta.pagesChangedSinceFullScan.length : 0;
        return sum + count;
      }, 0)
    : Array.isArray(scanMeta.pagesChangedSinceFullScan) ? scanMeta.pagesChangedSinceFullScan.length : 0;
  if (!changedPages && !diffs.length && !pageNotes.length) {
    host.innerHTML = `
      <div class="sdbvc-diffTitle">Pending Partial Changes</div>
      <div class="sdbvc-diffEmpty">No quantity changes waiting for export yet.</div>
    `;
    return;
  }

  const entries = [...pageNotes, ...diffs];
  const visibleEntries = entries.slice(0, MAX_RENDERED_PENDING_DIFF_LINES);
  const hiddenCount = Math.max(0, entries.length - visibleEntries.length);
  host.innerHTML = `
    <div class="sdbvc-diffTitle">Pending Partial Changes</div>
    <div class="sdbvc-diffSubtitle">${changedPages} page${changedPages === 1 ? "" : "s"} waiting to export</div>
    <div class="sdbvc-diffList">
      ${visibleEntries.map((entry) => {
        if (entry.type === "page-note") {
          return `
            <div class="sdbvc-diffRow is-page-note">
              <span class="sdbvc-diffName">${escapeHtml(entry.text)}</span>
            </div>
          `;
        }
        return `
          <div class="sdbvc-diffRow">
            <span class="sdbvc-diffName">${escapeHtml(entry.name)}</span>
            <span class="sdbvc-diffDelta ${entry.delta > 0 ? "is-positive" : "is-negative"}">${entry.delta > 0 ? "+" : ""}${formatNumber(entry.delta)}</span>
          </div>
        `;
      }).join("")}
      ${hiddenCount ? `<div class="sdbvc-diffEmpty">Showing first ${formatNumber(MAX_RENDERED_PENDING_DIFF_LINES)} changes. ${formatNumber(hiddenCount)} more not shown.</div>` : ""}
      ${!visibleEntries.length ? `<div class="sdbvc-diffEmpty">Only non-quantity metadata changed so far.</div>` : ""}
    </div>
  `;
}

async function updateItemdbData({ mode = "itemdb", onProgress } = {}) {
  const items = getStoredItems();
  if (!items.length) {
    throw new Error("No SDB items have been collected yet. Run a scan first.");
  }

  let itemDatabase = getItemDatabase();
  const scanMeta = getScanMeta();
  const queueKey = mode === "prices" ? "priceRefreshPendingIds" : "itemdbPendingIds";
  const resumeKey = mode === "prices" ? "priceRefreshResumeAfter" : "itemdbResumeAfter";
  const lastCompletedKey = mode === "prices" ? "priceRefreshLastCompletedAt" : "itemdbLastCompletedAt";
  const lastChunkKey = mode === "prices" ? "priceRefreshLastChunkAt" : "itemdbLastChunkAt";
  const lastRateLimitKey = mode === "prices" ? "priceRefreshLastRateLimitAt" : "itemdbLastRateLimitAt";
  const refreshAfterMs = mode === "prices" ? PRICE_REFRESH_AFTER_MS : ITEMDB_REFRESH_AFTER_MS;
  const actionLabel = mode === "prices" ? "price refresh" : "itemdb update";
  if (scanMeta[resumeKey] && Date.now() < scanMeta[resumeKey]) {
    throw new Error(`${actionLabel} is still cooling down. Try again after ${new Date(scanMeta[resumeKey]).toLocaleString()}.`);
  }

  let remainingIds = buildItemdbQueue(items, itemDatabase, scanMeta, {
    pendingKey: queueKey,
    refreshAfterMs,
  });
  if (!remainingIds.length) {
    setScanMeta({
      ...scanMeta,
      [queueKey]: [],
      [resumeKey]: null,
      [lastCompletedKey]: new Date().toISOString(),
    });
    return;
  }

  setScanMeta({
    ...scanMeta,
    [queueKey]: remainingIds,
    [resumeKey]: null,
  });

  const chunks = [];
  for (let index = 0; index < remainingIds.length; index += ITEMDB_CHUNK_SIZE) {
    chunks.push(remainingIds.slice(index, index + ITEMDB_CHUNK_SIZE));
  }

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    onProgress?.({
      chunkIndex: chunkIndex + 1,
      totalChunks: chunks.length,
      remainingItems: remainingIds.length,
    });
    try {
      const chunkData = await requestItemdbChunk(chunks[chunkIndex]);
      Object.entries(chunkData).forEach(([id, nextEntry]) => {
        itemDatabase[id] = {
          ...(itemDatabase[id] || {}),
          ...nextEntry,
          zones:
            nextEntry.zonesFetchedAt != null
              ? nextEntry.zones || nextEntry.occupies || []
              : itemDatabase[id]?.zones || itemDatabase[id]?.occupies || [],
          zonesFetchedAt:
            nextEntry.zonesFetchedAt != null
              ? nextEntry.zonesFetchedAt
              : itemDatabase[id]?.zonesFetchedAt || itemDatabase[id]?.occupiesFetchedAt || null,
        };
      });
      setItemDatabase(itemDatabase);
      remainingIds = remainingIds.slice(chunks[chunkIndex].length);
      setScanMeta({
        ...getScanMeta(),
        [queueKey]: remainingIds,
        [resumeKey]: null,
        [lastChunkKey]: new Date().toISOString(),
      });
    } catch (error) {
      if (error.code === "RATE_LIMIT") {
        const retryAfterMs = Number.isFinite(error.retryAfterMs) && error.retryAfterMs > 0
          ? error.retryAfterMs
          : ITEMDB_RATE_LIMIT_COOLDOWN_MS;
        const resumeAfter = Date.now() + retryAfterMs;
        setScanMeta({
          ...getScanMeta(),
          [queueKey]: remainingIds,
          [lastRateLimitKey]: new Date().toISOString(),
          [resumeKey]: resumeAfter,
        });
        throw new Error(
          `Reached itemdb's rate limit. Progress was saved and ${remainingIds.length.toLocaleString("en-US")} items remain. Try ${mode === "prices" ? "Refresh Prices" : "Update itemdb Data"} again after ${new Date(resumeAfter).toLocaleString()}.`,
        );
      }
      throw error;
    }
    if (chunkIndex < chunks.length - 1) {
      await delay(ITEMDB_CHUNK_DELAY_MS);
    }
  }

  setScanMeta({
    ...getScanMeta(),
    [queueKey]: [],
    [resumeKey]: null,
    [lastCompletedKey]: new Date().toISOString(),
  });
}

function getItemPriority(id, itemDatabase) {
  const entry = itemDatabase[id];
  const now = Date.now();
  const value = entry?.value ?? 1;
  const fetchedAt = entry?.fetchedAt || 0;
  const age = now - fetchedAt;
  return age * Math.log(value + 11);
}

function buildItemdbQueue(items, itemDatabase, scanMeta, { pendingKey = "itemdbPendingIds", refreshAfterMs = ITEMDB_REFRESH_AFTER_MS } = {}) {
  const knownIds = new Set(items.map((item) => parseInt(item.id, 10)).filter((id) => Number.isFinite(id)));
  const pendingIds = Array.isArray(scanMeta[pendingKey])
    ? scanMeta[pendingKey].filter((id) => knownIds.has(id))
    : [];
  const refreshBefore = Date.now() - refreshAfterMs;
  const staleOrMissingIds = Array.from(knownIds)
    .filter((id) => {
      const entry = itemDatabase[id];
      if (!entry || !entry.fetchedAt) return true;
      return entry.fetchedAt < refreshBefore;
    })
    .sort((a, b) => getItemPriority(b, itemDatabase) - getItemPriority(a, itemDatabase));

  const queue = [...pendingIds];
  const seen = new Set(queue);
  staleOrMissingIds.forEach((id) => {
    if (!seen.has(id)) {
      queue.push(id);
      seen.add(id);
    }
  });
  return queue;
}

function requestItemdbChunk(itemIds) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      responseType: "json",
      method: "POST",
      url: "https://itemdb.com.br/api/v1/items/many",
      data: JSON.stringify({ item_id: itemIds }),
      headers: {
        "Content-Type": "application/json",
      },
      onload(response) {
        if (response.status === 200) {
          const mapped = {};
          const fetchedAt = Date.now();
          Object.entries(response.response).forEach(([keyId, item]) => {
            mapped[parseInt(keyId, 10)] = {
              slug: item.slug || slugifyItemdbName(item.name),
              name: item.name,
              internal_id: item.internal_id,
              item_id: item.item_id,
              image: item.image,
              image_id: item.image_id,
              cat: item.category,
              value: item.price?.value ?? null,
              rarity: item.rarity,
              isNC: item.isNC,
              isBD: item.isBD,
              isWearable: item.isWearable,
              isNeohome: item.isNeohome,
              type: item.type,
              specialType: item.specialType,
              estVal: item.estVal,
              weight: item.weight,
              description: item.description,
              status: item.status,
              color: item.color,
              findAt: item.findAt,
              isMissingInfo: item.isMissingInfo,
              priceAddedAt: item.price?.addedAt || null,
              priceInflated: item.price?.inflated || false,
              comment: item.comment,
              zones: Array.isArray(item.zones)
                ? item.zones
                : Array.isArray(item.occupies)
                  ? item.occupies
                  : [],
              zonesFetchedAt: item.zonesFetchedAt || item.occupiesFetchedAt || null,
              fetchedAt,
            };
          });
          resolve(mapped);
          return;
        }

        if (response.status === 429) {
          const error = new Error("Reached itemdb's item-based rate limit (429).");
          error.code = "RATE_LIMIT";
          error.retryAfterMs = parseRetryAfterMs(response.responseHeaders);
          reject(error);
          return;
        }

        reject(new Error(`itemdb request failed with status ${response.status}`));
      },
      onerror(error) {
        reject(error);
      },
    });
  });
}

async function updateWearableZones({ onProgress } = {}) {
  let itemDatabase = getItemDatabase();
  const wearables = Object.entries(itemDatabase)
    .filter(([, item]) => item?.isWearable)
    .filter(([, item]) => !item?.zonesFetchedAt);

  if (!wearables.length) {
    return;
  }

  let completed = 0;
  for (let index = 0; index < wearables.length; index += WEARABLE_ZONE_CONCURRENCY) {
    const batch = wearables.slice(index, index + WEARABLE_ZONE_CONCURRENCY);

    batch.forEach(([, item], batchIndex) => {
      onProgress?.({
        current: index + batchIndex + 1,
        total: wearables.length,
        item,
      });
    });

    const results = await Promise.allSettled(
      batch.map(async ([id, item]) => {
        const zones = await fetchWearableZones(item);
        return {
          id,
          zones,
          fetchedAt: Date.now(),
        };
      }),
    );

    let rateLimitRetryAfterMs = null;
    let firstError = null;

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        const { id, zones, fetchedAt } = result.value;
        itemDatabase = {
          ...itemDatabase,
          [id]: {
            ...itemDatabase[id],
            zones,
            zonesFetchedAt: fetchedAt,
          },
        };
        completed += 1;
      } else if (result.reason?.code === "RATE_LIMIT") {
        rateLimitRetryAfterMs = result.reason.retryAfterMs || rateLimitRetryAfterMs;
      } else if (!firstError) {
        firstError = result.reason;
      }
    });

    setItemDatabase(itemDatabase);

    if (rateLimitRetryAfterMs != null) {
      const retryAfterText = new Date(Date.now() + rateLimitRetryAfterMs).toLocaleString();
      throw new Error(
        `Reached itemdb's zoning rate limit after saving ${completed.toLocaleString("en-US")} wearable updates. Run the zoning update again after ${retryAfterText} to continue from where it stopped.`,
      );
    }

    if (firstError) {
      throw firstError;
    }

    onProgress?.({
      current: completed,
      total: wearables.length,
    });

    if (index + WEARABLE_ZONE_CONCURRENCY < wearables.length) {
      await delay(WEARABLE_ZONE_DELAY_MS);
    }
  }
}

function fetchWearableZones(item) {
  const candidateIdentifiers = [
    item?.internal_id,
    item?.item_id,
    item?.slug,
    slugifyItemdbName(item?.name),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  if (!candidateIdentifiers.length) {
    return Promise.resolve([]);
  }

  return fetchWearableZonesWithRetry(candidateIdentifiers, WEARABLE_ZONE_RETRY_LIMIT);
}

async function fetchWearableZonesWithRetry(candidateIdentifiers, attemptsLeft) {
  const [itemIdentifier, ...remainingIdentifiers] = candidateIdentifiers;
  try {
    return await requestWearableZones(itemIdentifier);
  } catch (error) {
    if (error.code === "RATE_LIMIT") {
      throw error;
    }
    if ((error.code === "BAD_REQUEST" || error.code === "NOT_FOUND") && remainingIdentifiers.length) {
      return fetchWearableZonesWithRetry(remainingIdentifiers, WEARABLE_ZONE_RETRY_LIMIT);
    }
    if (error.code === "TRANSIENT" && attemptsLeft > 1) {
      const backoffMs = 500 * (WEARABLE_ZONE_RETRY_LIMIT - attemptsLeft + 1);
      await delay(backoffMs);
      return fetchWearableZonesWithRetry(candidateIdentifiers, attemptsLeft - 1);
    }
    if (error.code === "BAD_REQUEST" || error.code === "NOT_FOUND") {
      return [];
    }
    throw error;
  }
}

function requestWearableZones(itemIdentifier) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      responseType: "json",
      method: "GET",
      url: `https://itemdb.com.br/api/v1/items/${encodeURIComponent(itemIdentifier)}/wearable`,
      onload(response) {
        if (response.status === 429) {
          const error = new Error("Reached itemdb zoning rate limit (429).");
          error.code = "RATE_LIMIT";
          error.retryAfterMs = parseRetryAfterMs(response.responseHeaders);
          reject(error);
          return;
        }
        if (response.status === 400) {
          const error = new Error(`itemdb wearable API rejected identifier ${itemIdentifier}.`);
          error.code = "BAD_REQUEST";
          reject(error);
          return;
        }
        if (response.status === 404) {
          const error = new Error(`itemdb wearable data not found for ${itemIdentifier}.`);
          error.code = "NOT_FOUND";
          reject(error);
          return;
        }
        if ([502, 503, 504].includes(response.status)) {
          const error = new Error(`itemdb wearable API returned ${response.status}.`);
          error.code = "TRANSIENT";
          reject(error);
          return;
        }
        if (response.status !== 200) {
          reject(new Error(`itemdb wearable API returned ${response.status}`));
          return;
        }

        try {
          const wearableData = response.response;
          if (!hasLoggedWearableApiSample) {
            hasLoggedWearableApiSample = true;
          }
          const zones = Array.isArray(wearableData)
            ? Array.from(
                new Set(
                  wearableData
                    .map((entry) => entry?.zone_label)
                    .map((entry) => String(entry || "").trim())
                    .filter(Boolean),
                ),
              )
            : Array.isArray(wearableData?.zone_label)
              ? wearableData.zone_label.map((entry) => String(entry).trim()).filter(Boolean)
              : [];
          resolve(zones);
        } catch (error) {
          reject(error);
        }
      },
      onerror(error) {
        reject(error);
      },
    });
  });
}

function parseRetryAfterMs(responseHeaders) {
  const match = String(responseHeaders || "").match(/retry-after:\s*([^\r\n]+)/i);
  if (!match) return null;
  const rawValue = match[1].trim();
  const seconds = Number(rawValue);
  console.log("Parsed Retry-After header value:", { rawValue, seconds });
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const retryDate = Date.parse(rawValue);
  if (Number.isFinite(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }
  return null;
}

function slugifyItemdbName(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function exportVisualizerPayload(payload, fileBaseName) {
  const json = JSON.stringify(payload, null, 2);
  const size = new Blob([json], { type: "application/json" }).size;
  if (size > EXPORT_FILE_THRESHOLD_BYTES) {
    downloadTextFile(`${fileBaseName}-${formatDateStamp(new Date())}.json`, json, "application/json");
    return {
      method: "file",
      message: `Export was large (${formatBytes(size)}), so it was downloaded as a file instead of copying to clipboard.`,
    };
  }

  GM_setClipboard(json);
  return {
    method: "clipboard",
    message: `${payload.snapshotMode === "full" ? "Full" : "Partial"} visualizer JSON copied to clipboard.`,
  };
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDateStamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function showOverlay({ title, text, current, total }) {
  let overlay = document.querySelector("#sdbvcOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sdbvcOverlay";
    overlay.innerHTML = `
      <div class="sdbvc-overlayCard">
        <div class="sdbvc-overlayTitle" id="sdbvcOverlayTitle"></div>
        <div class="sdbvc-overlayText" id="sdbvcOverlayText"></div>
        <div class="sdbvc-progressBar"><div class="sdbvc-progressFill" id="sdbvcOverlayFill"></div></div>
        <div class="sdbvc-progressMeta" id="sdbvcOverlayMeta"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  overlay.querySelector("#sdbvcOverlayTitle").textContent = title;
  overlay.querySelector("#sdbvcOverlayText").textContent = text;
  overlay.querySelector("#sdbvcOverlayFill").style.width = `${percent}%`;
  overlay.querySelector("#sdbvcOverlayMeta").textContent = total > 0 ? `${current} / ${total}` : "";
}

function hideOverlay() {
  document.querySelector("#sdbvcOverlay")?.remove();
}
