/**
 * FMHY Supercharged — Shared Storage Library
 * Single source of truth for reading/writing extension data.
 *
 * Storage schema (chrome.storage.local):
 *   bookmarks        : Array<Bookmark>
 *   notes            : { [url]: Note }
 *   ratings          : { [url]: Rating }
 *   healthCache      : { [url]: HealthRecord }
 *   pageSnapshots    : { [pageUrl]: Snapshot }   // for diff-viewer
 *   recentHistory    : Array<HistoryEntry>       // last 50
 *   watchedCategories: Array<string>
 *   settings         : { [featureKey]: any }
 *   syncConfig       : { provider, token, gistId, ... }
 *   highlightRules   : Array<HighlightRule>
 *   pinnedResources  : Array<string>             // for quick toolbar
 *   lastVisit        : { [pageUrl]: timestamp }
 *
 * All methods return Promises.
 */
(function (global) {
  "use strict";

  const NS = "fmhy_sc_"; // namespace prefix to avoid collisions
  const DEFAULTS = {
    bookmarks: [],
    notes: {},
    ratings: {},
    healthCache: {},
    pageSnapshots: {},
    recentHistory: [],
    watchedCategories: [],
    highlightRules: [
      { id: "default-oss", pattern: "open[- ]?source", color: "#22c55e", label: "OSS" },
      { id: "default-self", pattern: "self[- ]?host", color: "#a855f7", label: "Self-host" },
      { id: "default-freemium", pattern: "freemium|free trial|premium", color: "#eab308", label: "Freemium" }
    ],
    pinnedResources: [],
    lastVisit: {},
    settings: {
      // master switches per feature
      base64Decoder: true,
      commandPalette: true,
      bookmarks: true,
      sync: false,
      healthChecker: true,
      notes: true,
      diffViewer: true,
      safetyBadges: true,
      filters: true,
      miniToc: true,
      recentHistory: true,
      quickToolbar: true,
      radialMenu: true,
      relatedSidebar: true,
      keyboardNav: true,
      searchEnhancer: true,
      themeSwitcher: true,
      densityModes: true,
      scrollMemory: true,
      highlightRules: true,
      readingMode: true,
      compareMatrix: true,
      ratings: true,
      notifications: true,
      exportTools: true,
      shareCards: true,
      // density default
      density: "comfortable",
      // theme default
      theme: "auto"
    },
    syncConfig: {
      provider: "none",        // 'none' | 'gist' | 'webdav'
      token: "",
      gistId: "",
      webdavUrl: "",
      lastSync: 0,
      autoSync: true
    }
  };

  // ---- internal helpers ----
  function key(k) { return NS + k; }

  // Safe deep clone (structuredClone may be unavailable in some SW contexts)
  function deepClone(v) {
    if (v === null || v === undefined) return v;
    try { return structuredClone(v); } catch (e) {}
    try { return JSON.parse(JSON.stringify(v)); } catch (e) {}
    return v;
  }

  function read(k) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key(k)], (res) => {
        const val = res[key(k)];
        if (val === undefined) {
          resolve(deepClone(DEFAULTS[k] ?? null));
        } else {
          resolve(val);
        }
      });
    });
  }

  function write(k, v) {
    return new Promise((resolve) => {
      const obj = {};
      obj[key(k)] = v;
      chrome.storage.local.set(obj, () => resolve(v));
    });
  }

  function patch(k, fn) {
    return read(k).then((v) => {
      const next = fn(v);
      return write(k, next);
    });
  }

  // ---- public API ----
  const Storage = {
    DEFAULTS,
    NS,

    // generic
    get(k) { return read(k); },
    set(k, v) { return write(k, v); },
    patch(k, fn) { return patch(k, fn); },

    // settings
    getSettings() { return read("settings"); },
    async getSetting(name) {
      const s = await read("settings");
      return s[name];
    },
    async setSetting(name, value) {
      return patch("settings", (s) => ({ ...s, [name]: value }));
    },
    async isFeatureEnabled(featureKey) {
      const s = await read("settings");
      return s[featureKey] !== false;
    },

    // bookmarks
    getBookmarks() { return read("bookmarks"); },
    addBookmark(bm) {
      const bookmark = {
        id: bm.id || `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url: bm.url,
        title: bm.title || bm.url,
        category: bm.category || "uncategorized",
        tags: bm.tags || [],
        folder: bm.folder || null,
        note: bm.note || "",
        rating: bm.rating || 0,
        addedAt: bm.addedAt || Date.now(),
        ...bm
      };
      return patch("bookmarks", (arr) => {
        if (arr.some((b) => b.url === bookmark.url)) return arr; // dedupe by URL
        return [bookmark, ...arr];
      }).then(() => bookmark);
    },
    removeBookmark(id) {
      return patch("bookmarks", (arr) => arr.filter((b) => b.id !== id));
    },
    findBookmarkByUrl(url) {
      return read("bookmarks").then((arr) => arr.find((b) => b.url === url) || null);
    },
    updateBookmark(id, updates) {
      return patch("bookmarks", (arr) =>
        arr.map((b) => (b.id === id ? { ...b, ...updates } : b))
      );
    },

    // notes
    getNotes() { return read("notes"); },
    getNote(url) { return read("notes").then((n) => n[url] || null); },
    setNote(url, text) {
      return patch("notes", (n) => {
        n[url] = { text, updatedAt: Date.now() };
        return n;
      });
    },
    removeNote(url) {
      return patch("notes", (n) => { delete n[url]; return n; });
    },

    // ratings
    getRatings() { return read("ratings"); },
    getRating(url) { return read("ratings").then((r) => r[url] || null); },
    setRating(url, stars, review) {
      return patch("ratings", (r) => {
        r[url] = { stars, review: review || "", updatedAt: Date.now() };
        return r;
      });
    },
    removeRating(url) {
      return patch("ratings", (r) => { delete r[url]; return r; });
    },

    // health cache
    getHealth(url) { return read("healthCache").then((h) => h[url] || null); },
    setHealth(url, status, statusCode) {
      return patch("healthCache", (h) => {
        h[url] = {
          status,           // 'alive' | 'dead' | 'unknown'
          statusCode,
          checkedAt: Date.now()
        };
        return h;
      });
    },
    getAllHealth() { return read("healthCache"); },

    // recent history (capped at 50)
    pushHistory(entry) {
      return patch("recentHistory", (arr) => {
        const filtered = arr.filter((e) => e.url !== entry.url);
        return [entry, ...filtered].slice(0, 50);
      });
    },
    getHistory() { return read("recentHistory"); },
    clearHistory() { return write("recentHistory", []); },

    // page snapshots (for diff-viewer)
    getSnapshot(pageUrl) { return read("pageSnapshots").then((s) => s[pageUrl] || null); },
    setSnapshot(pageUrl, links) {
      return patch("pageSnapshots", (s) => {
        s[pageUrl] = { links, capturedAt: Date.now() };
        return s;
      });
    },

    // pinned resources (quick toolbar)
    getPinned() { return read("pinnedResources"); },
    pin(url) {
      return patch("pinnedResources", (arr) =>
        arr.includes(url) ? arr : [...arr, url]
      );
    },
    unpin(url) {
      return patch("pinnedResources", (arr) => arr.filter((u) => u !== url));
    },

    // watched categories
    getWatchedCategories() { return read("watchedCategories"); },
    watchCategory(cat) {
      return patch("watchedCategories", (arr) =>
        arr.includes(cat) ? arr : [...arr, cat]
      );
    },
    unwatchCategory(cat) {
      return patch("watchedCategories", (arr) => arr.filter((c) => c !== cat));
    },

    // highlight rules
    getHighlightRules() { return read("highlightRules"); },
    setHighlightRules(rules) { return write("highlightRules", rules); },

    // last visit tracking
    getLastVisit(pageUrl) { return read("lastVisit").then((v) => v[pageUrl] || 0); },
    setLastVisit(pageUrl, ts) {
      return patch("lastVisit", (v) => { v[pageUrl] = ts; return v; });
    },

    // sync config
    getSyncConfig() { return read("syncConfig"); },
    setSyncConfig(cfg) {
      return patch("syncConfig", (c) => ({ ...c, ...cfg }));
    },

    // full backup / restore
    async exportAll() {
      const keys = Object.keys(DEFAULTS);
      const result = {};
      for (const k of keys) {
        result[k] = await read(k);
      }
      return { _meta: { app: "FMHY Supercharged", version: 1, exportedAt: Date.now() }, data: result };
    },
    async importAll(payload) {
      if (!payload || !payload.data) throw new Error("Invalid backup file");
      const keys = Object.keys(DEFAULTS);
      for (const k of keys) {
        if (payload.data[k] !== undefined) {
          await write(k, payload.data[k]);
        }
      }
    },

    // wipe
    async resetAll() {
      const keys = Object.keys(DEFAULTS);
      for (const k of keys) {
        await write(k, deepClone(DEFAULTS[k]));
      }
    }
  };

  global.FMHY = global.FMHY || {};
  global.FMHY.Storage = Storage;
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
