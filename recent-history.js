/**
 * Feature #15 — Recently Viewed Resources Dropdown
 *
 * Tracks the last 50 resources you visited (bookmarked + clicked external links).
 * The popup uses this via chrome.storage. This module records visits.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "recentHistory";
  let initialized = false;

  function recordPageVisit() {
    const url = window.location.href;
    const title = FMHY.Dom.getPageTitle();
    const category = FMHY.Dom.getCurrentCategory();
    FMHY.Storage.pushHistory({ url, title, category, visitedAt: Date.now() });
  }

  function trackExternalClicks() {
    // Capture clicks on external resource links
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="http"]');
      if (!a) return;
      const href = a.href;
      try {
        const u = new URL(href);
        if (u.hostname.endsWith("fmhy.net") || u.hostname.endsWith("fmhy.xyz")) return;
      } catch (err) { return; }
      const text = (a.textContent || "").trim();
      if (text.length < 2) return;
      FMHY.Storage.pushHistory({ url: href, title: text, category: FMHY.Dom.getCurrentCategory(), visitedAt: Date.now() });
    }, { capture: true });
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      recordPageVisit();
      trackExternalClicks();
      FMHY.onPageChange(recordPageVisit);
    },
    refresh() { return recordPageVisit(); },
    onMessage() { return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
