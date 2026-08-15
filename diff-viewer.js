/**
 * Feature #7 — "What's New Since Last Visit" Diff
 * Feature #28 (UI side) — Watched Categories notifications
 *
 * Snapshots all resource URLs on a page when you visit. On your next visit,
 * highlights newly added resources in green and removed ones in red strikethrough.
 *
 * The actual link-health background polling + notifications are in the
 * service worker. This module surfaces a small banner on diff'd pages.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "diffViewer";
  let initialized = false;
  let bannerEl = null;

  async function captureSnapshot() {
    const pageUrl = window.location.pathname;
    const links = FMHY.Dom.getResourceLinks().map((l) => ({
      href: l.href,
      text: l.text
    }));
    await FMHY.Storage.setSnapshot(pageUrl, links);
    await FMHY.Storage.setLastVisit(pageUrl, Date.now());
  }

  async function showDiff() {
    const pageUrl = window.location.pathname;
    const snap = await FMHY.Storage.getSnapshot(pageUrl);
    if (!snap) {
      // First visit — no diff, just capture
      await captureSnapshot();
      return;
    }
    const currentLinks = FMHY.Dom.getResourceLinks();
    const oldHrefs = new Set(snap.links.map((l) => l.href));
    const currentHrefs = new Set(currentLinks.map((l) => l.href));

    const added = currentLinks.filter((l) => !oldHrefs.has(l.href));
    const removed = snap.links.filter((l) => !currentHrefs.has(l.href));

    if (added.length === 0 && removed.length === 0) {
      // No changes — refresh snapshot timestamp only
      await FMHY.Storage.setLastVisit(pageUrl, Date.now());
      return;
    }

    // Highlight added links
    added.forEach(({ element }) => {
      element.classList.add("fmhy-diff-added");
    });

    // Show banner
    showBanner(added.length, removed.length, snap.capturedAt);

    // Notify if watched category
    const watched = await FMHY.Storage.getWatchedCategories();
    const cat = FMHY.Dom.getCurrentCategory();
    if (watched.includes(cat) && added.length > 0) {
      chrome.runtime.sendMessage({
        type: "notify",
        title: `${added.length} new resource(s) on ${cat}`,
        message: added.slice(0, 3).map((l) => l.text).join("\n") + (added.length > 3 ? `\n…and ${added.length - 3} more` : "")
      });
    }
  }

  function showBanner(added, removed, lastCaptured) {
    hideBanner();
    bannerEl = FMHY.Dom.el("div", { class: "fmhy-diff-banner" });
    const text = FMHY.Dom.el("span", { class: "fmhy-diff-banner-text" },
      ` ${added} new, ${removed} removed since ${FMHY.Dom.timeAgo(lastCaptured)}`
    );
    const actions = FMHY.Dom.el("div", { class: "fmhy-diff-banner-actions" });
    const showRemovedBtn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-small" }, "Show removed");
    showRemovedBtn.addEventListener("click", () => showRemovedList(removed));
    const dismissBtn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-small" }, "Dismiss");
    dismissBtn.addEventListener("click", async () => {
      hideBanner();
      await captureSnapshot(); // refresh baseline
    });
    actions.appendChild(showRemovedBtn);
    actions.appendChild(dismissBtn);
    bannerEl.appendChild(text);
    bannerEl.appendChild(actions);
    document.body.prepend(bannerEl);
    // Auto-hide after 15s
    setTimeout(hideBanner, 15000);
  }

  function hideBanner() {
    if (bannerEl) { bannerEl.remove(); bannerEl = null; }
  }

  function showRemovedList(count) {
    // Simple alert-style modal
    const modal = FMHY.Dom.el("div", { class: "fmhy-modal-overlay" });
    const box = FMHY.Dom.el("div", { class: "fmhy-modal" });
    box.appendChild(FMHY.Dom.el("h3", {}, `${count} resource(s) removed since last visit`));
    box.appendChild(FMHY.Dom.el("p", { class: "fmhy-muted" }, "These were on this page last time you visited but are no longer here. They may have been moved to /storage or removed entirely."));
    const closeBtn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-primary" }, "Close");
    closeBtn.addEventListener("click", () => modal.remove());
    box.appendChild(closeBtn);
    modal.appendChild(box);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      // Wait for content to be ready (VitePress loads async)
      setTimeout(showDiff, 1500);
      FMHY.onPageChange(() => setTimeout(showDiff, 1500));
    },
    onMessage() { return false; },
    // expose for testing / popup
    captureSnapshot,
    showDiff
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
