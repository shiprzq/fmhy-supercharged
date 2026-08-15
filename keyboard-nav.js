/**
 * Feature #19 — Vim-Style Keyboard Navigation
 *
 * Hotkeys:
 *   j / k       — move between resource links
 *   Enter       — open
 *   Shift+Enter — open in new tab
 *   b           — bookmark
 *   n           — add note
 *   s           — star
 *   /           — focus search
 *   g g         — scroll to top
 *   G           — scroll to bottom
 *   ?           — show help
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "keyboardNav";
  let initialized = false;
  let activeIdx = -1;
  let links = [];

  function refreshLinks() {
    links = FMHY.Dom.getResourceLinks();
    if (activeIdx >= links.length) activeIdx = links.length - 1;
    if (activeIdx < 0 && links.length > 0) activeIdx = 0;
    highlightActive();
  }

  function highlightActive() {
    document.querySelectorAll(".fmhy-kb-active").forEach((el) => el.classList.remove("fmhy-kb-active"));
    if (activeIdx >= 0 && links[activeIdx]) {
      const el = links[activeIdx].element;
      el.classList.add("fmhy-kb-active");
      // scrollIntoView may not exist in all contexts (e.g. detached elements)
      if (typeof el.scrollIntoView === "function") {
        try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
      }
    }
  }

  function move(delta) {
    if (links.length === 0) return;
    activeIdx = (activeIdx + delta + links.length) % links.length;
    highlightActive();
  }

  function openActive(newTab) {
    if (activeIdx < 0 || !links[activeIdx]) return;
    const href = links[activeIdx].href;
    if (newTab) window.open(href, "_blank", "noopener");
    else window.location.href = href;
  }

  async function bookmarkActive() {
    if (activeIdx < 0) return;
    const { href, text } = links[activeIdx];
    const existing = await FMHY.Storage.findBookmarkByUrl(href);
    if (existing) await FMHY.Storage.removeBookmark(existing.id);
    else await FMHY.Storage.addBookmark({ url: href, title: text, category: FMHY.Dom.getCurrentCategory() });
    if (FMHY.getFeature("bookmarks")) FMHY.getFeature("bookmarks").refreshBookmarkedSet();
  }

  async function noteActive() {
    if (activeIdx < 0) return;
    const noteFeat = FMHY.getFeature("notes");
    if (noteFeat) {
      // Trigger note editor via message
      chrome.runtime.sendMessage({ type: "openNoteEditor", url: links[activeIdx].href });
    }
  }

  let lastG = 0;
  function onKey(e) {
    // Skip if user is typing in an input/textarea
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) {
      if (e.key === "Escape") e.target.blur();
      return;
    }

    if (e.key === "j" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); move(1); }
    else if (e.key === "k" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); openActive(e.shiftKey); }
    else if (e.key === "b" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); bookmarkActive(); }
    else if (e.key === "n" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); noteActive(); }
    else if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const search = document.querySelector('input[type="search"], input[type="text"][placeholder*="search" i], .DocSearch-Input');
      if (search) search.focus();
    }
    else if (e.key === "g") {
      const now = Date.now();
      if (now - lastG < 500) { window.scrollTo({ top: 0, behavior: "smooth" }); lastG = 0; }
      else lastG = now;
    }
    else if (e.key === "G" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    }
    else if (e.key === "?" && !e.ctrlKey && !e.metaKey && e.shiftKey) {
      e.preventDefault();
      showHelp();
    }
  }

  function showHelp() {
    const modal = FMHY.Dom.el("div", { class: "fmhy-modal-overlay" });
    const box = FMHY.Dom.el("div", { class: "fmhy-modal" });
    box.appendChild(FMHY.Dom.el("h3", {}, "⌨ Keyboard Shortcuts"));
    const list = [
      ["j / k", "Move between resource links"],
      ["Enter", "Open active link"],
      ["Shift+Enter", "Open in new tab"],
      ["b", "Bookmark / unbookmark active link"],
      ["n", "Add note to active link"],
      ["/", "Focus search"],
      ["g g", "Scroll to top"],
      ["G", "Scroll to bottom"],
      ["Ctrl+Shift+K", "Open command palette"],
      ["Ctrl+Shift+Space", "Open radial menu"],
      ["Ctrl+Shift+B", "Bookmark current page"],
      ["?", "Show this help"]
    ];
    const tbl = FMHY.Dom.el("table", { class: "fmhy-kb-help" });
    list.forEach(([key, desc]) => {
      const tr = FMHY.Dom.el("tr");
      tr.appendChild(FMHY.Dom.el("td", {}, FMHY.Dom.el("kbd", {}, key)));
      tr.appendChild(FMHY.Dom.el("td", {}, desc));
      tbl.appendChild(tr);
    });
    box.appendChild(tbl);
    const close = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-primary" }, "Got it");
    close.addEventListener("click", () => modal.remove());
    box.appendChild(close);
    modal.appendChild(box);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      document.addEventListener("keydown", onKey);
      setTimeout(refreshLinks, 1000);
      FMHY.onPageChange(() => { activeIdx = -1; setTimeout(refreshLinks, 1000); });
    },
    onMessage() { return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
