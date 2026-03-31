// ==UserScript==
// @name        SDB Visualizer v2
// @author      Hero (special thanks to NeoQuest.Guide & itemDB)
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @version     2026.03.31-10
// @match       *://*.neopets.com/safetydeposit.phtml*
// @connect     itemdb.com.br
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_setClipboard
// @grant       GM_xmlhttpRequest
// @description Collects SDB data for the contextual SDB viewer, updates itemdb data, fetches wearable zones data, and exports JSON.
// @license     MIT
// ==/UserScript==

const STORAGE_KEYS = {
  allItems: "allSDBItems",
  visitedPages: "visitedSDBPages",
  itemDatabase: "itemDatabase",
  scanMeta: "sdbVisualizerScanMeta",
  helpCollapsed: "sdbVisualizerHelpCollapsed",
  viewerTheme: "sdbVisualizerViewerTheme",
  removalDraft: "sdbVisualizerRemovalDraft",
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
const VIEWER_SORT_OPTIONS = [
  { key: "name", label: "Name" },
  { key: "qty", label: "Quantity" },
  { key: "price", label: "Price" },
  { key: "stack", label: "Stack Value" },
  { key: "rarity", label: "Rarity" },
  { key: "updated", label: "Recently Enriched" },
];
const VIEWER_DEFAULT_FILTERS = {
  search: "",
  pageSize: "100",
  sdbType: "all",
  itemdbCategory: "all",
  currency: "all",
  wearable: "all",
  zoning: "all",
  neohome: "all",
  minRarity: "",
  maxRarity: "",
  minPrice: "",
  sortBy: "",
};
let hasLoggedWearableApiSample = false;
let visualizerOverlayElements = null;
let viewerState = null;

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
          <div class="sdbvc-subtitle">Use these buttons to collect your SDB data and open the contextual report directly on Neopets.</div>
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
            <li>Optional: click <strong>Update Wearable Zoning Data</strong> if you want wearable zone info.</li>
            <li>Click <strong>Open Report Here</strong> to load your saved collector data into the visualizer!</li>
            <li>Later on, click <strong>Refresh Prices</strong> to update price data only, this won't need a full SDB scan. </li>
            <li><strong>JSON Export</strong> if you want a backup of your latest saved data.</li>
            <li><strong>Clear Zoning Cache Only</strong> removes saved wearable zoning results so you can fetch again without deleting your full scan data.</li>
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
        <button type="button" id="sdbvcEmbeddedReportButton" class="sdbvc-btn report">Open Report Here</button>
        <button type="button" id="sdbvcClearZonesButton" class="sdbvc-btn danger-soft">Clear Zoning Cache Only</button>
        <button type="button" id="sdbvcClearButton" class="danger">Clear ALL Data</button>
        <button type="button" id="sdbvcExportFullButton" class="sdbvc-btn export">JSON Export</button>
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
    .sdbvc-btn.report {
      background: #fff2c7;
      border-color: #d6b35c;
    }
    .sdbvc-btn.prices {
      background: #dff1ff;
      border-color: #94bfeb;
    }
    .sdbvc-btn.export {
      background: #fde7cf;
      border-color: #dfb181;
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
    #sdbvcVisualizerOverlay {
      --sdbvc-viewer-surface: rgba(255, 251, 244, 0.88);
      --sdbvc-viewer-surface-strong: rgba(255, 255, 255, 0.86);
      --sdbvc-viewer-surface-soft: rgba(255, 255, 255, 0.72);
      --sdbvc-viewer-surface-muted: rgba(255, 248, 239, 0.88);
      --sdbvc-viewer-hero-surface: linear-gradient(140deg, rgba(255, 247, 235, 0.94), rgba(248, 236, 213, 0.82));
      --sdbvc-viewer-text: #2b241d;
      --sdbvc-viewer-muted: #6f665c;
      --sdbvc-viewer-accent: #4b3723;
      --sdbvc-viewer-border: rgba(82, 57, 27, 0.12);
      --sdbvc-viewer-border-soft: rgba(82, 57, 27, 0.08);
      --sdbvc-viewer-badge: #f4e5cf;
      --sdbvc-viewer-input: rgba(255, 255, 255, 0.88);
      --sdbvc-viewer-image-backdrop: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(247, 236, 219, 0.86));
      position: fixed;
      inset: 0;
      z-index: 1000000;
      background: rgba(28, 19, 10, 0.78);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      color: #2b241d;
    }
    .sdbvc-viewerShell {
      width: min(1780px, calc(100vw - 24px));
      height: min(97vh, 1280px);
      border-radius: 28px;
      overflow: hidden;
      border: 1px solid rgba(72, 49, 18, 0.22);
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.35);
      background:
        radial-gradient(circle at top left, rgba(255, 221, 176, 0.72), transparent 24%),
        radial-gradient(circle at top right, rgba(200, 231, 255, 0.48), transparent 20%),
        linear-gradient(180deg, #f8f1e5 0%, #efe4d0 100%);
      display: flex;
      flex-direction: column;
    }
    .sdbvc-viewerTopbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 16px 22px;
      background: var(--sdbvc-viewer-surface);
      border-bottom: 1px solid var(--sdbvc-viewer-border);
      backdrop-filter: blur(10px);
    }
    .sdbvc-viewerTopbarIntro {
      display: grid;
      gap: 4px;
      min-width: 0;
      padding-top: 2px;
    }
    .sdbvc-viewerTopbar strong {
      display: block;
      font-size: 20px;
      line-height: 1.1;
    }
    .sdbvc-viewerTopbar span {
      font-size: 13px;
      line-height: 1.45;
      color: var(--sdbvc-viewer-muted);
    }
    .sdbvc-viewerTopbarActions {
      display: flex;
      flex-wrap: wrap;
      justify-content: end;
      gap: 10px;
      align-items: center;
    }
    .sdbvc-viewerTopbarActions button,
    .sdbvc-viewerTopbarActions a {
      cursor: pointer;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid var(--sdbvc-viewer-border);
      background: var(--sdbvc-viewer-input);
      color: var(--sdbvc-viewer-accent);
      font-weight: bold;
      text-decoration: none;
    }
    .sdbvc-viewerThemeControl {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--sdbvc-viewer-muted);
      font-weight: bold;
    }
    .sdbvc-viewerThemeControl select {
      padding: 7px 10px;
      border-radius: 999px;
      border: 1px solid var(--sdbvc-viewer-border);
      background: var(--sdbvc-viewer-input);
      color: var(--sdbvc-viewer-accent);
    }
    .sdbvc-viewerStatus {
      padding: 12px 22px;
      font-size: 13px;
      line-height: 1.4;
      color: var(--sdbvc-viewer-muted);
      background: var(--sdbvc-viewer-surface-muted);
      border-bottom: 1px solid var(--sdbvc-viewer-border);
    }
    .sdbvc-viewerBody {
      flex: 1;
      overflow: auto;
      padding: 22px;
    }
    .sdbvc-viewerHero,
    .sdbvc-viewerPanel {
      border: 1px solid var(--sdbvc-viewer-border);
      border-radius: 22px;
      background: var(--sdbvc-viewer-surface);
      box-shadow: 0 18px 40px rgba(93, 67, 33, 0.1);
      backdrop-filter: blur(10px);
    }
    .sdbvc-viewerHero {
      padding: 30px 34px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 28px;
      background: var(--sdbvc-viewer-hero-surface), var(--sdbvc-viewer-surface);
    }
    .sdbvc-viewerHeroCopy {
      display: grid;
      gap: 10px;
      min-width: 0;
      justify-items: start;
      align-content: start;
    }
    .sdbvc-viewerEyebrow {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 12px;
      color: #9b5425;
      font-weight: bold;
    }
    .sdbvc-viewerTitle {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(42px, 4vw, 68px);
      line-height: 0.94;
      color: var(--sdbvc-viewer-text);
    }
    .sdbvc-viewerHeroText {
      margin: 0;
      max-width: 760px;
      color: var(--sdbvc-viewer-muted);
      font-size: 16px;
      line-height: 1.55;
    }
    .sdbvc-viewerHeroMeta {
      min-width: 280px;
      display: grid;
      gap: 10px;
      color: var(--sdbvc-viewer-muted);
      font-size: 13px;
      line-height: 1.45;
      text-align: left;
      justify-items: start;
      padding: 18px 20px;
      border-radius: 20px;
      background: var(--sdbvc-viewer-surface-soft);
      border: 1px solid var(--sdbvc-viewer-border-soft);
    }
    .sdbvc-viewerGrid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 420px;
      gap: 22px;
      margin-top: 22px;
      align-items: start;
    }
    .sdbvc-viewerLeft {
      min-width: 0;
      display: grid;
      gap: 22px;
    }
    .sdbvc-viewerPanel {
      padding: 24px 26px;
    }
    .sdbvc-viewerHeading {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 18px;
    }
    .sdbvc-viewerHeadingActions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .sdbvc-viewerHeadingMain {
      min-width: 0;
      text-align: left;
    }
    .sdbvc-viewerHeading h2 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 32px;
      line-height: 1;
      color: var(--sdbvc-viewer-text);
    }
    .sdbvc-viewerHeading p {
      margin: 8px 0 0;
      color: var(--sdbvc-viewer-muted);
      font-size: 14px;
      line-height: 1.5;
    }
    .sdbvc-viewerStats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
    }
    .sdbvc-viewerStat {
      padding: 18px;
      border-radius: 18px;
      background: var(--sdbvc-viewer-surface-soft);
      border: 1px solid var(--sdbvc-viewer-border-soft);
    }
    .sdbvc-viewerStatLabel {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--sdbvc-viewer-muted);
      font-weight: bold;
    }
    .sdbvc-viewerStatValue {
      margin-top: 8px;
      font-size: 23px;
      line-height: 1.15;
      font-weight: bold;
      color: var(--sdbvc-viewer-text);
      white-space: nowrap;
    }
    .sdbvc-viewerFilters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 14px;
    }
    .sdbvc-viewerFilters label,
    .sdbvc-viewerInlineControl {
      display: grid;
      gap: 6px;
      font-size: 12px;
      color: var(--sdbvc-viewer-muted);
      font-weight: bold;
    }
    .sdbvc-viewerFilters input,
    .sdbvc-viewerFilters select,
    .sdbvc-viewerInlineControl select {
      width: 100%;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid var(--sdbvc-viewer-border);
      background: var(--sdbvc-viewer-input);
      color: var(--sdbvc-viewer-text);
    }
    .sdbvc-viewerFilterActions,
    .sdbvc-viewerResultsTools,
    .sdbvc-viewerViewToggle,
    .sdbvc-viewerPagination {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .sdbvc-viewerButton,
    .sdbvc-viewerPageButton {
      cursor: pointer;
      border: 1px solid var(--sdbvc-viewer-border);
      background: var(--sdbvc-viewer-input);
      color: var(--sdbvc-viewer-accent);
      border-radius: 999px;
      padding: 9px 14px;
      font-weight: bold;
    }
    .sdbvc-viewerButton.is-active,
    .sdbvc-viewerPageButton.is-active {
      background: linear-gradient(180deg, #bf4f22 0%, #983814 100%);
      color: #fff;
      border-color: #983814;
    }
    .sdbvc-viewerResultsHeader,
    .sdbvc-viewerSortRow {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }
    .sdbvc-viewerResultsTools {
      justify-content: flex-end;
      margin-left: auto;
    }
    .sdbvc-viewerResultsIntro {
      min-width: 0;
      text-align: left;
    }
    .sdbvc-viewerResultsIntro h2 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 32px;
      line-height: 1;
      color: var(--sdbvc-viewer-text);
    }
    .sdbvc-viewerResultsIntro p {
      margin: 8px 0 0;
      color: var(--sdbvc-viewer-muted);
      font-size: 14px;
      line-height: 1.5;
    }
    .sdbvc-viewerSortRow {
      display: none;
    }
    .sdbvc-viewerChips {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 18px 0 16px;
    }
    .sdbvc-viewerChip,
    .sdbvc-viewerPill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 7px 12px;
      background: var(--sdbvc-viewer-badge);
      color: var(--sdbvc-viewer-accent);
      font-size: 12px;
    }
    .sdbvc-viewerGridCards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
    }
    .sdbvc-viewerCard {
      cursor: pointer;
      padding: 16px;
      border-radius: 20px;
      background: var(--sdbvc-viewer-surface-strong);
      border: 1px solid var(--sdbvc-viewer-border-soft);
      transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
    }
    .sdbvc-viewerCard:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 26px rgba(93, 67, 33, 0.1);
      border-color: rgba(191, 79, 34, 0.24);
    }
    .sdbvc-viewerImageWrap {
      position: relative;
      display: grid;
      place-items: center;
      min-height: 132px;
      border-radius: 16px;
      background: var(--sdbvc-viewer-image-backdrop);
    }
    .sdbvc-viewerImage,
    .sdbvc-viewerDetailImage {
      max-width: 80px;
      max-height: 80px;
      image-rendering: auto;
    }
    .sdbvc-viewerQty {
      position: absolute;
      right: 8px;
      bottom: 8px;
      border-radius: 999px;
      background: rgba(34, 28, 23, 0.88);
      color: #fff;
      font-size: 11px;
      font-weight: bold;
      padding: 4px 8px;
    }
    .sdbvc-viewerCardTitle {
      margin-top: 14px;
      font-weight: bold;
      color: var(--sdbvc-viewer-text);
      line-height: 1.35;
      min-height: 2.6em;
      font-size: 14px;
    }
    .sdbvc-viewerPriceRow {
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 13px;
      color: var(--sdbvc-viewer-muted);
    }
    .sdbvc-viewerPriceRow strong {
      color: var(--sdbvc-viewer-text);
    }
    .sdbvc-viewerTableWrap {
      overflow: auto;
      border-radius: 16px;
      border: 1px solid var(--sdbvc-viewer-border-soft);
      background: var(--sdbvc-viewer-surface-soft);
    }
    .sdbvc-viewerTable {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .sdbvc-viewerTable th,
    .sdbvc-viewerTable td {
      padding: 14px 16px;
      text-align: left;
      border-bottom: 1px solid rgba(82, 57, 27, 0.08);
      white-space: nowrap;
    }
    .sdbvc-viewerTable tbody tr {
      cursor: pointer;
    }
    .sdbvc-viewerTable tbody tr:hover {
      background: rgba(255, 242, 224, 0.78);
    }
    .sdbvc-viewerEmpty {
      padding: 26px 18px;
      border-radius: 18px;
      text-align: center;
      color: var(--sdbvc-viewer-muted);
      background: var(--sdbvc-viewer-surface-soft);
      border: 1px dashed var(--sdbvc-viewer-border);
    }
    .sdbvc-viewerDetailEmpty {
      color: var(--sdbvc-viewer-muted);
      padding: 18px 0;
    }
    .sdbvc-viewerDetailHero {
      display: grid;
      justify-items: center;
      text-align: center;
      gap: 16px;
    }
    .sdbvc-viewerDetailMedia {
      width: 100%;
      display: grid;
      justify-items: center;
      gap: 12px;
    }
    .sdbvc-viewerDetailMedia .sdbvc-viewerImageWrap {
      width: min(220px, 100%);
      min-height: 170px;
      padding: 18px;
    }
    .sdbvc-viewerDetailImage {
      max-width: 140px;
      max-height: 140px;
    }
    .sdbvc-viewerDetailBody {
      width: 100%;
      display: grid;
      justify-items: center;
      gap: 10px;
    }
    .sdbvc-viewerDetailName {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 34px;
      line-height: 1.05;
      color: var(--sdbvc-viewer-text);
    }
    .sdbvc-viewerDetailMeta,
    .sdbvc-viewerDetailDescription {
      color: var(--sdbvc-viewer-muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .sdbvc-viewerDetailBody .sdbvc-viewerChips {
      justify-content: center;
      margin: 0;
    }
    .sdbvc-viewerDetailDescription {
      margin-top: 18px;
      text-align: left;
    }
    .sdbvc-viewerDetailStats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .sdbvc-viewerDetailStat {
      border-radius: 16px;
      background: var(--sdbvc-viewer-surface-soft);
      padding: 12px;
      border: 1px solid var(--sdbvc-viewer-border-soft);
    }
    .sdbvc-viewerDetailStat span {
      display: block;
      color: var(--sdbvc-viewer-muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: bold;
    }
    .sdbvc-viewerDetailStat strong {
      display: block;
      margin-top: 6px;
      color: var(--sdbvc-viewer-text);
    }
    .sdbvc-viewerLinkRow {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-top: 18px;
    }
    .sdbvc-viewerLink {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      background: var(--sdbvc-viewer-badge);
      color: var(--sdbvc-viewer-accent);
      text-decoration: none;
    }
    .sdbvc-viewerLinkIcon {
      width: 24px;
      height: 24px;
      object-fit: contain;
      border-radius: 6px;
      background: rgba(255,255,255,0.7);
      padding: 2px;
    }
    .sdbvc-viewerLinkButton {
      border: 0;
      cursor: pointer;
    }
    .sdbvc-viewerLinkButtonText {
      font-size: 21px;
      font-weight: bold;
      line-height: 1;
    }
    .sdbvc-viewerAside {
      display: grid;
      gap: 18px;
      align-content: start;
    }
    .sdbvc-viewerSubPanel {
      border-radius: 22px;
      border: 1px solid var(--sdbvc-viewer-border-soft);
      background: var(--sdbvc-viewer-surface-soft);
      padding: 18px;
    }
    .sdbvc-viewerSubPanelHeader {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 12px;
      margin-bottom: 12px;
    }
    .sdbvc-viewerSubPanelHeader h3 {
      margin: 0;
      font-size: 18px;
      color: var(--sdbvc-viewer-text);
    }
    .sdbvc-viewerSubPanelHeader p {
      margin: 4px 0 0;
      color: var(--sdbvc-viewer-muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .sdbvc-viewerRemovalList {
      display: grid;
      gap: 10px;
    }
    .sdbvc-viewerRemovalEmpty {
      color: var(--sdbvc-viewer-muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .sdbvc-viewerRemovalEntry {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 10px;
      align-items: center;
      padding: 12px;
      border-radius: 16px;
      border: 1px solid var(--sdbvc-viewer-border-soft);
      background: var(--sdbvc-viewer-surface-strong);
    }
    .sdbvc-viewerRemovalEntryName {
      min-width: 0;
    }
    .sdbvc-viewerRemovalEntryName strong {
      display: block;
      color: var(--sdbvc-viewer-text);
      font-size: 14px;
    }
    .sdbvc-viewerRemovalEntryName span {
      display: block;
      margin-top: 3px;
      color: var(--sdbvc-viewer-muted);
      font-size: 12px;
    }
    .sdbvc-viewerRemovalQty {
      width: 78px;
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid var(--sdbvc-viewer-border);
      background: var(--sdbvc-viewer-input);
      color: var(--sdbvc-viewer-text);
      font: inherit;
    }
    .sdbvc-viewerRemovalRemove {
      border: 1px solid var(--sdbvc-viewer-border);
      background: var(--sdbvc-viewer-input);
      color: var(--sdbvc-viewer-accent);
      border-radius: 999px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
      font-weight: bold;
    }
    .sdbvc-viewerRemovalControls {
      display: grid;
      gap: 12px;
      margin-top: 14px;
    }
    .sdbvc-viewerRemovalPinRow {
      display: grid;
      gap: 6px;
      color: var(--sdbvc-viewer-muted);
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .sdbvc-viewerRemovalPinInput {
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid var(--sdbvc-viewer-border);
      background: var(--sdbvc-viewer-input);
      color: var(--sdbvc-viewer-text);
      font: inherit;
      letter-spacing: 0.18em;
    }
    .sdbvc-viewerRemovalActions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .sdbvc-viewerRemovalActionButton {
      border: 1px solid var(--sdbvc-viewer-border);
      background: var(--sdbvc-viewer-badge);
      color: var(--sdbvc-viewer-accent);
      border-radius: 999px;
      padding: 10px 16px;
      cursor: pointer;
      font: inherit;
      font-weight: bold;
    }
    .sdbvc-viewerRemovalActionButton:disabled,
    .sdbvc-viewerRemovalRemove:disabled {
      cursor: default;
      opacity: 0.65;
    }
    .sdbvc-viewerRemovalStatus {
      min-height: 18px;
      color: var(--sdbvc-viewer-muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .sdbvc-viewerRemovalStatus.is-error {
      color: #b42318;
    }
    #sdbvcVisualizerOverlay[data-theme="cherry"] {
      --sdbvc-viewer-surface: rgba(255, 247, 250, 0.92);
      --sdbvc-viewer-surface-strong: rgba(255, 251, 253, 0.9);
      --sdbvc-viewer-surface-soft: rgba(255, 240, 246, 0.86);
      --sdbvc-viewer-surface-muted: rgba(255, 244, 248, 0.9);
      --sdbvc-viewer-hero-surface: linear-gradient(140deg, rgba(255, 243, 248, 0.96), rgba(255, 224, 236, 0.88));
      --sdbvc-viewer-text: #452d37;
      --sdbvc-viewer-muted: #8a6673;
      --sdbvc-viewer-accent: #b34067;
      --sdbvc-viewer-border: rgba(129, 67, 89, 0.16);
      --sdbvc-viewer-border-soft: rgba(129, 67, 89, 0.1);
      --sdbvc-viewer-badge: #ffe3ec;
      --sdbvc-viewer-input: rgba(255, 250, 252, 0.92);
      --sdbvc-viewer-image-backdrop: linear-gradient(180deg, rgba(255,252,253,0.96), rgba(255, 232, 241, 0.9));
    }
    #sdbvcVisualizerOverlay[data-theme="sky"] {
      --sdbvc-viewer-surface: rgba(246, 251, 255, 0.92);
      --sdbvc-viewer-surface-strong: rgba(252, 254, 255, 0.92);
      --sdbvc-viewer-surface-soft: rgba(231, 244, 255, 0.86);
      --sdbvc-viewer-surface-muted: rgba(242, 249, 255, 0.9);
      --sdbvc-viewer-hero-surface: linear-gradient(140deg, rgba(247, 252, 255, 0.96), rgba(220, 239, 255, 0.88));
      --sdbvc-viewer-text: #21384c;
      --sdbvc-viewer-muted: #64809a;
      --sdbvc-viewer-accent: #1769a6;
      --sdbvc-viewer-border: rgba(52, 103, 149, 0.16);
      --sdbvc-viewer-border-soft: rgba(52, 103, 149, 0.1);
      --sdbvc-viewer-badge: #deefff;
      --sdbvc-viewer-input: rgba(250, 253, 255, 0.94);
      --sdbvc-viewer-image-backdrop: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(223, 241, 255, 0.88));
    }
    #sdbvcVisualizerOverlay[data-theme="iron"] {
      --sdbvc-viewer-surface: rgba(245, 247, 249, 0.92);
      --sdbvc-viewer-surface-strong: rgba(251, 252, 253, 0.92);
      --sdbvc-viewer-surface-soft: rgba(232, 236, 240, 0.86);
      --sdbvc-viewer-surface-muted: rgba(242, 245, 247, 0.9);
      --sdbvc-viewer-hero-surface: linear-gradient(140deg, rgba(249, 250, 251, 0.96), rgba(224, 229, 235, 0.88));
      --sdbvc-viewer-text: #2a3139;
      --sdbvc-viewer-muted: #69737d;
      --sdbvc-viewer-accent: #4c5c6b;
      --sdbvc-viewer-border: rgba(66, 76, 86, 0.16);
      --sdbvc-viewer-border-soft: rgba(66, 76, 86, 0.1);
      --sdbvc-viewer-badge: #d9dee4;
      --sdbvc-viewer-input: rgba(252, 253, 254, 0.94);
      --sdbvc-viewer-image-backdrop: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(231, 236, 241, 0.88));
    }
    #sdbvcVisualizerOverlay[data-theme="dreams"] {
      --sdbvc-viewer-surface: rgba(250, 248, 255, 0.92);
      --sdbvc-viewer-surface-strong: rgba(253, 252, 255, 0.92);
      --sdbvc-viewer-surface-soft: rgba(239, 234, 255, 0.86);
      --sdbvc-viewer-surface-muted: rgba(247, 244, 255, 0.9);
      --sdbvc-viewer-hero-surface: linear-gradient(140deg, rgba(252, 250, 255, 0.96), rgba(233, 225, 255, 0.88));
      --sdbvc-viewer-text: #3d3557;
      --sdbvc-viewer-muted: #7e769a;
      --sdbvc-viewer-accent: #6651bf;
      --sdbvc-viewer-border: rgba(93, 79, 133, 0.16);
      --sdbvc-viewer-border-soft: rgba(93, 79, 133, 0.1);
      --sdbvc-viewer-badge: #ece7ff;
      --sdbvc-viewer-input: rgba(253, 252, 255, 0.94);
      --sdbvc-viewer-image-backdrop: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(236, 230, 255, 0.88));
    }
    #sdbvcVisualizerOverlay[data-theme="cherry"] .sdbvc-viewerShell {
      background:
        radial-gradient(circle at top left, rgba(255, 201, 223, 0.78), transparent 24%),
        radial-gradient(circle at top right, rgba(255, 232, 191, 0.45), transparent 20%),
        linear-gradient(180deg, #fff5f8 0%, #f7e2e8 100%);
    }
    #sdbvcVisualizerOverlay[data-theme="sky"] .sdbvc-viewerShell {
      background:
        radial-gradient(circle at top left, rgba(198, 227, 255, 0.82), transparent 24%),
        radial-gradient(circle at top right, rgba(215, 244, 255, 0.5), transparent 20%),
        linear-gradient(180deg, #f3f9ff 0%, #deebf7 100%);
    }
    #sdbvcVisualizerOverlay[data-theme="iron"] .sdbvc-viewerShell {
      background:
        radial-gradient(circle at top left, rgba(221, 228, 234, 0.82), transparent 24%),
        radial-gradient(circle at top right, rgba(244, 247, 250, 0.44), transparent 20%),
        linear-gradient(180deg, #f2f4f6 0%, #dfe4e9 100%);
    }
    #sdbvcVisualizerOverlay[data-theme="dreams"] .sdbvc-viewerShell {
      background:
        radial-gradient(circle at top left, rgba(224, 214, 255, 0.82), transparent 24%),
        radial-gradient(circle at top right, rgba(205, 232, 255, 0.48), transparent 20%),
        linear-gradient(180deg, #f7f4ff 0%, #e8e2ff 100%);
    }
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerShell {
      --sdbvc-viewer-surface: rgba(30, 35, 43, 0.9);
      --sdbvc-viewer-surface-strong: rgba(34, 40, 49, 0.92);
      --sdbvc-viewer-surface-soft: rgba(39, 45, 54, 0.9);
      --sdbvc-viewer-surface-muted: rgba(33, 39, 47, 0.92);
      --sdbvc-viewer-hero-surface: linear-gradient(140deg, rgba(34, 39, 46, 0.96), rgba(27, 31, 37, 0.88));
      --sdbvc-viewer-text: #f2ede4;
      --sdbvc-viewer-muted: #b8b0a4;
      --sdbvc-viewer-accent: #f2ede4;
      --sdbvc-viewer-border: rgba(233, 220, 201, 0.12);
      --sdbvc-viewer-border-soft: rgba(233, 220, 201, 0.08);
      --sdbvc-viewer-badge: #2e343d;
      --sdbvc-viewer-input: rgba(39, 45, 54, 0.94);
      --sdbvc-viewer-image-backdrop: linear-gradient(180deg, rgba(44, 51, 61, 0.95), rgba(32, 37, 45, 0.9));
      background:
        radial-gradient(circle at top left, rgba(92, 67, 50, 0.24), transparent 24%),
        radial-gradient(circle at top right, rgba(54, 81, 93, 0.22), transparent 20%),
        linear-gradient(180deg, #1b1f26 0%, #20252d 100%);
    }
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerTitle,
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerDetailName,
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerStatValue,
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerPriceRow strong,
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerDetailStat strong {
      color: #f2ede4;
    }
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerTopbar span,
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerStatus,
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerHeroText,
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerHeading p,
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerDetailMeta,
    #sdbvcVisualizerOverlay[data-theme="dark"] .sdbvc-viewerDetailDescription {
      color: #b8b0a4;
    }
    @media (max-width: 1100px) {
      .sdbvc-viewerGrid {
        grid-template-columns: 1fr;
      }
      .sdbvc-viewerHeading,
      .sdbvc-viewerResultsHeader {
        flex-direction: column;
      }
      .sdbvc-viewerHeadingActions,
      .sdbvc-viewerResultsTools {
        justify-content: flex-start;
        margin-left: 0;
      }
      .sdbvc-viewerHero {
        align-items: start;
        flex-direction: column;
      }
      .sdbvc-viewerHeroMeta {
        text-align: left;
      }
    }
    @media (max-width: 700px) {
      #sdbvcVisualizerOverlay {
        padding: 10px;
      }
      .sdbvc-viewerShell {
        height: 96vh;
      }
      .sdbvc-viewerBody {
        padding: 12px;
      }
      .sdbvc-viewerTopbar {
        padding: 14px;
      }
      .sdbvc-viewerStatus {
        padding: 10px 14px;
      }
      .sdbvc-viewerPanel,
      .sdbvc-viewerHero {
        padding: 16px;
      }
      .sdbvc-viewerGridCards {
        grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
      }
      .sdbvc-viewerTitle {
        font-size: clamp(34px, 9vw, 48px);
      }
      .sdbvc-viewerHeroText {
        font-size: 15px;
      }
      .sdbvc-viewerDetailName {
        font-size: 28px;
      }
      .sdbvc-viewerDetailMedia .sdbvc-viewerImageWrap {
        width: min(180px, 100%);
        min-height: 150px;
      }
      .sdbvc-viewerDetailImage {
        max-width: 120px;
        max-height: 120px;
      }
      .sdbvc-viewerRemovalEntry {
        grid-template-columns: 1fr;
      }
      .sdbvc-viewerRemovalActions {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `;

  document.head.appendChild(style);
  document.querySelector(".content").insertBefore(host, document.querySelector(".content").firstChild);

  const statusEl = host.querySelector("#sdbvcStatus");
  if (!isMainSdbPage) {
    setCompactStatus(statusEl);
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
    embeddedReport: host.querySelector("#sdbvcEmbeddedReportButton"),
    clearZones: host.querySelector("#sdbvcClearZonesButton"),
    exportFull: host.querySelector("#sdbvcExportFullButton"),
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
    const totalPages = Math.max(
      Number(scanMeta.totalPages || 0),
      Number(currentPageMeta.totalPages || 0),
      visitedPages.length,
      Object.keys(buildPageItemIdsMap(scanMeta.pageItemIdsByPage)).length,
    );
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
      `Logged ${items.length.toLocaleString("en-US")} unique items / ${totalQty.toLocaleString("en-US")} total quantity \n` +
      `Visited pages: ${visitedPages.length}/${totalPages || 0}\n` +
      `itemdb entries: ${Object.keys(itemDatabase).length.toLocaleString("en-US")}\n` +
      `Wearables checked for zones: ${zonesCheckedCount.toLocaleString("en-US")} | With zones found: ${zonesCount.toLocaleString("en-US")}\n` +
      `itemdb remaining: ${pendingItemdb.toLocaleString("en-US")} | Resume: ${resumeAt}\n` +
      `price refresh remaining: ${pendingPrices.toLocaleString("en-US")} | Resume: ${priceResumeAt}\n` +
      `Last prices refreshed: ${lastPricesRefreshed}\n` +
      `Last full scan: ${lastFullScan}`;
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

  buttons.embeddedReport.addEventListener("click", () => {
    try {
      openEmbeddedVisualizerReport({
        status: setStatus,
      });
    } catch (error) {
      console.error("Contextual visualizer open failed", error);
      setStatus(`Contextual report failed to open: ${error.message}`);
    }
  });

  buttons.exportFull.addEventListener("click", () => {
    const snapshotMode = hasAuthoritativeFullScan() ? "full" : "partial";
    const payload = buildVisualizerExportPayload({ snapshotMode, itemScope: "stored" });
    if (!payload.items.length) {
      setStatus("No stored SDB data yet. Run a scan first.");
      return;
    }
    const result = exportVisualizerPayload(payload, `sdb-visualizer-${snapshotMode}`);
    setStatus(result.message);
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

function setCollectorStatusMessage(message) {
  const statusEl = document.querySelector("#sdbvcStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", /failed|error|warning|rate limit|429|502|503|504|stopped/i.test(message));
}

function getStoredRemovalDraft() {
  const raw = JSON.parse(GM_getValue(STORAGE_KEYS.removalDraft, "null"));
  return raw && typeof raw === "object" ? raw : null;
}

function setStoredRemovalDraft(draft) {
  GM_setValue(STORAGE_KEYS.removalDraft, JSON.stringify(draft));
}

function clearStoredRemovalDraft() {
  GM_deleteValue(STORAGE_KEYS.removalDraft);
}

function getStoredItems() {
  return JSON.parse(GM_getValue(STORAGE_KEYS.allItems, "[]"));
}

function setStoredItems(items) {
  GM_setValue(STORAGE_KEYS.allItems, JSON.stringify(items));
}

function getVisitedPages() {
  const raw = JSON.parse(GM_getValue(STORAGE_KEYS.visitedPages, "[]"));
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === "object" && raw.__scoped && raw.scopes && typeof raw.scopes === "object") {
    const browsePages = raw.scopes.browse;
    return Array.isArray(browsePages) ? browsePages : [];
  }
  return [];
}

function setVisitedPages(pages) {
  GM_setValue(STORAGE_KEYS.visitedPages, JSON.stringify(pages));
}

function getItemDatabase() {
  return JSON.parse(GM_getValue(STORAGE_KEYS.itemDatabase, "{}"));
}

function setItemDatabase(itemDatabase) {
  GM_setValue(STORAGE_KEYS.itemDatabase, JSON.stringify(itemDatabase));
}

function getScanMeta() {
  const raw = JSON.parse(GM_getValue(STORAGE_KEYS.scanMeta, "{}"));
  if (raw && typeof raw === "object" && raw.__scoped && raw.scopes && typeof raw.scopes === "object") {
    const browseMeta = raw.scopes.browse;
    return browseMeta && typeof browseMeta === "object" ? browseMeta : {};
  }
  return raw && typeof raw === "object" ? raw : {};
}

function setScanMeta(scanMeta) {
  GM_setValue(STORAGE_KEYS.scanMeta, JSON.stringify(scanMeta));
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
  const scanMeta = getScanMeta();
  const visitedPages = getVisitedPages();
  const totalPages = scanMeta.totalPages || currentPageMeta.totalPages || 0;
  const hasFailedPages = Array.isArray(scanMeta.failedScanPages) && scanMeta.failedScanPages.length > 0;
  return Boolean(scanMeta.lastFullScanAt) && totalPages > 0 && visitedPages.length >= totalPages && !hasFailedPages;
}

function getCurrentPageMeta(doc) {
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
  };
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

function recordCurrentPage(doc, pageNumber) {
  const items = parseSdbRows(doc);
  const mergedItems = mergeItemsById(getStoredItems(), items);
  setStoredItems(mergedItems);

  const visitedPages = getVisitedPages();
  if (!visitedPages.includes(pageNumber)) {
    visitedPages.push(pageNumber);
    visitedPages.sort((a, b) => a - b);
    setVisitedPages(visitedPages);
  }

  const pageMeta = getCurrentPageMeta(doc);
  const scanMeta = getScanMeta();
  const pageItemIds = buildPageItemIdsMap(scanMeta.pageItemIdsByPage);
  pageItemIds[String(pageNumber)] = items.map((item) => item.id);
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
    pageItemIdsByPage: pageItemIds,
    pagesChangedSinceFullScan,
    failedScanPages,
    lastFailedScanAt: failedScanPages.length ? scanMeta.lastFailedScanAt || new Date().toISOString() : null,
  });
}

async function scanEntireSdb({ onProgress } = {}) {
  const pageMeta = getCurrentPageMeta(document);
  const offsets = Array.from({ length: pageMeta.totalPages }, (_, index) => index * 30);
  const collectedItems = [];
  const failedPages = [];
  const pageItemIdsByPage = {};

  for (let index = 0; index < offsets.length; index += 1) {
    const offset = offsets[index];
    const scanResult = await fetchAndParseSdbPage({
      offset,
      pageIndex: index + 1,
      totalPages: offsets.length,
      onProgress,
    });
    collectedItems.push(...scanResult.items);
    if (scanResult.valid) {
      pageItemIdsByPage[String(index + 1)] = scanResult.items.map((item) => item.id);
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

  const uniqueItems = mergeItemsById([], collectedItems);
  setStoredItems(uniqueItems);
  const failedPageNumbers = new Set(failedPages.map((page) => page.pageIndex));
  setVisitedPages(Array.from({ length: offsets.length }, (_, index) => index + 1).filter((pageNumber) => !failedPageNumbers.has(pageNumber)));
  setScanMeta({
    ...getScanMeta(),
    totalPages: pageMeta.totalPages,
    totalItems: pageMeta.totalItems,
    totalQuantity: pageMeta.totalQuantity,
    username: pageMeta.username || getScanMeta().username || null,
    lastFullScanAt: new Date().toISOString(),
    lastObservedPage: 1,
    pageItemIdsByPage,
    pagesChangedSinceFullScan: [],
    failedScanPages: failedPages,
    lastFailedScanAt: failedPages.length ? new Date().toISOString() : null,
  });
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
  if (offset === 0) {
    return `${location.origin}/safetydeposit.phtml`;
  }
  return `${location.origin}/safetydeposit.phtml?category=0&obj_name=&offset=${offset}`;
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

function buildVisualizerExportPayload({ snapshotMode = "partial", itemScope = "snapshot" } = {}) {
  const pageMeta = getCurrentPageMeta(document);
  const scanMeta = getScanMeta();
  const itemDatabase = getItemDatabase();
  const items = getStoredItems();
  const storedTotalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
  const visitedPages = getVisitedPages();
  const totalPages = scanMeta.totalPages || pageMeta.totalPages;
  const pageItemIdsByPage = buildPageItemIdsMap(scanMeta.pageItemIdsByPage);
  const pagesImported = snapshotMode === "full"
    ? visitedPages
    : getPartialExportPages(scanMeta, pageMeta.currentPage, visitedPages, pageItemIdsByPage);
  const pageCoverage = totalPages > 0 ? pagesImported.length / totalPages : 0;
  const exportedItemIds = new Set(
    snapshotMode === "full"
      ? items.map((item) => item.id)
      : pagesImported.flatMap((pageNumber) => pageItemIdsByPage[String(pageNumber)] || []),
  );
  const exportItems = itemScope === "stored"
    ? items
    : items.filter((item) => exportedItemIds.has(item.id));
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
    totalItems: items.length,
    totalQuantity: storedTotalQty,
    lastFullScanAt: scanMeta.lastFullScanAt || null,
    lastPageRecordedAt: scanMeta.lastPageRecordedAt || null,
    lastObservedPage: scanMeta.lastObservedPage || pageMeta.currentPage,
    categoryOptions,
    items: exportItems.map((item) => ({
      ...item,
      itemdb: normalizeItemdbForExport(itemDatabase[item.id]) || null,
    })),
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
        ? ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : [],
    ]),
  );
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

function openEmbeddedVisualizerReport({ status }) {
  const hasFullScan = hasAuthoritativeFullScan();
  const snapshotMode = hasFullScan ? "full" : "partial";
  const payload = buildVisualizerExportPayload({ snapshotMode });
  if (!payload.items.length) {
    status("No stored SDB data yet. Run a scan first.");
    return;
  }

  const overlay = ensureVisualizerOverlay();
  viewerState = createViewerState(payload);
  overlay.status.textContent = hasFullScan
    ? "Contextual report ready."
    : "Contextual report ready. Data coverage is partial until you finish a full scan.";
  overlay.host.classList.remove("is-hidden");
  document.body.style.overflow = "hidden";
  applyContextualViewerTheme();
  renderContextualViewer();
  status(hasFullScan ? "Opening contextual full report..." : "Opening contextual partial report from saved collector data...");
}

function ensureVisualizerOverlay() {
  if (visualizerOverlayElements) {
    return visualizerOverlayElements;
  }

  const host = document.createElement("div");
  host.id = "sdbvcVisualizerOverlay";
  host.className = "is-hidden";
  host.innerHTML = `
    <div class="sdbvc-viewerShell">
      <div class="sdbvc-viewerTopbar">
        <div class="sdbvc-viewerTopbarIntro">
          <strong>SDB Visualizer</strong>
          <span>Pretty report view rendered directly by the userscript on Neopets.</span>
        </div>
        <div class="sdbvc-viewerTopbarActions">
          <label class="sdbvc-viewerThemeControl">
            <span>Theme</span>
            <select data-action="theme-select">
              <option value="default">Default</option>
              <option value="cherry">Cherry Blossoms</option>
              <option value="sky">Sky Blue</option>
              <option value="iron">Iron Steel</option>
              <option value="dreams">Lavender Dreams</option>
              <option value="dark">Dark Mode</option>
            </select>
          </label>
          <button type="button" data-action="close">Close</button>
        </div>
      </div>
      <div class="sdbvc-viewerStatus" data-role="status">
        Loading report...
      </div>
      <div class="sdbvc-viewerBody">
        <section class="sdbvc-viewerHero">
          <div class="sdbvc-viewerHeroCopy">
            <div class="sdbvc-viewerEyebrow">Neopets Safety Deposit Box</div>
            <h1 class="sdbvc-viewerTitle" data-role="title">SDB Visualizer</h1>
            <p class="sdbvc-viewerHeroText">Explore your full Safety Deposit Box in one place with richer filters, images, itemDB metadata, and no single-page limits.</p>
          </div>
          <div class="sdbvc-viewerHeroMeta" data-role="heroMeta"></div>
        </section>
        <div class="sdbvc-viewerGrid">
          <div class="sdbvc-viewerLeft">
            <section class="sdbvc-viewerPanel">
              <div class="sdbvc-viewerHeading">
                <div class="sdbvc-viewerHeadingMain">
                  <h2>Overview</h2>
                  <p data-role="datasetMeta">Waiting for data.</p>
                </div>
              </div>
              <div class="sdbvc-viewerStats" data-role="stats"></div>
            </section>
            <section class="sdbvc-viewerPanel">
              <div class="sdbvc-viewerHeading">
                <div class="sdbvc-viewerHeadingMain">
                  <h2>Filters</h2>
                  <p>Mix native SDB fields with itemDB metadata.</p>
                </div>
                <div class="sdbvc-viewerHeadingActions sdbvc-viewerFilterActions">
                  <button type="button" class="sdbvc-viewerButton" data-action="reset-filters">Reset Filters</button>
                </div>
              </div>
              <div class="sdbvc-viewerFilters">
                <label><span>Search</span><input type="text" data-filter="search" placeholder="Name, description, type..." /></label>
                <label><span>SDB Type</span><select data-filter="sdbType"></select></label>
                <label><span>ItemDB Category</span><select data-filter="itemdbCategory"></select></label>
                <label><span>Currency</span><select data-filter="currency"><option value="all">All Items</option><option value="np">Neopoint Only</option><option value="nc">Neocash Only</option></select></label>
                <label><span>Wearable</span><select data-filter="wearable"><option value="all">All</option><option value="true">Wearable</option><option value="false">Not Wearable</option></select></label>
                <label><span>Zoning</span><select data-filter="zoning"></select></label>
                <label><span>Neohome</span><select data-filter="neohome"><option value="all">All</option><option value="true">Neohome</option><option value="false">Not Neohome</option></select></label>
                <label><span>Min Rarity</span><input type="number" min="0" data-filter="minRarity" placeholder="0" /></label>
                <label><span>Max Rarity</span><input type="number" min="0" data-filter="maxRarity" placeholder="999" /></label>
                <label><span>Min Price</span><input type="number" min="0" data-filter="minPrice" placeholder="0" /></label>
              </div>
            </section>
            <section class="sdbvc-viewerPanel">
              <div class="sdbvc-viewerResultsHeader">
                <div class="sdbvc-viewerResultsIntro">
                  <h2>Items</h2>
                  <p data-role="resultsMeta">0 items</p>
                </div>
                <div class="sdbvc-viewerResultsTools">
                  <label class="sdbvc-viewerInlineControl">
                    <span>Sort By</span>
                    <select data-filter="sortBy"></select>
                  </label>
                  <label class="sdbvc-viewerInlineControl"><span>Show</span><select data-filter="pageSize"><option value="25">25 items</option><option value="50">50 items</option><option value="75">75 items</option><option value="100">100 items</option><option value="200">200 items</option><option value="all">All items</option></select></label>
                  <div class="sdbvc-viewerViewToggle">
                    <button type="button" class="sdbvc-viewerButton" data-action="view-grid">Grid</button>
                    <button type="button" class="sdbvc-viewerButton" data-action="view-table">Table</button>
                  </div>
                </div>
              </div>
              <div class="sdbvc-viewerChips" data-role="chips"></div>
              <div class="sdbvc-viewerEmpty is-hidden" data-role="empty">No items match your current filters.</div>
              <div data-role="grid"></div>
              <div class="is-hidden" data-role="table"></div>
              <div class="sdbvc-viewerPagination" data-role="pagination"></div>
            </section>
          </div>
          <aside class="sdbvc-viewerAside">
            <section class="sdbvc-viewerPanel">
              <div class="sdbvc-viewerHeading">
                <div class="sdbvc-viewerHeadingMain">
                  <h2>Item Detail</h2>
                  <p>Click any item card or row for more context.</p>
                </div>
              </div>
              <div data-role="detail" class="sdbvc-viewerDetailEmpty">No item selected yet.</div>
            </section>
            <section class="sdbvc-viewerSubPanel" data-role="removalPanel">
              <div class="sdbvc-viewerSubPanelHeader">
                <div>
                  <h3>Removal List</h3>
                  <p>Queue items to pull out of your SDB, then submit them together.</p>
                </div>
              </div>
              <div data-role="removalList"></div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  const closeButton = host.querySelector('[data-action="close"]');
  closeButton?.addEventListener("click", closeEmbeddedVisualizerOverlay);
  host.addEventListener("click", (event) => {
    if (event.target === host) {
      closeEmbeddedVisualizerOverlay();
    }
  });
  document.addEventListener("keydown", handleEmbeddedVisualizerEscape);
  host.querySelector('[data-action="reset-filters"]')?.addEventListener("click", resetContextualViewerFilters);
  host.querySelector('[data-action="view-grid"]')?.addEventListener("click", () => setContextualViewerView("grid"));
  host.querySelector('[data-action="view-table"]')?.addEventListener("click", () => setContextualViewerView("table"));
  host.querySelector('[data-action="theme-select"]')?.addEventListener("change", updateContextualViewerTheme);
  host.querySelectorAll("[data-filter]").forEach((element) => {
    const eventName = element.tagName === "SELECT" ? "change" : "input";
    element.addEventListener(eventName, updateContextualViewerFilter);
  });
  host.querySelector('[data-role="grid"]')?.addEventListener("click", selectContextualViewerItemFromEvent);
  host.querySelector('[data-role="table"]')?.addEventListener("click", selectContextualViewerItemFromEvent);
  host.querySelector('[data-role="pagination"]')?.addEventListener("click", handleContextualViewerPaginationClick);
  host.querySelector('[data-role="detail"]')?.addEventListener("click", handleContextualViewerDetailClick);
  host.querySelector('[data-role="removalList"]')?.addEventListener("click", handleContextualViewerRemovalListClick);
  host.querySelector('[data-role="removalList"]')?.addEventListener("input", handleContextualViewerRemovalListInput);
  host.querySelector('[data-role="removalList"]')?.addEventListener("change", handleContextualViewerRemovalListInput);

  visualizerOverlayElements = {
    host,
    status: host.querySelector('[data-role="status"]'),
    title: host.querySelector('[data-role="title"]'),
    heroMeta: host.querySelector('[data-role="heroMeta"]'),
    datasetMeta: host.querySelector('[data-role="datasetMeta"]'),
    stats: host.querySelector('[data-role="stats"]'),
    resultsMeta: host.querySelector('[data-role="resultsMeta"]'),
    chips: host.querySelector('[data-role="chips"]'),
    empty: host.querySelector('[data-role="empty"]'),
    grid: host.querySelector('[data-role="grid"]'),
    table: host.querySelector('[data-role="table"]'),
    pagination: host.querySelector('[data-role="pagination"]'),
    detail: host.querySelector('[data-role="detail"]'),
    removalList: host.querySelector('[data-role="removalList"]'),
  };
  return visualizerOverlayElements;
}

function closeEmbeddedVisualizerOverlay() {
  if (!visualizerOverlayElements) return;
  visualizerOverlayElements.host.classList.add("is-hidden");
  document.body.style.overflow = "";
}

function handleEmbeddedVisualizerEscape(event) {
  if (event.key === "Escape" && visualizerOverlayElements && !visualizerOverlayElements.host.classList.contains("is-hidden")) {
    closeEmbeddedVisualizerOverlay();
  }
}

function createViewerState(payload) {
  const dataset = {
    username: payload.username || null,
    snapshotMode: payload.snapshotMode || "partial",
    totalPages: payload.totalPages ?? null,
    totalItems: payload.totalItems ?? null,
    totalQuantity: payload.totalQuantity ?? null,
    pagesImported: Array.isArray(payload.pagesImported) ? payload.pagesImported : [],
    lastImportedAt: payload.exportedAt || new Date().toISOString(),
    lastFullScanAt: payload.lastFullScanAt || null,
    lastPageRecordedAt: payload.lastPageRecordedAt || null,
    lastObservedPage: payload.lastObservedPage ?? payload.currentPage ?? null,
    items: (payload.items || []).map((item) => normalizeViewerItem(item)).sort((a, b) => a.name.localeCompare(b.name)),
  };
  const storedRemovalDraft = getStoredRemovalDraft();
  const removalList = buildViewerRemovalListFromDraft(storedRemovalDraft, dataset);

  return {
    dataset,
    filters: { ...VIEWER_DEFAULT_FILTERS },
    view: "grid",
    currentPage: 1,
    theme: GM_getValue(STORAGE_KEYS.viewerTheme, "default"),
    selectedItemId: dataset.items[0]?.id ?? null,
    removalList,
    removalPin: "",
    removalStatus: Object.keys(removalList).length ? "Removal list restored from saved browser data." : "",
    removalStatusIsError: false,
    isRemovingItems: false,
  };
}

function normalizeViewerItem(item) {
  return {
    id: Number(item.id),
    name: item.name || "Unknown Item",
    qty: Number(item.qty || 0),
    image: item.image || "",
    description: item.description || "",
    sdbType: item.sdbType || item.type || item.cat || "",
    itemdb: item.itemdb
      ? {
          internal_id: safeNumber(item.itemdb.internal_id),
          item_id: safeNumber(item.itemdb.item_id),
          image: item.itemdb.image || "",
          category: item.itemdb.category || item.itemdb.cat || "",
          value: safeNumber(item.itemdb.value),
          estVal: safeNumber(item.itemdb.estVal),
          rarity: safeNumber(item.itemdb.rarity),
          isNC: Boolean(item.itemdb.isNC),
          isBD: Boolean(item.itemdb.isBD),
          isWearable: Boolean(item.itemdb.isWearable),
          isNeohome: Boolean(item.itemdb.isNeohome),
          type: item.itemdb.type || "",
          description: item.itemdb.description || "",
          status: item.itemdb.status || "",
          slug: item.itemdb.slug || "",
          zones: Array.isArray(item.itemdb.zones) ? item.itemdb.zones : [],
          zonesFetchedAt: item.itemdb.zonesFetchedAt || null,
          fetchedAt: item.itemdb.fetchedAt || null,
        }
      : null,
  };
}

function resetContextualViewerFilters() {
  if (!viewerState) return;
  viewerState.filters = { ...VIEWER_DEFAULT_FILTERS };
  viewerState.currentPage = 1;
  renderContextualViewer();
}

function setContextualViewerView(view) {
  if (!viewerState) return;
  viewerState.view = view;
  renderContextualViewer();
}

function updateContextualViewerTheme(event) {
  if (!viewerState) return;
  viewerState.theme = event.currentTarget.value || "default";
  GM_setValue(STORAGE_KEYS.viewerTheme, viewerState.theme);
  applyContextualViewerTheme();
}

function applyContextualViewerTheme() {
  if (!viewerState || !visualizerOverlayElements) return;
  visualizerOverlayElements.host.dataset.theme = viewerState.theme || "default";
  const select = visualizerOverlayElements.host.querySelector('[data-action="theme-select"]');
  if (select) {
    select.value = viewerState.theme || "default";
  }
}

function updateContextualViewerFilter(event) {
  if (!viewerState) return;
  const key = event.currentTarget.getAttribute("data-filter");
  viewerState.filters[key] = event.currentTarget.value;
  viewerState.currentPage = 1;
  renderContextualViewer();
}

function selectContextualViewerItemFromEvent(event) {
  if (!viewerState) return;
  const element = event.target.closest("[data-item-id]");
  if (!element) return;
  viewerState.selectedItemId = Number(element.getAttribute("data-item-id"));
  renderContextualViewerDetail();
}

function handleContextualViewerPaginationClick(event) {
  if (!viewerState) return;
  const button = event.target.closest("[data-page]");
  if (!button) return;
  const nextPage = Number(button.getAttribute("data-page"));
  if (!Number.isFinite(nextPage) || nextPage < 1) return;
  viewerState.currentPage = nextPage;
  renderContextualViewer();
}

function renderContextualViewer() {
  if (!viewerState || !visualizerOverlayElements) return;
  applyContextualViewerTheme();
  syncViewerControls();
  populateViewerSortOptions();
  populateViewerFilterOptions();
  renderContextualViewerOverview();
  renderContextualViewerResults();
  renderContextualViewerDetail();
  renderContextualViewerRemovalList();
}

function syncViewerControls() {
  visualizerOverlayElements.host.querySelectorAll("[data-filter]").forEach((element) => {
    const key = element.getAttribute("data-filter");
    const value = key in viewerState.filters ? viewerState.filters[key] : "";
    element.value = value;
  });
}

function populateViewerSortOptions() {
  const select = visualizerOverlayElements.host.querySelector('[data-filter="sortBy"]');
  if (!select || select.dataset.ready === "true") return;
  const options = ['<option value="">Default</option>'];
  VIEWER_SORT_OPTIONS.forEach((option) => {
    options.push(`<option value="${escapeAttribute(option.key)}-asc">${escapeHtml(option.label)} (Ascending)</option>`);
    options.push(`<option value="${escapeAttribute(option.key)}-desc">${escapeHtml(option.label)} (Descending)</option>`);
  });
  select.innerHTML = options.join("");
  select.dataset.ready = "true";
  select.value = viewerState.filters.sortBy;
}

function populateViewerFilterOptions() {
  const items = viewerState.dataset.items;
  fillViewerSelect(
    visualizerOverlayElements.host.querySelector('[data-filter="sdbType"]'),
    "All SDB Types",
    [...new Set(items.map((item) => item.sdbType).filter(Boolean))].sort(),
    viewerState.filters.sdbType,
  );
  fillViewerSelect(
    visualizerOverlayElements.host.querySelector('[data-filter="itemdbCategory"]'),
    "All Categories",
    [...new Set(items.map((item) => item.itemdb?.category).filter(Boolean))].sort(),
    viewerState.filters.itemdbCategory,
  );
  fillViewerSelect(
    visualizerOverlayElements.host.querySelector('[data-filter="zoning"]'),
    "All Zones",
    [...new Set(items.flatMap((item) => item.itemdb?.zones || []).filter(Boolean))].sort(),
    viewerState.filters.zoning,
  );
}

function fillViewerSelect(select, fallbackLabel, values, currentValue) {
  if (!select) return;
  select.innerHTML = `<option value="all">${escapeHtml(fallbackLabel)}</option>${values
    .map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
  select.value = values.includes(currentValue) || currentValue === "all" ? currentValue : "all";
}

function renderContextualViewerOverview() {
  const dataset = viewerState.dataset;
  const items = dataset.items;
  const enriched = items.filter((item) => item.itemdb);
  const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
  const totalValue = items.reduce((sum, item) => sum + getViewerStackValue(item), 0);
  const ncCount = items.filter((item) => isViewerNcItem(item)).length;
  const pages = dataset.pagesImported.length;
  const coverageLabel = formatViewerCoverage(pages, dataset.totalPages);
  const snapshotLabel = getViewerSnapshotLabel(dataset.snapshotMode);
  const lastImported = dataset.lastImportedAt ? new Date(dataset.lastImportedAt).toLocaleString() : "Not imported yet";

  visualizerOverlayElements.title.textContent = dataset.username ? `SDB Visualizer - ${dataset.username}` : "SDB Visualizer";
  visualizerOverlayElements.heroMeta.innerHTML = `
    <div>Snapshot: <strong>${escapeHtml(snapshotLabel)}</strong></div>
    <div>Coverage: <strong>${escapeHtml(coverageLabel)}</strong></div>
    <div>Last updated: <strong>${escapeHtml(lastImported)}</strong></div>
  `;
  visualizerOverlayElements.datasetMeta.textContent = items.length
    ? `${pages} imported page${pages === 1 ? "" : "s"} | coverage ${coverageLabel} | snapshot ${snapshotLabel} | last updated ${lastImported}`
    : "Waiting for imported data.";

  const stats = [
    ["Unique Items", formatNumber(items.length)],
    ["Total Quantity", formatNumber(totalQty)],
    ["Enriched Items", formatNumber(enriched.length)],
    ["Est. Total NP Value", formatNp(totalValue)],
    ["NC Items", formatNumber(ncCount)],
  ];

  visualizerOverlayElements.stats.innerHTML = stats
    .map(
      ([label, value]) => `
        <article class="sdbvc-viewerStat">
          <div class="sdbvc-viewerStatLabel">${escapeHtml(label)}</div>
          <div class="sdbvc-viewerStatValue">${escapeHtml(value)}</div>
        </article>
      `,
    )
    .join("");
}

function renderContextualViewerResults() {
  const filtered = getViewerFilteredItems();
  const pagination = paginateViewerItems(filtered);
  const visibleItems = pagination.items;
  const uniqueTypes = new Set(visibleItems.map((item) => item.sdbType).filter(Boolean));
  const categories = new Set(visibleItems.map((item) => item.itemdb?.category).filter(Boolean));
  const totalVisibleQty = visibleItems.reduce((sum, item) => sum + (item.qty || 0), 0);
  const visibleValue = visibleItems.reduce((sum, item) => sum + getViewerStackValue(item), 0);

  visualizerOverlayElements.resultsMeta.textContent =
    `${formatNumber(pagination.startIndex)}-${formatNumber(pagination.endIndex)} of ${formatNumber(filtered.length)} filtered items | ` +
    `${formatNumber(totalVisibleQty)} total quantity | ${formatNp(visibleValue)} stack value`;

  visualizerOverlayElements.chips.innerHTML = [
    ["Visible SDB Types", uniqueTypes.size],
    ["Visible ItemDB Categories", categories.size],
    ["Wearables", visibleItems.filter((item) => item.itemdb?.isWearable).length],
    ["With Zoning", visibleItems.filter((item) => (item.itemdb?.zones || []).length > 0).length],
  ]
    .map(([label, value]) => `<span class="sdbvc-viewerChip">${escapeHtml(label)} <strong>${escapeHtml(String(value))}</strong></span>`)
    .join("");

  visualizerOverlayElements.empty.classList.toggle("is-hidden", visibleItems.length > 0);
  visualizerOverlayElements.grid.classList.toggle("is-hidden", viewerState.view !== "grid" || visibleItems.length === 0);
  visualizerOverlayElements.table.classList.toggle("is-hidden", viewerState.view !== "table" || visibleItems.length === 0);
  visualizerOverlayElements.host.querySelector('[data-action="view-grid"]')?.classList.toggle("is-active", viewerState.view === "grid");
  visualizerOverlayElements.host.querySelector('[data-action="view-table"]')?.classList.toggle("is-active", viewerState.view === "table");

  visualizerOverlayElements.grid.innerHTML = visibleItems.length
    ? `<div class="sdbvc-viewerGridCards">${visibleItems.map((item) => buildViewerCardMarkup(item)).join("")}</div>`
    : "";
  visualizerOverlayElements.table.innerHTML = visibleItems.length ? buildViewerTableMarkup(visibleItems) : "";
  visualizerOverlayElements.pagination.innerHTML = buildViewerPaginationMarkup(pagination.totalPages, filtered.length);

  const selectedVisible = filtered.find((item) => item.id === viewerState.selectedItemId) || filtered[0] || null;
  viewerState.selectedItemId = selectedVisible?.id ?? null;
}

function renderContextualViewerDetail() {
  if (!viewerState || !visualizerOverlayElements) return;
  const item = viewerState.dataset.items.find((entry) => entry.id === viewerState.selectedItemId);
  if (!item) {
    visualizerOverlayElements.detail.className = "sdbvc-viewerDetailEmpty";
    visualizerOverlayElements.detail.textContent = "No item selected yet.";
    return;
  }

  const fetchedAt = item.itemdb?.fetchedAt ? new Date(item.itemdb.fetchedAt).toLocaleString() : "Not enriched";
  visualizerOverlayElements.detail.className = "";
  visualizerOverlayElements.detail.innerHTML = `
    <div class="sdbvc-viewerDetailHero">
      <div class="sdbvc-viewerDetailMedia">
        <div class="sdbvc-viewerImageWrap">
          <img class="sdbvc-viewerDetailImage" src="${escapeAttribute(getViewerImageUrl(item.image || item.itemdb?.image))}" alt="${escapeAttribute(item.name)}" />
          <span class="sdbvc-viewerQty">x${escapeHtml(formatNumber(item.qty))}</span>
        </div>
      </div>
      <div class="sdbvc-viewerDetailBody">
        <h3 class="sdbvc-viewerDetailName">${escapeHtml(item.name)}</h3>
        <p class="sdbvc-viewerDetailMeta">${escapeHtml(item.sdbType || "Unknown Type")} | ID ${escapeHtml(String(item.id))}</p>
        <div class="sdbvc-viewerChips">
          ${item.itemdb?.category ? `<span class="sdbvc-viewerPill">${escapeHtml(item.itemdb.category)}</span>` : ""}
          ${item.itemdb?.rarity != null ? `<span class="sdbvc-viewerPill">Rarity ${escapeHtml(String(item.itemdb.rarity))}</span>` : ""}
          <span class="sdbvc-viewerPill">${isViewerNcItem(item) ? "Neocash" : "Neopoint"}</span>
          ${item.itemdb?.isWearable ? `<span class="sdbvc-viewerPill">Wearable</span>` : ""}
          ${item.itemdb?.isBD ? `<span class="sdbvc-viewerPill">Battledome</span>` : ""}
        </div>
      </div>
    </div>
    <p class="sdbvc-viewerDetailDescription">${escapeHtml(item.description || item.itemdb?.description || "No description captured yet.")}</p>
    <div class="sdbvc-viewerDetailStats">
      <div class="sdbvc-viewerDetailStat"><span>Price</span><strong>${escapeHtml(getViewerPrice(item))}</strong></div>
      <div class="sdbvc-viewerDetailStat"><span>Stack Value</span><strong>${escapeHtml(formatNp(getViewerStackValue(item)))}</strong></div>
      <div class="sdbvc-viewerDetailStat"><span>ItemDB Updated</span><strong>${escapeHtml(fetchedAt)}</strong></div>
      <div class="sdbvc-viewerDetailStat"><span>Zones</span><strong>${escapeHtml((item.itemdb?.zones || []).join(", ") || "Unknown")}</strong></div>
    </div>
    <div class="sdbvc-viewerLinkRow">
      ${buildViewerDetailLinks(item)
        .map(
          (link) => link.action
            ? `<button type="button" class="sdbvc-viewerLink sdbvc-viewerLinkButton" data-action="${escapeAttribute(link.action)}" data-item-id="${escapeAttribute(String(item.id))}" title="${escapeAttribute(link.label)}" aria-label="${escapeAttribute(link.label)}"><span class="sdbvc-viewerLinkButtonText">${escapeHtml(link.text || "-")}</span></button>`
            : `<a class="sdbvc-viewerLink" href="${escapeAttribute(link.href)}" target="_blank" rel="noopener noreferrer" title="${escapeAttribute(link.label)}" aria-label="${escapeAttribute(link.label)}"><img class="sdbvc-viewerLinkIcon" src="${escapeAttribute(link.iconSrc)}" alt="${escapeAttribute(link.label)}" loading="lazy" /></a>`,
        )
        .join("")}
    </div>
  `;
}

function renderContextualViewerRemovalList() {
  if (!viewerState || !visualizerOverlayElements?.removalList) return;
  const entries = getViewerRemovalEntries();
  const totalRequested = entries.reduce((sum, entry) => sum + entry.qty, 0);
  const statusClass = viewerState.removalStatusIsError ? "sdbvc-viewerRemovalStatus is-error" : "sdbvc-viewerRemovalStatus";

  visualizerOverlayElements.removalList.innerHTML = `
    <div class="sdbvc-viewerRemovalList">
      ${entries.length
        ? entries.map((entry) => `
          <div class="sdbvc-viewerRemovalEntry">
            <div class="sdbvc-viewerRemovalEntryName">
              <strong>${escapeHtml(entry.name)}</strong>
              <span>Available: ${escapeHtml(formatNumber(entry.availableQty))} | Item ID ${escapeHtml(String(entry.id))}</span>
            </div>
            <input class="sdbvc-viewerRemovalQty" type="number" min="1" max="${escapeAttribute(String(entry.availableQty))}" value="${escapeAttribute(String(entry.qty))}" data-action="removal-qty" data-item-id="${escapeAttribute(String(entry.id))}" />
            <button type="button" class="sdbvc-viewerRemovalRemove" data-action="remove-removal-entry" data-item-id="${escapeAttribute(String(entry.id))}">Remove</button>
          </div>
        `).join("")
        : `<div class="sdbvc-viewerRemovalEmpty">Use the new quick action in Item Detail to add items here. Quantities must stay within the amount currently saved in your SDB snapshot.</div>`}
      <div class="sdbvc-viewerRemovalControls">
        <label class="sdbvc-viewerRemovalPinRow">
          <span>SDB PIN</span>
          <input class="sdbvc-viewerRemovalPinInput" type="password" inputmode="numeric" autocomplete="off" placeholder="0 if no PIN" value="${escapeAttribute(viewerState.removalPin)}" data-action="removal-pin" />
        </label>
        <div class="sdbvc-viewerRemovalActions">
          <button type="button" class="sdbvc-viewerRemovalActionButton" data-action="submit-removal-list" ${!entries.length || viewerState.isRemovingItems ? "disabled" : ""}>${viewerState.isRemovingItems ? "Removing..." : "Remove All Items"}</button>
          <span>${escapeHtml(formatNumber(totalRequested))} item${totalRequested === 1 ? "" : "s"} queued</span>
        </div>
        <div class="${statusClass}">${escapeHtml(viewerState.removalStatus || "")}</div>
      </div>
    </div>
  `;
}

function buildViewerRemovalListFromDraft(draft, dataset) {
  if (!draft || typeof draft !== "object" || !Array.isArray(draft.entries)) {
    return {};
  }
  if (draft.username && dataset.username && draft.username !== dataset.username) {
    return {};
  }

  const itemsById = new Map(dataset.items.map((item) => [item.id, item]));
  return draft.entries.reduce((accumulator, entry) => {
    const itemId = Number(entry?.id);
    const item = itemsById.get(itemId);
    if (!item) return accumulator;
    const qty = Math.max(1, Math.min(item.qty, Number(entry.qty) || 1));
    if (qty > 0) {
      accumulator[itemId] = qty;
    }
    return accumulator;
  }, {});
}

function syncViewerRemovalDraft() {
  if (!viewerState) return;
  const entries = getViewerRemovalEntries().map((entry) => ({
    id: entry.id,
    qty: entry.qty,
  }));
  if (!entries.length) {
    clearStoredRemovalDraft();
    return;
  }
  setStoredRemovalDraft({
    username: viewerState.dataset.username || null,
    savedAt: new Date().toISOString(),
    entries,
  });
}

function handleContextualViewerDetailClick(event) {
  if (!viewerState) return;
  const button = event.target.closest('[data-action="add-to-removal-list"]');
  if (!button) return;
  const itemId = Number(button.getAttribute("data-item-id"));
  if (!Number.isFinite(itemId) || itemId <= 0) return;
  addViewerItemToRemovalList(itemId);
}

function handleContextualViewerRemovalListClick(event) {
  if (!viewerState) return;
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const action = actionElement.getAttribute("data-action");
  const itemId = Number(actionElement.getAttribute("data-item-id"));

  if (action === "remove-removal-entry") {
    removeViewerRemovalListEntry(itemId);
    return;
  }
  if (action === "submit-removal-list") {
    submitViewerRemovalList();
  }
}

function handleContextualViewerRemovalListInput(event) {
  if (!viewerState) return;
  const action = event.target.getAttribute("data-action");
  if (action === "removal-pin") {
    viewerState.removalPin = String(event.target.value || "").replace(/[^\d]/g, "");
    event.target.value = viewerState.removalPin;
    clearViewerRemovalStatus();
    return;
  }
  if (action !== "removal-qty") return;
  const itemId = Number(event.target.getAttribute("data-item-id"));
  const nextQty = updateViewerRemovalListQuantity(itemId, event.target.value);
  if (nextQty != null) {
    event.target.value = String(nextQty);
  }
}

function addViewerItemToRemovalList(itemId) {
  const item = findViewerItemById(itemId);
  if (!item) return;
  const existingQty = Number(viewerState.removalList[itemId] || 0);
  if (existingQty >= item.qty) {
    setViewerRemovalStatus(`You only have ${formatNumber(item.qty)} of ${item.name} saved in this snapshot.`, true);
    renderContextualViewerRemovalList();
    return;
  }
  viewerState.removalList[itemId] = existingQty + 1;
  setViewerRemovalStatus(`${item.name} added to the removal list.`, false);
  syncViewerRemovalDraft();
  renderContextualViewerRemovalList();
}

function removeViewerRemovalListEntry(itemId) {
  if (!Number.isFinite(itemId) || itemId <= 0) return;
  delete viewerState.removalList[itemId];
  clearViewerRemovalStatus();
  syncViewerRemovalDraft();
  renderContextualViewerRemovalList();
}

function updateViewerRemovalListQuantity(itemId, rawValue) {
  const item = findViewerItemById(itemId);
  if (!item) return null;
  const parsedQty = Number(rawValue);
  if (!Number.isFinite(parsedQty) || parsedQty < 1) {
    viewerState.removalList[itemId] = 1;
    setViewerRemovalStatus(`Removal quantities must be at least 1.`, true);
    syncViewerRemovalDraft();
    renderContextualViewerRemovalList();
    return 1;
  }
  if (parsedQty > item.qty) {
    viewerState.removalList[itemId] = item.qty;
    setViewerRemovalStatus(`You cannot remove ${formatNumber(parsedQty)} of ${item.name}; only ${formatNumber(item.qty)} are available.`, true);
    syncViewerRemovalDraft();
    renderContextualViewerRemovalList();
    return item.qty;
  }
  viewerState.removalList[itemId] = Math.floor(parsedQty);
  clearViewerRemovalStatus();
  syncViewerRemovalDraft();
  return viewerState.removalList[itemId];
}

function getViewerRemovalEntries() {
  if (!viewerState) return [];
  return Object.entries(viewerState.removalList)
    .map(([itemId, qty]) => {
      const item = findViewerItemById(Number(itemId));
      if (!item) return null;
      return {
        id: item.id,
        name: item.name,
        availableQty: item.qty,
        qty: Math.max(1, Math.min(item.qty, Number(qty) || 1)),
      };
    })
    .filter((entry) => entry && entry.availableQty > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findViewerItemById(itemId) {
  return viewerState?.dataset.items.find((item) => item.id === itemId) || null;
}

function setViewerRemovalStatus(message, isError = false) {
  if (!viewerState) return;
  viewerState.removalStatus = message;
  viewerState.removalStatusIsError = Boolean(isError);
}

function clearViewerRemovalStatus() {
  setViewerRemovalStatus("", false);
}

async function submitViewerRemovalList() {
  if (!viewerState || viewerState.isRemovingItems) return;
  const entries = getViewerRemovalEntries();
  if (!entries.length) {
    setViewerRemovalStatus("Add at least one item to the removal list first.", true);
    renderContextualViewerRemovalList();
    return;
  }

  const invalidEntry = entries.find((entry) => entry.qty > entry.availableQty);
  if (invalidEntry) {
    setViewerRemovalStatus(`You cannot remove ${formatNumber(invalidEntry.qty)} of ${invalidEntry.name}; only ${formatNumber(invalidEntry.availableQty)} are available.`, true);
    renderContextualViewerRemovalList();
    return;
  }

  viewerState.isRemovingItems = true;
  setViewerRemovalStatus("Sending removal request to Neopets...", false);
  renderContextualViewerRemovalList();

  try {
    await delay(randomBetween(350, 700));
    const result = await submitSdbRemovalRequest(entries, viewerState.removalPin);
    if (result.ok) {
      applyViewerRemovalResult(entries);
      viewerState.removalList = {};
      viewerState.removalPin = "";
      clearStoredRemovalDraft();
      setViewerRemovalStatus(result.message, false);
      setCollectorStatusMessage(result.message);
      renderContextualViewer();
      return;
    }
    if (shouldRefreshAfterRemovalError(result.message)) {
      syncViewerRemovalDraft();
      setViewerRemovalStatus(`${result.message} Refresh Page to retry.`, true);
      return;
    }
    setViewerRemovalStatus(result.message, true);
  } catch (error) {
    setViewerRemovalStatus(error?.message || "SDB removal request failed.", true);
  } finally {
    viewerState.isRemovingItems = false;
    renderContextualViewerRemovalList();
  }
}

async function submitSdbRemovalRequest(entries, pin) {
  const searchParams = new URLSearchParams(location.search);
  const form = new URLSearchParams();
  entries.forEach((entry) => {
    form.append(`back_to_inv[${entry.id}]`, String(entry.qty));
  });
  form.append("pin", String(pin || "0"));
  form.append("category", searchParams.get("category") || "0");
  form.append("offset", searchParams.get("offset") || "0");
  form.append("obj_name", searchParams.get("obj_name") || "");

  const response = await fetch("/process_safetydeposit.phtml?checksub=scan", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: form.toString(),
  });

  const html = await response.text();
  if (!response.ok) {
    return { ok: false, message: `SDB removal request failed with ${response.status}.` };
  }

  const parsedMessage = parseSdbRemovalResponseMessage(html);
  if (parsedMessage.isError) {
    return { ok: false, message: parsedMessage.message };
  }

  const totalRequested = entries.reduce((sum, entry) => sum + entry.qty, 0);
  return {
    ok: true,
    message: parsedMessage.message || `Removed ${formatNumber(totalRequested)} item${totalRequested === 1 ? "" : "s"} from your SDB.`,
  };
}

function parseSdbRemovalResponseMessage(html) {
  const normalized = String(html || "");
  const errorMatch = normalized.match(/<b>\s*Error:\s*<\/b>\s*([^<]+)/i);
  if (errorMatch) {
    return {
      isError: true,
      message: `Error: ${errorMatch[1].trim()}`,
    };
  }

  const doc = new DOMParser().parseFromString(normalized, "text/html");
  const contentText = doc.querySelector(".content")?.textContent?.replace(/\s+/g, " ").trim() || "";
  const successMatch = contentText.match(/successfully[^.]*\./i);
  if (successMatch) {
    return {
      isError: false,
      message: successMatch[0].trim(),
    };
  }

  return {
    isError: false,
    message: "",
  };
}

function shouldRefreshAfterRemovalError(message) {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("pin");
}

function applyViewerRemovalResult(entries) {
  const removalById = new Map(entries.map((entry) => [entry.id, entry.qty]));
  const nextItems = viewerState.dataset.items
    .map((item) => {
      const removedQty = removalById.get(item.id) || 0;
      if (!removedQty) return item;
      return {
        ...item,
        qty: Math.max(0, item.qty - removedQty),
      };
    })
    .filter((item) => item.qty > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  viewerState.dataset.items = nextItems;
  viewerState.selectedItemId = nextItems.some((item) => item.id === viewerState.selectedItemId)
    ? viewerState.selectedItemId
    : nextItems[0]?.id ?? null;

  const storedItems = getStoredItems()
    .map((item) => {
      const removedQty = removalById.get(item.id) || 0;
      if (!removedQty) return item;
      return {
        ...item,
        qty: Math.max(0, Number(item.qty || 0) - removedQty),
      };
    })
    .filter((item) => Number(item.qty || 0) > 0)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  setStoredItems(storedItems);

  const scanMeta = getScanMeta();
  const removedTotalQty = entries.reduce((sum, entry) => sum + entry.qty, 0);
  setScanMeta({
    ...scanMeta,
    totalItems: nextItems.length,
    totalQuantity: Math.max(0, Number(scanMeta.totalQuantity ?? viewerState.dataset.totalQuantity ?? 0) - removedTotalQty),
    lastPageRecordedAt: new Date().toISOString(),
  });
  viewerState.dataset.totalItems = nextItems.length;
  viewerState.dataset.totalQuantity = Math.max(0, Number(viewerState.dataset.totalQuantity ?? 0) - removedTotalQty);
  viewerState.dataset.lastImportedAt = new Date().toISOString();
}

function getViewerFilteredItems() {
  const items = [...viewerState.dataset.items];
  const search = viewerState.filters.search.trim().toLowerCase();
  const minRarity = parseNumber(viewerState.filters.minRarity);
  const maxRarity = parseNumber(viewerState.filters.maxRarity);
  const minPrice = parseNumber(viewerState.filters.minPrice);

  return items
    .filter((item) => {
      if (search) {
        const haystack = [item.name, item.description, item.sdbType, item.itemdb?.category, item.itemdb?.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (viewerState.filters.sdbType !== "all" && item.sdbType !== viewerState.filters.sdbType) return false;
      if (viewerState.filters.itemdbCategory !== "all" && item.itemdb?.category !== viewerState.filters.itemdbCategory) return false;
      if (viewerState.filters.currency === "np" && isViewerNcItem(item)) return false;
      if (viewerState.filters.currency === "nc" && !isViewerNcItem(item)) return false;
      if (viewerState.filters.wearable === "true" && !item.itemdb?.isWearable) return false;
      if (viewerState.filters.wearable === "false" && item.itemdb?.isWearable) return false;
      if (viewerState.filters.zoning !== "all" && !(item.itemdb?.zones || []).includes(viewerState.filters.zoning)) return false;
      if (viewerState.filters.neohome === "true" && !item.itemdb?.isNeohome) return false;
      if (viewerState.filters.neohome === "false" && item.itemdb?.isNeohome) return false;
      if (minRarity != null && (item.itemdb?.rarity ?? -1) < minRarity) return false;
      if (maxRarity != null && (item.itemdb?.rarity ?? 10000) > maxRarity) return false;
      if (minPrice != null && (item.itemdb?.value ?? -1) < minPrice) return false;
      return true;
    })
    .sort(buildViewerSorter(viewerState.filters.sortBy));
}

function buildViewerSorter(sortBy) {
  switch (sortBy) {
    case "name-desc":
      return (a, b) => b.name.localeCompare(a.name);
    case "qty-asc":
      return (a, b) => a.qty - b.qty || a.name.localeCompare(b.name);
    case "qty-desc":
      return (a, b) => b.qty - a.qty || a.name.localeCompare(b.name);
    case "price-asc":
      return (a, b) => (a.itemdb?.value ?? Number.MAX_SAFE_INTEGER) - (b.itemdb?.value ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
    case "price-desc":
      return (a, b) => (b.itemdb?.value ?? -1) - (a.itemdb?.value ?? -1) || a.name.localeCompare(b.name);
    case "stack-asc":
      return (a, b) => getViewerStackValue(a) - getViewerStackValue(b) || a.name.localeCompare(b.name);
    case "stack-desc":
      return (a, b) => getViewerStackValue(b) - getViewerStackValue(a) || a.name.localeCompare(b.name);
    case "rarity-asc":
      return (a, b) => (a.itemdb?.rarity ?? Number.MAX_SAFE_INTEGER) - (b.itemdb?.rarity ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
    case "rarity-desc":
      return (a, b) => (b.itemdb?.rarity ?? -1) - (a.itemdb?.rarity ?? -1) || a.name.localeCompare(b.name);
    case "updated-asc":
      return (a, b) => String(a.itemdb?.fetchedAt || "").localeCompare(String(b.itemdb?.fetchedAt || "")) || a.name.localeCompare(b.name);
    case "updated-desc":
      return (a, b) => String(b.itemdb?.fetchedAt || "").localeCompare(String(a.itemdb?.fetchedAt || "")) || a.name.localeCompare(b.name);
    case "":
    case "name-asc":
    default:
      return (a, b) => a.name.localeCompare(b.name);
  }
}

function paginateViewerItems(items) {
  if (viewerState.filters.pageSize === "all") {
    viewerState.currentPage = 1;
    return {
      items,
      totalPages: 1,
      startIndex: items.length ? 1 : 0,
      endIndex: items.length,
    };
  }

  const perPage = Number(viewerState.filters.pageSize) || 100;
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  viewerState.currentPage = Math.min(Math.max(1, viewerState.currentPage), totalPages);
  const start = (viewerState.currentPage - 1) * perPage;
  const pagedItems = items.slice(start, start + perPage);
  return {
    items: pagedItems,
    totalPages,
    startIndex: items.length ? start + 1 : 0,
    endIndex: start + pagedItems.length,
  };
}

function buildViewerPaginationMarkup(totalPages, totalItems) {
  if (totalPages <= 1 || totalItems === 0) {
    return "";
  }

  const buttons = [];
  buttons.push(`<button type="button" class="sdbvc-viewerPageButton" data-page="${viewerState.currentPage - 1}" ${viewerState.currentPage === 1 ? "disabled" : ""}>Prev</button>`);
  const windowStart = Math.max(1, viewerState.currentPage - 2);
  const windowEnd = Math.min(totalPages, viewerState.currentPage + 2);
  for (let page = windowStart; page <= windowEnd; page += 1) {
    buttons.push(`<button type="button" class="sdbvc-viewerPageButton ${page === viewerState.currentPage ? "is-active" : ""}" data-page="${page}">${page}</button>`);
  }
  buttons.push(`<button type="button" class="sdbvc-viewerPageButton" data-page="${viewerState.currentPage + 1}" ${viewerState.currentPage === totalPages ? "disabled" : ""}>Next</button>`);
  buttons.push(`<span>Page ${viewerState.currentPage} of ${totalPages}</span>`);
  return buttons.join("");
}

function buildViewerCardMarkup(item) {
  const showCategoryBubble = item.sdbType?.toLowerCase() === "neocash" && Boolean(item.itemdb?.category);
  return `
    <article class="sdbvc-viewerCard" data-item-id="${item.id}">
      <div class="sdbvc-viewerImageWrap">
        <img class="sdbvc-viewerImage" src="${escapeAttribute(getViewerImageUrl(item.image || item.itemdb?.image))}" alt="${escapeAttribute(item.name)}" />
        <span class="sdbvc-viewerQty">x${escapeHtml(formatNumber(item.qty))}</span>
      </div>
      <div class="sdbvc-viewerCardTitle">${escapeHtml(item.name)}</div>
      <div class="sdbvc-viewerChips">
        <span class="sdbvc-viewerPill">${escapeHtml(item.sdbType || "Unknown Type")}</span>
        ${showCategoryBubble ? `<span class="sdbvc-viewerPill">${escapeHtml(item.itemdb.category)}</span>` : ""}
        ${item.itemdb?.rarity != null ? `<span class="sdbvc-viewerPill">r${escapeHtml(String(item.itemdb.rarity))}</span>` : ""}
      </div>
      <div class="sdbvc-viewerPriceRow"><span>${isViewerNcItem(item) ? "NC" : "Price"}</span><strong>${escapeHtml(getViewerPrice(item))}</strong></div>
      <div class="sdbvc-viewerPriceRow"><span>Stack</span><strong>${escapeHtml(formatNp(getViewerStackValue(item)))}</strong></div>
    </article>
  `;
}

function buildViewerTableMarkup(items) {
  return `
    <div class="sdbvc-viewerTableWrap">
      <table class="sdbvc-viewerTable">
        <thead>
          <tr>
            <th>Name</th>
            <th>Qty</th>
            <th>SDB Type</th>
            <th>ItemDB Category</th>
            <th>Rarity</th>
            <th>Price</th>
            <th>Stack Value</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
                <tr data-item-id="${item.id}">
                  <td>${escapeHtml(item.name)}</td>
                  <td>${escapeHtml(formatNumber(item.qty))}</td>
                  <td>${escapeHtml(item.sdbType || "")}</td>
                  <td>${escapeHtml(item.itemdb?.category || "")}</td>
                  <td>${escapeHtml(item.itemdb?.rarity != null ? `r${item.itemdb.rarity}` : "")}</td>
                  <td>${escapeHtml(getViewerPrice(item))}</td>
                  <td>${escapeHtml(formatNp(getViewerStackValue(item)))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function isViewerNcItem(item) {
  return Boolean(item.itemdb?.isNC) || (item.itemdb?.rarity ?? 0) >= 500;
}

function getViewerPrice(item) {
  if (isViewerNcItem(item)) return "NC";
  return item.itemdb?.value != null ? formatNp(item.itemdb.value) : "Unknown";
}

function getViewerStackValue(item) {
  if (isViewerNcItem(item)) return 0;
  return (item.itemdb?.value || 0) * (item.qty || 0);
}

function getViewerImageUrl(src) {
  const raw = String(src || "").trim();
  if (!raw) return "https://images.neopets.com/items/blank.gif";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `${location.origin}${raw}`;
  return raw;
}

function buildViewerDetailLinks(item) {
  const encodedName = encodeURIComponent(item.name || "");
  const itemdbSlug = item.itemdb?.slug || slugifyItemdbName(item.name || "");
  const links = [
    {
      label: "Add to removal list",
      action: "add-to-removal-list",
      text: "-",
    },
    {
      label: "Safety Deposit Box",
      iconSrc: "https://images.neopets.com/images/emptydepositbox.gif",
      href: `https://www.neopets.com/safetydeposit.phtml?obj_name=${encodedName}&category=0`,
    },
    {
      label: "ItemDB",
      iconSrc: "https://images.neopets.com/themes/h5/basic/images/v3/quickstock-icon.svg",
      href: `https://itemdb.com.br/item/${encodeURIComponent(itemdbSlug)}`,
    },
  ];

  if (!isViewerNcItem(item)) {
    links.push(
      {
        label: "Auction House",
        iconSrc: "https://itemdb.com.br/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fauction.1142bqb.irn5j.png&w=32&q=100",
        href: `https://www.neopets.com/genie.phtml?type=process_genie&criteria=exact&auctiongenie=${encodedName}`,
      },
      {
        label: "Trading Post",
        iconSrc: "https://itemdb.com.br/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftradingpost.0thlqk590y~_-.png&w=32&q=100",
        href: `https://www.neopets.com/island/tradingpost.phtml?type=browse&&sort_by=newest&criteria=item_exact&search_string=${encodedName}`,
      },
    );
  }

  if (item.itemdb?.isWearable) {
    links.push(
      {
        label: "Closet",
        iconSrc: "https://itemdb.com.br/_next/static/media/closet.1217_t~foln1b.svg",
        href: `https://www.neopets.com/closet.phtml?obj_name=${encodedName}`,
      },
      {
        label: "Dress to Impress",
        iconSrc: "https://images.neopets.com/items/clo_shoyru_dappermon.gif",
        href: `https://impress.openneo.net/items?q=${encodedName}`,
      },
    );
  }

  return links;
}

function getViewerSnapshotLabel(mode) {
  switch (mode) {
    case "full":
      return "Full snapshot";
    case "mixed":
      return "Mixed snapshot";
    default:
      return "Partial snapshot";
  }
}

function formatViewerCoverage(importedPages, totalPages) {
  if (!totalPages) {
    return `${formatNumber(importedPages)} pages`;
  }
  const percent = Math.round((importedPages / totalPages) * 100);
  return `${formatNumber(importedPages)}/${formatNumber(totalPages)} pages (${percent}%)`;
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
    message: `JSON export copied to clipboard (${payload.snapshotMode === "full" ? "full snapshot" : "latest saved partial snapshot"}).`,
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

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatNp(value) {
  return `${formatNumber(value)} NP`;
}

function parseNumber(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
