// ==UserScript==
// @name         Neopets Soup Kitchen Daily Redirect
// @version      1.1
// @description  For those who constantly forget to donate, now you're forced to visit the Soup Kitchen!
// @author       Hero
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @match        *://www.neopets.com/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const SOUP_KITCHEN_URL = "https://www.neopets.com/soupkitchen.phtml";
    const STORAGE_KEY = "heroSoupKitchenDonationTracker";
    const path = window.location.pathname.toLowerCase();

    // Keep the donation page, bank, and account access pages reachable.
    if (path === "/soupkitchen.phtml" || path === "/bank.phtml"
        || /^\/(?:login|loginpage|logout|signup|password|forgotpassword)/.test(path)) {
        return;
    }

    let savedState;
    try {
        savedState = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    } catch (error) {
        console.warn("[Soup Kitchen Daily Redirect] Could not read donation history.", error);
        return;
    }

    const dateParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());
    const date = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
    const today = `${date.year}-${date.month}-${date.day}`;

    if (savedState?.lastDonationDate !== today) {
        window.location.replace(SOUP_KITCHEN_URL);
    }
}());
