/**
 * Feature #2 — Command Palette (Ctrl+Shift+K)
 *
 * A Raycast/Alfred-style fuzzy-search overlay that indexes every link on
 * the current page + your bookmarks + your history. Hotkey Ctrl+Shift+K.
 *
 * Also responds to the background's "openCommandPalette" command message.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "commandPalette";
  let initialized = false;
  let overlay = null;
  let input = null;
  let resultsBox = null;
  let allItems = [];
  let activeIdx = 0;
  let visibleResults = [];

  function buildIndex() {
    const items = [];
    // 1. All resource links on the current page
    FMHY.Dom.getResourceLinks().forEach((l) => {
      const heading = findClosestHeading(l.element);
      items.push({
        type: "page-link",
        title: l.text,
        subtitle: heading ? `${heading} · ${hostnameOf(l.href)}` : hostnameOf(l.href),
        url: l.href,
        icon: "link",
        score: 0
      });
    });
    // 2. FMHY main category links (from nav)
    document.querySelectorAll('a[href^="/"]').forEach((a) => {
      const href = a.href;
      const text = (a.textContent || "").trim();
      if (text && text.length > 1 && text.length < 40) {
        items.push({
          type: "nav",
          title: text,
          subtitle: "FMHY navigation",
          url: href,
          icon: "compass",
          score: 0
        });
      }
    });
    return items;
  }

  function findClosestHeading(el) {
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
      const prev = node.previousElementSibling;
      if (prev) {
        const h = prev.matches("h1,h2,h3,h4,h5,h6") ? prev : prev.querySelector("h1,h2,h3,h4,h5,h6");
        if (h) return h.textContent.trim();
      }
      node = node.parentElement;
    }
    return null;
  }

  function hostnameOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ""; }
  }

  async function refreshIndexWithUserData() {
    const [bookmarks, history] = await Promise.all([
      FMHY.Storage.getBookmarks(),
      FMHY.Storage.getHistory()
    ]);
    bookmarks.forEach((b) => {
      allItems.push({
        type: "bookmark",
        title: b.title,
        subtitle: ` ${b.category}${b.tags && b.tags.length ? " · #" + b.tags.join(" #") : ""}`,
        url: b.url,
        icon: "bookmark",
        score: 0
      });
    });
    history.forEach((h) => {
      allItems.push({
        type: "history",
        title: h.title || h.url,
        subtitle: `Recently viewed · ${FMHY.Dom.timeAgo(h.visitedAt)}`,
        url: h.url,
        icon: "history",
        score: 0
      });
    });
  }

  function open() {
    if (overlay) { close(); return; }
    allItems = buildIndex();
    refreshIndexWithUserData();

    overlay = FMHY.Dom.el("div", { class: "fmhy-cp-overlay", role: "dialog", "aria-modal": "true" });
    const box = FMHY.Dom.el("div", { class: "fmhy-cp-box" });
    const header = FMHY.Dom.el("div", { class: "fmhy-cp-header" }, [
      FMHY.Dom.el("span", { class: "fmhy-cp-logo" }, FMHY.Icon.render("zap", 22)),
      FMHY.Dom.el("span", {}, "FMHY Supercharged Command Palette")
    ]);
    input = FMHY.Dom.el("input", {
      type: "text",
      placeholder: "Search resources, bookmarks, history… (Esc to close)",
      autocomplete: "off",
      spellcheck: "false"
    });
    resultsBox = FMHY.Dom.el("div", { class: "fmhy-cp-results" });
    const footer = FMHY.Dom.el("div", { class: "fmhy-cp-footer" }, [
      FMHY.Dom.el("span", {}, "↑↓ navigate · Enter open · ⌘+Enter open in new tab · Esc close")
    ]);

    box.appendChild(header);
    box.appendChild(input);
    box.appendChild(resultsBox);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    input.addEventListener("input", () => render(input.value));
    input.addEventListener("keydown", onKeydown);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    requestAnimationFrame(() => input.focus());
    render("");
  }

  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
    input = null; resultsBox = null; activeIdx = 0; visibleResults = [];
  }

  function render(query) {
    if (!resultsBox) return;
    const q = query.trim();
    let scored;
    if (!q) {
      scored = allItems.slice(0, 50);
      // Sort: bookmarks first, then history, then page-links
      const order = { bookmark: 0, history: 1, "page-link": 2, nav: 3 };
      scored.sort((a, b) => order[a.type] - order[b.type]);
    } else {
      scored = allItems
        .map((it) => ({ ...it, score: Math.max(
          FMHY.Dom.fuzzyMatch(q, it.title) * 2,
          FMHY.Dom.fuzzyMatch(q, it.subtitle)
        ) }))
        .filter((it) => it.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);
    }
    visibleResults = scored;
    activeIdx = Math.min(activeIdx, scored.length - 1);
    if (activeIdx < 0) activeIdx = 0;

    resultsBox.innerHTML = "";
    if (scored.length === 0) {
      resultsBox.appendChild(FMHY.Dom.el("div", { class: "fmhy-cp-empty" }, "No matches found."));
      return;
    }
    scored.forEach((it, i) => {
      const row = FMHY.Dom.el("div", {
        class: "fmhy-cp-row" + (i === activeIdx ? " active" : ""),
        tabindex: "-1"
      });
      row.appendChild(FMHY.Dom.el("span", { class: "fmhy-cp-icon" }, it.icon));
      const body = FMHY.Dom.el("div", { class: "fmhy-cp-row-body" });
      body.appendChild(FMHY.Dom.el("div", { class: "fmhy-cp-title" }, it.title));
      body.appendChild(FMHY.Dom.el("div", { class: "fmhy-cp-sub" }, it.subtitle));
      row.appendChild(body);
      row.addEventListener("click", () => activate(i, false));
      row.addEventListener("mouseenter", () => { activeIdx = i; updateActive(); });
      resultsBox.appendChild(row);
    });
  }

  function updateActive() {
    const rows = resultsBox.querySelectorAll(".fmhy-cp-row");
    rows.forEach((r, i) => r.classList.toggle("active", i === activeIdx));
    const active = rows[activeIdx];
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function onKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, visibleResults.length - 1); updateActive(); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); updateActive(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      activate(activeIdx, e.metaKey || e.ctrlKey);
    }
  }

  function activate(idx, newTab) {
    const it = visibleResults[idx];
    if (!it) return;
    if (newTab) window.open(it.url, "_blank", "noopener");
    else window.location.href = it.url;
    close();
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
          e.preventDefault();
          open();
        }
      });
    },
    onMessage(msg) {
      if (msg.type === "openCommandPalette") { open(); return true; }
      return false;
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
