// ==UserScript==
// @name         Neopets Game Trophies Tracker
// @version      2.4
// @description  Modern Neopets trophy tracker UI with dynamic filtering.
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/prizes.phtml*
// @match        *://*.neopets.com/userlookup.phtml*
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    panelId: 'ntt-panel',
    launcherId: 'ntt-launcher',
    mountId: 'ntt-root',
    themeStorageKey: 'ntt-theme',
    trackingListStorageKey: 'ntt-tracking-list',
    lookupOwnedStorageKey: 'ntt-lookup-owned',
  };

  const LOOKUP_ONLY_TROPHY_IDS = new Set(['1409', '1414']);
  const GLOWING_TROPHY_IDS = new Set([
    '170',  // Plushie Tycoon
    '229',  // Word Poker
    '231',  // Petpet Battles
    '314',  // Hubrid's Hero Heist
    '331',  // Test Your Strength
    '342',  // NeoBoard Avatar Collector
    '351',  // Bilge Dice
    '352',  // Bilge Dice Streak
    '356',  // Dice Escape
    '358',  // Faerie Bubbles
    '368',  // Hasee Bounce
    '381',  // Kass Basher
    '404',  // Kreludan Mining Corp.
    '412',  // Snowmuncher
    '726',  // Ugga Smash
    '734',  // Bruno's Backwoods Breakaway
    '1134', // Spinacles
    '202',  // Spell-Or-Starve
  ]);

  const TROPHY_LEVELS = {
    gold: 3,
    silver: 2,
    bronze: 1,
    runnerUp: 0.5,
    none: 0,
    unknown: -1,
  };

  const LEVEL_META = {
    3: { key: 'gold', label: 'Gold' },
    2: { key: 'silver', label: 'Silver' },
    1: { key: 'bronze', label: 'Bronze' },
    0.5: { key: 'runner-up', label: 'Runner-Up' },
    0: { key: 'missing', label: 'Missing' },
    '-1': { key: 'unknown', label: 'Unknown' },
  };

  const CATALOG_URL = 'https://raw.githubusercontent.com/mhero18/Hero-Userscripts/main/Hero-Created/jsonfiles/trophycatalog.json';
  let GAME_METADATA = {};

  async function loadCatalog() {
    if (!CATALOG_URL) {
      throw new Error('Catalog URL is not configured yet.');
    }

    const response = await fetch(CATALOG_URL);
    if (!response.ok) {
      throw new Error(`Catalog request failed (${response.status})`);
    }

    const payload = await response.json();
    const trophies = payload && typeof payload === 'object' && payload.trophies && typeof payload.trophies === 'object'
      ? payload.trophies
      : payload;

    if (!trophies || typeof trophies !== 'object') {
      throw new Error('Catalog JSON did not contain a valid trophies object.');
    }

    GAME_METADATA = trophies;
    return trophies;
  }


  function buildTrackerItems() {
    const ownedById = new Map(parsePrizePageTrophies().map((item) => [item.trophyId, item]));
    const catalogIds = new Set(Object.keys(GAME_METADATA).map(String));

    for (const trophyId of catalogIds) {
      if (!ownedById.has(trophyId)) {
        ownedById.set(trophyId, buildMissingCatalogItem(trophyId, GAME_METADATA[trophyId] || {}));
      }
    }

    return Array.from(ownedById.values()).sort((left, right) => left.gameName.localeCompare(right.gameName));
  }

  function parsePrizePageTrophies() {
    const prizeCells = Array.from(document.querySelectorAll('table[width="600"] td img[src*="/trophies/"]'));
    const fallbackCells = prizeCells.length ? prizeCells : Array.from(document.querySelectorAll('img[src*="/trophies/"]'));
    const trophies = fallbackCells
      .map(parsePrizeImage)
      .filter(Boolean)
      .sort((left, right) => left.gameName.localeCompare(right.gameName));

    return dedupeById(trophies);
  }

  function buildMissingCatalogItem(trophyId, metadata) {
    const links = buildLinks(trophyId, metadata);
    const category = normalizeCategoryLabel(metadata.category || '');
    return {
      trophyId: String(trophyId),
      trophyImage: `https://images.neopets.com/trophies/${trophyId}_1.gif`,
      gameName: metadata.gameName || `Game ${trophyId}`,
      category,
      technology: simplifyTechnologyLabel(metadata.technology || ''),
      gameLink: links.gameLink,
      guideLink: links.guideLink,
      highScoreLink: links.highScoreLink,
      isGlowing: GLOWING_TROPHY_IDS.has(String(trophyId)),
      statusValue: TROPHY_LEVELS.none,
      statusKey: LEVEL_META[0].key,
      statusLabel: LEVEL_META[0].label,
      needsUpgrade: false,
      searchHaystack: [trophyId, metadata.gameName, metadata.category, metadata.technology]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };
  }

  function getNeedsUpgrade(statusValue, category) {
    if (isSpecialCategory(category)) {
      return false;
    }
    return statusValue === TROPHY_LEVELS.bronze || statusValue === TROPHY_LEVELS.silver || statusValue === TROPHY_LEVELS.runnerUp;
  }

  function isSpecialCategory(category) {
    return category === 'Retired' || category === 'PVP';
  }

  function applyLookupOwnedOverride(item, lookupOwnedMap) {
    const trophyId = String(item.trophyId);
    const variant = Number(lookupOwnedMap[trophyId]);
    if (![1, 2, 3, 4].includes(variant)) {
      return item;
    }

    const status = getStatusFromVariantAndText(variant, '', '');

    return {
      ...item,
      trophyImage: `https://images.neopets.com/trophies/${trophyId}_${variant}.gif`,
      statusValue: status.value,
      statusKey: status.key,
      statusLabel: status.label,
      needsUpgrade: getNeedsUpgrade(status.value, item.category),
    };
  }

  function parsePrizeImage(image) {
    const idMatch = image.src.match(/\/trophies\/(\d+)_([1-4])\.(gif|png)/i);
    if (!idMatch) {
      return null;
    }

    const trophyId = idMatch[1];
    const variant = Number(idMatch[2]);
    const alt = cleanText(image.getAttribute('alt'));
    const rawText = cleanText(image.closest('td')?.textContent || '');
    const metadata = GAME_METADATA[trophyId] || {};
    const status = getStatusFromVariantAndText(variant, alt, rawText);
    const inferredName = metadata.gameName || extractGameName(alt, rawText, trophyId);
    const links = buildLinks(trophyId, metadata);
    const category = normalizeCategoryLabel(metadata.category || '');

    return {
      trophyId,
      trophyImage: normalizeImageSrc(image.getAttribute('src')),
      gameName: inferredName,
      category,
      technology: simplifyTechnologyLabel(metadata.technology || ''),
      gameLink: links.gameLink,
      guideLink: links.guideLink,
      highScoreLink: links.highScoreLink,
      isGlowing: GLOWING_TROPHY_IDS.has(String(trophyId)),
      statusValue: status.value,
      statusKey: status.key,
      statusLabel: status.label,
      needsUpgrade: getNeedsUpgrade(status.value, category),
      searchHaystack: [trophyId, inferredName, alt, rawText, metadata.category, metadata.technology]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };
  }

  function buildLinks(trophyId, metadata) {
    const gameLink = normalizeLink(
      metadata.gameLinks || metadata.gameLink || `https://www.neopets.com/games/game.phtml?game_id=${trophyId}`,
      'Game'
    );
    const highScoreLink = normalizeLink(
      metadata.highScoreLinks || metadata.highScoreLink || `https://www.neopets.com/games/hiscores.phtml?game_id=${trophyId}`,
      'High Scores'
    );
    const guideLink = normalizeLink(metadata.guideLinks || metadata.guideLink, 'JN Guide');

    return { gameLink, highScoreLink, guideLink };
  }

  function normalizeLink(value, defaultLabel) {
    if (!value) {
      return null;
    }

    if (Array.isArray(value)) {
      value = value.find((entry) => {
        if (!entry) {
          return false;
        }
        if (typeof entry === 'string') {
          return Boolean(normalizeCatalogUrl(entry));
        }
        return Boolean(normalizeCatalogUrl(entry.href || entry.url || ''));
      });
      if (!value) {
        return null;
      }
    }

    if (typeof value === 'string') {
      const href = normalizeCatalogUrl(String(value));
      return href ? { href, label: defaultLabel } : null;
    }

    const href = normalizeCatalogUrl(value.href || value.url || '');
    if (!href) {
      return null;
    }
    return { href, label: normalizeLinkLabel(value.label, defaultLabel, href) };
  }

  function normalizeCatalogUrl(value) {
    const cleaned = cleanText(value);
    if (!cleaned || cleaned === 'N/A' || cleaned.includes('[none]')) {
      return '';
    }
    if (cleaned.startsWith('?')) {
      return `https://www.jellyneo.net/${cleaned}`;
    }
    return cleaned;
  }

  function normalizeLinkLabel(label, defaultLabel, href) {
    const cleaned = cleanText(label);
    if (!cleaned || cleaned === '?' || cleaned === '??' || cleaned === 'N/A') {
      return defaultLabel;
    }

    const compact = cleaned.replace(/\s+/g, ' ').trim();
    if (compact.endsWith('?')) {
      const withoutBrokenEntity = compact.replace(/\s*\?+$/, '').trim();
      if (withoutBrokenEntity) {
        return withoutBrokenEntity;
      }
    }

    if (compact === 'Play Game' || compact === 'High Score Table' || compact === 'JN Guide') {
      return defaultLabel;
    }

    if (/jellyneo/i.test(compact) || /^jn guide$/i.test(compact)) {
      return defaultLabel;
    }

    if (/hiscore|high score/i.test(compact)) {
      return 'High Scores';
    }

    if (/play game/i.test(compact)) {
      return defaultLabel;
    }

    if (/jellyneo\.net/.test(href) && compact === defaultLabel) {
      return 'JN Guide';
    }

    return compact;
  }

  function getStatusFromVariantAndText(variant, alt, rawText) {
    const text = `${alt} ${rawText}`.toLowerCase();

    if (variant === 4) {
      return makeStatus(TROPHY_LEVELS.runnerUp);
    }
    if (variant === 1 || text.includes('champion')) {
      return makeStatus(TROPHY_LEVELS.gold);
    }
    if (variant === 2 || text.includes('second place') || text.includes('runner-up')) {
      return makeStatus(TROPHY_LEVELS.silver);
    }
    if (variant === 3 || text.includes('third place')) {
      return makeStatus(TROPHY_LEVELS.bronze);
    }
    return makeStatus(TROPHY_LEVELS.unknown);
  }

  function extractGameName(alt, rawText, trophyId) {
    const candidates = [alt, rawText];
    for (const candidate of candidates) {
      const cleaned = candidate
        .replace(/\d+xchampion/gi, '')
        .replace(/champion!?/gi, '')
        .replace(/second place at/gi, '')
        .replace(/third place at/gi, '')
        .replace(/runner-up medal at/gi, '')
        .replace(/!!+/g, '')
        .trim();

      if (cleaned) {
        return cleaned;
      }
    }

    return `Game ${trophyId}`;
  }

  function dedupeById(items) {
    const byId = new Map();
    for (const item of items) {
      const existing = byId.get(item.trophyId);
      if (!existing || item.statusValue > existing.statusValue) {
        byId.set(item.trophyId, item);
      }
    }
    return Array.from(byId.values());
  }

  function applyFilters(items, filters) {
    return items
      .filter((item) => {
        if (filters.search && !item.searchHaystack.includes(filters.search.toLowerCase())) {
          return false;
        }
        if (filters.type !== 'all' && item.statusKey !== filters.type) {
          return false;
        }
        if (filters.category === 'Glowing' && !item.isGlowing) {
          return false;
        }
        if (filters.category !== 'all' && filters.category !== 'Glowing' && item.category !== filters.category) {
          return false;
        }
        if (filters.technology !== 'all' && item.technology !== filters.technology) {
          return false;
        }
        if (filters.status === 'maxed' && item.statusValue !== TROPHY_LEVELS.gold) {
          return false;
        }
        if (filters.status === 'needs-upgrade' && !item.needsUpgrade) {
          return false;
        }
        if (filters.status === 'missing' && (item.statusValue !== TROPHY_LEVELS.none || isSpecialCategory(item.category))) {
          return false;
        }
        return true;
      })
      .sort((left, right) => sortItems(left, right, filters.sort));
  }

  function sortItems(left, right, sort) {
    if (sort === 'status') {
      return right.statusValue - left.statusValue || left.gameName.localeCompare(right.gameName);
    }
    if (sort === 'id') {
      return Number(left.trophyId) - Number(right.trophyId);
    }
    return left.gameName.localeCompare(right.gameName);
  }

  function getSummary(allItems, filteredItems) {
    const countedItems = allItems.filter((item) => item.includeInPrimaryCounts);
    return {
      total: countedItems.length,
      owned: allItems.filter((item) => item.statusValue > TROPHY_LEVELS.none).length,
      missing: countedItems.filter((item) => item.statusValue === TROPHY_LEVELS.none).length,
      gold: allItems.filter((item) => item.statusValue === TROPHY_LEVELS.gold).length,
      silver: allItems.filter((item) => item.statusValue === TROPHY_LEVELS.silver).length,
      bronze: allItems.filter((item) => item.statusValue === TROPHY_LEVELS.bronze).length,
      upgrades: allItems.filter((item) => item.needsUpgrade).length,
      filtered: filteredItems.length,
    };
  }

  function renderCard(item) {
    const statusClass = `status-${item.statusKey}`;
    const canTrack = !isSpecialCategory(item.category);
    const showTrackingAction = canTrack && (item.statusValue === TROPHY_LEVELS.none || item.needsUpgrade);
    const isTracked = item.isTracked;
    return `
      <article class="ntt-card ${statusClass}">
        <div class="ntt-card-top">
          <div class="ntt-card-media">
            <img class="ntt-card-image" src="${escapeAttribute(item.trophyImage)}" alt="${escapeAttribute(item.gameName)} trophy" loading="lazy" />
            <span class="ntt-badge ${statusClass}">${escapeHtml(item.statusLabel)}</span>
          </div>
          <div class="ntt-card-heading">
            <div class="ntt-card-title-row">
              <h3>${escapeHtml(item.gameName)}</h3>
            </div>
            <p class="ntt-sub">Trophy ID ${escapeHtml(item.trophyId)}</p>
            <p class="ntt-sub">${escapeHtml(item.category)}</p>
            <p class="ntt-sub">${escapeHtml(item.technology)}</p>
          </div>
        </div>
        <div class="ntt-card-tags">
          ${item.statusValue === TROPHY_LEVELS.none && !isSpecialCategory(item.category) ? '<span class="ntt-pill ntt-pill-missing">Missing</span>' : ''}
          ${item.needsUpgrade ? '<span class="ntt-pill ntt-pill-upgrade">Needs Upgrade</span>' : ''}
          ${item.statusValue === TROPHY_LEVELS.gold ? '<span class="ntt-pill">Maxed</span>' : ''}
          ${
            showTrackingAction
              ? `<button class="ntt-pill ntt-pill-action" type="button" data-action="toggle-track" data-trophy-id="${escapeAttribute(item.trophyId)}" ${isTracked ? 'disabled' : ''}>${isTracked ? 'In List' : 'Add to List'}</button>`
              : ''
          }
        </div>
        <div class="ntt-card-links">
          ${renderLink(item.gameLink, 'Game')}
          ${renderLink(item.guideLink, 'JN Guide')}
          ${renderLink(item.highScoreLink, 'High Scores')}
        </div>
      </article>
    `;
  }

  function renderLink(link, fallbackLabel) {
    if (!link) {
      return `<span class="ntt-link-disabled">${escapeHtml(fallbackLabel)}</span>`;
    }
    const label = link.label && link.label !== fallbackLabel ? `${fallbackLabel}: ${link.label}` : fallbackLabel;
    return `<a href="${escapeAttribute(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }

  function renderStat(label, value) {
    return `<article class="ntt-stat"><p>${escapeHtml(label)}</p><strong>${escapeHtml(String(value))}</strong></article>`;
  }

  function renderTrackingPanel(viewModel) {
    const { trackingItems, selectedTrackingItem } = viewModel;

    return `
      <aside class="ntt-tracking-panel">
        <div class="ntt-tracking-list-panel">
          <div class="ntt-tracking-head">
            <h2>Tracking List</h2>
            <button class="ntt-secondary ntt-clear-list" type="button" data-action="clear-tracking" ${trackingItems.length ? '' : 'disabled'}>Clear All</button>
          </div>
          <div class="ntt-tracking-list">
            ${
              trackingItems.length
                ? trackingItems.map((item) => `
                  <div class="ntt-track-row ${selectedTrackingItem && selectedTrackingItem.trophyId === item.trophyId ? 'is-selected' : ''}">
                    <button class="ntt-track-select" type="button" data-action="select-tracking" data-trophy-id="${escapeAttribute(item.trophyId)}">${escapeHtml(item.gameName)}</button>
                    <button class="ntt-track-remove" type="button" data-action="remove-tracking" data-trophy-id="${escapeAttribute(item.trophyId)}">Remove</button>
                  </div>
                `).join('')
                : '<div class="ntt-empty ntt-empty-sm">Add Missing or Needs Upgrade trophies here to keep a focused shortlist.</div>'
            }
          </div>
        </div>
        <div class="ntt-tracking-details">
          <h3>Game Details</h3>
          ${
            selectedTrackingItem
              ? renderCard(selectedTrackingItem)
              : '<div class="ntt-empty ntt-empty-sm">Select a game from your tracking list to view its details here.</div>'
          }
        </div>
      </aside>
    `;
  }

  function renderOptions(values, selected) {
    return [`<option value="all">All</option>`]
      .concat(
        values.map((value) => `<option value="${escapeAttribute(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(value)}</option>`)
      )
      .join('');
  }

  function renderTypeOptions(selected) {
    const options = ['all', 'gold', 'silver', 'bronze', 'runner-up', 'missing'];
    return options
      .map((value) => {
        const label = value === 'all' ? 'All' : value.replace('-', ' ');
        return `<option value="${value}" ${selected === value ? 'selected' : ''}>${capitalize(label)}</option>`;
      })
      .join('');
  }

  function renderStatusOptions(selected) {
    const options = [
      ['all', 'All'],
      ['maxed', 'Maxed'],
      ['needs-upgrade', 'Needs Upgrade'],
      ['missing', 'Missing'],
    ];
    return options
      .map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`)
      .join('');
  }

  function renderThemeOptions(selected) {
    const options = [
      ['default', 'Default'],
      ['cherry-blossom', 'Cherry Blossom'],
      ['ocean-waves', 'Ocean Waves'],
      ['lavender-dreams', 'Lavender Dreams'],
      ['dark-mode', 'Dark Mode'],
    ];
    return options
      .map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`)
      .join('');
  }

  function renderSortOptions(selected) {
    const options = [
      ['name', 'Name'],
      ['status', 'Status'],
      ['id', 'Trophy ID'],
    ];
    return options
      .map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`)
      .join('');
  }

  function makeStatus(value) {
    const meta = LEVEL_META[String(value)] || LEVEL_META['-1'];
    return { value, key: meta.key, label: meta.label };
  }

  function normalizeImageSrc(src) {
    if (!src) {
      return '';
    }
    if (src.startsWith('//')) {
      return `https:${src}`;
    }
    return src;
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.map(cleanText).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  }

  function normalizeCategoryLabel(value) {
    const cleaned = cleanText(value);
    const replacements = new Map([
      ['Creative (Spotlight/Contest)', 'Creative (Spotlight/Contest)'],
      ['Standard (Highest Scores)', 'Standard (Highest Scores)'],
      ['Dailies/Random Events', 'Dailies/Random Events'],
      ['Non-Competitive', 'Non-Competitive'],
      ['Cumulative', 'Cumulative'],
      ['PVP', 'PVP'],
      ['Exceptional Eight', 'Exceptional Eight'],
      ['Retired', 'Retired'],
    ]);

    return replacements.get(cleaned) || cleaned || 'Retired';
  }

  function simplifyTechnologyLabel(value) {
    const cleaned = cleanText(value);
    const replacements = new Map([
      ['Standard Browser (PHP-based Games)', 'Normal Browser'],
      ['Standard Flash (i.e. only Ruffle)', 'Flash (Ruffle)'],
      ['Flash Workaround (i.e. Pale Moon + Fiddler)', 'Flash Workaround'],
      ['Normal Browser', 'Normal Browser'],
      ['Flash (Ruffle)', 'Flash (Ruffle)'],
      ['Flash Workaround', 'Flash Workaround'],
      ['Shockwave', 'Shockwave'],
      ['3DVIA', '3DVIA'],
      ['Flash Required', 'Flash Required'],
    ]);

    return replacements.get(cleaned) || cleaned || 'Other';
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getDefaultFilters() {
    return {
      search: '',
      type: 'all',
      status: 'all',
      category: 'all',
      technology: 'all',
      sort: 'name',
      includeSpecialCounts: false,
    };
  }

  function shouldIncludeInPrimaryCounts(item, includeSpecialCounts) {
    if (includeSpecialCounts) {
      return true;
    }
    return item.category !== 'PVP' && item.category !== 'Retired';
  }

  function getDefaultTheme() {
    return 'default';
  }

  function loadThemePreference() {
    try {
      const value = window.localStorage.getItem(CONFIG.themeStorageKey);
      return cleanText(value) || getDefaultTheme();
    } catch (error) {
      return getDefaultTheme();
    }
  }

  function saveThemePreference(theme) {
    try {
      window.localStorage.setItem(CONFIG.themeStorageKey, theme);
    } catch (error) {
      // Ignore storage failures and keep the in-memory theme.
    }
  }

  function loadTrackingListPreference() {
    try {
      const value = window.localStorage.getItem(CONFIG.trackingListStorageKey);
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed)
        ? Array.from(new Set(parsed.map((entry) => cleanText(entry)).filter(Boolean)))
        : [];
    } catch (error) {
      return [];
    }
  }

  function loadLookupOwnedPreference() {
    try {
      const value = window.localStorage.getItem(CONFIG.lookupOwnedStorageKey);
      const parsed = JSON.parse(value || '[]');
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }

      return Object.fromEntries(
        Object.entries(parsed)
          .map(([trophyId, variant]) => [cleanText(trophyId), Number(variant)])
          .filter(([trophyId, variant]) => LOOKUP_ONLY_TROPHY_IDS.has(trophyId) && [1, 2, 3, 4].includes(variant))
      );
    } catch (error) {
      return {};
    }
  }

  function parseLookupOnlyTrophies() {
    return Object.fromEntries(
      Array.from(document.querySelectorAll('td.trophy_cell img[src*="/trophies/"]'))
        .map((image) => {
          const match = image.src.match(/\/trophies\/(\d+)_([1-4])\.(gif|png)/i);
          if (!match) {
            return null;
          }
          return [cleanText(match[1]), Number(match[2])];
        })
        .filter((entry) => entry && LOOKUP_ONLY_TROPHY_IDS.has(entry[0]))
    );
  }

  function storeLookupOwnedTrophies() {
    const ownedIds = parseLookupOnlyTrophies();
    try {
      window.localStorage.setItem(CONFIG.lookupOwnedStorageKey, JSON.stringify(ownedIds));
    } catch (error) {
      // Ignore storage failures and keep the lookup page usable.
    }
    return ownedIds;
  }

  function ensureMount() {
    let mount = document.getElementById(CONFIG.mountId);
    if (!mount) {
      mount = document.createElement('div');
      mount.id = CONFIG.mountId;
      document.body.appendChild(mount);
    }
    return mount;
  }

  function getCurrentUsername() {
    const userLink = document.querySelector('td.user.medText a[href*="userlookup.phtml?user="]');
    return cleanText(userLink?.textContent || '');
  }

  function getViewedUsername() {
    const params = new URLSearchParams(window.location.search);
    return cleanText(params.get('user') || '');
  }

  function isOwnUserlookupPage() {
    const currentUsername = getCurrentUsername().toLowerCase();
    const viewedUsername = getViewedUsername().toLowerCase();
    return Boolean(currentUsername && viewedUsername && currentUsername === viewedUsername);
  }

  function ensureUserlookupPageButton() {
    let button = document.getElementById('ntt-userlookup-link');
    if (button) {
      return button;
    }

    const module = document.querySelector('#usertrophies .contentModuleContent');
    if (!module) {
      return null;
    }

    const wrapper = document.createElement('div');
      wrapper.className = 'ntt-userlookup-action';

      button = document.createElement('a');
      button.id = 'ntt-userlookup-link';
      button.className = 'ntt-userlookup-button';
      button.href = '/prizes.phtml';
      button.textContent = 'Open Trophy Tracker Page';
      button.target = '_blank';
      button.rel = 'noopener noreferrer';

    wrapper.appendChild(button);
    module.appendChild(wrapper);

    return button;
  }

  function ensureInlineLauncher() {
    let launcher = document.getElementById(CONFIG.launcherId);
    if (launcher) {
      return launcher;
    }

    const trophyCenter = Array.from(document.querySelectorAll('td.content center')).find((center) =>
      /Trophy Cabinet/i.test(center.textContent || '')
      && /High-Score Tables/i.test(center.textContent || '')
      && /My Scores/i.test(center.textContent || '')
    );

    if (!trophyCenter) {
      return null;
    }

    const wrap = document.createElement('span');
    wrap.className = 'ntt-inline-launcher-wrap';
    wrap.innerHTML = ' <span class="ntt-inline-sep">|</span> ';

    launcher = document.createElement('button');
    launcher.id = CONFIG.launcherId;
    launcher.type = 'button';
    launcher.className = 'ntt-inline-launcher';
    launcher.textContent = 'Open Trophy Tracker View';

    wrap.appendChild(launcher);
    trophyCenter.appendChild(wrap);

    return launcher;
  }

  function getViewModel(state) {
    const itemsWithTracking = state.items.map((item) => ({
      ...applyLookupOwnedOverride(item, state.lookupOwned),
      isTracked: state.trackingList.includes(item.trophyId),
      includeInPrimaryCounts: shouldIncludeInPrimaryCounts(item, state.filters.includeSpecialCounts),
    }));
    const filteredItems = applyFilters(itemsWithTracking, state.filters);
    const summary = getSummary(itemsWithTracking, filteredItems);
    const categories = uniqueValues(
      itemsWithTracking
        .map((item) => item.category)
        .concat(itemsWithTracking.some((item) => item.isGlowing) ? ['Glowing'] : [])
    );
    const technologies = uniqueValues(itemsWithTracking.map((item) => item.technology));
    const trackingItems = state.trackingList
      .map((trophyId) => itemsWithTracking.find((item) => item.trophyId === trophyId))
      .filter(Boolean);
    const selectedTrackingItem = trackingItems.find((item) => item.trophyId === state.trackingSelectedId) || trackingItems[0] || null;

    if (selectedTrackingItem && state.trackingSelectedId !== selectedTrackingItem.trophyId) {
      state.trackingSelectedId = selectedTrackingItem.trophyId;
    }
    if (!selectedTrackingItem && state.trackingSelectedId) {
      state.trackingSelectedId = '';
    }

    return {
      filteredItems,
      summary,
      categories,
      technologies,
      catalogError: state.catalogError,
      trackingItems,
      selectedTrackingItem,
      includeSpecialCounts: state.filters.includeSpecialCounts,
    };
  }

  function renderResults(viewModel) {
    const { filteredItems, summary, catalogError } = viewModel;

    return `
      ${catalogError ? `<div class="ntt-alert">${escapeHtml(catalogError)}</div>` : ''}
      <div class="ntt-results-layout">
        <section class="ntt-results-main">
          <section class="ntt-summary">
            ${renderStat('Total', summary.total)}
            ${renderStat('Owned', summary.owned)}
            ${renderStat('Missing', summary.missing)}
            ${renderStat('Gold', summary.gold)}
            ${renderStat('Silver', summary.silver)}
            ${renderStat('Bronze', summary.bronze)}
          </section>

          <section>
            <div class="ntt-results-head">
              <p>${escapeHtml(`${summary.filtered} trophies shown`)}</p>
              <label class="ntt-check-field ntt-results-toggle">
                <input type="checkbox" name="includeSpecialCounts" ${viewModel.includeSpecialCounts ? 'checked' : ''} />
                <span>Include PVP/Retired In Counts</span>
              </label>
            </div>
            ${
              filteredItems.length
                ? `<div class="ntt-grid">${filteredItems.map((item) => renderCard(item)).join('')}</div>`
                : '<div class="ntt-empty">No trophies match the current filters.</div>'
            }
          </section>
        </section>
        ${renderTrackingPanel(viewModel)}
      </div>
    `;
  }

  function renderApp(state) {
    const viewModel = getViewModel(state);

    return `
      ${
        state.isOpen
          ? `
        <section id="${CONFIG.panelId}" data-theme="${escapeAttribute(state.theme)}" aria-modal="true" role="dialog" aria-label="Neopets Trophy Tracker">
          <div class="ntt-backdrop" data-action="close"></div>
          <div class="ntt-dialog">
            <header class="ntt-header">
              <div>
                <p class="ntt-kicker">Neopets Trophy Tracker</p>
                <h1>Trophies for ${escapeHtml(state.username || 'your account')}</h1>
              </div>
              <div class="ntt-header-actions">
                <label class="ntt-field ntt-theme-field">
                  <span>Theme</span>
                  <select name="theme">${renderThemeOptions(state.theme)}</select>
                </label>
                <button class="ntt-secondary" type="button" data-action="reset-filters">Reset Filters</button>
                <button class="ntt-close" type="button" data-action="close">Close</button>
              </div>
            </header>
            <div class="ntt-body">
              <section class="ntt-toolbar">
                <label class="ntt-field ntt-search">
                  <span>Search</span>
                  <input type="search" name="search" value="${escapeAttribute(state.filters.search)}" placeholder="Search trophy, category, technology..." />
                </label>
                <label class="ntt-field">
                  <span>Type</span>
                  <select name="type">${renderTypeOptions(state.filters.type)}</select>
                </label>
                <label class="ntt-field">
                  <span>Status</span>
                  <select name="status">${renderStatusOptions(state.filters.status)}</select>
                </label>
                <label class="ntt-field">
                  <span>Category</span>
                  <select name="category">${renderOptions(viewModel.categories, state.filters.category)}</select>
                </label>
                <label class="ntt-field">
                  <span>Technology</span>
                  <select name="technology">${renderOptions(viewModel.technologies, state.filters.technology)}</select>
                </label>
                <label class="ntt-field">
                  <span>Sort</span>
                  <select name="sort">${renderSortOptions(state.filters.sort)}</select>
                </label>
              </section>
              <div id="ntt-results">${renderResults(viewModel)}</div>
            </div>
          </div>
        </section>`
          : ''
      }
    `;
  }

  function bindAppEvents(state, mount) {
    function persistTrackingList() {
      try {
        window.localStorage.setItem(CONFIG.trackingListStorageKey, JSON.stringify(state.trackingList));
      } catch (_error) {
        // Ignore storage failures so the tracker still works in restricted contexts.
      }
    }

    function bindResultEvents() {
      mount.querySelectorAll('.ntt-results-head input').forEach((field) => {
        field.addEventListener('input', () => {
          state.filters[field.name] = field.type === 'checkbox' ? field.checked : field.value;
          rerender({ resultsOnly: true });
        });
        field.addEventListener('change', () => {
          state.filters[field.name] = field.type === 'checkbox' ? field.checked : field.value;
          rerender({ resultsOnly: true });
        });
      });

      mount.querySelectorAll('[data-action="toggle-track"]').forEach((element) => {
        element.addEventListener('click', () => {
          const trophyId = element.getAttribute('data-trophy-id') || '';
          if (!trophyId || state.trackingList.includes(trophyId)) {
            return;
          }
          state.trackingList = [...state.trackingList, trophyId];
          state.trackingSelectedId = trophyId;
          persistTrackingList();
          rerender({ resultsOnly: true });
        });
      });

      mount.querySelectorAll('[data-action="remove-tracking"]').forEach((element) => {
        element.addEventListener('click', () => {
          const trophyId = element.getAttribute('data-trophy-id') || '';
          state.trackingList = state.trackingList.filter((entry) => entry !== trophyId);
          if (state.trackingSelectedId === trophyId) {
            state.trackingSelectedId = state.trackingList[0] || '';
          }
          persistTrackingList();
          rerender({ resultsOnly: true });
        });
      });

      mount.querySelectorAll('[data-action="select-tracking"]').forEach((element) => {
        element.addEventListener('click', () => {
          state.trackingSelectedId = element.getAttribute('data-trophy-id') || '';
          rerender({ resultsOnly: true });
        });
      });

      mount.querySelectorAll('[data-action="clear-tracking"]').forEach((element) => {
        element.addEventListener('click', () => {
          state.trackingList = [];
          state.trackingSelectedId = '';
          persistTrackingList();
          rerender({ resultsOnly: true });
        });
      });
    }

    function rerender(options = {}) {
      const preserve = options.preserveFocus;
      const resultsOnly = options.resultsOnly && state.isOpen;

      if (resultsOnly) {
        const results = mount.querySelector('#ntt-results');
        if (results) {
          results.innerHTML = renderResults(getViewModel(state));
        } else {
          mount.innerHTML = renderApp(state);
          bindAppEvents(state, mount);
        }
      } else {
        mount.innerHTML = renderApp(state);
        bindAppEvents(state, mount);
      }

      if (state.isOpen) {
        bindResultEvents();
      }

      if (!preserve) {
        return;
      }

      const field = mount.querySelector(`[name="${preserve.name}"]`);
      if (!field) {
        return;
      }

      field.focus();
      if (typeof preserve.start === 'number' && typeof field.setSelectionRange === 'function') {
        field.setSelectionRange(preserve.start, preserve.end ?? preserve.start);
      }
    }

    const launcher = document.getElementById(CONFIG.launcherId);
    if (launcher) {
      launcher.onclick = () => {
        state.username = getCurrentUsername() || state.username;
        state.isOpen = true;
        rerender();
      };
    }

    mount.querySelectorAll('[data-action="close"]').forEach((element) => {
      element.addEventListener('click', () => {
        state.isOpen = false;
        rerender();
      });
    });

    mount.querySelectorAll('[data-action="reset-filters"]').forEach((element) => {
      element.addEventListener('click', () => {
        state.filters = getDefaultFilters();
        rerender();
      });
    });

    mount.querySelectorAll('.ntt-toolbar input, .ntt-toolbar select').forEach((field) => {
      field.addEventListener('input', () => {
        state.filters[field.name] = field.type === 'checkbox' ? field.checked : field.value;

        if (field.tagName === 'INPUT' && field.type !== 'checkbox') {
          rerender({
            resultsOnly: true,
            preserveFocus: {
              name: field.name,
              start: field.selectionStart,
              end: field.selectionEnd,
            },
          });
          return;
        }

        rerender({ resultsOnly: true });
      });
      field.addEventListener('change', () => {
        state.filters[field.name] = field.type === 'checkbox' ? field.checked : field.value;
        rerender({ resultsOnly: true });
      });
    });

    mount.querySelectorAll('select[name="theme"]').forEach((field) => {
      field.addEventListener('change', () => {
        state.theme = field.value || getDefaultTheme();
        saveThemePreference(state.theme);
        rerender();
      });
    });

    if (state.isOpen) {
      bindResultEvents();
    }
  }

  async function init() {
    injectStyles();

    if (window.location.pathname.includes('/userlookup.phtml')) {
      if (isOwnUserlookupPage()) {
        storeLookupOwnedTrophies();
        ensureUserlookupPageButton();
      }
      return;
    }

    let catalogError = '';
    try {
      await loadCatalog();
    } catch (error) {
      catalogError = error instanceof Error ? error.message : 'Failed to load trophy catalog.';
    }

    const state = {
      isOpen: false,
      items: [],
      catalogError,
      filters: getDefaultFilters(),
      theme: loadThemePreference(),
      lookupOwned: loadLookupOwnedPreference(),
      trackingList: loadTrackingListPreference(),
      trackingSelectedId: '',
      username: getCurrentUsername(),
    };

    state.items = dedupeById(buildTrackerItems()).map((item) => ({
      ...item,
      isTracked: state.trackingList.includes(item.trophyId),
    }));

    const mount = ensureMount();
    ensureInlineLauncher();
    mount.innerHTML = renderApp(state);
    bindAppEvents(state, mount);

  }

  function injectStyles() {
    if (document.getElementById('ntt-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'ntt-styles';
    style.textContent = `
      :root {
        --ntt-bg: rgba(13, 19, 31, 0.84);
        --ntt-panel: #f6efe3;
        --ntt-panel-strong: #fffaf1;
        --ntt-surface: rgba(255,255,255,.76);
        --ntt-surface-hover: rgba(255,255,255,.92);
        --ntt-card-image-a: rgba(255,248,233,.95);
        --ntt-card-image-b: rgba(240,247,255,.95);
        --ntt-ink: #1f2833;
        --ntt-muted: #637082;
        --ntt-border: rgba(34, 59, 96, 0.12);
        --ntt-accent: #0f7b6c;
        --ntt-accent-soft: #d9f4ef;
        --ntt-link-a: #1a2d47;
        --ntt-link-b: #16263d;
        --ntt-link-text: #ffffff;
        --ntt-pill-bg: rgba(18,92,161,.08);
        --ntt-pill-text: #1f4e83;
        --ntt-upgrade-bg: #d9f4ef;
        --ntt-upgrade-text: #0f7b6c;
        --ntt-missing-bg: rgba(138,47,78,.12);
        --ntt-missing-text: #8a2f4e;
        --ntt-gold-bg: rgba(225,189,73,.18);
        --ntt-gold-text: #b17a10;
        --ntt-silver-bg: rgba(111,127,150,.15);
        --ntt-silver-text: #6f7f96;
        --ntt-bronze-bg: rgba(143,84,55,.14);
        --ntt-bronze-text: #8f5437;
        --ntt-unknown-bg: rgba(58,74,96,.12);
        --ntt-unknown-text: #425166;
        --ntt-shadow: 0 24px 80px rgba(9, 19, 34, 0.28);
        --ntt-sans: "Segoe UI", "Aptos", "Inter", "Helvetica Neue", sans-serif;
        --ntt-display: "Aptos Display", "Segoe UI Variable Display", "Trebuchet MS", sans-serif;
      }
      #${CONFIG.panelId}[data-theme="default"] {
        --ntt-bg: rgba(13, 19, 31, 0.84);
        --ntt-panel: #f6efe3;
        --ntt-panel-strong: #fffaf1;
        --ntt-surface: rgba(255,255,255,.76);
        --ntt-surface-hover: rgba(255,255,255,.92);
        --ntt-card-image-a: rgba(255,248,233,.95);
        --ntt-card-image-b: rgba(240,247,255,.95);
        --ntt-ink: #1f2833;
        --ntt-muted: #637082;
        --ntt-border: rgba(34, 59, 96, 0.12);
        --ntt-accent: #0f7b6c;
        --ntt-accent-soft: #d9f4ef;
        --ntt-link-a: #1a2d47;
        --ntt-link-b: #16263d;
        --ntt-link-text: #ffffff;
        --ntt-pill-bg: rgba(18,92,161,.08);
        --ntt-pill-text: #1f4e83;
        --ntt-upgrade-bg: #d9f4ef;
        --ntt-upgrade-text: #0f7b6c;
        --ntt-missing-bg: rgba(138,47,78,.12);
        --ntt-missing-text: #8a2f4e;
        --ntt-gold-bg: rgba(225,189,73,.18);
        --ntt-gold-text: #b17a10;
        --ntt-silver-bg: rgba(111,127,150,.15);
        --ntt-silver-text: #6f7f96;
        --ntt-bronze-bg: rgba(143,84,55,.14);
        --ntt-bronze-text: #8f5437;
        --ntt-unknown-bg: rgba(58,74,96,.12);
        --ntt-unknown-text: #425166;
        --ntt-shadow: 0 24px 80px rgba(9, 19, 34, 0.28);
      }
      #${CONFIG.panelId}[data-theme="cherry-blossom"] {
        --ntt-bg: rgba(50, 22, 33, 0.7);
        --ntt-panel: #fff1f6;
        --ntt-panel-strong: #fff8fb;
        --ntt-surface: rgba(255,255,255,.72);
        --ntt-surface-hover: rgba(255,255,255,.9);
        --ntt-card-image-a: rgba(255,240,246,.96);
        --ntt-card-image-b: rgba(255,249,252,.96);
        --ntt-ink: #3e2131;
        --ntt-muted: #8a6174;
        --ntt-border: rgba(160, 84, 117, 0.16);
        --ntt-accent: #c4527e;
        --ntt-accent-soft: #ffe0eb;
        --ntt-link-a: #b04b70;
        --ntt-link-b: #8e375c;
        --ntt-pill-bg: rgba(196,82,126,.12);
        --ntt-pill-text: #9b345f;
        --ntt-upgrade-bg: #ffe0eb;
        --ntt-upgrade-text: #b13f69;
        --ntt-missing-bg: rgba(123,49,82,.14);
        --ntt-missing-text: #8b325a;
        --ntt-shadow: 0 24px 80px rgba(71, 22, 44, 0.24);
      }
      #${CONFIG.panelId}[data-theme="ocean-waves"] {
        --ntt-bg: rgba(7, 34, 55, 0.78);
        --ntt-panel: #eef9ff;
        --ntt-panel-strong: #f7fdff;
        --ntt-surface: rgba(255,255,255,.74);
        --ntt-surface-hover: rgba(255,255,255,.92);
        --ntt-card-image-a: rgba(235,249,255,.96);
        --ntt-card-image-b: rgba(243,255,255,.96);
        --ntt-ink: #17384d;
        --ntt-muted: #5e7e92;
        --ntt-border: rgba(39, 113, 148, 0.16);
        --ntt-accent: #157ca7;
        --ntt-accent-soft: #d8f1fb;
        --ntt-link-a: #136d92;
        --ntt-link-b: #0e5673;
        --ntt-pill-bg: rgba(21,124,167,.11);
        --ntt-pill-text: #175d7b;
        --ntt-upgrade-bg: #d8f1fb;
        --ntt-upgrade-text: #0f6f95;
        --ntt-missing-bg: rgba(31,87,130,.12);
        --ntt-missing-text: #225f8b;
        --ntt-shadow: 0 24px 80px rgba(7, 45, 77, 0.26);
      }
      #${CONFIG.panelId}[data-theme="lavender-dreams"] {
        --ntt-bg: rgba(35, 25, 59, 0.76);
        --ntt-panel: #f6f1ff;
        --ntt-panel-strong: #fbf8ff;
        --ntt-surface: rgba(255,255,255,.74);
        --ntt-surface-hover: rgba(255,255,255,.92);
        --ntt-card-image-a: rgba(244,238,255,.96);
        --ntt-card-image-b: rgba(252,249,255,.96);
        --ntt-ink: #33264b;
        --ntt-muted: #75678e;
        --ntt-border: rgba(115, 94, 170, 0.16);
        --ntt-accent: #8a63d2;
        --ntt-accent-soft: #ece2ff;
        --ntt-link-a: #7a58c0;
        --ntt-link-b: #60449d;
        --ntt-pill-bg: rgba(138,99,210,.11);
        --ntt-pill-text: #6949ad;
        --ntt-upgrade-bg: #ece2ff;
        --ntt-upgrade-text: #7a58c0;
        --ntt-missing-bg: rgba(118,75,165,.12);
        --ntt-missing-text: #7a4eb0;
        --ntt-shadow: 0 24px 80px rgba(44, 28, 83, 0.24);
      }
      #${CONFIG.panelId}[data-theme="dark-mode"] {
        --ntt-bg: rgba(4, 8, 14, 0.82);
        --ntt-panel: #161c27;
        --ntt-panel-strong: #1d2634;
        --ntt-surface: rgba(34,42,57,.86);
        --ntt-surface-hover: rgba(42,52,70,.95);
        --ntt-card-image-a: rgba(31,39,53,.96);
        --ntt-card-image-b: rgba(24,30,42,.96);
        --ntt-ink: #eef4ff;
        --ntt-muted: #9aa9bf;
        --ntt-border: rgba(128, 152, 190, 0.18);
        --ntt-accent: #7ed6c5;
        --ntt-accent-soft: rgba(126,214,197,.15);
        --ntt-link-a: #84b6ff;
        --ntt-link-b: #5d8fdb;
        --ntt-link-text: #08111d;
        --ntt-pill-bg: rgba(132,182,255,.12);
        --ntt-pill-text: #b8d4ff;
        --ntt-upgrade-bg: rgba(126,214,197,.15);
        --ntt-upgrade-text: #a8efe2;
        --ntt-missing-bg: rgba(214,126,165,.16);
        --ntt-missing-text: #ffc3db;
        --ntt-gold-bg: rgba(225,189,73,.2);
        --ntt-gold-text: #ffd56d;
        --ntt-silver-bg: rgba(157,177,205,.18);
        --ntt-silver-text: #d6e1f2;
        --ntt-bronze-bg: rgba(178,122,89,.18);
        --ntt-bronze-text: #efbb9b;
        --ntt-unknown-bg: rgba(96,112,138,.2);
        --ntt-unknown-text: #c9d4e7;
        --ntt-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
      }
      .ntt-inline-launcher-wrap { white-space: nowrap; }
      .ntt-inline-sep { color: inherit; font-weight: normal; }
      #${CONFIG.launcherId}.ntt-inline-launcher {
        appearance: none;
        border: 1px solid #7ea7c9;
        border-radius: 999px;
        background: linear-gradient(180deg, #f7fbff, #e5f0fb);
        color: #0d5fa6;
        cursor: pointer;
        font: 700 13px/1.2 var(--ntt-sans);
        padding: 4px 10px;
        margin: 0 0 0 2px;
        vertical-align: baseline;
        text-decoration: none;
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.85) inset;
      }
      #${CONFIG.launcherId}.ntt-inline-launcher:hover {
        color: #0f7b6c;
        border-color: #5d9f91;
        background: linear-gradient(180deg, #f3fffc, #dff6f0);
        text-decoration: none;
      }
      .ntt-userlookup-action {
        display: flex;
        justify-content: center;
        padding: 18px 0 6px;
      }
      .ntt-userlookup-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 220px;
        border: 1px solid #7ea7c9;
        border-radius: 999px;
        background: linear-gradient(180deg, #f7fbff, #e5f0fb);
        color: #0d5fa6;
        font: 700 13px/1.2 var(--ntt-sans);
        padding: 8px 16px;
        text-decoration: none;
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.85) inset;
      }
      .ntt-userlookup-button:hover {
        color: #0f7b6c;
        border-color: #5d9f91;
        background: linear-gradient(180deg, #f3fffc, #dff6f0);
        text-decoration: none;
      }
      #${CONFIG.panelId} { position: fixed; inset: 0; z-index: 2147483001; }
      .ntt-backdrop { position: absolute; inset: 0; background: var(--ntt-bg); backdrop-filter: blur(8px); }
      .ntt-dialog {
        position: relative;
        width: min(1420px, calc(100vw - 18px));
        height: min(92vh, 980px);
        margin: min(4vh, 18px) auto;
        padding: 28px;
        border-radius: 24px;
        background: radial-gradient(circle at top right, color-mix(in srgb, var(--ntt-accent) 18%, transparent), transparent 28%), linear-gradient(180deg, var(--ntt-panel-strong), var(--ntt-panel));
        color: var(--ntt-ink);
        box-shadow: var(--ntt-shadow);
        display: flex;
        flex-direction: column;
      }
      .ntt-header, .ntt-results-head, .ntt-card-top, .ntt-card-title-row { display: flex; justify-content: space-between; gap: 14px; }
      .ntt-header { align-items: flex-start; margin-bottom: 18px; }
      .ntt-header-actions { display: flex; align-items: flex-end; gap: 10px; }
      .ntt-header h1, .ntt-header p, .ntt-stat p, .ntt-stat strong, .ntt-results-head p, .ntt-empty { margin: 0; }
      .ntt-kicker { color: var(--ntt-accent); font: 700 12px/1.2 var(--ntt-sans); text-transform: uppercase; letter-spacing: .08em; }
      .ntt-header h1 { margin-top: 6px; font: 700 clamp(26px, 3vw, 38px)/1.05 var(--ntt-display); }
      .ntt-close, .ntt-secondary {
        border: 1px solid var(--ntt-border);
        border-radius: 999px;
        background: var(--ntt-surface);
        color: var(--ntt-ink);
        padding: 10px 14px;
        font: 600 13px/1 var(--ntt-sans);
        cursor: pointer;
      }
      .ntt-theme-field { min-width: 190px; }
      .ntt-theme-field span { text-align: left; }
      .ntt-body { overflow: auto; padding-right: 6px; }
      .ntt-alert {
        margin-bottom: 16px;
        border: 1px solid color-mix(in srgb, var(--ntt-missing-text) 28%, var(--ntt-border));
        background: color-mix(in srgb, var(--ntt-missing-bg) 72%, var(--ntt-surface));
        color: var(--ntt-ink);
        border-radius: 16px;
        padding: 12px 14px;
        font: 600 13px/1.45 var(--ntt-sans);
      }
      .ntt-summary, .ntt-grid { display: grid; gap: 12px; }
      .ntt-summary { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); margin-bottom: 18px; }
      .ntt-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
      .ntt-results-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 18px;
        align-items: start;
      }
      .ntt-results-main { min-width: 0; }
      .ntt-stat, .ntt-toolbar, .ntt-card {
        border: 1px solid var(--ntt-border);
        background: var(--ntt-surface);
        backdrop-filter: blur(4px);
      }
      .ntt-stat, .ntt-card { border-radius: 20px; padding: 16px; }
      .ntt-stat p { color: var(--ntt-muted); font: 600 12px/1 var(--ntt-sans); text-transform: uppercase; letter-spacing: .08em; }
      .ntt-stat strong { display: block; margin-top: 8px; font: 700 28px/1 var(--ntt-display); }
      .ntt-toolbar {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        padding: 16px;
        border-radius: 20px;
        margin-bottom: 18px;
      }
      .ntt-field, .ntt-toggle { display: flex; flex-direction: column; gap: 8px; color: var(--ntt-muted); font: 600 12px/1.2 var(--ntt-sans); }
      .ntt-check-field {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 38px;
        padding: 0 4px;
        color: var(--ntt-muted);
        font: 600 12px/1.2 var(--ntt-sans);
      }
      .ntt-check-field input {
        width: 16px;
        height: 16px;
        margin: 0;
      }
      .ntt-search { grid-column: span 2; }
      .ntt-field input, .ntt-field select {
        width: 100%;
        border: 1px solid rgba(27,48,76,.14);
        border-radius: 14px;
        padding: 11px 12px;
        background: color-mix(in srgb, var(--ntt-surface-hover) 92%, white 8%);
        color: var(--ntt-ink);
        font: 500 14px/1.3 var(--ntt-sans);
      }
      .ntt-toggle { flex-direction: row; align-items: center; justify-content: flex-end; align-self: end; gap: 10px; color: var(--ntt-ink); }
      .ntt-results-head { align-items: center; margin-bottom: 14px; }
      .ntt-results-toggle {
        margin-left: auto;
        white-space: nowrap;
      }
      .ntt-results-head p, .ntt-sub { color: var(--ntt-muted); font: 500 13px/1.3 var(--ntt-sans); }
      .ntt-card {
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        gap: 14px;
        min-height: 328px;
        box-shadow: 0 10px 24px rgba(18, 33, 58, 0.06);
        transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease;
      }
      .ntt-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 18px 36px rgba(18, 33, 58, 0.12);
        border-color: rgba(15, 123, 108, 0.22);
        background: var(--ntt-surface-hover);
      }
      .ntt-card-top { align-items: stretch; }
      .ntt-card-media {
        width: 96px;
        min-width: 96px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }
      .ntt-card-image {
        width: 96px; height: 96px; object-fit: contain; border-radius: 18px; padding: 10px;
        background: linear-gradient(180deg, var(--ntt-card-image-a), var(--ntt-card-image-b));
        border: 1px solid rgba(31,57,95,.08);
      }
      .ntt-card-heading {
        min-width: 0;
        flex: 1;
        display: grid;
        grid-template-rows: 48px repeat(3, auto);
        align-content: start;
        gap: 4px;
      }
      .ntt-card-title-row {
        align-items: center;
        justify-content: center;
        text-align: center;
      }
      .ntt-card-heading h3 {
        margin: 0;
        min-height: 48px;
        font: 700 20px/1.14 var(--ntt-display);
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        text-align: center;
        width: 100%;
        align-self: center;
      }
      .ntt-badge, .ntt-pill {
        display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 6px 10px; font: 700 12px/1 var(--ntt-sans);
      }
      .ntt-badge { width: 96px; min-height: 32px; box-sizing: border-box; text-align: center; }
      .status-gold .ntt-badge { background: var(--ntt-gold-bg); color: var(--ntt-gold-text); }
      .status-silver .ntt-badge { background: var(--ntt-silver-bg); color: var(--ntt-silver-text); }
      .status-bronze .ntt-badge, .status-runner-up .ntt-badge { background: var(--ntt-bronze-bg); color: var(--ntt-bronze-text); }
      .status-missing .ntt-badge { background: var(--ntt-missing-bg); color: var(--ntt-missing-text); }
      .status-unknown .ntt-badge { background: var(--ntt-unknown-bg); color: var(--ntt-unknown-text); }
      .ntt-card-tags { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-start; }
      .ntt-pill { background: var(--ntt-pill-bg); color: var(--ntt-pill-text); min-height: 30px; }
      .ntt-pill-upgrade { background: var(--ntt-upgrade-bg); color: var(--ntt-upgrade-text); }
      .ntt-pill-missing { background: var(--ntt-missing-bg); color: var(--ntt-missing-text); }
      .ntt-pill-action {
        border: 1px solid color-mix(in srgb, var(--ntt-accent) 26%, var(--ntt-border));
        cursor: pointer;
      }
      .ntt-pill-action:disabled {
        opacity: .58;
        cursor: default;
      }
      .ntt-card-links a, .ntt-link-disabled {
        display: inline-flex; align-items: center; justify-content: center; min-height: 38px; border-radius: 12px; padding: 0 12px; font: 700 13px/1 var(--ntt-sans); text-decoration: none;
      }
      .ntt-card-links {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        align-items: end;
      }
      .ntt-card-links a {
        background: linear-gradient(180deg, var(--ntt-link-a), var(--ntt-link-b));
        color: var(--ntt-link-text);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
        transition: transform 120ms ease, filter 120ms ease, background 120ms ease;
      }
      .ntt-card-links a:hover {
        transform: translateY(-1px);
        filter: brightness(1.05);
      }
      .ntt-link-disabled { background: rgba(29,36,48,.08); color: var(--ntt-muted); }
      .ntt-sub {
        text-align: center;
        padding: 0 4px;
        line-height: 1.2;
      }
      .ntt-tracking-panel {
        display: grid;
        gap: 12px;
        align-self: start;
        position: sticky;
        top: 0;
      }
      .ntt-tracking-list-panel, .ntt-tracking-details {
        border: 1px solid var(--ntt-border);
        background: var(--ntt-surface);
        backdrop-filter: blur(4px);
        border-radius: 20px;
        padding: 16px;
      }
      .ntt-track-row {
        border: 1px solid var(--ntt-border);
        background: color-mix(in srgb, var(--ntt-surface-hover) 82%, transparent);
        backdrop-filter: blur(4px);
        border-radius: 16px;
      }
      .ntt-tracking-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .ntt-tracking-head h2, .ntt-tracking-details h3 { margin: 0; font: 700 22px/1.1 var(--ntt-display); text-align: center; }
      .ntt-clear-list { white-space: nowrap; }
      .ntt-tracking-list {
        display: grid;
        gap: 10px;
        margin-top: 12px;
        max-height: 340px;
        overflow: auto;
      }
      .ntt-track-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        padding: 10px;
      }
      .ntt-track-row.is-selected {
        border-color: color-mix(in srgb, var(--ntt-accent) 30%, var(--ntt-border));
        background: var(--ntt-surface-hover);
      }
      .ntt-track-select, .ntt-track-remove {
        border: 0;
        background: transparent;
        color: var(--ntt-ink);
        font: 600 13px/1.3 var(--ntt-sans);
      }
      .ntt-track-select {
        text-align: left;
        cursor: pointer;
      }
      .ntt-track-remove {
        border-radius: 999px;
        padding: 8px 12px;
        background: var(--ntt-missing-bg);
        color: var(--ntt-missing-text);
        cursor: pointer;
      }
      .ntt-tracking-details {
        display: grid;
        gap: 12px;
      }
      .ntt-tracking-details .ntt-card {
        min-height: 0;
      }
      .ntt-empty-sm {
        min-height: 120px;
        font-size: 13px;
        padding: 12px;
      }
      .ntt-empty { min-height: 220px; display: flex; align-items: center; justify-content: center; text-align: center; color: var(--ntt-muted); }
      @media (max-width: 860px) {
        .ntt-dialog { width: calc(100vw - 12px); height: calc(100vh - 12px); margin: 6px; padding: 16px; border-radius: 20px; }
        .ntt-search { grid-column: span 1; }
        .ntt-header, .ntt-results-head { flex-direction: column; align-items: flex-start; }
        .ntt-header-actions { width: 100%; flex-wrap: wrap; align-items: stretch; }
        .ntt-theme-field { min-width: 0; width: 100%; }
        .ntt-results-toggle { margin-left: 0; white-space: normal; }
        .ntt-results-layout { grid-template-columns: 1fr; }
        .ntt-tracking-panel { position: static; }
        .ntt-card-links { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  init();
})();
