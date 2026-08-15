/**
 * Feature #20 — Enhanced Search with Autocomplete + History
 *
 * Wraps/augments VitePress's built-in search input with:
 *   - autocomplete from page headings + bookmark titles + search history
 *   - `category:` and `tag:` query syntax
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "searchEnhancer";
  let initialized = false;
  let dropdown = null;

  function findSearchInputs() {
    return document.querySelectorAll('input[type="search"], input[placeholder*="search" i], .DocSearch-Input, .VPNavBarSearch input');
  }

  function attach(input) {
    if (input.dataset.fmhySearchEnh) return;
    input.dataset.fmhySearchEnh = "1";

    input.addEventListener("input", FMHY.Dom.debounce(() => onInput(input), 150));
    input.addEventListener("focus", () => onInput(input));
    input.addEventListener("blur", () => setTimeout(closeDropdown, 200));
    input.addEventListener("keydown", (e) => onKeydown(e, input));
  }

  async function onInput(input) {
    const q = input.value.trim();
    if (!q) { closeDropdown(); return; }

    const suggestions = await gatherSuggestions(q);
    if (suggestions.length === 0) { closeDropdown(); return; }
    showDropdown(input, suggestions);
  }

  async function gatherSuggestions(q) {
    const out = [];

    // Parse category: and tag: prefixes
    const catMatch = q.match(/category:(\w+)/);
    const tagMatch = q.match(/tag:(\w+)/);
    const cat = catMatch ? catMatch[1].toLowerCase() : null;
    const tag = tagMatch ? tagMatch[1].toLowerCase() : null;
    const plain = q.replace(/(category|tag):\w+/g, "").trim().toLowerCase();

    // Bookmarks
    const bookmarks = await FMHY.Storage.getBookmarks();
    bookmarks.forEach((b) => {
      if (cat && !b.category.toLowerCase().includes(cat)) return;
      if (tag && !(b.tags || []).some((t) => t.toLowerCase().includes(tag))) return;
      if (plain && !b.title.toLowerCase().includes(plain) && !b.url.toLowerCase().includes(plain)) return;
      out.push({
        type: "bookmark",
        label: b.title,
        sub: `Bookmark in ${b.category}`,
        url: b.url,
        score: plain ? (b.title.toLowerCase().startsWith(plain) ? 100 : 50) : 80
      });
    });

    // History
    const history = await FMHY.Storage.getHistory();
    history.forEach((h) => {
      if (plain && !h.title.toLowerCase().includes(plain)) return;
      out.push({
        type: "history",
        label: h.title,
        sub: ` ${FMHY.Dom.timeAgo(h.visitedAt)}`,
        url: h.url,
        score: 30
      });
    });

    // Page headings
    document.querySelectorAll("main h2, main h3, .vp-doc h2, .vp-doc h3").forEach((h) => {
      const text = h.textContent.trim();
      if (plain && !text.toLowerCase().includes(plain)) return;
      out.push({
        type: "heading",
        label: text,
        sub: " On this page",
        url: "#" + (h.id || ""),
        score: 40
      });
    });

    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  let activeIdx = 0;
  let currentItems = [];

  function showDropdown(input, items) {
    closeDropdown();
    currentItems = items;
    activeIdx = 0;
    dropdown = FMHY.Dom.el("div", { class: "fmhy-search-dropdown" });
    items.forEach((it, i) => {
      const row = FMHY.Dom.el("div", {
        class: "fmhy-search-row" + (i === 0 ? " active" : "")
      });
      row.appendChild(FMHY.Dom.el("span", { class: "fmhy-search-label" }, it.label));
      row.appendChild(FMHY.Dom.el("span", { class: "fmhy-search-sub" }, it.sub));
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        navigate(it, input);
      });
      row.addEventListener("mouseenter", () => {
        activeIdx = i;
        updateActive();
      });
      dropdown.appendChild(row);
    });
    positionDropdown(input);
    document.body.appendChild(dropdown);
  }

  function positionDropdown(input) {
    const r = input.getBoundingClientRect();
    dropdown.style.left = r.left + window.scrollX + "px";
    dropdown.style.top = r.bottom + window.scrollY + "px";
    dropdown.style.width = r.width + "px";
  }

  function closeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
    currentItems = [];
  }

  function updateActive() {
    if (!dropdown) return;
    const rows = dropdown.querySelectorAll(".fmhy-search-row");
    rows.forEach((r, i) => r.classList.toggle("active", i === activeIdx));
  }

  function onKeydown(e, input) {
    if (!dropdown) return;
    if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = (activeIdx + 1) % currentItems.length; updateActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = (activeIdx - 1 + currentItems.length) % currentItems.length; updateActive(); }
    else if (e.key === "Enter" && currentItems[activeIdx]) {
      e.preventDefault();
      navigate(currentItems[activeIdx], input);
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  }

  function navigate(it, input) {
    if (it.url.startsWith("#")) {
      const el = document.getElementById(it.url.slice(1));
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      window.open(it.url, "_blank", "noopener");
    }
    closeDropdown();
    input.blur();
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      const wireInputs = () => findSearchInputs().forEach(attach);
      wireInputs();
      FMHY.onPageChange(wireInputs);
    },
    onMessage() { return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
