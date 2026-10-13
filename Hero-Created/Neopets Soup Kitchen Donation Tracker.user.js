// ==UserScript==
// @name         Neopets Soup Kitchen Donation Tracker
// @version      3.2
// @description  Tracks monthly Soup Kitchen donations, 14-day streak cycles, and autofills the last entered donation amount.
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/soupkitchen.phtml*
// @run-at       document-start
// @grant        none
// @downloadURL  https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Soup%20Kitchen%20Donation%20Tracker.user.js
// @updateURL    https://github.com/mhero18/Hero-Userscripts/raw/refs/heads/main/Hero-Created/Neopets%20Soup%20Kitchen%20Donation%20Tracker.user.js
// ==/UserScript==

/*
 * - Times/Days/Months are tracked using PST / NST
 * - Reminders for minimum amounts needed for both item prize and avatar
 * - Autofills 25k by default as donation amount, but remembers your last entered amount
 * - The cumulative total amount donated is reset each month, even if you skip the 1st
 * - Keeps last month's total for reference
 * - Tracks your streak and resets if you miss a day
 * - Streak count starts over after completing 14 days
 * - Values are all stored in browser's localstorage
 */

(function () {
    "use strict";

    const INSTALL_FLAG = "__heroSoupKitchenDonationTrackerInstalled";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const DONATION_ENDPOINT = "/np-templates/ajax/soupkitchen/donate.php";
    const STORAGE_KEY = "heroSoupKitchenDonationTracker";
    const AMOUNT_STORAGE_KEY = "heroSoupKitchenLastDonationAmount";
    const MIN_ITEM_PRIZE_AMOUNT = 25000;
    const MIN_MONTHLY_AVATAR_AMOUNT = 15000000;
    const TRACKER_ID = "hero-sk-donation-tracker";
    const STYLE_ID = "hero-sk-donation-tracker-styles";
    const AMOUNT_WARNING_ID = "hero-sk-amount-warning";
    const MONTHLY_REMINDER_ID = "hero-sk-monthly-reminder";
    const DEFAULT_STATE = Object.freeze({
        totalAmount: 0,
        totalMonth: null,
        lastMonthTotal: null,
        lastMonth: null,
        streak: 0,
        lastDonationDate: null
    });

    function isDonationEndpoint(url) {
        try {
            return new URL(url, window.location.href).pathname === DONATION_ENDPOINT;
        } catch {
            return false;
        }
    }

    function readState() {
        try {
            const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
            if (!saved || typeof saved !== "object") return { ...DEFAULT_STATE };

            const totalAmount = Number(saved.totalAmount);
            const lastMonthTotal = saved.lastMonthTotal == null ? null : Number(saved.lastMonthTotal);
            const streak = Number(saved.streak);
            const lastDonationDate = /^\d{4}-\d{2}-\d{2}$/.test(saved.lastDonationDate || "")
                ? saved.lastDonationDate
                : null;

            return {
                totalAmount: Number.isSafeInteger(totalAmount) && totalAmount >= 0 ? totalAmount : 0,
                totalMonth: /^\d{4}-\d{2}$/.test(saved.totalMonth || "") ? saved.totalMonth : null,
                lastMonthTotal: Number.isSafeInteger(lastMonthTotal) && lastMonthTotal >= 0 ? lastMonthTotal : null,
                lastMonth: /^\d{4}-\d{2}$/.test(saved.lastMonth || "") ? saved.lastMonth : null,
                streak: Number.isSafeInteger(streak) && streak >= 0 ? streak : 0,
                lastDonationDate
            };
        } catch (error) {
            console.warn("[Soup Kitchen Donation Tracker] Could not read saved totals.", error);
            return { ...DEFAULT_STATE };
        }
    }

    function saveState(state) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            return true;
        } catch (error) {
            console.error("[Soup Kitchen Donation Tracker] Could not save totals.", error);
            return false;
        }
    }

    function getNeopetsDate() {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Los_Angeles",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function dateToDayNumber(date) {
        const [year, month, day] = date.split("-").map(Number);
        return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
    }

    function getCurrentState(today = getNeopetsDate()) {
        const state = readState();
        const previousState = JSON.stringify(state);
        const month = today.slice(0, 7);
        const [year, monthNumber] = month.split("-").map(Number);
        const lastMonth = new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);

        // Assign older saved totals to their last recorded donation month
        state.totalMonth ||= state.lastDonationDate?.slice(0, 7) || month;
        if (state.totalMonth !== month) {
            // Archive before resetting
            state.lastMonthTotal = state.totalMonth === lastMonth ? state.totalAmount : 0;
            state.lastMonth = lastMonth;
            state.totalAmount = 0;
            state.totalMonth = month;
        } else if (state.lastMonth !== lastMonth) {
            state.lastMonthTotal = null;
            state.lastMonth = lastMonth;
        }

        if (state.streak > 14) state.streak = ((state.streak - 1) % 14) + 1;
        const daysSinceDonation = state.lastDonationDate
            ? dateToDayNumber(today) - dateToDayNumber(state.lastDonationDate)
            : Infinity;
        if (daysSinceDonation > 1 || (daysSinceDonation > 0 && state.streak === 14)) {
            state.streak = 0;
        }

        if (JSON.stringify(state) !== previousState) saveState(state);
        return state;
    }

    function recordDonation(amount) {
        if (!Number.isSafeInteger(amount) || amount <= 0) return;

        const today = getNeopetsDate();
        const state = getCurrentState(today);

        if (state.lastDonationDate !== today) {
            const continuedStreak = state.lastDonationDate
                && dateToDayNumber(today) - dateToDayNumber(state.lastDonationDate) === 1;
            state.streak = continuedStreak ? state.streak + 1 : 1;
            state.lastDonationDate = today;
        }

        state.totalAmount = Math.min(Number.MAX_SAFE_INTEGER, state.totalAmount + amount);
        if (saveState(state)) renderState();
    }

    function installFetchTracker() {
        const originalFetch = window.fetch;
        window.fetch = function (input, options = {}) {
            const responsePromise = originalFetch.apply(this, arguments);

            if (options.method === "POST" && isDonationEndpoint(input)) {
                responsePromise
                    .then(async (response) => {
                        const { amount } = JSON.parse(options.body);
                        const result = await response.clone().json();
                        if (result?.success === true) recordDonation(amount);
                    })
                    .catch((error) => {
                        console.warn("[Soup Kitchen Donation Tracker] Could not inspect donation response.", error);
                    });
            }

            return responsePromise;
        };
    }

    function addStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${TRACKER_ID} {
                display: block;
                width: auto;
                margin: 16px 54px 5px;
                font-family: MuseoSansRounded500, Arial, sans-serif;
                font-size: 14px;
                text-align: center;
            }

            #${TRACKER_ID} .hero-sk-tracker__stat {
                display: block;
                margin: 5px 0;
            }

            #${TRACKER_ID} .hero-sk-tracker__value {
                font-weight: 700;
            }

            #${TRACKER_ID} .hero-sk-tracker__reset {
                margin: 5px 0;
                padding: 2px 8px;
                cursor: pointer;
                font-family: inherit;
                font-size: 12px;
            }

            #${TRACKER_ID} .hero-sk-tracker__editor {
                max-width: 460px;
                margin: 12px auto 0;
            }

            #${TRACKER_ID} .hero-sk-tracker__row {
                display: flex;
                align-items: center;
                justify-content: center;
                flex-wrap: wrap;
                gap: 6px;
                margin: 8px 0;
            }

            #${TRACKER_ID} .hero-sk-tracker__editor input {
                width: 130px;
            }

            #${TRACKER_ID} .hero-sk-tracker__editor input,
            #${TRACKER_ID} .hero-sk-tracker__editor select {
                font: inherit;
            }

            #${TRACKER_ID} .hero-sk-tracker__note {
                margin: 6px 0;
                font-size: 12px;
            }

            #${TRACKER_ID} [data-editor-error] {
                color: #c62828;
            }

            #${AMOUNT_WARNING_ID}, #${MONTHLY_REMINDER_ID} {
                margin: 6px 0;
                color: #c62828;
                font-family: MuseoSansRounded500, Arial, sans-serif;
                font-size: 14px;
                text-align: center;
            }

            #sk-donate-result #${MONTHLY_REMINDER_ID} {
                display: block;
                box-sizing: border-box;
                width: 100%;
                max-width: 520px;
                margin: 6px auto;
                text-align: center;
            }

            #${MONTHLY_REMINDER_ID}[data-goal-met="true"] {
                color: #2e7d32;
            }

            @media (max-width: 600px) {
                #${TRACKER_ID} { margin-inline: 16px; }
            }
        `;
        (document.head || document.documentElement).append(style);
    }

    function renderState() {
        const tracker = document.getElementById(TRACKER_ID);
        if (!tracker) return;

        const state = getCurrentState();
        tracker.querySelector("[data-total]").textContent = `${state.totalAmount.toLocaleString()} NP`;
        tracker.querySelector("[data-last-month-total]").textContent = state.lastMonthTotal === null
            ? "Not Tracked"
            : `${state.lastMonthTotal.toLocaleString()} NP`;
        tracker.querySelector("[data-streak]").textContent = state.streak.toLocaleString();
        tracker.querySelector("[data-donated-today]").textContent = state.lastDonationDate === getNeopetsDate()
            ? "Yes"
            : "No";
        renderMonthlyReminder(state.totalAmount);
    }

    function renderMonthlyReminder(totalAmount) {
        const thanks = document.getElementById("sk-donate-thanks");
        if (!thanks) return;

        let reminder = document.getElementById(MONTHLY_REMINDER_ID);
        if (!reminder) {
            reminder = document.createElement("p");
            reminder.id = MONTHLY_REMINDER_ID;
            thanks.insertAdjacentElement("afterend", reminder);
        }

        const goalMet = totalAmount >= MIN_MONTHLY_AVATAR_AMOUNT;
        const minimumAmount = MIN_MONTHLY_AVATAR_AMOUNT.toLocaleString("en-US");
        reminder.dataset.goalMet = String(goalMet);
        reminder.textContent = goalMet
            ? `You've met the minimum of ${minimumAmount} NPs total donated for this month, remember to come back on the 1st of next month to get your avatar!`
            : `Remember to donate a minimum of ${minimumAmount} NPs total before the end of this month to be eligible for the avatar!`;
    }

    function mountTracker() {
        const donationContainer = document.getElementById("sk-donate");
        if (!donationContainer || document.getElementById(TRACKER_ID)) return;

        addStyles();

        const tracker = document.createElement("section");
        tracker.id = TRACKER_ID;
        tracker.setAttribute("aria-label", "Soup Kitchen donation totals");
        tracker.innerHTML = `
            <p class="hero-sk-tracker__stat">
                Total Amount Donated This Month: <span class="hero-sk-tracker__value" data-total>0 NP</span>
            </p>
            <p class="hero-sk-tracker__stat">
                Total Donation Days Streak: <span class="hero-sk-tracker__value" data-streak>0</span> / 14
            </p>
            <p class="hero-sk-tracker__stat">
                Donated Today? <span class="hero-sk-tracker__value" data-donated-today>No</span>
            </p>
            <button class="hero-sk-tracker__reset" type="button" data-edit>Edit / Reset Donation Tracker</button>
            <form class="hero-sk-tracker__editor" data-editor hidden novalidate>
                <div class="hero-sk-tracker__row">
                    <label for="hero-sk-edit-total">This month's total (NP):</label>
                    <input id="hero-sk-edit-total" name="totalAmount" type="text" inputmode="numeric" required>
                    <button class="hero-sk-tracker__reset" type="button" data-reset="totalAmount">Set to 0</button>
                </div>
                <div class="hero-sk-tracker__row">
                    <label for="hero-sk-edit-streak">Streak (0–14):</label>
                    <input id="hero-sk-edit-streak" name="streak" type="number" min="0" max="14" step="1" required>
                    <button class="hero-sk-tracker__reset" type="button" data-reset="streak">Set to 0</button>
                </div>
                <div class="hero-sk-tracker__row">
                    <label for="hero-sk-edit-today">Donated today?</label>
                    <select id="hero-sk-edit-today" name="donatedToday">
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                    </select>
                    <button class="hero-sk-tracker__reset" type="button" data-reset="donatedToday">Set to No</button>
                </div>
                <p class="hero-sk-tracker__stat">
                    Last Month's Total Donated: <span class="hero-sk-tracker__value" data-last-month-total>Not Tracked</span>
                </p>
                <p data-editor-error role="alert" hidden></p>
                <button class="hero-sk-tracker__reset" type="submit">Save Values</button>
                <button class="hero-sk-tracker__reset" type="button" data-cancel>Cancel</button>
            </form>
        `;

        initValueEditor(tracker);

        donationContainer.append(tracker);
        renderState();
    }

    function initValueEditor(tracker) {
        const editor = tracker.querySelector("[data-editor]");
        const error = editor.querySelector("[data-editor-error]");
        const field = (name) => editor.elements.namedItem(name);

        tracker.querySelector("[data-edit]").addEventListener("click", () => {
            if (!editor.hidden) {
                editor.hidden = true;
                return;
            }

            renderState();
            const state = getCurrentState();
            field("totalAmount").value = state.totalAmount.toLocaleString("en-US");
            field("streak").value = state.streak;
            field("donatedToday").value = state.lastDonationDate === getNeopetsDate() ? "yes" : "no";
            error.hidden = true;
            editor.hidden = false;
            field("totalAmount").focus();
        });

        editor.querySelectorAll("[data-reset]").forEach((button) => {
            button.addEventListener("click", () => {
                const name = button.dataset.reset;
                field(name).value = name === "donatedToday" ? "no" : "0";
            });
        });
        editor.querySelector("[data-cancel]").addEventListener("click", () => {
            editor.hidden = true;
        });

        editor.addEventListener("submit", (event) => {
            event.preventDefault();
            const totalText = field("totalAmount").value.replaceAll(",", "").trim();
            const streakText = field("streak").value.trim();
            const totalAmount = Number(totalText);
            const streak = Number(streakText);
            error.hidden = true;

            if (!/^\d+$/.test(totalText) || !Number.isSafeInteger(totalAmount)
                || !/^\d+$/.test(streakText) || !Number.isInteger(streak) || streak > 14) {
                error.textContent = "Enter a non-negative whole NP amount and a whole streak from 0 to 14 only.";
                error.hidden = false;
                return;
            }

            if (!window.confirm("Replace your tracker values? This cannot be undone!")) return;

            const today = getNeopetsDate();
            const yesterday = new Date((dateToDayNumber(today) - 1) * 86_400_000).toISOString().slice(0, 10);
            const lastDonationDate = field("donatedToday").value === "yes"
                ? today
                : (streak > 0 ? yesterday : null);

            if (saveState({ ...getCurrentState(today), totalAmount, totalMonth: today.slice(0, 7), streak, lastDonationDate })) {
                editor.hidden = true;
                renderState();
            } else {
                error.textContent = "Could not save your values. Please try again.";
                error.hidden = false;
            }
        });
    }

    function initAmountAutofill() {
        const input = document.getElementById("sk-donate-amount");
        if (!input) return;

        const warning = document.createElement("p");
        warning.id = AMOUNT_WARNING_ID;
        warning.textContent = `${MIN_ITEM_PRIZE_AMOUNT.toLocaleString("en-US")} minimum is needed for the 14-day streak item prize!`;
        warning.hidden = true;
        input.insertAdjacentElement("afterend", warning);

        function restoreAmount() {
            input.value = window.localStorage.getItem(AMOUNT_STORAGE_KEY) || MIN_ITEM_PRIZE_AMOUNT;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }

        input.addEventListener("input", () => {
            const amount = input.value.replace(/\D/g, "");
            warning.hidden = !amount || Number(amount) >= MIN_ITEM_PRIZE_AMOUNT;
            if (amount) window.localStorage.setItem(AMOUNT_STORAGE_KEY, amount);
            else window.localStorage.removeItem(AMOUNT_STORAGE_KEY);
        });

        document.getElementById("sk-donate-back")?.addEventListener("click", () => {
            setTimeout(restoreAmount, 0);
        });

        restoreAmount();
    }

    function initTracker() {
        mountTracker();
        setTimeout(initAmountAutofill, 0);
        // Refresh calendar-dependent values if the page stays open overnight.
        setInterval(renderState, 60_000);
    }

    installFetchTracker();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initTracker, { once: true });
    } else {
        initTracker();
    }

    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY || event.key === null) renderState();
    });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) renderState();
    });
}());
