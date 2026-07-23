// ==UserScript==
// @name         Neopets Training Schools Helper
// @version      3.7
// @author       Hero
// @description  Improves Neopets training schools: train, complete, cancel, and pay for courses with bulk actions.
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/pirates/academy.phtml?type=status*
// @match        *://*.neopets.com/island/training.phtml?type=status*
// @match        *://*.neopets.com/island/fight_training.phtml?type=status*
// @grant        none
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Training%20Schools%20Helper.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Training%20Schools%20Helper.user.js
// ==/UserScript==


/*
  --------------------------------
  Adds a helper UI on training school status pages (Swashbuckling Academy, Mystery Island Training, Secret Ninja School)
  to streamline pet training management.

  - Clean table showing all pets, stats, and training status (Training, Need to Pay, Need to Complete)
  - Bulk select stats and train multiple pets at once
  - Buttons to: Train Selected, Complete Courses, Cancel Unpaid, Get All Items from SDB, Pay All Unpaid, Check All, Reset selected
  - Shows progress bar and feedback during actions
  - Uses small random delays to mimic natural actions
  - Displays stat increases after Completion
  --------------------------------
*/

(function() {
    'use strict';

    const HIGHLIGHT_STORAGE_KEY = "trainingHelperHighlightEnabled";
    const SDB_PIN_STORAGE_KEY = "trainingHelperSdbPin";

    function log(msg) { console.log(`[TrainingHelper] ${msg}`); }

    function normalizeSdbPin(pin) {
        return (pin || "").replace(/\D/g, "").slice(0, 4);
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#039;"
        }[char]));
    }

    function getSdbPin() {
        const pinInput = document.getElementById("training-sdb-pin");
        return normalizeSdbPin(pinInput?.value) || "0";
    }

    function getStoredSdbPin() {
        return normalizeSdbPin(localStorage.getItem(SDB_PIN_STORAGE_KEY));
    }

    function saveSdbPin(pin) {
        const normalizedPin = normalizeSdbPin(pin);
        if (normalizedPin) localStorage.setItem(SDB_PIN_STORAGE_KEY, normalizedPin);
        else localStorage.removeItem(SDB_PIN_STORAGE_KEY);
        return normalizedPin;
    }

    const style = document.createElement("style");
    style.textContent = `
    .training-table { margin: 10px auto; width: 70%; border-collapse: collapse; font-family: Arial, sans-serif; color: #000000; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .training-table th, .training-table td { border: 1px solid #bbb; padding: 8px; text-align: center; }
    .training-table th { background: #4a8cd4; color: white; font-weight: bold; }
    .training-table th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
    .training-table th.sortable::after {
      content: "↕"; display: inline-block; width: 12px; margin-left: 4px;
      font-size: 11px; line-height: 1; opacity: 0.75; text-align: center;
      vertical-align: 1px;
    }
    .training-table th.sort-asc::after { content: "↑"; }
    .training-table th.sort-desc::after { content: "↓"; }
    .training-table tr:nth-child(even) { background: #f8f9fa; }
    .training-table tr:nth-child(odd) { background: #fff; }
    .training-table .check-all { background: #e3f2fd; font-weight: bold; }
    .training-table .pet-row:hover { background: #f0f7ff; }
    .training-table .training-disabled { opacity: 0.6; background: #f5f5f5 !important; }
    .training-table .training-disabled:hover { background: #f5f5f5 !important; }
    .training-table .training-disabled input[type="radio"] { cursor: not-allowed; }
    .training-table .stat-value { color: #2e7d32; font-weight: bold; }
    .training-rules-on .training-table .stat-trainable {
      background: #e7f7e7 !important; box-shadow: inset 0 0 0 2px #72bf72;
    }
    .training-rules-on .training-table .stat-not-trainable {
      background: #fde8e8 !important; box-shadow: inset 0 0 0 2px #dc7777;
    }
    .training-rules-on .training-table .stat-trainable .stat-value { color: #1f7a1f; }
    .training-rules-on .training-table .stat-not-trainable .stat-value { color: #9f2f2f; }
    .training-actions { margin: 12px auto; text-align: center; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;}
    .training-actions button {
      padding: 10px 16px; margin: 0 8px; border: none; border-radius: 6px;
      background: #5c9ded; color: #fff; cursor: pointer; font-size: 14px;
      transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      flex: 0 1 auto;
      min-width: 120px;
    }
    .training-actions button:hover { background: #4a8cd4; transform: translateY(-1px); }
    .training-actions button:disabled { background: #ccc; cursor: not-allowed; transform: none; }
    .training-actions .btn-danger { background: #dc3545; }
    .training-actions .btn-danger:hover { background: #c82333; }
    .training-actions .btn-success { background: #28a745; }
    .training-actions .btn-success:hover { background: #218838; }
    .training-actions .btn-toggle-active { background: #6f42c1; }
    .training-actions .btn-toggle-active:hover { background: #5a35a0; }
    .training-pin-setting {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px;
      border: 1px solid #bbb; border-radius: 6px; background: #fff;
      color: #333; font-family: Arial, sans-serif; font-size: 13px;
    }
    .training-pin-setting input {
      width: 52px; padding: 5px 6px; border: 1px solid #aaa; border-radius: 4px;
      font-size: 13px; text-align: center;
    }

    #training-results {
      margin-top: 12px; text-align: center; font-family: Arial, sans-serif; color: #000000;
      font-size: 14px; padding: 10px; border-radius: 6px; background: #f8f9fa;
    }
    .progress-bar {
      width: 100%; height: 20px; background: #e9ecef; border-radius: 10px;
      overflow: hidden; margin: 10px 0;
    }
    .progress-fill {
      height: 100%; background: linear-gradient(90deg, #28a745, #20c997);
      transition: width 0.3s ease;
    }
    .pet-status { font-size: 12px; color: #666; }
    .stat-recommendations { margin-top: 5px; font-size: 11px; color: #888; }
  `;
    document.head.appendChild(style);

    // Determine process URL
    let processUrl;
    const url = window.location.href;
    if (url.includes('pirates/academy')) processUrl = '/pirates/process_academy.phtml';
    else if (url.includes('island/fight_training')) processUrl = '/island/process_fight_training.phtml';
    else processUrl = '/island/process_training.phtml';

    log(`Using process URL: ${processUrl}`);

    // Helper for random delay
    function randomDelay(min=350, max=550) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function refreshButtonHTML() {
        return `
  <div style="margin-top:10px;">
    <button class="btn-refresh-page" style="
      padding:8px 14px; border:none; border-radius:6px;
      background:#5c9ded; color:#fff; cursor:pointer; font-size:14px;
      transition: all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.1);
    ">🔄 Refresh Page</button>
  </div>
`;
    }

    function bindRefreshButtons() {
        document.querySelectorAll(".btn-refresh-page").forEach(button => {
            button.addEventListener("click", () => {
                location.reload();
            });
        });
    }

    function showFinalStatus(message, issues = []) {
        const issueHTML = issues.length
            ? `<div style="margin-top:10px; color:#c00;"><strong>Issues:</strong><br>${issues.map(issue => `<div>${escapeHtml(issue)}</div>`).join("")}</div>`
            : "";
        if (issues.length) {
            resultsContainer.innerHTML = `<div>${escapeHtml(message)}</div>${issueHTML}${refreshButtonHTML()}`;
            bindRefreshButtons();
        } else {
            resultsContainer.innerHTML = `<div>${escapeHtml(message)} Refreshing page...</div>`;
            setTimeout(() => location.reload(), 2000);
        }
    }

    // Parse pets
    const petsMap = {};
    document.querySelectorAll("table").forEach(table => {
        table.querySelectorAll("tr").forEach(tr => {
            const td = tr.querySelector("td[align='center']");
            if (!td) return;
            const img = td.querySelector("img");
            if (!img) return;
            const srcMatch = img.src.match(/\/cpn\/([\w]+)\//);
            if (!srcMatch) return;
            const name = srcMatch[1];
            if (petsMap[name]) return;

            const text = td.innerText;
            const pet = {
                name,
                Lvl: parseInt((text.match(/Lvl\s*:\s*(\d+)/) || [])[1]) || 0,
                Str: parseInt((text.match(/Str\s*:\s*(\d+)/) || [])[1]) || 0,
                Def: parseInt((text.match(/Def\s*:\s*(\d+)/) || [])[1]) || 0,
                Mov: parseInt((text.match(/Mov\s*:\s*(\d+)/) || [])[1]) || 0,
                Hp:  parseInt((text.match(/Hp\s*:\s*\d+\s*\/\s*(\d+)/) || [])[1]) || 0,
                cancelForm: td.querySelector("form input[value='Cancel']")?.form,
                completeForm: td.nextElementSibling?.querySelector("form input[name='type'][value='complete']")?.form,
                isTraining: false,
                needsPayment: false,
                needsComplete: false,
            };

            const parentTr = td.closest('tr');
            const prevTr = parentTr?.previousElementSibling;
            const statusTd = parentTr.querySelectorAll("td")[1];

            if (prevTr) {
                const headerText = prevTr.textContent || '';

                if (headerText.includes('is currently studying') && statusTd?.innerText.includes('Time till course finishes')) {
                    pet.isTraining = true;
                } else if (headerText.includes('is currently studying') && statusTd?.innerText.includes('Course Finished')) {
                    pet.needsComplete = true;
                } else if (headerText.includes('is currently studying')) {
                    pet.needsPayment = true;
                }
            }


            petsMap[name] = pet;
        });
    });

    // Filter eligible pets based on school
    let levelFilter;
    if (url.includes('pirates/academy')) levelFilter = p => p.Lvl <= 40;
    else if (url.includes('island/training')) levelFilter = p => p.Lvl < 250;
    else if (url.includes('island/fight_training')) levelFilter = p => p.Lvl >= 250;
    else levelFilter = p => p.Lvl < 250;

    const eligiblePets = Object.values(petsMap).filter(levelFilter);
    const pets = eligiblePets;
    if (!pets.length) return log("No eligible pets found.");

    // Build table
    const tableWrapper = document.createElement("div");
    function statRuleCell(p, stat, value, radioInput) {
        const hpBlocksOtherStats = p.Hp > (p.Lvl * 2);
        let canTrain = true;
        let reason = "Can be trained under the level rules.";

        if (stat === "Strength" || stat === "Defence" || stat === "Agility") {
            canTrain = !hpBlocksOtherStats && value < (p.Lvl * 2);
            if (hpBlocksOtherStats) reason = "HP is above twice this pet's level, so train Level first.";
            else if (!canTrain) reason = `${stat} is already at least twice this pet's level.`;
        } else if (stat === "Endurance") {
            canTrain = value < (p.Lvl * 3);
            if (!canTrain) reason = "HP is already at least three times this pet's level.";
        } else if (hpBlocksOtherStats) {
            reason = "Training Level will let this pet train other stats again.";
        }

        const ruleClass = canTrain ? "stat-trainable" : "stat-not-trainable";
        return `<td class="stat-rule ${ruleClass}" data-sort-value="${value}" title="${escapeHtml(reason)}">${radioInput}<br><span class="stat-value">${value}</span></td>`;
    }

    const tbodyRows = pets.map(p => {
        const radioInputs = ['Level', 'Strength', 'Defence', 'Agility', 'Endurance'].map(stat =>
                                                                                         `<input type="radio" name="${p.name}" value="${stat}"${(p.isTraining || p.needsPayment || p.needsComplete) ? ' disabled' : ''}>`
                                                                                        );

        let statusText = "";
        if (p.isTraining) statusText = `<small style="color:#888;">(Training)</small>`;
        else if (p.needsPayment) statusText = `<small style="color:#c00;">(Need to Pay)</small>`;
        else if (p.needsComplete) statusText = `<small style="color:#c00;">(Need to Complete)</small>`;

        const rowClass = (p.isTraining || p.needsPayment || p.needsComplete) ? 'pet-row training-disabled' : 'pet-row';

        return `
      <tr class="${rowClass}">
        <td data-sort-value="${escapeHtml(p.name.toLowerCase())}"><strong>${p.name}</strong><br>${statusText}</td>
        ${statRuleCell(p, "Level", p.Lvl, radioInputs[0])}
        ${statRuleCell(p, "Strength", p.Str, radioInputs[1])}
        ${statRuleCell(p, "Defence", p.Def, radioInputs[2])}
        ${statRuleCell(p, "Agility", p.Mov, radioInputs[3])}
        ${statRuleCell(p, "Endurance", p.Hp, radioInputs[4])}
        <td data-sort-value="${p.Hp + p.Str + p.Def}"><span class="stat-value">${p.Hp + p.Str + p.Def}</span></td>
      </tr>
    `;
    }).join("");

    const checkAllRow = `
    <tr class="check-all">
      <td><b>Select All →</b></td>
      <td><input type="radio" name="checkall" value="Level"></td>
      <td><input type="radio" name="checkall" value="Strength"></td>
      <td><input type="radio" name="checkall" value="Defence"></td>
      <td><input type="radio" name="checkall" value="Agility"></td>
      <td><input type="radio" name="checkall" value="Endurance"></td>
      <td></td>
    </tr>
  `;

    tableWrapper.innerHTML = `
    <table class="training-table">
      <thead>
        <tr><th class="sortable" data-sort-type="text">Pet</th><th class="sortable" data-sort-type="number">Lvl</th><th class="sortable" data-sort-type="number">Str</th><th class="sortable" data-sort-type="number">Def</th><th class="sortable" data-sort-type="number">Mov</th><th class="sortable" data-sort-type="number">HP</th><th class="sortable" data-sort-type="number">HSD</th></tr>
      </thead>
      <tbody>
        ${tbodyRows}
        ${checkAllRow}
      </tbody>
    </table>
    <div class="training-actions">
      <button id="btn-train-all" class="btn-primary">🏋️ Train Selected</button>
      <button id="btn-complete-all" class="btn-success">✅ Complete Courses</button>
      <button id="btn-get-items">📦 Get All Items</button>
      <button id="btn-cancel-all" class="btn-danger">❌ Cancel Unpaid</button>
      <button id="btn-pay-all" class="btn-primary">💰 Pay All Unpaid</button>
      <button id="btn-reset">🔄 Reset Selection</button>
      <button id="btn-toggle-training-rules" type="button" title="Highlight stats by level training rules">Toggle Highlight</button>
      <label class="training-pin-setting" title="Leave blank if you do not use a PIN.">
        SDB PIN
        <input id="training-sdb-pin" type="text" inputmode="numeric" maxlength="4" autocomplete="off" value="${getStoredSdbPin()}" placeholder="0">
      </label>
    </div>
    <div id="training-results"></div>
  `;

    const statusHeader = [...document.querySelectorAll("b")].find(b => b.textContent.trim() === "Current Course Status");
    if (statusHeader) statusHeader.parentElement.insertBefore(tableWrapper, statusHeader);

    const resultsContainer = document.getElementById("training-results");
    let currentSort = { column: null, direction: "asc" };
    function sortTrainingTable(columnIndex, sortType) {
        const tbody = tableWrapper.querySelector(".training-table tbody");
        const petRows = [...tbody.querySelectorAll("tr.pet-row")];
        const checkAllRow = tbody.querySelector("tr.check-all");
        const direction = currentSort.column === columnIndex && currentSort.direction === "asc" ? "desc" : "asc";
        const directionMultiplier = direction === "asc" ? 1 : -1;

        petRows.sort((a, b) => {
            const aValue = a.children[columnIndex]?.dataset.sortValue || "";
            const bValue = b.children[columnIndex]?.dataset.sortValue || "";

            if (sortType === "number") {
                return ((Number(aValue) || 0) - (Number(bValue) || 0)) * directionMultiplier;
            }

            return aValue.localeCompare(bValue, undefined, { sensitivity: "base" }) * directionMultiplier;
        });

        petRows.forEach(row => tbody.appendChild(row));
        if (checkAllRow) tbody.appendChild(checkAllRow);

        tableWrapper.querySelectorAll(".training-table th.sortable").forEach(th => {
            th.classList.remove("sort-asc", "sort-desc");
        });
        const activeHeader = tableWrapper.querySelectorAll(".training-table th.sortable")[columnIndex];
        activeHeader?.classList.add(direction === "asc" ? "sort-asc" : "sort-desc");
        currentSort = { column: columnIndex, direction };
    }

    tableWrapper.querySelectorAll(".training-table th.sortable").forEach((header, index) => {
        header.addEventListener("click", () => {
            sortTrainingTable(index, header.dataset.sortType);
        });
    });

    const sdbPinInput = document.getElementById("training-sdb-pin");
    sdbPinInput.addEventListener("input", () => {
        sdbPinInput.value = saveSdbPin(sdbPinInput.value);
    });
    const trainingRulesToggle = document.getElementById("btn-toggle-training-rules");
    function setTrainingRulesHighlight(isActive) {
        tableWrapper.classList.toggle("training-rules-on", isActive);
        trainingRulesToggle.classList.toggle("btn-toggle-active", isActive);
        trainingRulesToggle.textContent = isActive ? "Toggle Highlight: On" : "Toggle Highlight";
    }

    setTrainingRulesHighlight(localStorage.getItem(HIGHLIGHT_STORAGE_KEY) === "1");

    trainingRulesToggle.addEventListener("click", () => {
        const isActive = !tableWrapper.classList.contains("training-rules-on");
        setTrainingRulesHighlight(isActive);
        localStorage.setItem(HIGHLIGHT_STORAGE_KEY, isActive ? "1" : "0");
    });

    function updateProgress(current, total, message) {
        resultsContainer.innerHTML = `
      <div>${message}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${(current/total)*100}%"></div>
      </div>
      <small>${current}/${total} pets processed</small>
    `;
    }

    // Check all
    document.querySelectorAll(".check-all input[type=radio]").forEach(radio => {
        radio.addEventListener("change", () => {
            const stat = radio.value;
            pets.filter(p => !p.isTraining).forEach(p => {
                const input = document.querySelector(`input[name="${p.name}"][value="${stat}"]`);
                if (input) input.checked = true;
            });
        });
    });

    // Reset
    document.getElementById("btn-reset").addEventListener("click", () => {
        document.querySelectorAll(".training-table input[type=radio]").forEach(r => r.checked = false);
        resultsContainer.innerHTML = "";
        log("Reset all selections.");
    });

    // Train all
    document.getElementById("btn-train-all").addEventListener("click", async () => {
        const selectedPets = pets.filter(p => !p.isTraining && document.querySelector(`input[name="${p.name}"]:checked`));
        if (!selectedPets.length) return alert("No available pets selected!");

        const button = document.getElementById("btn-train-all");
        button.disabled = true;
        const issues = [];

        for (let i=0;i<selectedPets.length;i++){
            const p = selectedPets[i];
            const choice = document.querySelector(`input[name="${p.name}"]:checked`);
            if (!choice) continue;
            updateProgress(i, selectedPets.length, `Training ${p.name} in ${choice.value}...`);
            const formData = new URLSearchParams({type:'start', course_type: choice.value, pet_name: p.name});

            try {
                const res = await fetch(processUrl, {method:'POST', body: formData, headers:{'Content-Type':'application/x-www-form-urlencoded'}});
                const html = await res.text();
                const errorMatch = html.match(/<b>Error: <\/b>([^<]+)/);
                if (errorMatch) {
                    const message = `${p.name}: ${errorMatch[1]}`;
                    issues.push(message);
                    log(`❌ ${message}`);
                } else {
                    log(`✅ ${p.name} training started`);
                }
            } catch(err){
                const message = `${p.name}: network error`;
                issues.push(message);
                log(`❌ ${message}`);
            }

            await new Promise(r=>setTimeout(r, randomDelay()));
        }

        showFinalStatus("Training complete!", issues);
        button.disabled = false;
    });

    // Cancel all
    document.getElementById("btn-cancel-all").addEventListener("click", async () => {
        const cancellablePets = [];
        document.querySelectorAll("form").forEach(form=>{
            const cancelButton = form.querySelector("input[value='Cancel']");
            const petNameInput = form.querySelector("input[name='pet_name']");
            if(cancelButton && petNameInput) cancellablePets.push(petNameInput.value);
        });
        if(!cancellablePets.length) return alert("No unpaid courses found.");
        if(!confirm(`Cancel ${cancellablePets.length} unpaid courses?`)) return;

        const button = document.getElementById("btn-cancel-all");
        button.disabled = true;
        const issues = [];

        for(let i=0;i<cancellablePets.length;i++){
            const petName = cancellablePets[i];
            updateProgress(i, cancellablePets.length, `Cancelling course for ${petName}...`);
            try{
                const res = await fetch(processUrl,{method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:`pet_name=${encodeURIComponent(petName)}&type=cancel`});
                const html = await res.text();
                const errorMatch = html.match(/<b>Error: <\/b>([^<]+)/);
                if (errorMatch) {
                    const message = `${petName}: ${errorMatch[1]}`;
                    issues.push(message);
                    log(`❌ Error cancelling ${message}`);
                } else {
                    log(`✅ Cancelled course for ${petName}`);
                }
            }catch(err){
                const message = `${petName}: network error`;
                issues.push(message);
                log(`❌ Error cancelling ${petName}`);
            }
            await new Promise(r=>setTimeout(r, randomDelay()));
        }

        showFinalStatus("Cancellation complete!", issues);
        button.disabled=false;
    });

    // Complete all
    document.getElementById("btn-complete-all").addEventListener("click", async () => {
        const completablePets = pets.filter(p=>p.completeForm);
        if(!completablePets.length) return alert("No completed courses found!");

        const button = document.getElementById("btn-complete-all");
        button.disabled = true;
        let resultsHTML = "<div><strong>Course Completion Results:</strong></div><br>";

        for(let i=0;i<completablePets.length;i++){
            const p = completablePets[i];
            updateProgress(i, completablePets.length, `Completing course for ${p.name}...`);
            const formData = new URLSearchParams({type:'complete', pet_name:p.name});
            try{
                const res = await fetch(processUrl, {method:'POST', body:formData, headers:{'Content-Type':'application/x-www-form-urlencoded'}});
                const html = await res.text();
                const statMatch = html.match(/increased (\w+)/);
                const stat = statMatch ? statMatch[1] : "Unknown";
                let bonus=1;
                if(html.includes("SUPER BONUS")){
                    const bonusMatch = html.match(/SUPER BONUS - You went up (\d+) points/);
                    bonus = bonusMatch?parseInt(bonusMatch[1]):2;
                }
                const errorMatch = html.match(/<b>Error: <\/b>([^<]+)/);
                resultsHTML += errorMatch ? `<div>${p.name}: <span style="color:red">❌ ${errorMatch[1]}</span></div>` :
                `<div>${p.name}: <span style="color:green">✅ +${bonus} ${stat}${bonus>1?' (SUPER BONUS!)':''}</span></div>`;
            }catch(err){ resultsHTML+=`<div>${p.name}: <span style="color:red">❌ Network Error</span></div>`;}
            await new Promise(r=>setTimeout(r, randomDelay()));
        }

        resultsContainer.innerHTML = resultsHTML + refreshButtonHTML();

        // Add refresh button
        bindRefreshButtons();
        button.disabled=false;
    });

    // Remove Cancel All button on fight_training page
    if (url.includes('island/fight_training')) {
        const cancelBtn = document.getElementById("btn-cancel-all");
        if (cancelBtn) cancelBtn.remove();
    }


    // Pay All
    document.getElementById("btn-pay-all").addEventListener("click", async () => {
        const payForms = [];
        const addedPets = new Set(); // To prevent duplicates

        if (url.includes('island/fight_training')) {
            // Fight training: look for unpaid course text in table cells
            document.querySelectorAll("table").forEach(table => {
                const tdsWithText = [...table.querySelectorAll("td")].filter(td => td.textContent.includes("This course has not been paid for yet"));
                if (!tdsWithText) return;

                tdsWithText.forEach(tdWithText => {
                    const payLink = tdWithText.querySelector("a[href*='type=pay']");
                    if (!payLink) return;

                    const hrefAttr = payLink.getAttribute("href");
                    const urlParams = new URLSearchParams(hrefAttr.split("?")[1]);
                    const petName = urlParams.get("pet_name");
                    if (!petName || addedPets.has(petName)) return;

                    payForms.push({
                        action: "/island/process_fight_training.phtml",
                        method: "GET",
                        params: { type: "pay", pet_name: petName },
                        petName
                    });

                    addedPets.add(petName);
                    log(`Found unpaid fight_training course for: ${petName}`);
                });
            });
        } else {
            // Other pages: look for Pay buttons
            document.querySelectorAll("form").forEach(form => {
                const petNameInput = form.querySelector("input[name='pet_name']");
                if (!petNameInput) return;

                const payButton = form.querySelector("input[value*='Pay']");
                if (!payButton) return;

                if (addedPets.has(petNameInput.value)) return; // skip duplicates

                payForms.push({
                    form,
                    petName: petNameInput.value
                });

                addedPets.add(petNameInput.value);
                log(`Found unpaid course for: ${petNameInput.value}`);
            });
        }

        if (!payForms.length) {
            alert("No unpaid courses found to pay.");
            return;
        }

        if (!confirm(`Pay for ${payForms.length} unpaid course(s)?`)) return;

        const button = document.getElementById("btn-pay-all");
        button.disabled = true;
        const issues = [];

        for (let i = 0; i < payForms.length; i++) {
            const entry = payForms[i];
            updateProgress(i, payForms.length, `Paying for ${entry.petName}...`);

            try {
                if (url.includes('island/fight_training')) {
                    // Fight training: use GET with query params
                    const queryStr = new URLSearchParams(entry.params).toString();
                    const res = await fetch(`${entry.action}?${queryStr}`, { method: entry.method });
                    const html = await res.text();
                    const errorMatch = html.match(/<b>Error: <\/b>([^<]+)/);
                    if (errorMatch) throw new Error(errorMatch[1]);
                } else {
                    // Other pages: use POST form submission
                    const formData = new URLSearchParams();
                    entry.form.querySelectorAll("input").forEach(input => {
                        if (input.name) formData.append(input.name, input.value);
                    });
                    const res = await fetch(entry.form.action, {
                        method: entry.form.method || "POST",
                        body: formData,
                        headers: { "Content-Type": "application/x-www-form-urlencoded" }
                    });
                    const html = await res.text();
                    const errorMatch = html.match(/<b>Error: <\/b>([^<]+)/);
                    if (errorMatch) throw new Error(errorMatch[1]);
                }

                log(`✅ Paid course for ${entry.petName}`);
            } catch (err) {
                const message = `${entry.petName}: ${err.message || err}`;
                issues.push(message);
                log(`❌ Error paying course for ${entry.petName}: ${err}`);
            }

            await new Promise(r => setTimeout(r, randomDelay()));
        }

        showFinalStatus("All payments completed!", issues);
        button.disabled = false;
    });


    // Retrieve All Items from SDB
    const itemID = {
        "One Dubloon Coin": "12755", "Two Dubloon Coin": "12756", "Five Dubloon Coin": "12757",
        "Mau Codestone": "7458", "Tai-Kai Codestone": "7459", "Lu Codestone": "7460", "Vo Codestone": "7461",
        "Eo Codestone": "7462", "Main Codestone": "7463", "Zei Codestone": "7464", "Orn Codestone": "7465",
        "Har Codestone": "7466", "Bri Codestone": "7467", "Mag Codestone": "22208", "Vux Codestone": "22209",
        "Cui Codestone": "22210", "Kew Codestone": "22211", "Sho Codestone": "22212", "Zed Codestone": "22213"
    };

    function parseSdbStatus(data) {
        if (!data.includes("Error:")) return "Successful";

        const errorMatch = data.match(/<b>Error:\s*<\/b>\s*([\s\S]*?)(?:<\/div>|<br|<\/td>|$)/i);
        const rawError = errorMatch ? errorMatch[1] : data.slice(data.indexOf("Error:"));
        return "Error: " + rawError.replace(/<[^>]+>/g, "").trim();
    }

    function extractRefCk(html) {
        const inputMatch = html.match(/name=["']_ref_ck["'][^>]*value=["']([^"']+)["']/i);
        if (inputMatch) return inputMatch[1];

        const valueFirstInputMatch = html.match(/value=["']([^"']+)["'][^>]*name=["']_ref_ck["']/i);
        if (valueFirstInputMatch) return valueFirstInputMatch[1];

        const pageMatch = html.match(/_ref_ck["']?\s*[:=]\s*["']([a-f0-9]+)["']/i);
        return pageMatch?.[1] || "";
    }

    async function getRefCk() {
        if (typeof window.getCK === "function") return window.getCK();

        const refInput = document.querySelector("input[name='_ref_ck']");
        if (refInput?.value) return refInput.value;

        const currentPageRefCk = extractRefCk(document.documentElement.innerHTML);
        if (currentPageRefCk) return currentPageRefCk;

        try {
            const response = await fetch("/safetydeposit.phtml", { credentials: "same-origin" });
            const html = await response.text();
            return extractRefCk(html);
        } catch (err) {
            return "";
        }
    }

    function parseSdbMoveItemsStatus(response, bodyText) {
        if (!response.ok) return `Error: SDB request failed (${response.status})`;
        if (!bodyText.trim()) return "Error: SDB request returned an empty response";

        try {
            const payload = JSON.parse(bodyText);
            const errorMessage = payload.message || payload.error || payload.errors?.[0]?.message || payload.errors?.[0];
            if (payload.success === false || errorMessage) return `Error: ${errorMessage || "SDB request failed"}`;
            return "Successful";
        } catch (err) {
            return parseSdbStatus(bodyText);
        }
    }

    async function getItemsFromSDB(array) {
        const itemCount = {};

        for (let i = 0; i < array.length; i++) {
            const id = itemID[array[i]];
            if (!id) continue;
            if (!itemCount[id]) itemCount[id] = 0;
            itemCount[id]++;
        }

        const refCk = await getRefCk();
        if (!refCk) return "Error: Could not find _ref_ck for SDB request";

        const payload = {
            moves: Object.entries(itemCount).map(([id, quantity]) => ({
                obj_info_id: Number(id),
                quantity,
                action: "inventory"
            })),
            pin: getSdbPin(),
            _ref_ck: refCk
        };

        await new Promise(r => setTimeout(r, randomDelay()));

        try {
            const response = await fetch("/np-templates/ajax/safetydeposit/move-items.php", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: JSON.stringify(payload)
            });
            const bodyText = await response.text();
            return parseSdbMoveItemsStatus(response, bodyText);
        } catch (err) {
            return "Error: SDB request failed";
        }
    }

    document.getElementById("btn-get-items").addEventListener("click", async function() {
        const getAllItems = [];
        // Codestones
        document.querySelectorAll("b").forEach(b => {
            if (b.innerText.includes("Codestone")) getAllItems.push(b.innerText.trim());
            if (b.innerText.includes("Dubloon Coin")) getAllItems.push(b.innerText.trim());
        });
        if (!getAllItems.length) return alert("No items found!");
        this.disabled = true;

        const status = await getItemsFromSDB(getAllItems);
        const summary = {};
        getAllItems.forEach(i => summary[i] = (summary[i] || 0) + 1);

        const itemList = Object.entries(summary)
            .map(([name, count]) => `${escapeHtml(name)} (x${count})`)
            .join("<br>");
        const missingItemNote = `<br><br><small><b>Note:</b> If you do not have an item in your SDB, you will see it as still needed once you Pay All.</small>`;

        if (!status.startsWith("Error:")) {
            resultsContainer.innerHTML = `<b>SDB Retrieval Request:</b> ${escapeHtml(status)}<br><br>Items requested:<br>${itemList}${missingItemNote}`;
        } else {
            resultsContainer.innerHTML = `<b>${escapeHtml(status)}</b>${missingItemNote}`;
        }
        this.disabled = false;
    });

})();
