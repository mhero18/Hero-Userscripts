// ==UserScript==
// @name         Neopets Training Schools Helper
// @version      1.6
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
  - Buttons to: Train Selected, Complete Courses, Cancel Unpaid, Pay All Unpaid, Check All, Reset selected
  - Shows progress bar and feedback during actions
  - Uses small random delays to mimic natural actions
  - Auto-refreshes page after operations finish
  - Displays stat increases after Completion
  --------------------------------
*/


(function() {
    'use strict';

    function log(msg) { console.log(`[TrainingHelper] ${msg}`); }

    const style = document.createElement("style");
    style.textContent = `
    .training-table { margin: 10px auto; width: 70%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .training-table th, .training-table td { border: 1px solid #bbb; padding: 8px; text-align: center; }
    .training-table th { background: #4a8cd4; color: white; font-weight: bold; }
    .training-table tr:nth-child(even) { background: #f8f9fa; }
    .training-table tr:nth-child(odd) { background: #fff; }
    .training-table .check-all { background: #e3f2fd; font-weight: bold; }
    .training-table .pet-row:hover { background: #f0f7ff; }
    .training-table .training-disabled { opacity: 0.6; background: #f5f5f5 !important; }
    .training-table .training-disabled:hover { background: #f5f5f5 !important; }
    .training-table .training-disabled input[type="radio"] { cursor: not-allowed; }
    .training-table .stat-value { color: #2e7d32; font-weight: bold; }
    .training-actions { margin: 12px auto; text-align: center; }
    .training-actions button {
      padding: 10px 16px; margin: 0 8px; border: none; border-radius: 6px;
      background: #5c9ded; color: #fff; cursor: pointer; font-size: 14px;
      transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .training-actions button:hover { background: #4a8cd4; transform: translateY(-1px); }
    .training-actions button:disabled { background: #ccc; cursor: not-allowed; transform: none; }
    .training-actions .btn-danger { background: #dc3545; }
    .training-actions .btn-danger:hover { background: #c82333; }
    .training-actions .btn-success { background: #28a745; }
    .training-actions .btn-success:hover { background: #218838; }
    #training-results {
      margin-top: 12px; text-align: center; font-family: Arial, sans-serif;
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
    function randomDelay(min=1000, max=2000) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
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
        <td><strong>${p.name}</strong><br>${statusText}</td>
        <td>${radioInputs[0]}<br><span class="stat-value">${p.Lvl}</span></td>
        <td>${radioInputs[1]}<br><span class="stat-value">${p.Str}</span></td>
        <td>${radioInputs[2]}<br><span class="stat-value">${p.Def}</span></td>
        <td>${radioInputs[3]}<br><span class="stat-value">${p.Mov}</span></td>
        <td>${radioInputs[4]}<br><span class="stat-value">${p.Hp}</span></td>
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
    </tr>
  `;

    tableWrapper.innerHTML = `
    <table class="training-table">
      <thead>
        <tr><th>Pet</th><th>Lvl</th><th>Str</th><th>Def</th><th>Mov</th><th>HP</th></tr>
      </thead>
      <tbody>
        ${tbodyRows}
        ${checkAllRow}
      </tbody>
    </table>
    <div class="training-actions">
      <button id="btn-train-all" class="btn-primary">🏋️ Train Selected</button>
      <button id="btn-complete-all" class="btn-success">✅ Complete Courses</button>
      <button id="btn-cancel-all" class="btn-danger">❌ Cancel Unpaid</button>
      <button id="btn-pay-all" class="btn-primary">💰 Pay All Unpaid</button>
      <button id="btn-reset">🔄 Reset</button>
    </div>
    <div id="training-results"></div>
  `;

    const statusHeader = [...document.querySelectorAll("b")].find(b => b.textContent.trim() === "Current Course Status");
    if (statusHeader) statusHeader.parentElement.insertBefore(tableWrapper, statusHeader);

    const resultsContainer = document.getElementById("training-results");

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
                log(errorMatch ? `❌ ${p.name}: ${errorMatch[1]}` : `✅ ${p.name} training started`);
            } catch(err){ log(`❌ ${p.name} network error`); }

            await new Promise(r=>setTimeout(r, randomDelay(1200,2000)));
        }

        updateProgress(selectedPets.length, selectedPets.length, "Training complete! Refreshing page...");
        button.disabled = false;
        setTimeout(()=>location.reload(),2000);
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

        for(let i=0;i<cancellablePets.length;i++){
            const petName = cancellablePets[i];
            updateProgress(i, cancellablePets.length, `Cancelling course for ${petName}...`);
            try{
                await fetch(processUrl,{method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:`pet_name=${encodeURIComponent(petName)}&type=cancel`});
                log(`✅ Cancelled course for ${petName}`);
            }catch(err){ log(`❌ Error cancelling ${petName}`); }
            await new Promise(r=>setTimeout(r, randomDelay(800,1500)));
        }

        updateProgress(cancellablePets.length, cancellablePets.length, "Cancellation complete! Refreshing page...");
        button.disabled=false;
        setTimeout(()=>location.reload(),2000);
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
            await new Promise(r=>setTimeout(r, randomDelay(1200,2000)));
        }

        resultsContainer.innerHTML = resultsHTML + `
  <div style="margin-top:10px;">
    <button id="btn-refresh" style="
      padding:8px 14px; border:none; border-radius:6px;
      background:#5c9ded; color:#fff; cursor:pointer; font-size:14px;
      transition: all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.1);
    ">🔄 Refresh Page</button>
  </div>
`;

        // Add refresh button
        document.getElementById("btn-refresh").addEventListener("click", () => {
            location.reload();
        });
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

        for (let i = 0; i < payForms.length; i++) {
            const entry = payForms[i];
            updateProgress(i, payForms.length, `Paying for ${entry.petName}...`);

            try {
                if (url.includes('island/fight_training')) {
                    // Fight training: use GET with query params
                    const queryStr = new URLSearchParams(entry.params).toString();
                    await fetch(`${entry.action}?${queryStr}`, { method: entry.method });
                } else {
                    // Other pages: use POST form submission
                    const formData = new URLSearchParams();
                    entry.form.querySelectorAll("input").forEach(input => {
                        if (input.name) formData.append(input.name, input.value);
                    });
                    await fetch(entry.form.action, {
                        method: entry.form.method || "POST",
                        body: formData,
                        headers: { "Content-Type": "application/x-www-form-urlencoded" }
                    });
                }

                log(`✅ Paid course for ${entry.petName}`);
            } catch (err) {
                log(`❌ Error paying course for ${entry.petName}: ${err}`);
            }

            // Random delay 1–3 seconds
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
        }

        updateProgress(payForms.length, payForms.length, "All payments completed! Refreshing page...");
        button.disabled = false;
        setTimeout(() => location.reload(), 2000);
    });

})();
