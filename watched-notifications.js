/**
 * Feature #28 — Watched Categories Notifications (UI side)
 *
 * Logic lives in diff-viewer.js (which calls chrome.runtime.sendMessage({type:"notify"}))
 * and background service worker (alarms). This module adds a small UI control
 * on every category page: " Watch this category" toggle.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "watchedNotifications";
  let initialized = false;
  let btn = null;

  async function refresh() {
    if (!btn) return;
    const watched = await FMHY.Storage.getWatchedCategories();
    const cat = FMHY.Dom.getCurrentCategory();
    const isWatched = watched.includes(cat);
    btn.textContent = isWatched ? " Watching" : " Watch";
    btn.classList.toggle("active", isWatched);
    btn.title = isWatched ? `Stop watching ${cat}` : `Get notified when new resources are added to ${cat}`;
  }

  async function toggle() {
    const cat = FMHY.Dom.getCurrentCategory();
    const watched = await FMHY.Storage.getWatchedCategories();
    if (watched.includes(cat)) {
      await FMHY.Storage.unwatchCategory(cat);
    } else {
      await FMHY.Storage.watchCategory(cat);
    }
    refresh();
  }

  function buildButton() {
    if (btn) btn.remove();
    btn = FMHY.Dom.el("button", { class: "fmhy-watch-btn" }, "");
    btn.addEventListener("click", toggle);
    document.body.appendChild(btn);
    refresh();
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      buildButton();
      FMHY.onPageChange(() => { buildButton(); });
    },
    onMessage() { return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
