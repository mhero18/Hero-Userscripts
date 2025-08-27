// ==UserScript==
// @name         Neopets Neomail User Actions
// @version      1.0.0
// @description  Adds quick action buttons for users in Neopets messages (trading post, auctions, shop, gallery)
// @author       Hero
// @match        *://*.neopets.com/neomessages.phtml
// @match        *://*.neopets.com/neomessages.phtml?type=read_message*
// @require      http://code.jquery.com/jquery-latest.js
// @grant        none
// @icon         https://images.neopets.com/items/foo_gmc_herohotdog.gif
// @run-at       document-end
// ==/UserScript==


/*
 * Adds quick-access action buttons next to usernames in Neomail.
 * Trading Post, Auctions, Shop, Gallery
 *
 * - Works in both message list (inbox) and individual message view.
 * - Injects clean, hover-animated icons for each action.
 * - Ensures actions are only added once per user cell.
 * - Compatible with dynamically loaded content via delayed initialization.
 */


// Add CSS styles for the action buttons
$(`<style type='text/css'>
.user-actions {
    display: inline-block;
    margin-left: 5px;
    vertical-align: middle;
}

.actionbtn {
    display: inline-block;
    cursor: pointer;
    margin: 0 1px;
    vertical-align: middle;
}

.actionbtn img {
    transition-duration: 0.2s;
    height: 18px;
    width: 18px;
    vertical-align: middle;
}

.actionbtn img:hover {
    transform: translateY(-1px);
}

.actionbtn a {
    text-decoration: none;
    display: inline-block;
    vertical-align: middle;
}

/* Ensure proper alignment within table cells */
td.medText .user-actions {
    vertical-align: baseline;
}
</style>`).appendTo("head");

/**
 * Creates action buttons for a user
 * @param {string} username - The username to create actions for
 * @returns {string} HTML string containing the action buttons
 */
function createUserActions(username) {
    // Clean the username to remove any special characters
    const cleanUser = username.replace(/[^a-zA-Z 0-9 _]+/g, '');

    return `<span class="user-actions">
        <a href="/island/tradingpost.phtml?type=browse&criteria=owner&search_string=${cleanUser}" target="_blank" title="View Trading Post">
            <div class="actionbtn">
                <img src="http://images.neopets.com/themes/h5/basic/images/tradingpost-icon.png" alt="Trading Post">
            </div>
        </a>
        <a href="/genie.phtml?type=find_user&auction_username=${cleanUser}" target="_blank" title="View Auctions">
            <div class="actionbtn">
                <img src="http://images.neopets.com/themes/h5/basic/images/auction-icon.png" alt="Auctions">
            </div>
        </a>
        <a href="/browseshop.phtml?owner=${cleanUser}" target="_blank" title="View Shop">
            <div class="actionbtn">
                <img src="http://images.neopets.com/themes/h5/basic/images/myshop-icon.png" alt="Shop">
            </div>
        </a>
        <a href="/gallery/index.phtml?gu=${cleanUser}" target="_blank" title="View Gallery">
            <div class="actionbtn">
                <img src="http://images.neopets.com/themes/h5/basic/images/v3/gallery-icon.svg" alt="Gallery">
            </div>
        </a>
    </span>`;
}

/**
 * Main function to add user actions to Neopets message pages
 */
function addUserActions() {
    // Check if we're on a read message page (has type=read_message in URL)
    const isReadMessagePage = window.location.href.includes('type=read_message');

    if (isReadMessagePage) {
        // For individual message pages - add actions next to the display name
        $('td.medText').each(function(i, element) {
            const $td = $(element);

            // Skip if this is the user's own welcome message
            if ($td.hasClass('user') || $td.text().includes('Welcome,')) {
                return;
            }

            const $userLink = $td.find('a[href*="/userlookup.phtml?user="]');

            if ($userLink.length > 0 && !$td.find('.user-actions').length) {
                const username = $userLink.find('b').text().trim() || $userLink.text().trim();

                if (username) {
                    // Find the display name span (like "Rob") that comes after the username link
                    const $displayNameSpan = $userLink.parent().find('span[style*="font-weight: normal"]').first();

                    if ($displayNameSpan.length > 0) {
                        // Add actions after the display name
                        $displayNameSpan.after(' ' + createUserActions(username));
                    } else {
                        // Fallback: add after the username link if no display name found
                        $userLink.after(' ' + createUserActions(username));
                    }
                }
            }
        });
    } else {
        // For message inbox/list pages - add actions on new line under username
        $('td.medText').each(function(i, element) {
            const $td = $(element);

            // Skip if this is the user's own welcome message
            if ($td.hasClass('user') || $td.text().includes('Welcome,')) {
                return;
            }

            const $userLink = $td.find('a[href*="/userlookup.phtml?user="]');

            if ($userLink.length > 0 && !$td.find('.user-actions').length) {
                const username = $userLink.find('b').text().trim() || $userLink.text().trim();

                if (username) {
                    // Find the closing bracket "]" after the username
                    const tdHtml = $td.html();
                    const closingBracketIndex = tdHtml.indexOf(']', tdHtml.indexOf($userLink[0].outerHTML));

                    if (closingBracketIndex !== -1) {
                        // Split the HTML at the closing bracket and add actions on new line
                        const beforeBracket = tdHtml.substring(0, closingBracketIndex + 1);
                        const afterBracket = tdHtml.substring(closingBracketIndex + 1);

                        const newHtml = beforeBracket + '<br>' + createUserActions(username) + afterBracket;
                        $td.html(newHtml);
                    } else {
                        // Fallback: add after the entire content of the cell
                        $td.append('<br>' + createUserActions(username));
                    }
                }
            }
        });
    }
}

// Initialize the script
$(document).ready(function() {
    addUserActions();

    // Also run after a short delay to catch any dynamically loaded content
    setTimeout(addUserActions, 500);
});