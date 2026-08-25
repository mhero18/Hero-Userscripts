// ==UserScript==
// @name         Neopets Soup Kitchen Donation Tracker
// @version      1.1
// @description  Tracks total Neopoints donated and the current Soup Kitchen donation-day streak.
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://*.neopets.com/soupkitchen.phtml*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const INSTALL_FLAG = "__heroSoupKitchenDonationTrackerInstalled";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const DONATION_ENDPOINT = "/np-templates/ajax/soupkitchen/donate.php";
    const STORAGE_KEY = "heroSoupKitchenDonationTracker";
    const TRACKER_ID = "hero-sk-donation-tracker";
    const STYLE_ID = "hero-sk-donation-tracker-styles";
    const DEFAULT_STATE = Object.freeze({
        totalAmount: 0,
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
            const streak = Number(saved.streak);
            const lastDonationDate = /^\d{4}-\d{2}-\d{2}$/.test(saved.lastDonationDate || "")
                ? saved.lastDonationDate
                : null;

            return {
                totalAmount: Number.isSafeInteger(totalAmount) && totalAmount >= 0 ? totalAmount : 0,
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

    function expireBrokenStreak() {
        const state = readState();
        if (!state.lastDonationDate || state.streak === 0) return;

        const daysSinceDonation = dateToDayNumber(getNeopetsDate()) - dateToDayNumber(state.lastDonationDate);
        if (daysSinceDonation > 1) {
            state.streak = 0;
            saveState(state);
        }
    }

    function recordDonation(amount) {
        if (!Number.isSafeInteger(amount) || amount <= 0) return;

        const state = readState();
        const today = getNeopetsDate();

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
                font-size: 14.6667px;
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

            @media (max-width: 600px) {
                #${TRACKER_ID} { margin-inline: 16px; }
            }
        `;
        (document.head || document.documentElement).append(style);
    }

    function renderState() {
        const tracker = document.getElementById(TRACKER_ID);
        if (!tracker) return;

        const state = readState();
        tracker.querySelector("[data-total]").textContent = `${state.totalAmount.toLocaleString()} NP`;
        tracker.querySelector("[data-streak]").textContent = state.streak.toLocaleString();
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
                Total Amount Donated: <span class="hero-sk-tracker__value" data-total>0 NP</span>
            </p>
            <p class="hero-sk-tracker__stat">
                Total Donation Days Streak: <span class="hero-sk-tracker__value" data-streak>0</span>
            </p>
            <button class="hero-sk-tracker__reset" type="button">Reset Donation Tracker</button>
        `;

        tracker.querySelector("button").addEventListener("click", () => {
            const confirmed = window.confirm(
                "Warning: This will reset your locally stored donation total and streak. Continue?"
            );
            if (!confirmed) return;

            if (saveState({ ...DEFAULT_STATE })) renderState();
        });

        donationContainer.append(tracker);
        renderState();
    }

    function initTracker() {
        expireBrokenStreak();
        mountTracker();
    }

    installFetchTracker();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initTracker, { once: true });
    } else {
        initTracker();
    }

    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY) renderState();
    });
}());
