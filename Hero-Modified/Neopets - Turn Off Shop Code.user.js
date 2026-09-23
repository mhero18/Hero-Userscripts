// ==UserScript==
// @name           Neopets - Turn Off Shop Code
// @description    Removes user code from shops.
// @include        *neopets.com/browseshop*
// @match          *neopets.com/browseshop*
// @version        2.1
// @updated        07.07.2026
// @namespace https://greasyfork.org/users/6099
// ==/UserScript==

(function () {
    'use strict';

    const pageRoot = document.querySelector('.bsp-description-inline, .content, #container__2020, .bsp-page') || document.body;
    const walker = document.createTreeWalker(pageRoot, NodeFilter.SHOW_COMMENT);
    const comments = [];

    while (walker.nextNode()) {
        comments.push(walker.currentNode);
    }

    const startComment = comments.find((comment) => /desc start/i.test(comment.nodeValue));
    const endComment = comments.find((comment) => /desc end/i.test(comment.nodeValue));

    if (!startComment || !endComment) {
        return;
    }

    if (!(startComment.compareDocumentPosition(endComment) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        return;
    }

    const range = document.createRange();
    range.setStartBefore(startComment);
    range.setEndAfter(endComment);
    range.deleteContents();
})();