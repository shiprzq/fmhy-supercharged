/**
 * FMHY Supercharged — Popup script
 * Manages the 4-tab popup UI: Quick, Bookmarks, Recent, Settings.
 */
(function () {
  "use strict";

  const NS = "fmhy_sc_";

  // ---- Inline SVG icon set (no emojis) ----
  // Mirrors lib/icons.js but inlined because popup can't load content scripts.
  const SVG_ICONS = {
    "zap": '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    "bookmark": '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    "bookmark-filled": '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor"/>',
    "history": '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 15"/>',
    "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    "command": '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>',
    "radial": '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="3" r="1"/><circle cx="12" cy="21" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="21" cy="12" r="1"/><circle cx="5.6" cy="5.6" r="1"/><circle cx="18.4" cy="5.6" r="1"/><circle cx="5.6" cy="18.4" r="1"/><circle cx="18.4" cy="18.4" r="1"/>',
    "sync": '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    "search": '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    "arrow-right": '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    "check-circle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    "alert": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    "info": '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    "star": '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    "trash": '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    "note": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
    "external": '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'
  };

  function svgIcon(name, size = 16) {
    const path = SVG_ICONS[name] || SVG_ICONS["info"];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="fmhy-icon" aria-hidden="true">${path}</svg>`;
  }

  /** Inject SVG icons into all [data-icon] slots. */
  function injectIcons() {
    document.querySelectorAll("[data-icon]").forEach((el) => {
      const name = el.getAttribute("data-icon");
      const size = parseInt(el.getAttribute("data-icon-size") || "16", 10);
      el.innerHTML = svgIcon(name, size);
    });
  }

  const DEFAULTS_SETTINGS = {
    base64Decoder: true, commandPalette: true, bookmarks: true, sync: false,
    healthChecker: true, notes: true, diffViewer: true, safetyBadges: true,
    filters: true, miniToc: true, recentHistory: true, quickToolbar: true,
    radialMenu: true, relatedSidebar: true, keyboardNav: true, searchEnhancer: true,
    themeSwitcher: true, densityModes: true, scrollMemory: true, highlightRules: true,
    readingMode: true, compareMatrix: true, ratings: true, watchedNotifications: true,
    notifications: true, exportTools: true, shareCards: true, density: "comfortable"
  };

  const FEATURE_LABELS = {
    base64Decoder: "Base64 auto-decoder",
    commandPalette: "Command palette (Ctrl+Shift+K)",
    bookmarks: "Bookmark manager",
    sync: "Cross-device sync",
    healthChecker: "Dead-link monitor",
    notes: "Inline notes",
    diffViewer: "What's-new diff",
    safetyBadges: "Safety & trust badges",
    filters: "Smart filters bar",
    miniToc: "Mini table of contents",
    recentHistory: "Recently viewed tracking",
    quickToolbar: "Quick-access toolbar",
    radialMenu: "Radial category menu",
    relatedSidebar: "Related resources panel",
    keyboardNav: "Vim keyboard nav",
    searchEnhancer: "Search autocomplete",
    themeSwitcher: "Per-category themes",
    densityModes: "Density modes",
    scrollMemory: "Scroll memory",
    highlightRules: "Highlight rules",
    readingMode: "Reading mode",
    compareMatrix: "Comparison matrix",
    ratings: "Star ratings",
    watchedNotifications: "Watched categories",
    notifications: "Desktop notifications",
    exportTools: "Export tools",
    shareCards: "Shareable cards"
  };

  function get(k) {
    return new Promise((r) => chrome.storage.local.get([NS + k], (res) => r(res[NS + k] ?? DEFAULTS_SETTINGS[k])));
  }
  function set(k, v) {
    return new Promise((r) => {
      const settings = {};
      chrome.storage.local.get([NS + "settings"], (cur) => {
        const merged = { ...(cur[NS + "settings"] || DEFAULTS_SETTINGS), [k]: v };
        const obj = {};
        obj[NS + "settings"] = merged;
        chrome.storage.local.set(obj, () => r());
      });
    });
  }

  function getRaw(k) {
    return new Promise((r) => chrome.storage.local.get([NS + k], (res) => r(res[NS + k] ?? null)));
  }

  // ---------- Tab switching ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`).classList.add("active");
      if (tab.dataset.tab === "bookmarks") renderBookmarks();
      if (tab.dataset.tab === "history") renderHistory();
      if (tab.dataset.tab === "settings") renderToggles();
    });
  });

  // ---------- Quick actions ----------
  document.getElementById("open-palette").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: "openCommandPalette" });
    window.close();
  });

  document.getElementById("open-radial").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: "openRadialMenu" });
    window.close();
  });

  document.getElementById("action-export").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: "exportData" });
    window.close();
  });

  document.getElementById("action-sync").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "syncNow" }, (res) => {
      const el = document.getElementById("sync-status");
      if (res && res.ok) el.textContent = "Synced";
      else el.textContent = "Sync failed — configure in Options";
      setTimeout(() => el.textContent = "", 3000);
    });
  });

  document.getElementById("action-bookmark-page").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: "toggleBookmarkCurrent" });
    window.close();
  });

  document.getElementById("action-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById("open-options-page").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById("clear-history").addEventListener("click", async () => {
    if (!confirm("Clear all recently-viewed history?")) return;
    await new Promise((r) => {
      const obj = {}; obj[NS + "recentHistory"] = [];
      chrome.storage.local.set(obj, r);
    });
    renderHistory();
  });

  // ---------- Bookmarks ----------
  async function renderBookmarks() {
    const list = document.getElementById("bm-list");
    const search = document.getElementById("bm-search");
    const all = (await getRaw("bookmarks")) || [];
    document.getElementById("bm-count").textContent = all.length;

    const render = (filter) => {
      const f = (filter || "").toLowerCase().trim();
      const items = f
        ? all.filter((b) => b.title.toLowerCase().includes(f) || b.url.toLowerCase().includes(f) || (b.tags || []).some((t) => t.toLowerCase().includes(f)))
        : all;
      list.innerHTML = "";
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.innerHTML = `<span class="empty-icon">${svgIcon("bookmark", 36)}</span>${all.length === 0 ? "No bookmarks yet.<br>Click the + button next to any resource on fmhy.net." : "No matches found."}`;
        list.appendChild(empty);
        return;
      }
      items.slice(0, 50).forEach((bm) => {
        const item = document.createElement("div");
        item.className = "bm-item";
        const host = (() => { try { return new URL(bm.url).hostname; } catch (e) { return ""; } })();
        const fav = host ? `https://www.google.com/s2/favicons?sz=32&domain=${host}` : "";
        const iconSlot = fav
          ? `<img class="bm-item-icon" src="${fav}" alt="" width="20" height="20" onerror="this.outerHTML='${svgIcon("bookmark", 20).replace(/'/g, "&#39;")}'">`
          : `<span class="bm-item-icon">${svgIcon("bookmark", 20)}</span>`;
        item.innerHTML = `
          ${iconSlot}
          <div class="bm-item-body">
            <div class="bm-item-title"></div>
            <div class="bm-item-sub">${bm.category || "uncategorized"} · ${host || "unknown"}</div>
          </div>
          <button class="bm-item-delete" title="Delete bookmark">${svgIcon("trash", 14)}</button>
        `;
        item.querySelector(".bm-item-title").textContent = bm.title;
        item.addEventListener("click", (e) => {
          if (e.target.closest(".bm-item-delete")) return;
          chrome.tabs.create({ url: bm.url });
        });
        item.querySelector(".bm-item-delete").addEventListener("click", async (e) => {
          e.stopPropagation();
          await new Promise((r) => {
            chrome.storage.local.get([NS + "bookmarks"], (res) => {
              const arr = res[NS + "bookmarks"] || [];
              const next = arr.filter((b) => b.id !== bm.id);
              const obj = {};
              obj[NS + "bookmarks"] = next;
              chrome.storage.local.set(obj, r);
            });
          });
          renderBookmarks();
        });
        list.appendChild(item);
      });
    };

    render("");
    search.oninput = () => render(search.value);
  }

  // ---------- History ----------
  async function renderHistory() {
    const list = document.getElementById("history-list");
    const hist = (await getRaw("recentHistory")) || [];
    if (hist.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = `<span class="empty-icon">${svgIcon("history", 36)}</span>No recently viewed resources yet.`;
      list.appendChild(empty);
      return;
    }
    list.innerHTML = "";
    hist.slice(0, 20).forEach((h) => {
      const item = document.createElement("div");
      item.className = "history-item";
      const host = (() => { try { return new URL(h.url).hostname; } catch (e) { return ""; } })();
      const ago = timeAgo(h.visitedAt);
      const fav = host ? `https://www.google.com/s2/favicons?sz=32&domain=${host}` : "";
      const iconSlot = fav
        ? `<img class="history-item-icon" src="${fav}" alt="" width="20" height="20" onerror="this.outerHTML='${svgIcon("history", 20).replace(/'/g, "&#39;")}'">`
        : `<span class="history-item-icon">${svgIcon("history", 20)}</span>`;
      item.innerHTML = `
        ${iconSlot}
        <div class="history-item-body">
          <div class="history-item-title"></div>
          <div class="history-item-sub">${ago} · ${host || "unknown"}</div>
        </div>
      `;
      item.querySelector(".history-item-title").textContent = h.title || h.url;
      item.addEventListener("click", () => chrome.tabs.create({ url: h.url }));
      list.appendChild(item);
    });
  }

  function timeAgo(ts) {
    if (!ts) return "never";
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  // ---------- Sync status ----------
  async function showSyncStatus() {
    const cfg = await getRaw("syncConfig");
    const el = document.getElementById("sync-status");
    if (!el) return;
    const dot = el.querySelector(".status-dot");
    const text = el.querySelector(".status-text");
    if (!cfg || cfg.provider === "none") {
      if (dot) dot.style.background = "#94a3b8";
      if (text) text.textContent = "Sync not configured — set up in Options";
    } else {
      const last = cfg.lastSync ? timeAgo(cfg.lastSync) : "never";
      if (dot) dot.style.background = "#22c55e";
      if (text) text.textContent = `Synced via ${cfg.provider === "gist" ? "GitHub Gist" : "WebDAV"} · ${last}`;
    }
  }

  // ---------- Settings toggles ----------
  async function renderToggles() {
    const container = document.getElementById("feature-toggles");
    const settings = (await getRaw("settings")) || DEFAULTS_SETTINGS;
    container.innerHTML = "";
    Object.keys(FEATURE_LABELS).forEach((key) => {
      const row = document.createElement("div");
      row.className = "toggle-row";
      const isOn = settings[key] !== false;
      row.innerHTML = `
        <label>${FEATURE_LABELS[key]}</label>
        <div class="toggle ${isOn ? "on" : ""}" role="switch" aria-checked="${isOn}" tabindex="0"></div>
      `;
      const tog = row.querySelector(".toggle");
      const label = row.querySelector("label");

      const handleToggle = async (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const newVal = !(await get(key));
        await set(key, newVal);
        tog.classList.toggle("on", newVal);
        tog.setAttribute("aria-checked", String(newVal));
      };

      // Click on toggle, label, OR anywhere on row
      tog.addEventListener("click", handleToggle);
      label.addEventListener("click", handleToggle);
      row.addEventListener("click", handleToggle);
      // Keyboard support
      tog.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          handleToggle(e);
        }
      });
      container.appendChild(row);
    });
  }

  // Initial render — inject SVG icons into all [data-icon] slots
  injectIcons();
  // Brand icon slot
  const brandSlot = document.getElementById("brand-icon-slot");
  if (brandSlot) brandSlot.innerHTML = svgIcon("zap", 22);
  // Settings icon button
  const optsBtn = document.getElementById("open-options");
  if (optsBtn) optsBtn.innerHTML = svgIcon("settings", 18);

  showSyncStatus();
  (async () => {
    const bms = (await getRaw("bookmarks")) || [];
    document.getElementById("bm-count").textContent = bms.length;
  })();
})();
