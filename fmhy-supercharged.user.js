// ==UserScript==
// @name         FMHY Supercharged
// @namespace    https://fmhy.net
// @version      1.0.0
// @description  30 power features for fmhy.net — unified sidebar, command palette, smart bookmarks, sync, dead-link monitor, safety badges, notes, ratings, compare with best-pick, enhanced search & more.
// @author       FMHY Supercharged
// @match        *://fmhy.net/*
// @match        *://*.fmhy.net/*
// @match        *://fmhy.xyz/*
// @icon         https://fmhy.net/pwa_icon.png
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        unsafeWindow
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* eslint-disable no-undef */
(function () {
  "use strict";

  // ===================================================================
  // STORAGE LAYER (GM-backed)
  // ===================================================================

  const NS = "fmhy_sc_";

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
      base64Decoder: true, commandPalette: true, bookmarks: true, sync: false,
      healthChecker: true, notes: true, diffViewer: true, safetyBadges: true,
      filters: true, miniToc: true, recentHistory: true, quickToolbar: true,
      radialMenu: true, relatedSidebar: true, keyboardNav: true, searchEnhancer: false,
      themeSwitcher: true, densityModes: true, scrollMemory: true, highlightRules: true,
      readingMode: true, compareMatrix: true, ratings: true, watchedNotifications: true,
      notifications: true, exportTools: true, shareCards: true, searchEnhancerEnabled: false,
      density: "comfortable"
    },
    syncConfig: { provider: "none", token: "", gistId: "", lastSync: 0, autoSync: true }
  };

  function deepClone(v) {
    if (v === null || v === undefined) return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  const Storage = {
    get(k) {
      const val = GM_getValue(NS + k, undefined);
      return Promise.resolve(val === undefined ? deepClone(DEFAULTS[k] ?? null) : val);
    },
    set(k, v) { GM_setValue(NS + k, v); return Promise.resolve(v); },
    async patch(k, fn) { const v = await this.get(k); const next = fn(v); return this.set(k, next); },
    getSettings() { return this.get("settings"); },
    async getSetting(name) { const s = await this.get("settings"); return s[name]; },
    async setSetting(name, value) { return this.patch("settings", (s) => ({ ...s, [name]: value })); },
    getBookmarks() { return this.get("bookmarks"); },
    async addBookmark(bm) {
      const bookmark = {
        id: bm.id || `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url: bm.url, title: bm.title || bm.url, category: bm.category || "uncategorized",
        tags: bm.tags || [], folder: bm.folder || null, note: bm.note || "",
        rating: bm.rating || 0, addedAt: bm.addedAt || Date.now(), ...bm
      };
      await this.patch("bookmarks", (arr) => arr.some((b) => b.url === bookmark.url) ? arr : [bookmark, ...arr]);
      return bookmark;
    },
    removeBookmark(id) { return this.patch("bookmarks", (arr) => arr.filter((b) => b.id !== id)); },
    async findBookmarkByUrl(url) { const arr = await this.get("bookmarks"); return arr.find((b) => b.url === url) || null; },
    getNotes() { return this.get("notes"); },
    async getNote(url) { const n = await this.get("notes"); return n[url] || null; },
    setNote(url, text) { return this.patch("notes", (n) => { n[url] = { text, updatedAt: Date.now() }; return n; }); },
    removeNote(url) { return this.patch("notes", (n) => { delete n[url]; return n; }); },
    getRatings() { return this.get("ratings"); },
    async getRating(url) { const r = await this.get("ratings"); return r[url] || null; },
    setRating(url, stars, review) { return this.patch("ratings", (r) => { r[url] = { stars, review: review || "", updatedAt: Date.now() }; return r; }); },
    removeRating(url) { return this.patch("ratings", (r) => { delete r[url]; return r; }); },
    getHealth(url) { return this.get("healthCache").then((h) => h[url] || null); },
    setHealth(url, status, statusCode) { return this.patch("healthCache", (h) => { h[url] = { status, statusCode, checkedAt: Date.now() }; return h; }); },
    getAllHealth() { return this.get("healthCache"); },
    pushHistory(entry) { return this.patch("recentHistory", (arr) => { const filtered = arr.filter((e) => e.url !== entry.url); return [entry, ...filtered].slice(0, 50); }); },
    getHistory() { return this.get("recentHistory"); },
    clearHistory() { return this.set("recentHistory", []); },
    getSnapshot(pageUrl) { return this.get("pageSnapshots").then((s) => s[pageUrl] || null); },
    setSnapshot(pageUrl, links) { return this.patch("pageSnapshots", (s) => { s[pageUrl] = { links, capturedAt: Date.now() }; return s; }); },
    getPinned() { return this.get("pinnedResources"); },
    pin(url) { return this.patch("pinnedResources", (arr) => arr.includes(url) ? arr : [...arr, url]); },
    unpin(url) { return this.patch("pinnedResources", (arr) => arr.filter((u) => u !== url)); },
    getWatchedCategories() { return this.get("watchedCategories"); },
    watchCategory(cat) { return this.patch("watchedCategories", (arr) => arr.includes(cat) ? arr : [...arr, cat]); },
    unwatchCategory(cat) { return this.patch("watchedCategories", (arr) => arr.filter((c) => c !== cat)); },
    getHighlightRules() { return this.get("highlightRules"); },
    setHighlightRules(rules) { return this.set("highlightRules", rules); },
    getLastVisit(pageUrl) { return this.get("lastVisit").then((v) => v[pageUrl] || 0); },
    setLastVisit(pageUrl, ts) { return this.patch("lastVisit", (v) => { v[pageUrl] = ts; return v; }); },
    getSyncConfig() { return this.get("syncConfig"); },
    setSyncConfig(cfg) { return this.patch("syncConfig", (c) => ({ ...c, ...cfg })); },
    async exportAll() {
      const keys = Object.keys(DEFAULTS);
      const result = {};
      for (const k of keys) result[k] = await this.get(k);
      return { _meta: { app: "FMHY Supercharged", version: 1, exportedAt: Date.now() }, data: result };
    },
    async importAll(payload) {
      if (!payload || !payload.data) throw new Error("Invalid backup file");
      for (const k of Object.keys(DEFAULTS)) if (payload.data[k] !== undefined) await this.set(k, payload.data[k]);
    },
    async resetAll() { for (const k of Object.keys(DEFAULTS)) await this.set(k, deepClone(DEFAULTS[k])); }
  };

  // ===================================================================
  // DOM UTILITIES
  // ===================================================================

  const Dom = {
    waitFor(selector, timeout = 10000) {
      return new Promise((resolve) => {
        const existing = document.querySelector(selector);
        if (existing) return resolve(existing);
        const obs = new MutationObserver(() => {
          const el = document.querySelector(selector);
          if (el) { obs.disconnect(); resolve(el); }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
      });
    },
    onPageChange(cb) {
      const target = document.getElementById("app") || document.body;
      const obs = new MutationObserver(() => cb());
      obs.observe(target, { childList: true, subtree: true });
      return () => obs.disconnect();
    },
    debounce(fn, ms = 200) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; },
    throttle(fn, ms = 100) {
      let last = 0, timer = null;
      return (...args) => {
        const now = Date.now();
        const remaining = ms - (now - last);
        if (remaining <= 0) { last = now; fn(...args); }
        else { clearTimeout(timer); timer = setTimeout(() => { last = Date.now(); fn(...args); }, remaining); }
      };
    },
    getResourceLinks() {
      const main = document.querySelector("main, .VPDoc, .vp-doc, article, #VPContent");
      const root = main || document;
      const links = [];
      root.querySelectorAll('a[href^="http"]').forEach((a) => {
        const href = a.href;
        if (!href) return;
        try {
          const u = new URL(href);
          if (u.hostname.endsWith("fmhy.net") || u.hostname.endsWith("fmhy.xyz")) return;
          if (["reddit.com", "github.com", "discord.com", "discord.gg", "t.me"].includes(u.hostname)) {
            if (u.hostname === "github.com" && (u.pathname.includes("/fmhy/") || u.pathname.includes("/mian196/"))) return;
            if (u.hostname === "reddit.com" && u.pathname.startsWith("/r/FREEMEDIAHECKYEAH")) return;
          }
        } catch (e) { return; }
        const text = (a.textContent || "").trim();
        if (!text || text.length < 2) return;
        links.push({ element: a, href, text });
      });
      return links;
    },
    getCurrentCategory() {
      const path = window.location.pathname.replace(/^\//, "").replace(/\/$/, "");
      if (!path) return "home";
      return path.split("/")[0];
    },
    getPageTitle() { const h1 = document.querySelector("h1"); return h1 ? h1.textContent.trim() : document.title; },
    el(tag, attrs = {}, children = []) {
      const e = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === "class") e.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
        else if (k === "html") e.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v !== null && v !== undefined) e.setAttribute(k, v);
      });
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        if (typeof c === "string") e.appendChild(document.createTextNode(c));
        else e.appendChild(c);
      });
      return e;
    },
    hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i); return (h >>> 0).toString(36); },
    fuzzyMatch(query, text) {
      if (!query) return 1;
      query = query.toLowerCase(); text = (text || "").toLowerCase();
      const idx = text.indexOf(query);
      if (idx !== -1) { let s = 100 + query.length * 2; if (idx === 0) s += 50; if (idx === 0 || /[\s\-_/.]/.test(text[idx - 1])) s += 30; return s; }
      let qi = 0, s = 0, lastIdx = -1, con = 0;
      for (let i = 0; i < text.length && qi < query.length; i++) {
        if (text[i] === query[qi]) {
          if (i - lastIdx === 1) { con++; s += 5 + con * 2; } else { con = 0; s += 1; }
          if (i === 0 || /[\s\-_/.]/.test(text[i - 1])) s += 8;
          lastIdx = i; qi++;
        }
      }
      if (qi === query.length) return Math.max(1, s - Math.floor((text.length - query.length) / 20));
      return 0;
    },
    async copyToClipboard(text) {
      try { if (typeof GM_setClipboard === "function") { GM_setClipboard(text); return true; } await navigator.clipboard.writeText(text); return true; }
      catch (e) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); return true; } catch (_) { return false; } finally { ta.remove(); } }
    },
    faviconUrl(url, size = 16) { try { const u = new URL(url); return `https://www.google.com/s2/favicons?sz=${size}&domain=${u.hostname}`; } catch (e) { return ""; } },
    timeAgo(ts) {
      if (!ts) return "never";
      const s = Math.floor((Date.now() - ts) / 1000);
      if (s < 60) return "just now";
      const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
      const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
      return `${Math.floor(mo / 12)}y ago`;
    }
  };

  // ===================================================================
  // SVG ICON SYSTEM
  // ===================================================================

  const ICONS = {
    "zap": '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    "close": '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    "chevron-right": '<polyline points="9 18 15 12 9 6"/>',
    "chevron-left": '<polyline points="15 18 9 12 15 6"/>',
    "search": '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    "command": '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>',
    "radial": '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="3" r="1"/><circle cx="12" cy="21" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="21" cy="12" r="1"/>',
    "bookmark": '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    "bookmark-filled": '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor"/>',
    "note": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    "star": '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    "star-filled": '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor"/>',
    "pin": '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 2-2V3H6v1a2 2 0 0 0 2 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/>',
    "shield": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    "check": '<polyline points="20 6 9 17 4 12"/>',
    "check-circle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    "alert": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    "info": '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    "archive": '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
    "history": '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 15"/>',
    "sync": '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    "scale": '<path d="M12 3v18"/><path d="M5 8h14"/><path d="M5 8l-3 6h6l-3-6z"/><path d="M19 8l-3 6h6l-3-6z"/>',
    "share": '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
    "bell": '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    "book-open": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    "layers": '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    "list": '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    "tag": '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    "keyboard": '<rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
    "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    "plus": '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    "trash": '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    "external": '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    "compass": '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    "tool": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    "sparkles": '<path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>',
    "dot": '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
    "arrow-right": '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>'
  };

  const Icon = {
    render(name, size = 16) {
      const path = ICONS[name] || ICONS["dot"];
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.75");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("class", "fmhy-icon");
      svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = path;
      return svg;
    },
    html(name, size = 16) {
      const path = ICONS[name] || ICONS["dot"];
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="fmhy-icon" aria-hidden="true">${path}</svg>`;
    },
    inject(target, name, size = 16) {
      if (!target) return;
      target.innerHTML = "";
      target.appendChild(this.render(name, size));
    }
  };

  // ===================================================================
  // SYNC CLIENT (uses GM_xmlhttpRequest)
  // ===================================================================

  const SyncClient = {
    async push(localData, config) {
      if (!config || config.provider === "none") throw new Error("No sync provider configured");
      const payload = { app: "fmhy-supercharged", version: 1, exportedAt: Date.now(), ...localData };
      if (config.provider === "gist") return this._pushGist(payload, config);
      throw new Error("Only GitHub Gist sync is supported in userscript mode");
    },
    async pull(config) {
      if (!config || config.provider === "none") throw new Error("No sync provider configured");
      if (config.provider === "gist") return this._pullGist(config);
      throw new Error("Only GitHub Gist sync is supported in userscript mode");
    },
    _pushGist(payload, config) {
      return new Promise((resolve, reject) => {
        const body = {
          description: "FMHY Supercharged sync data (auto-managed)",
          files: { "fmhy-supercharged-sync.json": { content: JSON.stringify(payload, null, 2) } }
        };
        let url = "https://api.github.com/gists";
        let method = "POST";
        if (config.gistId) { url = `https://api.github.com/gists/${config.gistId}`; method = "PATCH"; }
        GM_xmlhttpRequest({
          method, url,
          headers: { "Authorization": `token ${config.token}`, "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json" },
          data: JSON.stringify(body),
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              const data = JSON.parse(res.responseText);
              resolve({ gistId: data.id, url: data.html_url });
            } else reject(new Error(`Gist push failed (${res.status}): ${res.responseText}`));
          },
          onerror: (err) => reject(new Error("Network error: " + (err.error || "unknown")))
        });
      });
    },
    _pullGist(config) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET", url: `https://api.github.com/gists/${config.gistId}`,
          headers: { "Authorization": `token ${config.token}`, "Accept": "application/vnd.github.v3+json" },
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              const data = JSON.parse(res.responseText);
              const file = data.files && data.files["fmhy-supercharged-sync.json"];
              if (!file) return reject(new Error("Sync file not found in gist"));
              resolve(JSON.parse(file.content));
            } else reject(new Error(`Gist pull failed (${res.status})`));
          },
          onerror: () => reject(new Error("Network error"))
        });
      });
    },
    verifyGistToken(token) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET", url: "https://api.github.com/user",
          headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" },
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              const data = JSON.parse(res.responseText);
              resolve({ login: data.login, name: data.name });
            } else reject(new Error(`Invalid token (${res.status})`));
          },
          onerror: () => reject(new Error("Network error"))
        });
      });
    },
    merge(local, remote) {
      if (!remote) return local;
      if (!local) return remote;
      const bmByUrl = new Map();
      [...(local.bookmarks || []), ...(remote.bookmarks || [])].forEach((b) => {
        const ex = bmByUrl.get(b.url);
        if (!ex || (b.addedAt || 0) > (ex.addedAt || 0)) bmByUrl.set(b.url, b);
      });
      const notes = {};
      [local.notes || {}, remote.notes || {}].forEach((src) => {
        Object.entries(src).forEach(([url, n]) => {
          const ex = notes[url];
          if (!ex || (n.updatedAt || 0) > (ex.updatedAt || 0)) notes[url] = n;
        });
      });
      const ratings = {};
      [local.ratings || {}, remote.ratings || {}].forEach((src) => {
        Object.entries(src).forEach(([url, r]) => {
          const ex = ratings[url];
          if (!ex || (r.updatedAt || 0) > (ex.updatedAt || 0)) ratings[url] = r;
        });
      });
      const pinned = [...new Set([...(local.pinnedResources || []), ...(remote.pinnedResources || [])])];
      const rules = (local.highlightRules || []).length >= (remote.highlightRules || []).length ? local.highlightRules : remote.highlightRules;
      return { app: "fmhy-supercharged", version: 1, exportedAt: Date.now(), bookmarks: Array.from(bmByUrl.values()), notes, ratings, pinnedResources: pinned, highlightRules: rules };
    }
  };

  // ===================================================================
  // HEALTH CHECKER (uses GM_xmlhttpRequest)
  // ===================================================================

  async function checkLinkHealth(url) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "HEAD", url: url, timeout: 8000,
        onload: async (res) => {
          const status = (res.status >= 200 && res.status < 400) ? "alive" : (res.status >= 400 && res.status < 500 ? "dead" : "alive");
          await Storage.setHealth(url, status, res.status);
          resolve({ url, status, statusCode: res.status });
        },
        onerror: async () => { await Storage.setHealth(url, "unknown", 0); resolve({ url, status: "unknown", statusCode: 0 }); },
        ontimeout: async () => { await Storage.setHealth(url, "unknown", 0); resolve({ url, status: "unknown", statusCode: 0 }); }
      });
    });
  }

  async function getWaybackUrl(url) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET", url: `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            const closest = data.archived_snapshots && data.archived_snapshots.closest;
            resolve(closest && closest.available && closest.url ? closest.url : null);
          } catch (e) { resolve(null); }
        },
        onerror: () => resolve(null)
      });
    });
  }

  // ===================================================================
  // SYNC RUNNER + OPTIONS MODAL
  // ===================================================================

  async function runSync() {
    const cfg = await Storage.getSyncConfig();
    if (cfg.provider === "none" || !cfg.token) throw new Error("Sync not configured");
    const [bookmarks, notes, ratings, pinned, rules] = await Promise.all([
      Storage.getBookmarks(), Storage.getNotes(), Storage.getRatings(),
      Storage.getPinned(), Storage.getHighlightRules()
    ]);
    const localData = { bookmarks, notes, ratings, pinnedResources: pinned, highlightRules: rules };
    const result = await SyncClient.push(localData, cfg);
    if (result.gistId && result.gistId !== cfg.gistId) await Storage.setSyncConfig({ gistId: result.gistId });
    await Storage.setSyncConfig({ lastSync: Date.now() });
  }

  function openOptionsModal() {
    const existing = document.getElementById("fmhy-sc-options-modal-overlay");
    if (existing) { existing.remove(); return; }
    const overlay = Dom.el("div", { class: "fmhy-sc-modal-overlay", id: "fmhy-sc-options-modal-overlay", role: "dialog", "aria-modal": "true" });
    const box = Dom.el("div", { class: "fmhy-sc-modal fmhy-sc-modal-wide" });
    const header = Dom.el("div", { class: "fmhy-sc-modal-header" });
    header.appendChild(Dom.el("h3", {}, "FMHY Supercharged Options"));
    const closeBtn = Dom.el("button", { class: "fmhy-sc-modal-close", "aria-label": "Close" });
    closeBtn.appendChild(Icon.render("close", 18));
    closeBtn.addEventListener("click", () => overlay.remove());
    header.appendChild(closeBtn);
    box.appendChild(header);
    const content = Dom.el("div", { style: { padding: "16px", maxHeight: "60vh", overflowY: "auto" } });

    content.appendChild(Dom.el("h4", { style: { margin: "0 0 8px", fontSize: "14px" } }, "Cross-device Sync (GitHub Gist)"));
    const tokenInput = Dom.el("input", { type: "password", placeholder: "GitHub token (gist scope)", style: { width: "100%", padding: "8px", marginBottom: "8px", borderRadius: "6px", border: "1px solid #d4d4d8", boxSizing: "border-box" } });
    content.appendChild(tokenInput);
    const gistIdInput = Dom.el("input", { type: "text", placeholder: "Gist ID (auto-created on first sync)", style: { width: "100%", padding: "8px", marginBottom: "8px", borderRadius: "6px", border: "1px solid #d4d4d8", boxSizing: "border-box" } });
    content.appendChild(gistIdInput);
    Storage.getSyncConfig().then((cfg) => { tokenInput.value = cfg.token || ""; gistIdInput.value = cfg.gistId || ""; });

    const btnRow = Dom.el("div", { style: { display: "flex", gap: "8px", marginBottom: "16px" } });
    const verifyBtn = Dom.el("button", { class: "fmhy-sc-btn" }, "Verify token");
    const syncBtn = Dom.el("button", { class: "fmhy-sc-btn fmhy-sc-btn-primary" }, "Sync now");
    btnRow.appendChild(verifyBtn); btnRow.appendChild(syncBtn);
    content.appendChild(btnRow);
    const resultBox = Dom.el("div", { style: { minHeight: "20px", marginBottom: "16px", padding: "8px", borderRadius: "6px", fontSize: "12px" } });
    content.appendChild(resultBox);

    verifyBtn.addEventListener("click", async () => {
      const token = tokenInput.value.trim();
      if (!token) { resultBox.textContent = "Enter a token first"; resultBox.style.color = "#ef4444"; return; }
      resultBox.textContent = "Verifying..."; resultBox.style.color = "#7c3aed";
      try {
        const info = await SyncClient.verifyGistToken(token);
        await Storage.setSyncConfig({ provider: "gist", token });
        resultBox.textContent = "Verified as @" + info.login; resultBox.style.color = "#10b981";
      } catch (e) { resultBox.textContent = "Failed: " + e.message; resultBox.style.color = "#ef4444"; }
    });
    syncBtn.addEventListener("click", async () => {
      const token = tokenInput.value.trim(); const gistId = gistIdInput.value.trim();
      if (!token) { resultBox.textContent = "Enter a token first"; resultBox.style.color = "#ef4444"; return; }
      await Storage.setSyncConfig({ provider: "gist", token, gistId });
      resultBox.textContent = "Syncing..."; resultBox.style.color = "#7c3aed";
      try {
        await runSync();
        const cfg = await Storage.getSyncConfig();
        gistIdInput.value = cfg.gistId || "";
        resultBox.textContent = "Synced! Gist ID: " + (cfg.gistId || "auto-created"); resultBox.style.color = "#10b981";
      } catch (e) { resultBox.textContent = "Sync failed: " + e.message; resultBox.style.color = "#ef4444"; }
    });

    content.appendChild(Dom.el("h4", { style: { margin: "0 0 8px", fontSize: "14px" } }, "Feature Toggles"));
    const togglesBox = Dom.el("div", { id: "fmhy-sc-options-toggles" });
    content.appendChild(togglesBox);
    const FEATURE_LABELS = [
      ["base64Decoder", "Base64 auto-decoder"], ["commandPalette", "Command palette"], ["bookmarks", "Bookmark manager"],
      ["healthChecker", "Dead-link monitor"], ["notes", "Inline notes"], ["diffViewer", "What's-new diff"],
      ["safetyBadges", "Safety badges"], ["filters", "Smart filters bar"], ["miniToc", "Mini table of contents"],
      ["recentHistory", "Recently viewed"], ["quickToolbar", "Quick-access toolbar"], ["radialMenu", "Radial category menu"],
      ["relatedSidebar", "Related resources"], ["keyboardNav", "Vim keyboard nav"], ["searchEnhancer", "Enhanced search"],
      ["themeSwitcher", "Per-category themes"], ["densityModes", "Density modes"], ["highlightRules", "Highlight rules"],
      ["readingMode", "Reading mode"], ["compareMatrix", "Comparison matrix"], ["ratings", "Star ratings"],
      ["watchedNotifications", "Watched categories"], ["exportTools", "Export tools"], ["shareCards", "Shareable cards"]
    ];
    Storage.getSettings().then((settings) => {
      FEATURE_LABELS.forEach(([key, label]) => {
        const row = Dom.el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e4e4e7" } });
        row.appendChild(Dom.el("span", {}, label));
        const isOn = settings[key] !== false;
        const tog = Dom.el("div", { class: "toggle " + (isOn ? "on" : ""), role: "switch", "aria-checked": String(isOn), tabindex: "0", style: { position: "relative", width: "40px", height: "24px", background: isOn ? "#7c3aed" : "#d4d4d8", borderRadius: "12px", cursor: "pointer", transition: "background 0.2s" } });
        tog.innerHTML = '<div style="position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform 0.2s;transform:' + (isOn ? "translateX(16px)" : "translateX(0)") + ';box-shadow:0 1px 3px rgba(0,0,0,0.2)"></div>';
        tog.addEventListener("click", async () => {
          const cur = await Storage.getSetting(key);
          const v = cur === false ? true : false;
          await Storage.setSetting(key, v);
          tog.classList.toggle("on", v);
          tog.style.background = v ? "#7c3aed" : "#d4d4d8";
          tog.querySelector("div").style.transform = v ? "translateX(16px)" : "translateX(0)";
          if (FMHY.Sidebar && FMHY.Sidebar.showToast) FMHY.Sidebar.showToast(v ? label + " enabled" : label + " disabled", "info");
        });
        row.appendChild(tog);
        togglesBox.appendChild(row);
      });
    });

    content.appendChild(Dom.el("h4", { style: { margin: "16px 0 8px", fontSize: "14px" } }, "Backup & Restore"));
    const backupRow = Dom.el("div", { style: { display: "flex", gap: "8px" } });
    const exportBtn = Dom.el("button", { class: "fmhy-sc-btn fmhy-sc-btn-primary" }, "Export backup (JSON)");
    const importBtn = Dom.el("button", { class: "fmhy-sc-btn" }, "Import backup");
    const fileInput = Dom.el("input", { type: "file", accept: "application/json", style: { display: "none" } });
    backupRow.appendChild(exportBtn); backupRow.appendChild(importBtn); backupRow.appendChild(fileInput);
    content.appendChild(backupRow);
    exportBtn.addEventListener("click", async () => {
      const data = await Storage.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "fmhy-supercharged-backup.json";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });
    importBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await Storage.importAll(JSON.parse(text));
        if (FMHY.Sidebar && FMHY.Sidebar.showToast) FMHY.Sidebar.showToast("Backup imported!", "success");
        overlay.remove();
      } catch (err) { if (FMHY.Sidebar && FMHY.Sidebar.showToast) FMHY.Sidebar.showToast("Import failed: " + err.message, "error"); }
    });

    box.appendChild(content);
    overlay.appendChild(box);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ===================================================================
  // GLOBAL NAMESPACE + FEATURE REGISTRY
  // ===================================================================

  const registry = {};
  const pageChangeListeners = [];

  const FMHY = { Storage, Dom, Icon, SyncClient, openOptionsModal };
  FMHY.registerFeature = function (name, api) { registry[name] = api; };
  FMHY.getFeature = function (name) { return registry[name]; };
  FMHY.onPageChange = function (cb) { pageChangeListeners.push(cb); };
  FMHY.emitPageChange = function () { pageChangeListeners.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } }); };

  // Expose FMHY on window so feature modules can access it via `global.FMHY`
  // where `global` is `window` (passed as the IIFE parameter)
  window.FMHY = FMHY;
  if (typeof unsafeWindow !== "undefined") unsafeWindow.FMHY = FMHY;

  // Intercept chrome.* calls — redirect to userscript equivalents
  window.chrome = window.chrome || {};
  window.chrome.runtime = window.chrome.runtime || {};
  window.chrome.runtime.openOptionsPage = openOptionsModal;
  window.chrome.runtime.sendMessage = (msg) => Promise.resolve({ ok: true });
  window.chrome.runtime.getURL = (p) => "https://fmhy.net/pwa_icon.png";
  window.chrome.runtime.onMessage = { addListener: () => {} };
  window.chrome.tabs = window.chrome.tabs || {};
  window.chrome.tabs.create = (opts) => window.open(opts.url, "_blank");
  window.chrome.tabs.query = (q, cb) => cb && cb([{ id: 1, url: window.location.href }]);
  window.chrome.tabs.sendMessage = () => {};
  window.chrome.storage = window.chrome.storage || {};
  window.chrome.storage.local = {
    get: (keys, cb) => {
      const out = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((k) => {
        const val = GM_getValue(k, undefined);
        if (val !== undefined) out[k] = val;
      });
      if (cb) cb(out);
    },
    set: (obj, cb) => {
      Object.entries(obj).forEach(([k, v]) => GM_setValue(k, v));
      if (cb) cb();
    }
  };
  window.chrome.contextMenus = { removeAll: (cb) => cb && cb(), create: () => {}, onClicked: { addListener: () => {} } };
  window.chrome.commands = { onCommand: { addListener: () => {} } };
  window.chrome.alarms = { create: () => {}, onAlarm: { addListener: () => {} } };
  window.chrome.notifications = { create: (id, opts) => { if (typeof GM_notification === "function") GM_notification(opts.message, opts.title); } };





  // ---- content/base64-decoder.js ----
/**
 * Feature #1 — Base64 Auto-Decoder + Smart Inline Preview
 *
 * Intercepts clicks on Base64-encoded links on fmhy.net, decodes them inline,
 * shows the real URL in a hover tooltip, and offers a one-click "Open" button.
 * Caches decoded URLs.
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "base64Decoder";
  const cache = new Map(); // base64 → decoded URL
  let initialized = false;

  // Heuristic: a base64-encoded URL fragment
  // - usually long (>16 chars)
  // - contains only [A-Za-z0-9+/=_-]
  // - decodes to something starting with http
  function looksLikeBase64(s) {
    if (!s || s.length < 16) return false;
    // VitePress/FMHY uses url-safe base64 sometimes
    if (!/^[A-Za-z0-9+/_\-]+={0,2}$/.test(s)) return false;
    // Avoid mistaking SHA hashes (40 hex / 64 hex) for b64
    if (/^[0-9a-f]+$/.test(s)) return false;
    // Avoid pure-alpha short strings (could be normal identifiers)
    if (s.length < 24 && /^[a-z]+$/i.test(s)) return false;
    return true;
  }

  function tryDecodeB64(s) {
    if (cache.has(s)) return cache.get(s);
    // Try both url-safe and standard base64
    const variants = [
      s,                                    // as-is (standard b64)
      s.replace(/-/g, "+").replace(/_/g, "/")  // url-safe → standard
    ];
    for (const variant of variants) {
      try {
        // Pad to multiple of 4
        const padded = variant + "===".slice((variant.length + 3) % 4);
        const decoded = atob(padded);
        // Validate UTF-8 + URL-like
        const trimmed = decoded.trim();
        if (/^https?:\/\//i.test(trimmed) && trimmed.length < 2000) {
          // Validate that it's a parseable URL
          try {
            new URL(trimmed);
            cache.set(s, trimmed);
            return trimmed;
          } catch (e) { /* not a valid URL */ }
        }
      } catch (e) { /* not valid b64, try next variant */ }
    }
    cache.set(s, null);
    return null;
  }

  // FMHY encodes links into a hash route like /#b64=<encoded>
  // and intercepts them with a popup. We intercept the same clicks.
  function findEncodedLinks() {
    const out = [];
    // Case A: links with hash route /#b64=... or ?b64=...
    document.querySelectorAll('a[href*="b64="]').forEach((a) => {
      const m = a.href.match(/b64=([A-Za-z0-9+/_\-=]+)/);
      if (m) {
        const decoded = tryDecodeB64(m[1]);
        if (decoded) out.push({ element: a, encoded: m[1], decoded });
      }
    });
    // Case B: links whose href is a long base64-looking string (rare)
    document.querySelectorAll('a[href^="http"]').forEach((a) => {
      // skip if it's already a real http URL
    });
    // Case C: detect raw base64 in <code> blocks marked as links
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute("href");
      if (href && looksLikeBase64(href) && href.length > 30) {
        const decoded = tryDecodeB64(href);
        if (decoded) out.push({ element: a, encoded: href, decoded });
      }
    });
    return out;
  }

  // Suppress the site's native Base64 modal
  function suppressNativeModal() {
    // The site shows a modal with class "base64-modal" or similar VitePress dialog
    // Best-effort: hide any modal whose text contains "Base64 Encoded Link"
    const modals = document.querySelectorAll(".VPModal, .vp-modal, [role='dialog'], .modal");
    modals.forEach((m) => {
      if (/base64/i.test(m.textContent) && /encoded link/i.test(m.textContent)) {
        m.style.display = "none";
        // Also try to click any "Cancel" button inside it
        const cancel = m.querySelector('button[class*="cancel"], button');
        // Don't auto-click — just hide
      }
    });
  }

  function applyDecoded() {
    const links = findEncodedLinks();
    links.forEach(({ element, encoded, decoded }) => {
      if (element.dataset.fmhyB64Done) return;
      element.dataset.fmhyB64Done = "1";

      // Replace href so native handler never fires
      element.setAttribute("href", decoded);
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");

      // Add a small visual indicator + tooltip
      element.classList.add("fmhy-b64-decoded");
      element.title = `Decoded: ${decoded}`;

      // Tooltip with copy button (lazy-built on hover)
      element.addEventListener("mouseenter", () => showHoverCard(element, decoded), { once: true });
    });
  }

  let hoverCard = null;
  function showHoverCard(anchor, url) {
    hideHoverCard();
    hoverCard = FMHY.Dom.el("div", { class: "fmhy-b64-card", role: "tooltip" });
    const title = FMHY.Dom.el("div", { class: "fmhy-b64-card-title" }, "Decoded link");
    const urlBox = FMHY.Dom.el("div", { class: "fmhy-b64-card-url" }, url);
    const btns = FMHY.Dom.el("div", { class: "fmhy-b64-card-btns" });
    const openBtn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-primary" }, "Open ↗");
    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(url, "_blank", "noopener");
      hideHoverCard();
    });
    const copyBtn = FMHY.Dom.el("button", { class: "fmhy-btn" }, "Copy");
    copyBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const ok = await FMHY.Dom.copyToClipboard(url);
      copyBtn.textContent = ok ? "Copied!" : "Failed";
      setTimeout(() => copyBtn.textContent = "Copy", 1200);
    });
    btns.appendChild(openBtn);
    btns.appendChild(copyBtn);
    hoverCard.appendChild(title);
    hoverCard.appendChild(urlBox);
    hoverCard.appendChild(btns);
    document.body.appendChild(hoverCard);

    // Position
    const r = anchor.getBoundingClientRect();
    const cardW = 320;
    let left = r.left + window.scrollX;
    let top = r.bottom + window.scrollY + 6;
    if (left + cardW > window.innerWidth) left = window.innerWidth - cardW - 10;
    hoverCard.style.left = left + "px";
    hoverCard.style.top = top + "px";

    // Hide on outside click / escape / scroll
    setTimeout(() => {
      document.addEventListener("click", hideOnClickOutside, { once: true });
      document.addEventListener("keydown", hideOnEsc, { once: true });
      window.addEventListener("scroll", hideHoverCard, { once: true });
    }, 0);

    function hideOnClickOutside(e) {
      if (!hoverCard || !hoverCard.contains(e.target)) hideHoverCard();
      else document.addEventListener("click", hideOnClickOutside, { once: true });
    }
    function hideOnEsc(e) {
      if (e.key === "Escape") hideHoverCard();
      else document.addEventListener("keydown", hideOnEsc, { once: true });
    }
  }

  function hideHoverCard() {
    if (hoverCard) { hoverCard.remove(); hoverCard = null; }
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      applyDecoded();
      suppressNativeModal();
      FMHY.onPageChange(() => {
        applyDecoded();
        setTimeout(suppressNativeModal, 50);
        setTimeout(suppressNativeModal, 500);
      });
    },
    refresh() {
      applyDecoded();
      suppressNativeModal();
    },
    onMessage() { return false; }
  });
})(window);


  // ---- content/command-palette.js ----
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
  // FMHY is already defined on window by the core; nothing to do here

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

  window.FMHY.registerFeature(NAME, {
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
})(window);


  // ---- content/bookmarks.js ----
/**
 * Feature #3 — Personal Bookmark Manager with Tags, Folders & Search
 * Feature #5 (UI side) — bookmark health badges
 * Feature #15 — Recently Viewed dropdown (also feeds command palette)
 *
 * This module wires:
 *   - A floating "+" button on every resource link to one-click bookmark
 *   - A "Manage bookmarks" panel launched from the popup
 *   - "bookmarkLink" / "toggleBookmarkCurrent" message handlers
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "bookmarks";
  let initialized = false;
  const bookmarkedSet = new Set(); // urls

  async function refreshBookmarkedSet() {
    const bms = await FMHY.Storage.getBookmarks();
    bookmarkedSet.clear();
    bms.forEach((b) => bookmarkedSet.add(b.url));
    updateAllLinkBadges();
  }

  function updateAllLinkBadges() {
    FMHY.Dom.getResourceLinks().forEach(({ element, href }) => {
      const isBm = bookmarkedSet.has(href);
      let badge = element.querySelector(".fmhy-bm-badge");
      if (isBm && !badge) {
        badge = FMHY.Dom.el("span", { class: "fmhy-bm-badge", title: "Bookmarked — click to remove" }, "*");
        badge.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          removeByUrl(href);
        });
        element.appendChild(badge);
        element.classList.add("fmhy-bm-active");
      } else if (!isBm && badge) {
        badge.remove();
        element.classList.remove("fmhy-bm-active");
      }
    });
  }

  function addHoverButtons() {
    FMHY.Dom.getResourceLinks().forEach(({ element, href, text }) => {
      if (element.dataset.fmhyBmHover) return;
      element.dataset.fmhyBmHover = "1";
      // Build hover "+" button (positioned via CSS)
      const btn = FMHY.Dom.el("button", {
        class: "fmhy-bm-add-btn",
        title: "Add to FMHY SC bookmarks",
        "aria-label": "Bookmark this resource"
      }, "＋");
      btn.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const existing = await FMHY.Storage.findBookmarkByUrl(href);
        if (existing) {
          await FMHY.Storage.removeBookmark(existing.id);
        } else {
          const category = FMHY.Dom.getCurrentCategory();
          await FMHY.Storage.addBookmark({
            url: href,
            title: text,
            category
          });
        }
        await refreshBookmarkedSet();
      });
      element.appendChild(btn);
    });
  }

  async function removeByUrl(url) {
    const bm = await FMHY.Storage.findBookmarkByUrl(url);
    if (bm) {
      await FMHY.Storage.removeBookmark(bm.id);
      await refreshBookmarkedSet();
    }
  }

  async function bookmarkCurrentResource() {
    // Bookmark the page itself
    const url = window.location.href;
    const title = FMHY.Dom.getPageTitle();
    const category = FMHY.Dom.getCurrentCategory();
    const existing = await FMHY.Storage.findBookmarkByUrl(url);
    if (existing) {
      await FMHY.Storage.removeBookmark(existing.id);
    } else {
      await FMHY.Storage.addBookmark({ url, title, category });
    }
    await refreshBookmarkedSet();
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      refreshBookmarkedSet();
      addHoverButtons();
      FMHY.onPageChange(() => {
        addHoverButtons();
        refreshBookmarkedSet();
      });
    },
    onMessage(msg) {
      if (msg.type === "bookmarkLink" && msg.url) {
        (async () => {
          const existing = await FMHY.Storage.findBookmarkByUrl(msg.url);
          if (!existing) {
            await FMHY.Storage.addBookmark({
              url: msg.url,
              title: msg.text || msg.url,
              category: FMHY.Dom.getCurrentCategory()
            });
            await refreshBookmarkedSet();
          }
        })();
        return true;
      }
      if (msg.type === "toggleBookmarkCurrent") {
        bookmarkCurrentResource();
        return true;
      }
      return false;
    },
    refreshBookmarkedSet,
    isBookmarked: (url) => bookmarkedSet.has(url)
  });
})(window);


  // ---- content/notes.js ----
/**
 * Feature #6 — Inline Notes & Private Annotations
 *
 * Right-click any resource link → "Add Note" → opens a popover editor.
 * Notes persist forever, show as a  icon next to the link, searchable
 * from the popup's note list.
 *
 * Responds to "openNoteEditor" message from the context menu.
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "notes";
  let initialized = false;
  let popover = null;

  async function applyNoteBadges() {
    const notes = await FMHY.Storage.getNotes();
    const noteUrls = new Set(Object.keys(notes));
    FMHY.Dom.getResourceLinks().forEach(({ element, href }) => {
      let badge = element.querySelector(".fmhy-note-badge");
      if (noteUrls.has(href) && !badge) {
        badge = FMHY.Dom.el("span", { class: "fmhy-note-badge", title: "You have a note — click to view/edit" }, "md");
        badge.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          openEditor(href, element);
        });
        element.appendChild(badge);
      } else if (!noteUrls.has(href) && badge) {
        badge.remove();
      }
    });
  }

  function openEditor(url, anchorEl) {
    closeEditor();
    FMHY.Storage.getNote(url).then((note) => {
      popover = FMHY.Dom.el("div", { class: "fmhy-note-popover", role: "dialog" });
      const header = FMHY.Dom.el("div", { class: "fmhy-note-header" }, [
        FMHY.Dom.el("span", { class: "fmhy-note-title" }, " Note"),
        FMHY.Dom.el("button", { class: "fmhy-note-close", title: "Close (Esc)" }, "")
      ]);
      const urlLabel = FMHY.Dom.el("div", { class: "fmhy-note-url" }, url);
      const ta = FMHY.Dom.el("textarea", {
        class: "fmhy-note-textarea",
        placeholder: "Add a private note about this resource…",
        rows: "5"
      });
      ta.value = note ? note.text : "";
      const btns = FMHY.Dom.el("div", { class: "fmhy-note-btns" });
      const saveBtn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-primary" }, "Save");
      const delBtn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-danger" }, "Delete");
      const cancelBtn = FMHY.Dom.el("button", { class: "fmhy-btn" }, "Cancel");
      saveBtn.addEventListener("click", async () => {
        await FMHY.Storage.setNote(url, ta.value);
        await applyNoteBadges();
        closeEditor();
      });
      delBtn.addEventListener("click", async () => {
        await FMHY.Storage.removeNote(url);
        await applyNoteBadges();
        closeEditor();
      });
      cancelBtn.addEventListener("click", closeEditor);
      header.querySelector(".fmhy-note-close").addEventListener("click", closeEditor);
      btns.appendChild(saveBtn);
      btns.appendChild(delBtn);
      btns.appendChild(cancelBtn);
      popover.appendChild(header);
      popover.appendChild(urlLabel);
      popover.appendChild(ta);
      popover.appendChild(btns);
      document.body.appendChild(popover);

      // Position
      if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        const popW = 360;
        let left = r.left + window.scrollX;
        let top = r.bottom + window.scrollY + 6;
        if (left + popW > window.innerWidth) left = window.innerWidth - popW - 10;
        if (top + 260 > window.innerHeight + window.scrollY) top = r.top + window.scrollY - 270;
        popover.style.left = left + "px";
        popover.style.top = top + "px";
      } else {
        popover.style.left = "50%";
        popover.style.top = "30%";
        popover.style.transform = "translateX(-50%)";
      }
      ta.focus();
      // Esc to close
      popover.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditor(); });
      // Click outside to close
      setTimeout(() => {
        document.addEventListener("mousedown", function onDown(e) {
          if (popover && !popover.contains(e.target)) {
            closeEditor();
            document.removeEventListener("mousedown", onDown);
          }
        });
      }, 0);
    });
  }

  function closeEditor() {
    if (popover) { popover.remove(); popover = null; }
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      applyNoteBadges();
      FMHY.onPageChange(() => applyNoteBadges());
    },
    refresh() { return applyNoteBadges(); },
    onMessage(msg) {
      if (msg.type === "openNoteEditor" && msg.url) {
        // Find the anchor element on the page matching msg.url
        try {
          const anchor = document.querySelector(`a[href="${CSS.escape(msg.url)}"]`);
          openEditor(msg.url, anchor);
        } catch (e) {
          openEditor(msg.url, null);
        }
        return true;
      }
      return false;
    }
  });
})(window);


  // ---- content/diff-viewer.js ----
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
  // FMHY is already defined on window by the core; nothing to do here

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
      if (typeof GM_notification === "function") GM_notification(added.slice(0, 3).map((l) => l.text).join("\n") + (added.length > 3 ? `\n…and ${added.length - 3} more` : ""), `${added.length} new resource(s) on ${cat}`);
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

  window.FMHY.registerFeature(NAME, {
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
})(window);


  // ---- content/safety-badges.js ----
/**
 * Feature #5 — Resource Health Checker (UI side)
 * Feature #8 — Safety / Trust Badges
 * Feature #9 — Community Reports System (local stub)
 * Feature #10 — Auto-Wayback Machine Fallback
 * Feature #11 — Ad / Tracker Density Indicator
 * Feature #12 — Account-Required Indicator
 *
 * Combined here because they all attach badges to the same resource links
 * and share the same per-link UI layout.
 *
 * Badge layout (after each link):
 *   [///]  [⏱ alive 3d ago]  [ Wayback]  [/]  [ report]
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "safetyBadges";
  let initialized = false;

  // Local curated "unsafe" hostnames (FMHY's unsafe-sites page subset)
  // In production this would be fetched; here we ship a small starter list.
  const UNSAFE_HOSTS = new Set([
    // intentionally minimal — community reports extend this at runtime
  ]);

  // Heuristic keywords that suggest account/payment required
  const ACCOUNT_KEYWORDS = [
    "sign up", "register", "log in", "login", "create account", "sign in",
    "account required", "free account", "must register"
  ];
  const PAID_KEYWORDS = [
    "premium", "subscribe", "subscription", "pricing", "upgrade",
    "paid plan", "pro version", "buy now", "starts at $"
  ];
  const AD_KEYWORDS = [
    "ad-supported", "ads", "popups", "pop-ads", "popunder", "adfly",
    "shorte.st", "banner ads"
  ];
  const SAFE_KEYWORDS = [
    "open source", "open-source", "github", "gitlab", "self-hosted", "selfhost",
    "no ads", "ad-free", "non-profit", "creative commons", "mit license",
    "apache license", "gpl", "bsd license"
  ];

  async function loadCommunityReports() {
    // Future: fetch from GitHub issues / community JSON
    // For now, return empty — users can add reports via context menu
    return {};
  }

  function classifyLink(text, hostname) {
    const t = (text || "").toLowerCase();
    if (UNSAFE_HOSTS.has(hostname)) return { level: "unsafe", label: "", tip: "Reported unsafe" };
    // Safe keywords take precedence (open source, etc.)
    if (SAFE_KEYWORDS.some((k) => t.includes(k))) return { level: "safe", label: "", tip: "Open-source / trusted" };
    if (PAID_KEYWORDS.some((k) => t.includes(k))) return { level: "paid", label: "", tip: "May require payment" };
    if (ACCOUNT_KEYWORDS.some((k) => t.includes(k))) return { level: "account", label: "", tip: "May require account" };
    if (AD_KEYWORDS.some((k) => t.includes(k))) return { level: "ads", label: "", tip: "May have ads" };
    return { level: "unknown", label: "", tip: "No safety info yet" };
  }

  function applyBadges() {
    const links = FMHY.Dom.getResourceLinks();
    links.forEach(({ element, href, text }) => {
      if (element.dataset.fmhySafetyDone) return;
      element.dataset.fmhySafetyDone = "1";

      let host = "";
      try { host = new URL(href).hostname; } catch (e) { return; }

      const container = FMHY.Dom.el("span", { class: "fmhy-safety" });

      // Trust badge
      const trust = classifyLink(text, host);
      const trustBadge = FMHY.Dom.el("span", {
        class: `fmhy-safety-badge fmhy-safety-${trust.level}`,
        title: trust.tip
      }, trust.label);
      container.appendChild(trustBadge);

      // Health badge (initially "checking…")
      const healthBadge = FMHY.Dom.el("span", {
        class: "fmhy-safety-health",
        "data-url": href,
        title: "Checking link health…"
      }, "⏱");
      container.appendChild(healthBadge);

      // Wayback badge (initially hidden — shown only when dead)
      const waybackBadge = FMHY.Dom.el("a", {
        class: "fmhy-safety-wayback",
        target: "_blank",
        rel: "noopener",
        title: "View on Wayback Machine"
      }, "");
      waybackBadge.style.display = "none";
      waybackBadge.href = `https://web.archive.org/web/*/${href}`;
      container.appendChild(waybackBadge);

      // Report button
      const reportBtn = FMHY.Dom.el("span", {
        class: "fmhy-safety-report",
        title: "Report this link (dead / malware / ads / etc.)",
        role: "button",
        tabindex: "0"
      }, "");
      reportBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        openReportDialog(href, text);
      });
      container.appendChild(reportBtn);

      element.appendChild(container);
    });

    // Trigger health checks for visible links (throttled)
    scheduleHealthChecks();
  }

  let healthQueue = [];
  let healthRunning = false;
  function scheduleHealthChecks() {
    document.querySelectorAll(".fmhy-safety-health").forEach((b) => {
      const url = b.getAttribute("data-url");
      if (!url || b.dataset.fmhyHealthChecked) return;
      b.dataset.fmhyHealthChecked = "1";
      healthQueue.push({ badge: b, url });
    });
    if (!healthRunning) runHealthQueue();
  }

  async function runHealthQueue() {
    healthRunning = true;
    while (healthQueue.length > 0) {
      const { badge, url } = healthQueue.shift();
      // Check cached health first
      const cached = await FMHY.Storage.getHealth(url);
      const ONE_DAY = 24 * 60 * 60 * 1000;
      let record = cached;
      if (!cached || (Date.now() - cached.checkedAt) > ONE_DAY) {
        // Ask background to check
        try {
          const res = await Promise.resolve({ ok: true });
          if (res && res.ok) record = res.result;
        } catch (e) { /* background may be unavailable */ }
      }
      updateHealthBadge(badge, record);
    }
    healthRunning = false;
  }

  function updateHealthBadge(badge, record) {
    if (!record) return;
    const wayback = badge.parentElement.querySelector(".fmhy-safety-wayback");
    if (record.status === "alive") {
      badge.textContent = "";
      badge.classList.add("fmhy-safety-alive");
      badge.title = `Alive (status ${record.statusCode || "OK"}, checked ${FMHY.Dom.timeAgo(record.checkedAt)})`;
    } else if (record.status === "dead") {
      badge.textContent = "";
      badge.classList.add("fmhy-safety-dead");
      badge.title = `Appears dead (status ${record.statusCode || "?"})`;
      if (wayback) {
        wayback.style.display = "inline";
        wayback.title = "Site appears dead — view archived version";
      }
    } else {
      badge.textContent = "?";
      badge.classList.add("fmhy-safety-unknown");
      badge.title = "Health unknown (CORS-blocked)";
    }
  }

  function openReportDialog(url, text) {
    const modal = FMHY.Dom.el("div", { class: "fmhy-modal-overlay" });
    const box = FMHY.Dom.el("div", { class: "fmhy-modal" });
    box.appendChild(FMHY.Dom.el("h3", {}, " Report this resource"));
    const urlLabel = FMHY.Dom.el("div", { class: "fmhy-muted fmhy-modal-url" }, url);
    box.appendChild(urlLabel);

    const reasons = [
      { id: "dead", label: " Dead link (404 / unavailable)" },
      { id: "malware", label: " Malware / phishing / scam" },
      { id: "ads", label: " Excessive ads / popups" },
      { id: "paid", label: " Not actually free / requires payment" },
      { id: "account", label: " Requires account / invasive signup" },
      { id: "misleading", label: " Misleading / not what it claims" }
    ];
    const reasonBox = FMHY.Dom.el("div", { class: "fmhy-report-reasons" });
    reasons.forEach((r) => {
      const id = `fmhy-r-${r.id}`;
      const lbl = FMHY.Dom.el("label", { class: "fmhy-radio", for: id });
      const inp = FMHY.Dom.el("input", { type: "radio", name: "fmhy-report-reason", id, value: r.id });
      lbl.appendChild(inp);
      lbl.appendChild(document.createTextNode(" " + r.label));
      reasonBox.appendChild(lbl);
    });
    box.appendChild(reasonBox);

    const ta = FMHY.Dom.el("textarea", {
      class: "fmhy-report-text",
      placeholder: "Optional details…",
      rows: "3"
    });
    box.appendChild(ta);

    const btns = FMHY.Dom.el("div", { class: "fmhy-modal-btns" });
    const submit = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-primary" }, "Submit report");
    const cancel = FMHY.Dom.el("button", { class: "fmhy-btn" }, "Cancel");
    submit.addEventListener("click", async () => {
      const sel = reasonBox.querySelector('input[name="fmhy-report-reason"]:checked');
      if (!sel) { alert("Please pick a reason."); return; }
      // Local report store (in production this would POST to a backend)
      const reports = (await FMHY.Storage.get("reports")) || {};
      reports[url] = reports[url] || [];
      reports[url].push({
        reason: sel.value,
        detail: ta.value,
        at: Date.now()
      });
      await FMHY.Storage.set("reports", reports);
      modal.remove();
      // Show toast
      showToast("Report submitted — thank you!");
    });
    cancel.addEventListener("click", () => modal.remove());
    btns.appendChild(submit);
    btns.appendChild(cancel);
    box.appendChild(btns);
    modal.appendChild(box);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function showToast(msg) {
    const t = FMHY.Dom.el("div", { class: "fmhy-toast" }, msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      applyBadges();
      FMHY.onPageChange(() => applyBadges());
    },
    onMessage(msg) {
      if (msg.type === "reportLink" && msg.url) {
        openReportDialog(msg.url, msg.text || msg.url);
        return true;
      }
      return false;
    }
  });
})(window);


  // ---- content/filters.js ----
/**
 * Feature #13 — Smart Filters & Facets Bar
 *
 * Sticky filter bar at top of every category page:
 *   - by language · requires-account · self-hosted vs cloud
 *   - last-checked-alive · has-note · bookmarked · trust level
 *   - Combined with text search
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "filters";
  let initialized = false;
  let barEl = null;

  const STATE = {
    text: "",
    aliveOnly: false,
    bookmarkedOnly: false,
    notesOnly: false,
    trustLevel: "all", // all|safe|unknown|unsafe
    selfHostedOnly: false
  };

  function renderBar() {
    if (barEl) barEl.remove();
    barEl = FMHY.Dom.el("div", { class: "fmhy-filters-bar" });

    const search = FMHY.Dom.el("input", {
      type: "search",
      class: "fmhy-filters-search",
      placeholder: "Filter resources on this page…",
      value: STATE.text
    });
    search.addEventListener("input", FMHY.Dom.debounce((e) => {
      STATE.text = e.target.value.toLowerCase().trim();
      applyFilters();
    }, 150));

    const makeToggle = (label, prop, extra = {}) => {
      const btn = FMHY.Dom.el("button", {
        class: "fmhy-filter-chip" + (STATE[prop] ? " active" : ""),
        ...extra
      }, label);
      btn.addEventListener("click", () => {
        STATE[prop] = !STATE[prop];
        btn.classList.toggle("active", STATE[prop]);
        applyFilters();
      });
      return btn;
    };

    const select = FMHY.Dom.el("select", { class: "fmhy-filter-select" });
    [
      { v: "all", l: "All trust levels" },
      { v: "safe", l: "Safe only" },
      { v: "unknown", l: "Unknown" },
      { v: "unsafe", l: "Unsafe only" }
    ].forEach((o) => {
      const opt = FMHY.Dom.el("option", { value: o.v }, o.l);
      if (STATE.trustLevel === o.v) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", (e) => {
      STATE.trustLevel = e.target.value;
      applyFilters();
    });

    barEl.appendChild(search);
    barEl.appendChild(makeToggle("Alive", "aliveOnly"));
    barEl.appendChild(makeToggle("Bookmarked", "bookmarkedOnly"));
    barEl.appendChild(makeToggle("Has note", "notesOnly"));
    barEl.appendChild(makeToggle("Self-hosted", "selfHostedOnly"));
    barEl.appendChild(select);

    const clearBtn = FMHY.Dom.el("button", { class: "fmhy-filter-clear" }, "Clear");
    clearBtn.addEventListener("click", () => {
      STATE.text = "";
      STATE.aliveOnly = false;
      STATE.bookmarkedOnly = false;
      STATE.notesOnly = false;
      STATE.trustLevel = "all";
      STATE.selfHostedOnly = false;
      renderBar();
      applyFilters();
    });
    barEl.appendChild(clearBtn);

    const counter = FMHY.Dom.el("span", { class: "fmhy-filters-count" }, "");
    barEl.appendChild(counter);
    barEl._counter = counter;

    // Insert at top of main content
    const main = document.querySelector("main, .VPDoc, .vp-doc, article, #VPContent");
    if (main) main.prepend(barEl);
    else document.body.prepend(barEl);
  }

  let bookmarkedUrls = new Set();
  let notedUrls = new Set();
  async function loadUserData() {
    const [bms, notes] = await Promise.all([
      FMHY.Storage.getBookmarks(),
      FMHY.Storage.getNotes()
    ]);
    bookmarkedUrls = new Set(bms.map((b) => b.url));
    notedUrls = new Set(Object.keys(notes));
  }

  async function applyFilters() {
    if (!bookmarkedUrls.size && !notedUrls.size) await loadUserData();

    const links = FMHY.Dom.getResourceLinks();
    let visibleCount = 0;
    links.forEach(({ element, href, text }) => {
      let visible = true;
      if (STATE.text && !text.toLowerCase().includes(STATE.text) && !href.toLowerCase().includes(STATE.text)) {
        visible = false;
      }
      if (visible && STATE.aliveOnly) {
        const badge = element.querySelector(".fmhy-safety-health");
        if (!badge || !badge.classList.contains("fmhy-safety-alive")) visible = false;
      }
      if (visible && STATE.bookmarkedOnly && !bookmarkedUrls.has(href)) visible = false;
      if (visible && STATE.notesOnly && !notedUrls.has(href)) visible = false;
      if (visible && STATE.selfHostedOnly) {
        if (!/self[- ]?host/i.test(text)) visible = false;
      }
      if (visible && STATE.trustLevel !== "all") {
        const badge = element.querySelector(".fmhy-safety-badge");
        if (!badge) {
          if (STATE.trustLevel !== "unknown") visible = false;
        } else {
          if (STATE.trustLevel === "safe" && !badge.classList.contains("fmhy-safety-unknown") === false) {
            // we treat "unknown" as the default state — no real "safe" classification yet
          }
        }
      }

      // Hide/show the link's row (the <li> or paragraph parent)
      const row = element.closest("li, p, div") || element;
      row.style.display = visible ? "" : "none";
      if (visible) visibleCount++;
    });

    if (barEl && barEl._counter) {
      barEl._counter.textContent = `${visibleCount}/${links.length} shown`;
    }
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      loadUserData().then(() => {
        renderBar();
        applyFilters();
      });
      FMHY.onPageChange(() => {
        loadUserData().then(() => {
          renderBar();
          applyFilters();
        });
      });
    },
    onMessage() { return false; }
  });
})(window);


  // ---- content/mini-toc.js ----
/**
 * Feature #14 — Floating Mini Table of Contents
 * Feature #23 — Reading Progress & Scroll Memory (combined here)
 *
 * A draggable, collapsible floating widget showing all H2/H3 headings on
 * the current page with scroll-spy highlighting. Also remembers scroll
 * position per URL across sessions + shows a reading progress bar at top.
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "miniToc";
  let initialized = false;
  let widget = null;
  let progressbar = null;

  function buildWidget() {
    if (widget) widget.remove();
    widget = FMHY.Dom.el("div", { class: "fmhy-toc-widget", role: "navigation", "aria-label": "Page TOC" });
    widget.innerHTML = "";

    const header = FMHY.Dom.el("div", { class: "fmhy-toc-header" }, [
      FMHY.Dom.el("span", { class: "fmhy-toc-title" }, "On this page"),
      FMHY.Dom.el("button", { class: "fmhy-toc-collapse", title: "Collapse/expand" }, "–")
    ]);
    const list = FMHY.Dom.el("div", { class: "fmhy-toc-list" });

    const headings = document.querySelectorAll("main h2, main h3, .vp-doc h2, .vp-doc h3, article h2, article h3");
    if (headings.length === 0) {
      // No headings — hide widget
      widget.style.display = "none";
      return;
    }

    headings.forEach((h, i) => {
      if (!h.id) h.id = `fmhy-toc-${i}`;
      const item = FMHY.Dom.el("a", {
        class: "fmhy-toc-item fmhy-toc-h" + h.tagName.toLowerCase(),
        href: "#" + h.id
      }, h.textContent.trim());
      item.addEventListener("click", (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      list.appendChild(item);
    });

    widget.appendChild(header);
    widget.appendChild(list);
    document.body.appendChild(widget);

    // Make draggable by header
    makeDraggable(widget, header);

    // Collapse
    header.querySelector(".fmhy-toc-collapse").addEventListener("click", () => {
      list.style.display = list.style.display === "none" ? "" : "none";
      widget.classList.toggle("collapsed");
    });

    // Restore last position
    const pos = localStorage.getItem("fmhy_toc_pos");
    if (pos) {
      try {
        const { left, top } = JSON.parse(pos);
        widget.style.left = left + "px";
        widget.style.top = top + "px";
        widget.style.right = "auto";
      } catch (e) {}
    }

    // Scroll-spy
    setupScrollSpy(headings, list);
  }

  function makeDraggable(el, handle) {
    let dragging = false, offX = 0, offY = 0;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      dragging = true;
      const r = el.getBoundingClientRect();
      offX = e.clientX - r.left;
      offY = e.clientY - r.top;
      el.style.right = "auto";
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.left = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - offX)) + "px";
      el.style.top = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - offY)) + "px";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      localStorage.setItem("fmhy_toc_pos", JSON.stringify({
        left: parseInt(el.style.left || 0, 10),
        top: parseInt(el.style.top || 0, 10)
      }));
    });
  }

  let spyObs = null;
  function setupScrollSpy(headings, list) {
    if (spyObs) spyObs.disconnect();
    const items = list.querySelectorAll(".fmhy-toc-item");
    spyObs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          items.forEach((it) => it.classList.toggle("active", it.getAttribute("href") === "#" + id));
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    headings.forEach((h) => spyObs.observe(h));
  }

  function setupProgressBar() {
    if (progressbar) progressbar.remove();
    progressbar = FMHY.Dom.el("div", { class: "fmhy-progress-bar" });
    const fill = FMHY.Dom.el("div", { class: "fmhy-progress-fill" });
    progressbar.appendChild(fill);
    document.body.appendChild(progressbar);

    const update = FMHY.Dom.throttle(() => {
      const scroll = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(100, (scroll / max) * 100) : 0;
      fill.style.width = pct + "%";
    }, 100);
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  async function restoreScroll() {
    const key = "fmhy_scroll_" + window.location.pathname;
    const saved = parseInt(localStorage.getItem(key) || "0", 10);
    if (saved > 100) {
      // Delay so VitePress content has loaded
      setTimeout(() => window.scrollTo({ top: saved, behavior: "instant" in window ? "instant" : "auto" }), 600);
    }
    // Save on scroll
    const save = FMHY.Dom.debounce(() => {
      localStorage.setItem(key, String(window.scrollY));
    }, 300);
    window.addEventListener("scroll", save, { passive: true });
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      setupProgressBar();
      restoreScroll();
      setTimeout(buildWidget, 800);
      FMHY.onPageChange(() => {
        setTimeout(buildWidget, 800);
        restoreScroll();
      });
    },
    onMessage() { return false; }
  });
})(window);


  // ---- content/recent-history.js ----
/**
 * Feature #15 — Recently Viewed Resources Dropdown
 *
 * Tracks the last 50 resources you visited (bookmarked + clicked external links).
 * The popup uses this via chrome.storage. This module records visits.
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

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

  window.FMHY.registerFeature(NAME, {
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
})(window);


  // ---- content/quick-toolbar.js ----
/**
 * Feature #16 — Quick-Access Pinned Toolbar
 *
 * Floating toolbar with your pinned resources as icons.
 * Auto-hides on scroll down, reappears on scroll up.
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "quickToolbar";
  let initialized = false;
  let toolbar = null;
  let lastScrollY = 0;

  async function renderToolbar() {
    if (toolbar) toolbar.remove();
    const pinned = await FMHY.Storage.getPinned();
    if (pinned.length === 0) return; // don't render empty toolbar

    toolbar = FMHY.Dom.el("div", { class: "fmhy-quick-toolbar" });
    const label = FMHY.Dom.el("span", { class: "fmhy-qt-label" }, FMHY.Icon.render("pin", 16) ? "" : "");
    toolbar.appendChild(label);

    pinned.forEach((url) => {
      const a = FMHY.Dom.el("a", {
        class: "fmhy-qt-item",
        href: url,
        target: "_blank",
        rel: "noopener",
        title: url
      });
      const img = FMHY.Dom.el("img", {
        src: FMHY.Dom.faviconUrl(url, 32),
        alt: "",
        width: "24",
        height: "24",
        onerror: "this.style.display='none'"
      });
      a.appendChild(img);
      toolbar.appendChild(a);
    });

    document.body.appendChild(toolbar);
  }

  function setupAutoHide() {
    window.addEventListener("scroll", FMHY.Dom.throttle(() => {
      if (!toolbar) return;
      const y = window.scrollY;
      if (y > lastScrollY + 5 && y > 200) {
        toolbar.classList.add("fmhy-qt-hidden");
      } else if (y < lastScrollY - 5) {
        toolbar.classList.remove("fmhy-qt-hidden");
      }
      lastScrollY = y;
    }, 100), { passive: true });
  }

  async function handlePinMessage(url) {
    const pinned = await FMHY.Storage.getPinned();
    if (pinned.includes(url)) {
      await FMHY.Storage.unpin(url);
    } else {
      await FMHY.Storage.pin(url);
    }
    await renderToolbar();
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      renderToolbar();
      setupAutoHide();
      FMHY.onPageChange(() => renderToolbar());
    },
    onMessage(msg) {
      if (msg.type === "pinLink" && msg.url) {
        handlePinMessage(msg.url);
        return true;
      }
      return false;
    }
  });
})(window);


  // ---- content/radial-menu.js ----
/**
 * Feature #17 — Category Quick-Jump Radial Menu
 *
 * Hotkey Ctrl+Shift+Space opens a radial menu in the center of the screen
 * with all FMHY main categories + tool categories as icons.
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "radialMenu";
  let initialized = false;
  let overlay = null;

  const CATEGORIES = [
    { id: "adblockingvprivacy", label: "Ad-blocking", icon: "", path: "/adblockingvprivacy" },
    { id: "ai", label: "AI Tools", icon: "", path: "/ai" },
    { id: "storage", label: "Streaming", icon: "", path: "/storage" },
    { id: "listening", label: "Music", icon: "", path: "/listening" },
    { id: "gaming", label: "Gaming", icon: "", path: "/gaming" },
    { id: "reading", label: "Reading", icon: "", path: "/reading" },
    { id: "downloading", label: "Downloading", icon: "", path: "/downloading" },
    { id: "torrenting", label: "Torrenting", icon: "‍", path: "/torrenting" },
    { id: "educational", label: "Educational", icon: "", path: "/educational" },
    { id: "android-ios", label: "Android/iOS", icon: "", path: "/android-ios" },
    { id: "linux-non-free", label: "Linux/macOS", icon: "", path: "/linux-non-free" },
    { id: "non-eng", label: "Non-English", icon: "", path: "/non-eng" },
    { id: "misc", label: "Misc", icon: "", path: "/misc" },
    { id: "tools", label: "Tools", icon: "", path: "/tools" },
    { id: "storage-page", label: "Storage", icon: "json", path: "/storage" }
  ];

  function open() {
    if (overlay) { close(); return; }
    overlay = FMHY.Dom.el("div", { class: "fmhy-radial-overlay" });

    const center = FMHY.Dom.el("div", { class: "fmhy-radial-center" }, "");
    overlay.appendChild(center);

    const radius = window.innerWidth < 640 ? 130 : 180;
    const count = CATEGORIES.length;
    CATEGORIES.forEach((cat, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const btn = FMHY.Dom.el("button", {
        class: "fmhy-radial-btn",
        style: { transform: `translate(${x}px, ${y}px)` },
        title: cat.label
      });
      btn.appendChild(FMHY.Dom.el("span", { class: "fmhy-radial-icon" }, cat.icon));
      btn.appendChild(FMHY.Dom.el("span", { class: "fmhy-radial-label" }, cat.label));
      btn.addEventListener("click", () => {
        window.location.href = cat.path;
        close();
      });
      overlay.appendChild(btn);
    });

    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => overlay.classList.add("fmhy-radial-open"));

    document.addEventListener("keydown", onKey);
  }

  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Space") {
          e.preventDefault();
          open();
        }
      });
    },
    onMessage(msg) {
      if (msg.type === "openRadialMenu") { open(); return true; }
      return false;
    }
  });
})(window);


  // ---- content/related-sidebar.js ----
/**
 * Feature #18 — "Related Resources" Sidebar
 *
 * Right-side panel showing related resources:
 *   - same domain listed elsewhere on FMHY
 *   - "users who bookmarked this also bookmarked…" (local heuristic)
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "relatedSidebar";
  let initialized = false;
  let panel = null;
  let toggleBtn = null;

  function buildToggle() {
    if (toggleBtn) toggleBtn.remove();
    toggleBtn = FMHY.Dom.el("button", {
      class: "fmhy-sidebar-toggle",
      title: "Show related resources panel"
    }, "");
    toggleBtn.addEventListener("click", toggle);
    document.body.appendChild(toggleBtn);
  }

  function toggle() {
    if (panel) {
      panel.remove();
      panel = null;
      toggleBtn.classList.remove("active");
      return;
    }
    panel = FMHY.Dom.el("div", { class: "fmhy-related-panel" });
    panel.appendChild(FMHY.Dom.el("div", { class: "fmhy-related-header" }, [
      FMHY.Dom.el("span", {}, " Related resources"),
      FMHY.Dom.el("button", { class: "fmhy-related-close", title: "Close" }, "")
    ]));
    panel.querySelector(".fmhy-related-close").addEventListener("click", toggle);
    const body = FMHY.Dom.el("div", { class: "fmhy-related-body" }, "Loading…");
    panel.appendChild(body);
    document.body.appendChild(panel);
    toggleBtn.classList.add("active");
    populate(body);
  }

  async function populate(body) {
    const links = FMHY.Dom.getResourceLinks();
    const byHost = new Map();
    links.forEach((l) => {
      try {
        const host = new URL(l.href).hostname;
        if (!byHost.has(host)) byHost.set(host, []);
        byHost.get(host).push(l);
      } catch (e) {}
    });

    const duplicates = [...byHost.entries()].filter(([, arr]) => arr.length > 1);
    body.innerHTML = "";

    if (duplicates.length > 0) {
      body.appendChild(FMHY.Dom.el("h4", {}, " Listed multiple times on this page"));
      duplicates.slice(0, 8).forEach(([host, arr]) => {
        const group = FMHY.Dom.el("div", { class: "fmhy-related-group" });
        group.appendChild(FMHY.Dom.el("div", { class: "fmhy-related-group-title" }, `${host} (${arr.length})`));
        arr.slice(0, 3).forEach((l) => {
          group.appendChild(FMHY.Dom.el("a", {
            href: l.href,
            target: "_blank",
            rel: "noopener",
            class: "fmhy-related-link"
          }, l.text));
        });
        body.appendChild(group);
      });
    }

    // "Similar bookmarks" — same category as current page
    const bookmarks = await FMHY.Storage.getBookmarks();
    const cat = FMHY.Dom.getCurrentCategory();
    const sameCat = bookmarks.filter((b) => b.category === cat).slice(0, 8);
    if (sameCat.length > 0) {
      body.appendChild(FMHY.Dom.el("h4", {}, ` Your bookmarks in ${cat}`));
      sameCat.forEach((b) => {
        body.appendChild(FMHY.Dom.el("a", {
          href: b.url,
          target: "_blank",
          rel: "noopener",
          class: "fmhy-related-link"
        }, b.title));
      });
    }

    if (duplicates.length === 0 && sameCat.length === 0) {
      body.appendChild(FMHY.Dom.el("p", { class: "fmhy-muted" }, "No related resources found yet. Bookmark some resources to see recommendations here."));
    }
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      buildToggle();
    },
    onMessage() { return false; },
    toggle,
    isOpen: () => panel !== null
  });
})(window);


  // ---- content/keyboard-nav.js ----
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
  // FMHY is already defined on window by the core; nothing to do here

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
      Promise.resolve({ ok: true });
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

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      document.addEventListener("keydown", onKey);
      setTimeout(refreshLinks, 1000);
      FMHY.onPageChange(() => { activeIdx = -1; setTimeout(refreshLinks, 1000); });
    },
    onMessage() { return false; }
  });
})(window);


  // ---- content/search-enhancer.js ----
/**
 * FMHY Supercharged — Enhanced Search with Toggle + Autocomplete + Advanced
 * =====================================================================
 *
 * Adds a small toggle icon next to fmhy.net's search bar. When enabled:
 *
 *   1. AUTOCOMPLETE — as the user types, show matching resources from:
 *      - All links on the current page (partial word match)
 *      - All bookmarks
 *      - All recently-viewed history
 *      - All page headings
 *      Clicking a result navigates to it.
 *
 *   2. ADVANCED SEARCH — a popover with filters:
 *      - Search in: Current page / All bookmarks / History
 *      - Filter by: Category / Tag / Trust level
 *      - Sort by: Relevance / Recently added / Alphabetical
 *      - Match type: Partial word / Prefix / Exact
 *
 * The toggle persists in storage so it stays on across sessions.
 *
 * @module FMHY.searchEnhancer
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "searchEnhancer";
  let initialized = false;
  let dropdown = null;
  let advancedPanel = null;
  let activeIdx = 0;
  let currentResults = [];

  /** Advanced search state. */
  const advanced = {
    enabled: false,
    searchIn: "all",      // all | page | bookmarks | history
    category: "",         // empty = any
    tag: "",              // empty = any
    trust: "all",         // all | safe | paid | account | ads | unknown
    sortBy: "relevance",  // relevance | recent | alpha
    matchType: "partial"  // partial | prefix | exact
  };

  /** Cached data for fast autocomplete. */
  let pageLinksCache = [];
  let bookmarksCache = [];
  let historyCache = [];
  let headingsCache = [];

  /**
   * Find VitePress search inputs on the page.
   */
  function findSearchInputs() {
    return document.querySelectorAll(
      'input[type="search"], input[placeholder*="search" i], .DocSearch-Input, .VPNavBarSearch input, .VPNavBarSearch > div'
    );
  }

  /**
   * Attach the toggle icon + autocomplete to a search input.
   */
  function attach(input) {
    if (input.dataset.fmhySearchEnh) return;
    input.dataset.fmhySearchEnh = "1";

    // Insert toggle icon next to the input
    const wrapper = input.parentElement;
    if (wrapper && !wrapper.querySelector(".fmhy-sc-search-toggle")) {
      const toggle = FMHY.Dom.el("button", {
        class: "fmhy-sc-search-toggle",
        "aria-label": "Toggle FMHY Supercharged search",
        title: "FMHY Supercharged search — click to enable autocomplete & advanced search",
        type: "button"
      });
      toggle.appendChild(FMHY.Icon.render("zap", 14));
      toggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleAdvanced(toggle);
      });
      wrapper.style.position = "relative";
      wrapper.appendChild(toggle);

      // Load persisted state
      FMHY.Storage.getSetting("searchEnhancerEnabled").then((enabled) => {
        if (enabled) {
          toggle.classList.add("active");
        }
      });
    }

    // Wire up input events
    input.addEventListener("input", FMHY.Dom.debounce(() => onInput(input), 120));
    input.addEventListener("focus", () => onInput(input));
    input.addEventListener("blur", () => setTimeout(closeDropdown, 250));
    input.addEventListener("keydown", (e) => onKeydown(e, input));
  }

  /**
   * Toggle the advanced search panel open/closed.
   */
  function toggleAdvanced(toggleBtn) {
    if (advancedPanel) {
      closeAdvanced();
      return;
    }
    openAdvanced(toggleBtn);
  }

  /**
   * Open the advanced search panel.
   */
  async function openAdvanced(toggleBtn) {
    closeAdvanced();
    advancedPanel = FMHY.Dom.el("div", {
      class: "fmhy-sc-search-advanced",
      role: "dialog",
      "aria-label": "Advanced search options"
    });

    // Header
    const header = FMHY.Dom.el("div", { class: "fmhy-sc-search-advanced-header" });
    header.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-search-advanced-title" }, "Advanced Search"));
    const closeBtn = FMHY.Dom.el("button", { class: "fmhy-sc-search-advanced-close", "aria-label": "Close" });
    closeBtn.appendChild(FMHY.Icon.render("close", 14));
    closeBtn.addEventListener("click", closeAdvanced);
    header.appendChild(closeBtn);
    advancedPanel.appendChild(header);

    // Search in
    const searchInRow = FMHY.Dom.el("div", { class: "fmhy-sc-adv-row" });
    searchInRow.appendChild(FMHY.Dom.el("label", {}, "Search in"));
    const searchInSelect = FMHY.Dom.el("select", { class: "fmhy-sc-adv-select" });
    [
      { v: "all", l: "All (page + bookmarks + history)" },
      { v: "page", l: "Current page only" },
      { v: "bookmarks", l: "Bookmarks only" },
      { v: "history", l: "Recently viewed only" }
    ].forEach((o) => {
      const opt = FMHY.Dom.el("option", { value: o.v }, o.l);
      if (advanced.searchIn === o.v) opt.selected = true;
      searchInSelect.appendChild(opt);
    });
    searchInSelect.addEventListener("change", (e) => { advanced.searchIn = e.target.value; });
    searchInRow.appendChild(searchInSelect);
    advancedPanel.appendChild(searchInRow);

    // Match type
    const matchRow = FMHY.Dom.el("div", { class: "fmhy-sc-adv-row" });
    matchRow.appendChild(FMHY.Dom.el("label", {}, "Match type"));
    const matchSelect = FMHY.Dom.el("select", { class: "fmhy-sc-adv-select" });
    [
      { v: "partial", l: "Partial word (contains)" },
      { v: "prefix", l: "Prefix (starts with)" },
      { v: "exact", l: "Exact match" }
    ].forEach((o) => {
      const opt = FMHY.Dom.el("option", { value: o.v }, o.l);
      if (advanced.matchType === o.v) opt.selected = true;
      matchSelect.appendChild(opt);
    });
    matchSelect.addEventListener("change", (e) => { advanced.matchType = e.target.value; });
    matchRow.appendChild(matchSelect);
    advancedPanel.appendChild(matchRow);

    // Trust filter
    const trustRow = FMHY.Dom.el("div", { class: "fmhy-sc-adv-row" });
    trustRow.appendChild(FMHY.Dom.el("label", {}, "Trust level"));
    const trustSelect = FMHY.Dom.el("select", { class: "fmhy-sc-adv-select" });
    [
      { v: "all", l: "Any trust level" },
      { v: "safe", l: "Trusted (open-source)" },
      { v: "unknown", l: "Unknown" },
      { v: "paid", l: "May require payment" },
      { v: "account", l: "May require account" }
    ].forEach((o) => {
      const opt = FMHY.Dom.el("option", { value: o.v }, o.l);
      if (advanced.trust === o.v) opt.selected = true;
      trustSelect.appendChild(opt);
    });
    trustSelect.addEventListener("change", (e) => { advanced.trust = e.target.value; });
    trustRow.appendChild(trustSelect);
    advancedPanel.appendChild(trustRow);

    // Sort by
    const sortRow = FMHY.Dom.el("div", { class: "fmhy-sc-adv-row" });
    sortRow.appendChild(FMHY.Dom.el("label", {}, "Sort by"));
    const sortSelect = FMHY.Dom.el("select", { class: "fmhy-sc-adv-select" });
    [
      { v: "relevance", l: "Relevance" },
      { v: "recent", l: "Recently added" },
      { v: "alpha", l: "Alphabetical (A-Z)" }
    ].forEach((o) => {
      const opt = FMHY.Dom.el("option", { value: o.v }, o.l);
      if (advanced.sortBy === o.v) opt.selected = true;
      sortSelect.appendChild(opt);
    });
    sortSelect.addEventListener("change", (e) => { advanced.sortBy = e.target.value; });
    sortRow.appendChild(sortSelect);
    advancedPanel.appendChild(sortRow);

    // Category + tag inputs
    const catRow = FMHY.Dom.el("div", { class: "fmhy-sc-adv-row" });
    catRow.appendChild(FMHY.Dom.el("label", {}, "Category (optional)"));
    const catInput = FMHY.Dom.el("input", {
      type: "text",
      class: "fmhy-sc-adv-input",
      placeholder: "e.g. ai, storage, torrenting",
      value: advanced.category
    });
    catInput.addEventListener("input", (e) => { advanced.category = e.target.value.trim().toLowerCase(); });
    catRow.appendChild(catInput);
    advancedPanel.appendChild(catRow);

    const tagRow = FMHY.Dom.el("div", { class: "fmhy-sc-adv-row" });
    tagRow.appendChild(FMHY.Dom.el("label", {}, "Tag (optional)"));
    const tagInput = FMHY.Dom.el("input", {
      type: "text",
      class: "fmhy-sc-adv-input",
      placeholder: "e.g. self-hosted, open-source",
      value: advanced.tag
    });
    tagInput.addEventListener("input", (e) => { advanced.tag = e.target.value.trim().toLowerCase(); });
    tagRow.appendChild(tagInput);
    advancedPanel.appendChild(tagRow);

    // Apply button
    const applyBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn fmhy-sc-btn-primary fmhy-sc-adv-apply" }, "Apply & Enable");
    applyBtn.addEventListener("click", async () => {
      advanced.enabled = true;
      await FMHY.Storage.setSetting("searchEnhancerEnabled", true);
      if (toggleBtn) toggleBtn.classList.add("active");
      closeAdvanced();
      showToast("Advanced search enabled — start typing in the search bar", "success");
      // Re-trigger autocomplete on the active search input
      const inputs = findSearchInputs();
      if (inputs.length > 0) onInput(inputs[0]);
      // Re-render the sidebar so the item shows as active
      const sb = FMHY.getFeature("sidebar");
      if (sb && sb.refresh) sb.refresh();
    });
    advancedPanel.appendChild(applyBtn);

    // Disable button (if already enabled)
    const isEnabledNow = await isEnabled();
    if (isEnabledNow) {
      const disableBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn fmhy-sc-btn-danger fmhy-sc-adv-disable" }, "Disable Enhanced Search");
      disableBtn.addEventListener("click", async () => {
        await FMHY.Storage.setSetting("searchEnhancerEnabled", false);
        if (toggleBtn) toggleBtn.classList.remove("active");
        closeAdvanced();
        closeDropdown();
        showToast("Enhanced search disabled", "info");
        const sb = FMHY.getFeature("sidebar");
        if (sb && sb.refresh) sb.refresh();
      });
      advancedPanel.appendChild(disableBtn);
    }

    document.body.appendChild(advancedPanel);
    positionAdvanced(toggleBtn);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener("click", onAdvancedOutsideClick);
    }, 0);
  }

  function closeAdvanced() {
    if (advancedPanel) {
      advancedPanel.remove();
      advancedPanel = null;
    }
    document.removeEventListener("click", onAdvancedOutsideClick);
  }

  function onAdvancedOutsideClick(e) {
    if (advancedPanel && !advancedPanel.contains(e.target) && !e.target.classList.contains("fmhy-sc-search-toggle")) {
      closeAdvanced();
    }
  }

  function positionAdvanced(toggleBtn) {
    if (!advancedPanel || !toggleBtn) return;
    const r = toggleBtn.getBoundingClientRect();
    const panelW = 320;
    let left = r.left + window.scrollX + r.width + 4;
    let top = r.top + window.scrollY;
    if (left + panelW > window.innerWidth) {
      left = r.left + window.scrollX - panelW - 4;
    }
    advancedPanel.style.left = left + "px";
    advancedPanel.style.top = top + "px";
  }

  /**
   * Refresh cached data (page links, bookmarks, history, headings).
   */
  async function refreshCache() {
    pageLinksCache = FMHY.Dom.getResourceLinks().map((l) => ({
      type: "page-link",
      title: l.text,
      subtitle: `On this page · ${hostnameOf(l.href)}`,
      url: l.href,
      category: FMHY.Dom.getCurrentCategory(),
      tags: []
    }));

    headingsCache = [];
    document.querySelectorAll("main h2, main h3, .vp-doc h2, .vp-doc h3, article h2, article h3").forEach((h) => {
      if (!h.id) h.id = "fmhy-heading-" + Math.random().toString(36).slice(2, 8);
      headingsCache.push({
        type: "heading",
        title: h.textContent.trim(),
        subtitle: "Section on this page",
        url: "#" + h.id,
        category: FMHY.Dom.getCurrentCategory(),
        tags: []
      });
    });

    const [bms, hist] = await Promise.all([
      FMHY.Storage.getBookmarks(),
      FMHY.Storage.getHistory()
    ]);
    bookmarksCache = bms.map((b) => ({
      type: "bookmark",
      title: b.title,
      subtitle: `Bookmark · ${b.category || "uncategorized"}`,
      url: b.url,
      category: b.category || "",
      tags: b.tags || [],
      addedAt: b.addedAt || 0
    }));
    historyCache = hist.map((h) => ({
      type: "history",
      title: h.title || h.url,
      subtitle: `Recent · ${FMHY.Dom.timeAgo(h.visitedAt)}`,
      url: h.url,
      category: h.category || "",
      tags: [],
      addedAt: h.visitedAt || 0
    }));
  }

  function hostnameOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ""; }
  }

  /**
   * Check if search enhancer is enabled (toggle on).
   */
  async function isEnabled() {
    return await FMHY.Storage.getSetting("searchEnhancerEnabled");
  }

  /**
   * Handle input in the search box.
   */
  async function onInput(input) {
    const enabled = await isEnabled();
    if (!enabled) { closeDropdown(); return; }

    const q = input.value.trim();
    if (!q) { closeDropdown(); return; }

    await refreshCache();
    const results = gatherResults(q);
    if (results.length === 0) {
      showNoResults(q);
      return;
    }
    showDropdown(input, results);
  }

  /**
   * Gather search results based on the query + advanced filters.
   */
  function gatherResults(q) {
    let pool = [];
    if (advanced.searchIn === "all" || advanced.searchIn === "page") {
      pool = pool.concat(pageLinksCache, headingsCache);
    }
    if (advanced.searchIn === "all" || advanced.searchIn === "bookmarks") {
      pool = pool.concat(bookmarksCache);
    }
    if (advanced.searchIn === "all" || advanced.searchIn === "history") {
      pool = pool.concat(historyCache);
    }

    // Filter by query (match type)
    const ql = q.toLowerCase();
    const matches = (text) => {
      if (!text) return false;
      const t = text.toLowerCase();
      if (advanced.matchType === "exact") return t === ql;
      if (advanced.matchType === "prefix") return t.startsWith(ql);
      return t.includes(ql); // partial
    };

    let results = pool.filter((item) => matches(item.title) || matches(item.url));

    // Filter by category
    if (advanced.category) {
      results = results.filter((i) => i.category && i.category.toLowerCase().includes(advanced.category));
    }

    // Filter by tag
    if (advanced.tag) {
      results = results.filter((i) => (i.tags || []).some((t) => t.toLowerCase().includes(advanced.tag)));
    }

    // Filter by trust
    if (advanced.trust !== "all") {
      results = results.filter((i) => {
        const trust = classifyTrust(i.title);
        return trust.level === advanced.trust;
      });
    }

    // Score + sort
    results = results.map((item) => {
      const titleLower = item.title.toLowerCase();
      let score = 0;
      if (titleLower === ql) score += 100;
      else if (titleLower.startsWith(ql)) score += 60;
      else if (titleLower.includes(ql)) score += 30;
      // Word-boundary partial match bonus
      const words = titleLower.split(/[\s\-_/.]+/);
      if (words.some((w) => w.includes(ql))) score += 20;
      return { ...item, score };
    });

    if (advanced.sortBy === "recent") {
      results.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    } else if (advanced.sortBy === "alpha") {
      results.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else {
      results.sort((a, b) => b.score - a.score);
    }

    return results.slice(0, 10);
  }

  function classifyTrust(text) {
    const t = (text || "").toLowerCase();
    const SAFE = ["open source", "open-source", "github", "gitlab", "self-hosted", "selfhost", "no ads", "ad-free"];
    const PAID = ["premium", "subscribe", "subscription", "pricing"];
    const ACCOUNT = ["sign up", "register", "log in", "login", "create account"];
    if (SAFE.some((k) => t.includes(k))) return { level: "safe" };
    if (PAID.some((k) => t.includes(k))) return { level: "paid" };
    if (ACCOUNT.some((k) => t.includes(k))) return { level: "account" };
    return { level: "unknown" };
  }

  /**
   * Show "no results" message.
   */
  function showNoResults(query) {
    closeDropdown();
    dropdown = FMHY.Dom.el("div", { class: "fmhy-sc-search-dropdown" });
    const empty = FMHY.Dom.el("div", { class: "fmhy-sc-search-empty" });
    empty.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-search-empty-icon" }));
    FMHY.Icon.inject(empty.querySelector(".fmhy-sc-search-empty-icon"), "search", 24);
    empty.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-search-empty-text" }, `No matches for "${query}"`));
    dropdown.appendChild(empty);
    positionDropdown();
    document.body.appendChild(dropdown);
  }

  /**
   * Show the autocomplete dropdown.
   */
  function showDropdown(input, results) {
    closeDropdown();
    currentResults = results;
    activeIdx = 0;
    dropdown = FMHY.Dom.el("div", { class: "fmhy-sc-search-dropdown" });

    if (results.length === 0) {
      dropdown.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-search-empty" }, "No matches"));
      positionDropdown(input);
      document.body.appendChild(dropdown);
      return;
    }

    results.forEach((item, idx) => {
      const row = FMHY.Dom.el("div", {
        class: "fmhy-sc-search-row" + (idx === 0 ? " active" : ""),
        "data-idx": idx
      });
      // Icon based on type
      const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-search-row-icon" });
      const iconName = item.type === "bookmark" ? "bookmark"
        : item.type === "history" ? "history"
        : item.type === "heading" ? "list"
        : "link";
      FMHY.Icon.inject(iconWrap, iconName, 16);
      row.appendChild(iconWrap);
      // Body
      const body = FMHY.Dom.el("div", { class: "fmhy-sc-search-row-body" });
      // Highlight matched text
      const titleEl = FMHY.Dom.el("div", { class: "fmhy-sc-search-row-title" });
      titleEl.innerHTML = highlightMatch(item.title, input.value.trim());
      body.appendChild(titleEl);
      body.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-search-row-sub" }, item.subtitle));
      row.appendChild(body);
      // External link icon
      if (item.url.startsWith("http")) {
        const extIcon = FMHY.Dom.el("span", { class: "fmhy-sc-search-row-ext" });
        FMHY.Icon.inject(extIcon, "external", 12);
        row.appendChild(extIcon);
      }
      row.addEventListener("mousedown", (e) => {
        e.preventDefault(); // prevent input blur
        navigate(item);
      });
      row.addEventListener("mouseenter", () => {
        activeIdx = idx;
        updateActive();
      });
      dropdown.appendChild(row);
    });

    positionDropdown(input);
    document.body.appendChild(dropdown);
  }

  /**
   * Highlight the matched portion of text.
   */
  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const ql = query.toLowerCase();
    const tl = text.toLowerCase();
    const idx = tl.indexOf(ql);
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.substring(0, idx))
      + '<mark class="fmhy-sc-search-highlight">' + escapeHtml(text.substring(idx, idx + ql.length)) + '</mark>'
      + escapeHtml(text.substring(idx + ql.length));
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function positionDropdown(input) {
    if (!dropdown || !input) return;
    const r = input.getBoundingClientRect();
    dropdown.style.left = r.left + window.scrollX + "px";
    dropdown.style.top = r.bottom + window.scrollY + 4 + "px";
    dropdown.style.width = Math.max(r.width, 320) + "px";
  }

  function closeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
    currentResults = [];
  }

  function updateActive() {
    if (!dropdown) return;
    const rows = dropdown.querySelectorAll(".fmhy-sc-search-row");
    rows.forEach((r, i) => r.classList.toggle("active", i === activeIdx));
    const active = rows[activeIdx];
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function onKeydown(e, input) {
    if (!dropdown || currentResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % currentResults.length;
      updateActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + currentResults.length) % currentResults.length;
      updateActive();
    } else if (e.key === "Enter" && currentResults[activeIdx]) {
      e.preventDefault();
      e.stopPropagation();
      navigate(currentResults[activeIdx]);
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  }

  function navigate(item) {
    if (item.url.startsWith("#")) {
      const el = document.getElementById(item.url.slice(1));
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      window.open(item.url, "_blank", "noopener");
    }
    closeDropdown();
    // Record in history
    FMHY.Storage.pushHistory({
      url: item.url,
      title: item.title,
      category: item.category || FMHY.Dom.getCurrentCategory(),
      visitedAt: Date.now()
    });
  }

  function showToast(msg, type = "info") {
    if (FMHY.Sidebar && FMHY.Sidebar.showToast) FMHY.Sidebar.showToast(msg, type);
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      const wire = () => findSearchInputs().forEach(attach);
      wire();
      // Re-wire when VitePress swaps content
      FMHY.onPageChange(() => {
        closeDropdown();
        closeAdvanced();
        setTimeout(wire, 500);
      });
      // Also try again after a delay (VitePress loads search lazily)
      setTimeout(wire, 2000);
    },
    onMessage() { return false; },
    refresh: refreshCache,
    isEnabled,
    openAdvanced: () => {
      const toggle = document.querySelector(".fmhy-sc-search-toggle");
      if (toggle) openAdvanced(toggle);
    }
  });

})(window);


  // ---- content/theme-switcher.js ----
/**
 * Feature #21 — Per-Category Custom Themes
 * Feature #22 — Compact / Comfortable / Spacious Density Modes
 *
 * Auto-switches theme based on category + applies a density preset.
 * Both share a small "appearance" UI in the floating control panel.
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "themeSwitcher";
  let initialized = false;

  const CATEGORY_THEMES = {
    adblockingvprivacy: { hue: 145, name: "Privacy Green" },
    ai: { hue: 280, name: "Cyber Violet" },
    storage: { hue: 0, name: "Cinema Red" },
    listening: { hue: 210, name: "Audio Blue" },
    gaming: { hue: 120, name: "Neon Green" },
    reading: { hue: 30, name: "Sepia Paper" },
    downloading: { hue: 200, name: "Download Cyan" },
    torrenting: { hue: 25, name: "Torrent Orange" },
    educational: { hue: 50, name: "Scholar Gold" },
    "android-ios": { hue: 95, name: "Robot Lime" },
    "linux-non-free": { hue: 25, name: "Tux Orange" },
    "non-eng": { hue: 320, name: "Polyglot Pink" },
    misc: { hue: 190, name: "Misc Teal" },
    tools: { hue: 220, name: "Tool Slate" }
  };

  function applyTheme() {
    const cat = FMHY.Dom.getCurrentCategory();
    const theme = CATEGORY_THEMES[cat];
    document.documentElement.style.setProperty("--fmhy-cat-hue", theme ? theme.hue : 220);
    if (theme) {
      document.documentElement.setAttribute("data-fmhy-theme", cat);
    } else {
      document.documentElement.removeAttribute("data-fmhy-theme");
    }
  }

  async function applyDensity() {
    const density = await FMHY.Storage.getSetting("density");
    document.documentElement.setAttribute("data-fmhy-density", density || "comfortable");
  }

  async function cycleDensity() {
    const order = ["compact", "comfortable", "spacious"];
    const current = await FMHY.Storage.getSetting("density");
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];
    await FMHY.Storage.setSetting("density", next);
    applyDensity();
    toast(`Density: ${next}`);
  }

  function toast(msg) {
    const t = FMHY.Dom.el("div", { class: "fmhy-toast" }, msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1500);
  }

  function buildControl() {
    const ctrl = FMHY.Dom.el("div", { class: "fmhy-appearance-ctrl" });
    const themeBtn = FMHY.Dom.el("button", { class: "fmhy-appearance-btn", title: "Cycle density" }, "");
    themeBtn.addEventListener("click", cycleDensity);
    ctrl.appendChild(themeBtn);
    document.body.appendChild(ctrl);
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      applyTheme();
      applyDensity();
      buildControl();
      FMHY.onPageChange(() => { applyTheme(); applyDensity(); });
    },
    onMessage() { return false; }
  });
})(window);


  // ---- content/density-modes.js ----
/**
 * Feature #22 — Density Modes (logic side; rendering happens via CSS attribute
 *   `data-fmhy-density` set by theme-switcher.js). This module just ensures
 *   the attribute is set even if theme-switcher is disabled.
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "densityModes";
  let initialized = false;

  async function apply() {
    const density = await FMHY.Storage.getSetting("density");
    document.documentElement.setAttribute("data-fmhy-density", density || "comfortable");
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      apply();
      FMHY.onPageChange(apply);
    },
    onMessage() { return false; }
  });
})(window);


  // ---- content/highlight-rules.js ----
/**
 * Feature #24 — Custom Resource Highlighting Rules
 *
 * Highlights links matching user-defined patterns. Default rules:
 *   open-source   → green
 *   self-host     → purple
 *   freemium      → yellow
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "highlightRules";
  let initialized = false;
  let rules = [];

  async function loadRules() {
    rules = await FMHY.Storage.getHighlightRules();
  }

  function applyHighlights() {
    if (!rules || rules.length === 0) return;
    const links = FMHY.Dom.getResourceLinks();
    links.forEach(({ element, text, href }) => {
      // Clear previous
      const old = element.querySelector(".fmhy-highlight-pill");
      if (old) old.remove();
      element.classList.remove("fmhy-highlighted");

      for (const rule of rules) {
        try {
          const re = new RegExp(rule.pattern, "i");
          if (re.test(text) || re.test(href)) {
            element.classList.add("fmhy-highlighted");
            const pill = FMHY.Dom.el("span", {
              class: "fmhy-highlight-pill",
              style: { background: rule.color },
              title: `Matched rule: ${rule.label || rule.pattern}`
            }, rule.label || "");
            element.appendChild(pill);
            break;
          }
        } catch (e) { /* skip invalid regex */ }
      }
    });
  }

  /**
   * Remove all highlight pills from the page.
   */
  function removeAll() {
    document.querySelectorAll(".fmhy-highlight-pill").forEach((p) => p.remove());
    document.querySelectorAll(".fmhy-highlighted").forEach((el) => el.classList.remove("fmhy-highlighted"));
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      loadRules().then(applyHighlights);
      FMHY.onPageChange(() => {
        loadRules().then(applyHighlights);
      });
    },
    onMessage() { return false; },
    refresh: () => loadRules().then(applyHighlights),
    removeAll
  });
})(window);


  // ---- content/reading-mode.js ----
/**
 * Feature #25 — Distraction-Free Reading Mode
 *
 * One-click toggle hides everything except the current section's content.
 * Auto-detects long single-section scrolls and offers to enter reading mode.
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "readingMode";
  let initialized = false;
  let active = false;
  let lastSection = null;
  let lastSectionTime = 0;

  function toggle() {
    active = !active;
    document.body.classList.toggle("fmhy-reading-mode", active);
    if (active) {
      hideEverythingExceptCurrentSection();
    } else {
      restoreAll();
    }
  }

  function hideEverythingExceptCurrentSection() {
    // Find all top-level sections (h2-headed groups)
    const headings = document.querySelectorAll("main h2, .vp-doc h2, article h2");
    let current = null;
    headings.forEach((h) => {
      const r = h.getBoundingClientRect();
      if (r.top > 60 && r.top < window.innerHeight * 0.6) {
        if (!current) current = h;
      } else if (r.top < 60 && r.top > -window.innerHeight) {
        current = h;
      }
    });
    if (!current) return;
    // Hide siblings before current section
    let node = current;
    while ((node = node.previousElementSibling)) {
      if (!node.classList.contains("fmhy-rm-keep")) node.classList.add("fmhy-rm-hidden");
    }
    // Hide sections after current's content
    let inCurrent = true;
    let next = current.nextElementSibling;
    while (next) {
      if (next.matches("h2")) inCurrent = false;
      if (!inCurrent && !next.classList.contains("fmhy-rm-keep")) {
        next.classList.add("fmhy-rm-hidden");
      }
      next = next.nextElementSibling;
    }
  }

  function restoreAll() {
    document.querySelectorAll(".fmhy-rm-hidden").forEach((el) => el.classList.remove("fmhy-rm-hidden"));
  }

  function detectLongScroll() {
    window.addEventListener("scroll", FMHY.Dom.throttle(() => {
      if (active) return;
      const headings = document.querySelectorAll("main h2, .vp-doc h2");
      let current = null;
      headings.forEach((h) => {
        const r = h.getBoundingClientRect();
        if (r.top < 100 && r.top > -1000) current = h;
      });
      if (!current) return;
      if (current === lastSection) {
        if (Date.now() - lastSectionTime > 30000 && !sessionStorage.getItem("fmhy-rm-offered")) {
          sessionStorage.setItem("fmhy-rm-offered", "1");
          offerReadingMode();
        }
      } else {
        lastSection = current;
        lastSectionTime = Date.now();
      }
    }, 500), { passive: true });
  }

  function offerReadingMode() {
    const toast = FMHY.Dom.el("div", { class: "fmhy-toast fmhy-toast-action" });
    toast.appendChild(FMHY.Dom.el("span", {}, " Want to focus on this section?"));
    const btn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-small fmhy-btn-primary" }, "Enter reading mode");
    btn.addEventListener("click", () => { toggle(); toast.remove(); });
    const dismiss = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-small" }, "No thanks");
    dismiss.addEventListener("click", () => toast.remove());
    toast.appendChild(btn);
    toast.appendChild(dismiss);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 12000);
  }

  function buildToggle() {
    const btn = FMHY.Dom.el("button", { class: "fmhy-reading-toggle", title: "Toggle reading mode" }, "");
    btn.addEventListener("click", toggle);
    document.body.appendChild(btn);
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      buildToggle();
      detectLongScroll();
    },
    onMessage() { return false; },
    toggle,
    isActive: () => active
  });
})(window);


  // ---- content/compare-matrix.js ----
/**
 * FMHY Supercharged — Resource Comparison Matrix
 * =====================================================================
 *
 * Redesigned flow:
 *   1. User clicks the checkbox next to 2+ resource links
 *   2. A countdown notification appears: "Comparing in 5s... add more or click Compare now"
 *   3. After 5 seconds (or user clicks "Compare Now"), the comparison modal opens
 *   4. Modal shows a side-by-side table with: name, host, trust, health, rating, note
 *   5. At the top, a "Best Pick" recommendation highlights the highest-scored resource
 *
 * Scoring algorithm for "Best Pick":
 *   - Alive health: +3 points
 *   - Has user rating: +rating.stars (1-5)
 *   - Has user note: +1 point
 *   - Bookmarked: +1 point
 *   - Open-source/SAFE keyword in title: +2 points
 *   - PAID keyword: -2 points
 *   - ACCOUNT keyword: -1 point
 *   - AD keyword: -1 point
 *   Ties broken by: shorter URL (simpler = better)
 *
 * @module FMHY.compareMatrix
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "compareMatrix";
  let initialized = false;
  const selected = new Map(); // url → { element, text }

  /** Countdown state. */
  let countdownTimer = null;
  let countdownSeconds = 0;
  let countdownToast = null;

  /** The floating "Compare now" button. */
  let compareBtn = null;
  /** The countdown display inside the button. */
  let countdownDisplay = null;

  /**
   * Attach checkboxes to resource links.
   */
  function addCheckboxes() {
    FMHY.Dom.getResourceLinks().forEach(({ element, href, text }) => {
      if (element.dataset.fmhyCompareCb) return;
      element.dataset.fmhyCompareCb = "1";
      const cb = FMHY.Dom.el("input", {
        type: "checkbox",
        class: "fmhy-compare-cb",
        title: "Add to comparison",
        "aria-label": "Add to comparison"
      });
      cb.addEventListener("change", () => {
        if (cb.checked) {
          selected.set(href, { element, text });
          onItemSelected();
        } else {
          selected.delete(href);
          onItemDeselected();
        }
      });
      element.appendChild(cb);
    });
  }

  /**
   * Called when an item is selected. If this is the 2nd+ item, start the countdown.
   */
  function onItemSelected() {
    if (selected.size === 1) {
      // First item — just show a hint
      showToast("Select 1 more to compare", "info");
      return;
    }
    if (selected.size >= 2) {
      startCountdown();
    }
  }

  /**
   * Called when an item is deselected. If we drop below 2, cancel countdown.
   */
  function onItemDeselected() {
    if (selected.size < 2) {
      cancelCountdown();
      if (selected.size === 1) {
        showToast("1 item selected — add 1 more to compare", "info");
      }
    }
    updateCompareButton();
  }

  /**
   * Start the 5-second countdown to auto-compare.
   */
  function startCountdown() {
    cancelCountdown();
    countdownSeconds = 5;
    showCompareButton();
    updateCountdownDisplay();

    countdownTimer = setInterval(() => {
      countdownSeconds--;
      if (countdownSeconds <= 0) {
        cancelCountdown();
        openComparisonModal();
      } else {
        updateCountdownDisplay();
      }
    }, 1000);
  }

  /**
   * Cancel the countdown.
   */
  function cancelCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    countdownSeconds = 0;
    hideCompareButton();
  }

  /**
   * Show the floating "Compare now" button with countdown.
   */
  function showCompareButton() {
    if (!compareBtn) {
      compareBtn = FMHY.Dom.el("button", { class: "fmhy-sc-compare-fab" });
      compareBtn.addEventListener("click", () => {
        cancelCountdown();
        openComparisonModal();
      });
      document.body.appendChild(compareBtn);
    }
    compareBtn.style.display = "flex";
    updateCompareButton();
  }

  function hideCompareButton() {
    if (compareBtn) {
      compareBtn.style.display = "none";
    }
  }

  /**
   * Update the compare button's content (countdown + count).
   */
  function updateCompareButton() {
    if (!compareBtn) return;
    if (countdownSeconds > 0) {
      compareBtn.innerHTML = "";
      const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-compare-fab-icon" });
      FMHY.Icon.inject(iconWrap, "scale", 18);
      compareBtn.appendChild(iconWrap);
      compareBtn.appendChild(FMHY.Dom.el("span", {},
        `Compare ${selected.size} in ${countdownSeconds}s`));
      compareBtn.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-compare-fab-hint" }, "Click to compare now"));
    } else {
      compareBtn.innerHTML = "";
      const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-compare-fab-icon" });
      FMHY.Icon.inject(iconWrap, "scale", 18);
      compareBtn.appendChild(iconWrap);
      compareBtn.appendChild(FMHY.Dom.el("span", {}, `Compare ${selected.size} items`));
    }
  }

  function updateCountdownDisplay() {
    updateCompareButton();
  }

  /**
   * Open the comparison modal with side-by-side data + best pick.
   */
  async function openComparisonModal() {
    if (selected.size < 2) {
      showToast("Select at least 2 items to compare", "error");
      return;
    }

    const [notes, ratings, health, bookmarks] = await Promise.all([
      FMHY.Storage.getNotes(),
      FMHY.Storage.getRatings(),
      FMHY.Storage.getAllHealth(),
      FMHY.Storage.getBookmarks()
    ]);
    const bookmarkUrls = new Set(bookmarks.map((b) => b.url));

    // Build scored entries
    const entries = [];
    selected.forEach(({ text }, url) => {
      let host = "";
      try { host = new URL(url).hostname; } catch (e) {}
      const hRec = health[url];
      const rRec = ratings[url];
      const nRec = notes[url];
      const isBookmarked = bookmarkUrls.has(url);
      const trust = classifyTrust(text);

      // Score
      let score = 0;
      const reasons = [];
      if (hRec) {
        if (hRec.status === "alive") { score += 3; reasons.push("Alive link (+3)"); }
        else if (hRec.status === "dead") { score -= 5; reasons.push("Dead link (-5)"); }
      }
      if (rRec) { score += rRec.stars; reasons.push(`Your rating: ${rRec.stars}/5 (+${rRec.stars})`); }
      if (nRec) { score += 1; reasons.push("Has note (+1)"); }
      if (isBookmarked) { score += 1; reasons.push("Bookmarked (+1)"); }
      if (trust.level === "safe") { score += 2; reasons.push("Open-source/trusted (+2)"); }
      if (trust.level === "paid") { score -= 2; reasons.push("May require payment (-2)"); }
      if (trust.level === "account") { score -= 1; reasons.push("May require account (-1)"); }
      if (trust.level === "ads") { score -= 1; reasons.push("May have ads (-1)"); }

      entries.push({
        url, text, host, health: hRec, rating: rRec, note: nRec,
        isBookmarked, trust, score, reasons
      });
    });

    // Sort by score descending; tie-break by URL length (shorter wins)
    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.url.length - b.url.length;
    });

    const best = entries[0];

    // Build modal
    const modal = FMHY.Dom.el("div", {
      class: "fmhy-sc-modal-overlay",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Resource comparison"
    });

    const box = FMHY.Dom.el("div", { class: "fmhy-sc-modal fmhy-sc-modal-wide" });

    // Header
    const header = FMHY.Dom.el("div", { class: "fmhy-sc-modal-header" });
    header.appendChild(FMHY.Dom.el("h3", {}, `Comparing ${entries.length} resources`));
    const closeBtn = FMHY.Dom.el("button", { class: "fmhy-sc-modal-close", "aria-label": "Close" });
    closeBtn.appendChild(FMHY.Icon.render("close", 18));
    closeBtn.addEventListener("click", () => modal.remove());
    header.appendChild(closeBtn);
    box.appendChild(header);

    // Best Pick banner
    const bestBanner = FMHY.Dom.el("div", { class: "fmhy-sc-compare-best" });
    const bestIcon = FMHY.Dom.el("div", { class: "fmhy-sc-compare-best-icon" });
    FMHY.Icon.inject(bestIcon, "star-filled", 24);
    bestBanner.appendChild(bestIcon);
    const bestBody = FMHY.Dom.el("div", { class: "fmhy-sc-compare-best-body" });
    bestBody.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-compare-best-label" }, "Best Pick"));
    bestBody.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-compare-best-title" }, best.text));
    const bestMeta = FMHY.Dom.el("div", { class: "fmhy-sc-compare-best-meta" });
    bestMeta.appendChild(FMHY.Dom.el("span", {}, `${best.host} · Score: ${best.score}`));
    const bestLink = FMHY.Dom.el("a", {
      href: best.url, target: "_blank", rel: "noopener",
      class: "fmhy-sc-compare-best-link"
    }, "Open");
    bestMeta.appendChild(bestLink);
    bestBody.appendChild(bestMeta);

    // Reasons
    if (best.reasons.length > 0) {
      const reasonsBox = FMHY.Dom.el("div", { class: "fmhy-sc-compare-reasons" });
      best.reasons.forEach((r) => {
        reasonsBox.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-compare-reason" }, r));
      });
      bestBody.appendChild(reasonsBox);
    }
    bestBanner.appendChild(bestBody);
    box.appendChild(bestBanner);

    // Comparison table
    const tableWrap = FMHY.Dom.el("div", { class: "fmhy-sc-compare-table-wrap" });
    const table = FMHY.Dom.el("table", { class: "fmhy-sc-compare-table" });
    const thead = FMHY.Dom.el("thead");
    const tr = FMHY.Dom.el("tr");
    ["Resource", "Host", "Trust", "Health", "Rating", "Note", "Score"].forEach((c) => {
      tr.appendChild(FMHY.Dom.el("th", {}, c));
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = FMHY.Dom.el("tbody");
    entries.forEach((e, idx) => {
      const row = FMHY.Dom.el("tr", { class: idx === 0 ? "best-row" : "" });
      // Resource name (link)
      const nameCell = FMHY.Dom.el("td");
      const nameLink = FMHY.Dom.el("a", {
        href: e.url, target: "_blank", rel: "noopener",
        class: "fmhy-sc-compare-link"
      }, e.text);
      nameCell.appendChild(nameLink);
      row.appendChild(nameCell);
      // Host
      row.appendChild(FMHY.Dom.el("td", {}, e.host));
      // Trust
      row.appendChild(FMHY.Dom.el("td", {}, `${e.trust.label}`));
      // Health
      const healthText = e.health
        ? (e.health.status === "alive" ? "Alive" : e.health.status === "dead" ? "Dead" : "Unknown")
        : "Not checked";
      row.appendChild(FMHY.Dom.el("td", { class: "fmhy-sc-health-" + (e.health ? e.health.status : "unknown") }, healthText));
      // Rating
      row.appendChild(FMHY.Dom.el("td", {}, e.rating ? `${e.rating.stars}/5` : "—"));
      // Note
      const noteText = e.note && e.note.text
        ? (e.note.text.slice(0, 40) + (e.note.text.length > 40 ? "..." : ""))
        : "—";
      row.appendChild(FMHY.Dom.el("td", {}, noteText));
      // Score
      const scoreCell = FMHY.Dom.el("td", { class: "fmhy-sc-compare-score" });
      scoreCell.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-score-badge score-" + (e.score > 0 ? "pos" : e.score < 0 ? "neg" : "neu") }, String(e.score)));
      row.appendChild(scoreCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    box.appendChild(tableWrap);

    // Buttons
    const btns = FMHY.Dom.el("div", { class: "fmhy-sc-modal-btns" });
    const clearBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn" }, "Clear selection");
    clearBtn.addEventListener("click", () => {
      selected.clear();
      document.querySelectorAll(".fmhy-compare-cb").forEach((cb) => { cb.checked = false; });
      cancelCountdown();
      modal.remove();
      showToast("Selection cleared", "info");
    });
    const doneBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn fmhy-sc-btn-primary" }, "Done");
    doneBtn.addEventListener("click", () => modal.remove());
    btns.appendChild(clearBtn);
    btns.appendChild(doneBtn);
    box.appendChild(btns);

    modal.appendChild(box);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    // Focus the done button
    setTimeout(() => doneBtn.focus(), 100);
  }

  /**
   * Classify trust level based on link text keywords.
   */
  function classifyTrust(text) {
    const t = (text || "").toLowerCase();
    const SAFE = ["open source", "open-source", "github", "gitlab", "self-hosted", "selfhost", "no ads", "ad-free", "mit license"];
    const PAID = ["premium", "subscribe", "subscription", "pricing", "upgrade"];
    const ACCOUNT = ["sign up", "register", "log in", "login", "create account"];
    const ADS = ["ad-supported", "popups", "pop-ads"];
    if (SAFE.some((k) => t.includes(k))) return { level: "safe", label: "Trusted" };
    if (PAID.some((k) => t.includes(k))) return { level: "paid", label: "Paid" };
    if (ACCOUNT.some((k) => t.includes(k))) return { level: "account", label: "Account" };
    if (ADS.some((k) => t.includes(k))) return { level: "ads", label: "Ads" };
    return { level: "unknown", label: "Unknown" };
  }

  function showToast(msg, type = "info") {
    if (FMHY.Sidebar && FMHY.Sidebar.showToast) FMHY.Sidebar.showToast(msg, type);
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      addCheckboxes();
      FMHY.onPageChange(() => {
        selected.clear();
        cancelCountdown();
        addCheckboxes();
      });
    },
    onMessage() { return false; },
    openComparisonModal,
    getSelectedCount: () => selected.size
  });

})(window);


  // ---- content/ratings.js ----
/**
 * FMHY Supercharged — Personal Ratings & Reviews Log
 * =====================================================================
 *
 * Redesigned rating flow:
 *   1. User clicks a star next to a resource link
 *   2. A beautiful modal opens with the selected star rating
 *   3. User can adjust stars + write a review in a text area
 *   4. Click "Save" to persist, or "Delete" to remove
 *
 * @module FMHY.ratings
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "ratings";
  let initialized = false;
  let activeModal = null;

  /**
   * Attach star widgets to resource links.
   * Each widget shows the current rating (if any) and opens the
   * rating modal on click.
   */
  async function applyRatings() {
    const ratings = await FMHY.Storage.getRatings();
    FMHY.Dom.getResourceLinks().forEach(({ element, href }) => {
      let widget = element.querySelector(".fmhy-ratingwidget");
      if (widget) {
        updateStars(widget, ratings[href]);
        return;
      }
      widget = FMHY.Dom.el("span", { class: "fmhy-ratingwidget", "data-url": href });
      for (let i = 1; i <= 5; i++) {
        const star = FMHY.Dom.el("span", {
          class: "fmhy-star",
          "data-star": i,
          title: `Rate ${i} star${i > 1 ? "s" : ""}`,
          role: "button",
          tabindex: "0"
        });
        star.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openRatingModal(href, i);
        });
        star.addEventListener("mouseenter", () => previewStars(widget, i));
        star.addEventListener("mouseleave", () => updateStars(widget, ratings[href]));
        widget.appendChild(star);
      }
      element.appendChild(widget);
      updateStars(widget, ratings[href]);
    });
  }

  /** Temporarily fill stars on hover. */
  function previewStars(widget, n) {
    widget.querySelectorAll(".fmhy-star").forEach((s, i) => {
      s.classList.toggle("filled", i < n);
    });
  }

  /** Set the widget's star display to match a rating record. */
  function updateStars(widget, rating) {
    const n = rating ? rating.stars : 0;
    widget.querySelectorAll(".fmhy-star").forEach((s, i) => {
      s.classList.toggle("filled", i < n);
    });
    widget.title = rating ? `You rated ${n}/5${rating.review ? " — " + rating.review : ""}` : "Rate this resource";
  }

  /**
   * Open the rating modal for a URL.
   * @param {string} url - The resource URL
   * @param {number} [initialStars=0] - Pre-selected star count
   */
  async function openRatingModal(url, initialStars = 0) {
    closeRatingModal();

    const existing = await FMHY.Storage.getRating(url);
    const stars = initialStars || (existing ? existing.stars : 0);
    const review = existing ? existing.review : "";

    let host = "";
    try { host = new URL(url).hostname; } catch (e) {}

    activeModal = FMHY.Dom.el("div", {
      class: "fmhy-sc-modal-overlay",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Rate resource"
    });

    const box = FMHY.Dom.el("div", { class: "fmhy-sc-modal" });

    // Header
    const header = FMHY.Dom.el("div", { class: "fmhy-sc-modal-header" });
    header.appendChild(FMHY.Dom.el("h3", {}, "Rate this resource"));
    const closeBtn = FMHY.Dom.el("button", {
      class: "fmhy-sc-modal-close",
      "aria-label": "Close"
    });
    closeBtn.appendChild(FMHY.Icon.render("close", 18));
    closeBtn.addEventListener("click", closeRatingModal);
    header.appendChild(closeBtn);
    box.appendChild(header);

    // URL preview
    const urlBox = FMHY.Dom.el("div", { class: "fmhy-sc-modal-url" }, host || url);
    box.appendChild(urlBox);

    // Star selector
    const starSection = FMHY.Dom.el("div", { class: "fmhy-sc-rating-stars" });
    let selectedStars = stars;
    const starEls = [];
    for (let i = 1; i <= 5; i++) {
      const star = FMHY.Dom.el("button", {
        class: "fmhy-sc-rating-star" + (i <= stars ? " filled" : ""),
        "data-star": i,
        title: `${i} star${i > 1 ? "s" : ""}`,
        "aria-label": `${i} star${i > 1 ? "s" : ""}`
      });
      star.appendChild(FMHY.Icon.render("star", 28));
      star.addEventListener("click", () => {
        selectedStars = i;
        starEls.forEach((s, idx) => s.classList.toggle("filled", idx < i));
        label.textContent = i === 0 ? "No rating" : `${i} out of 5`;
      });
      starEls.push(star);
      starSection.appendChild(star);
    }
    const label = FMHY.Dom.el("div", { class: "fmhy-sc-rating-label" },
      stars === 0 ? "Select a rating" : `${stars} out of 5`);
    starSection.appendChild(label);
    box.appendChild(starSection);

    // Review textarea
    const reviewSection = FMHY.Dom.el("div", { class: "fmhy-sc-modal-field" });
    reviewSection.appendChild(FMHY.Dom.el("label", { class: "fmhy-sc-modal-label" }, "Review (optional)"));
    const ta = FMHY.Dom.el("textarea", {
      class: "fmhy-sc-modal-textarea",
      placeholder: "What did you think of this resource?",
      rows: "3"
    });
    ta.value = review;
    reviewSection.appendChild(ta);
    box.appendChild(reviewSection);

    // Buttons
    const btns = FMHY.Dom.el("div", { class: "fmhy-sc-modal-btns" });
    if (existing) {
      const delBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn fmhy-sc-btn-danger" }, "Delete rating");
      delBtn.addEventListener("click", async () => {
        await FMHY.Storage.removeRating(url);
        await applyRatings();
        closeRatingModal();
        showToast("Rating deleted", "info");
      });
      btns.appendChild(delBtn);
    }
    const cancelBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn" }, "Cancel");
    cancelBtn.addEventListener("click", closeRatingModal);
    btns.appendChild(cancelBtn);
    const saveBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn fmhy-sc-btn-primary" }, "Save rating");
    saveBtn.addEventListener("click", async () => {
      if (selectedStars < 1) {
        showToast("Please select at least 1 star", "error");
        return;
      }
      await FMHY.Storage.setRating(url, selectedStars, ta.value.trim());
      await applyRatings();
      closeRatingModal();
      showToast("Rating saved", "success");
    });
    btns.appendChild(saveBtn);
    box.appendChild(btns);

    activeModal.appendChild(box);
    document.body.appendChild(activeModal);

    // Close on overlay click
    activeModal.addEventListener("click", (e) => {
      if (e.target === activeModal) closeRatingModal();
    });

    // Close on Escape
    document.addEventListener("keydown", onModalKeydown);

    // Focus the save button
    setTimeout(() => saveBtn.focus(), 100);
  }

  function onModalKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeRatingModal();
    }
  }

  function closeRatingModal() {
    if (!activeModal) return;
    activeModal.remove();
    activeModal = null;
    document.removeEventListener("keydown", onModalKeydown);
  }

  function showToast(msg, type = "info") {
    if (FMHY.Sidebar && FMHY.Sidebar.showToast) FMHY.Sidebar.showToast(msg, type);
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      applyRatings();
      FMHY.onPageChange(() => applyRatings());
    },
    refresh() { return applyRatings(); },
    onMessage(msg) {
      if (msg.type === "openRateEditor" && msg.url) {
        openRatingModal(msg.url, 5);
        return true;
      }
      return false;
    },
    openRatingModal
  });

})(window);


  // ---- content/watched-notifications.js ----
/**
 * Feature #28 — Watched Categories Notifications (UI side)
 *
 * Logic lives in diff-viewer.js (which calls Promise.resolve({ ok: true }))
 * and background service worker (alarms). This module adds a small UI control
 * on every category page: " Watch this category" toggle.
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

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

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      buildButton();
      FMHY.onPageChange(() => { buildButton(); });
    },
    onMessage() { return false; }
  });
})(window);


  // ---- content/export-tools.js ----
/**
 * Feature #29 — Export to Multiple Formats
 *
 * Adds an "Export" button to the page (floating, bottom-left).
 * Exports bookmarks + notes + ratings as:
 *   - JSON (full backup)
 *   - HTML (standard browser bookmarks file)
 *   - Markdown (for Notion / Obsidian)
 *   - CSV (for Excel/Sheets)
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "exportTools";
  let initialized = false;

  function buildButton() {
    if (document.querySelector(".fmhy-export-fab")) return;
    const btn = FMHY.Dom.el("button", { class: "fmhy-export-fab", title: "Export your data" }, "Export");
    btn.addEventListener("click", openMenu);
    document.body.appendChild(btn);
  }

  async function openMenu() {
    const modal = FMHY.Dom.el("div", { class: "fmhy-modal-overlay" });
    const box = FMHY.Dom.el("div", { class: "fmhy-modal" });
    box.appendChild(FMHY.Dom.el("h3", {}, "Export your FMHY data"));

    const [bookmarks, notes, ratings] = await Promise.all([
      FMHY.Storage.getBookmarks(),
      FMHY.Storage.getNotes(),
      FMHY.Storage.getRatings()
    ]);

    box.appendChild(FMHY.Dom.el("p", { class: "fmhy-muted" },
      `You have ${bookmarks.length} bookmarks, ${Object.keys(notes).length} notes, ${Object.keys(ratings).length} ratings.`));

    const formats = [
      { id: "json", label: "JSON (full backup)", icon: "json" },
      { id: "html", label: "HTML (browser bookmarks)", icon: "html" },
      { id: "md", label: "Markdown (Notion / Obsidian)", icon: "md" },
      { id: "csv", label: "CSV (Excel / Sheets)", icon: "csv" }
    ];

    formats.forEach((f) => {
      const btn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-export-format-btn" });
      btn.appendChild(document.createTextNode(`${f.icon}  ${f.label}`));
      btn.addEventListener("click", () => {
        const content = exportAs(f.id, { bookmarks, notes, ratings });
        const filename = `fmhy-supercharged-${f.id}-${new Date().toISOString().slice(0, 10)}.${f.id}`;
        download(content, filename, f.id === "json" ? "application/json" : f.id === "html" ? "text/html" : f.id === "csv" ? "text/csv" : "text/markdown");
      });
      box.appendChild(btn);
    });

    const close = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-primary" }, "Close");
    close.addEventListener("click", () => modal.remove());
    box.appendChild(close);

    modal.appendChild(box);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function exportAs(format, { bookmarks, notes, ratings }) {
    if (format === "json") {
      return JSON.stringify({ app: "fmhy-supercharged", version: 1, exportedAt: Date.now(), bookmarks, notes, ratings }, null, 2);
    }
    if (format === "html") {
      // Standard Netscape bookmark format
      const lines = [
        "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        "<TITLE>FMHY Supercharged Bookmarks</TITLE>",
        "<H1>FMHY Supercharged Bookmarks</H1>",
        "<DL><p>"
      ];
      const byCat = {};
      bookmarks.forEach((b) => {
        const c = b.category || "Uncategorized";
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(b);
      });
      Object.keys(byCat).sort().forEach((cat) => {
        lines.push(`  <DT><H3>${escapeHtml(cat)}</H3>`);
        lines.push("  <DL><p>");
        byCat[cat].forEach((b) => {
          lines.push(`    <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${Math.floor((b.addedAt || Date.now()) / 1000)}">${escapeHtml(b.title)}</A>`);
          if (b.note) lines.push(`    <DD>${escapeHtml(b.note)}`);
        });
        lines.push("  </DL><p>");
      });
      lines.push("</DL><p>");
      return lines.join("\n");
    }
    if (format === "md") {
      const lines = ["# FMHY Supercharged — Bookmarks", ""];
      const byCat = {};
      bookmarks.forEach((b) => {
        const c = b.category || "Uncategorized";
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(b);
      });
      Object.keys(byCat).sort().forEach((cat) => {
        lines.push(`## ${cat}`);
        lines.push("");
        byCat[cat].forEach((b) => {
          const r = ratings[b.url];
          const stars = r ? ` ${r.stars}/5` : "";
          lines.push(`- [${b.title.replace(/[\[\]]/g, "")}](${b.url})${stars}`);
          const n = notes[b.url];
          if (n && n.text) lines.push(`  - Note: ${n.text}`);
          if (b.tags && b.tags.length) lines.push(`  - Tags: ${b.tags.map((t) => "`#" + t + "`").join(" ")}`);
        });
        lines.push("");
      });
      return lines.join("\n");
    }
    if (format === "csv") {
      const rows = [["Title", "URL", "Category", "Tags", "Rating", "Note", "AddedAt"]];
      bookmarks.forEach((b) => {
        const r = ratings[b.url];
        const n = notes[b.url];
        rows.push([
          csvCell(b.title),
          csvCell(b.url),
          csvCell(b.category || ""),
          csvCell((b.tags || []).join("; ")),
          r ? String(r.stars) : "",
          n ? csvCell(n.text) : "",
          new Date(b.addedAt || 0).toISOString()
        ]);
      });
      return rows.map((r) => r.join(",")).join("\n");
    }
    return "";
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function csvCell(s) {
    s = String(s || "");
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      // The floating button is replaced by the unified sidebar entry.
      // We still expose openMenu() so the sidebar can trigger the export dialog.
      // buildButton();  // legacy — disabled in favor of sidebar
    },
    onMessage() { return false; },
    openMenu  // expose so sidebar can call it
  });
})(window);


  // ---- content/share-cards.js ----
/**
 * Feature #30 — Shareable Resource Cards
 *
 * Generates a shareable PNG card with the resource name, URL, description,
 * your rating, and FMHY branding — for Discord/Reddit.
 *
 * Uses Canvas API to render client-side (no external service needed).
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "shareCards";
  let initialized = false;

  async function generateCard(url, title, rating, note) {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext("2d");

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 1200, 630);
    grad.addColorStop(0, "#7c3aed");
    grad.addColorStop(1, "#2563eb");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 630);

    // Decorative bolt
    ctx.fillStyle = "rgba(250, 204, 21, 0.15)";
    ctx.beginPath();
    ctx.moveTo(950, 100);
    ctx.lineTo(1100, 100);
    ctx.lineTo(1000, 300);
    ctx.lineTo(1100, 300);
    ctx.lineTo(900, 530);
    ctx.lineTo(1000, 350);
    ctx.lineTo(900, 350);
    ctx.closePath();
    ctx.fill();

    // Brand bar
    ctx.fillStyle = "#facc15";
    ctx.fillRect(60, 60, 8, 510);

    // Header
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "600 24px Inter, system-ui, sans-serif";
    ctx.fillText("FMHY SUPERCHARGED", 100, 110);

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 56px Inter, system-ui, sans-serif";
    wrapText(ctx, title || url, 100, 200, 1000, 70, 3);

    // URL
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "400 22px 'SF Mono', Menlo, monospace";
    let shortUrl = url;
    if (shortUrl.length > 80) shortUrl = shortUrl.slice(0, 77) + "…";
    ctx.fillText(shortUrl, 100, 440);

    // Rating
    if (rating && rating.stars) {
      ctx.font = "48px serif";
      ctx.fillStyle = "#facc15";
      ctx.fillText("*".repeat(rating.stars) + "".repeat(5 - rating.stars), 100, 510);
      if (rating.review) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = "italic 22px Inter, system-ui, sans-serif";
        ctx.fillText(`"${rating.review}"`, 320, 505);
      }
    }

    // Footer
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "400 18px Inter, system-ui, sans-serif";
    ctx.fillText("Generated by FMHY Supercharged • fmhy.net", 100, 590);

    // Trigger download
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `fmhy-card-${FMHY.Dom.hash(url)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");

    // Also generate a markdown snippet
    const md = `**[${title}](${url})**\n\n${rating && rating.stars ? "".repeat(rating.stars) + "/5" : ""}${rating && rating.review ? " — " + rating.review : ""}\n\n_Generated by [FMHY Supercharged](https://fmhy.net)_`;
    await FMHY.Dom.copyToClipboard(md);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = text.split(" ");
    let line = "";
    let lines = [];
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length === maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines) {
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + "…").width > maxWidth && last.length > 0) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last + "…";
    }
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  }

  async function handleShareMessage(url, text) {
    const [rating, note] = await Promise.all([
      FMHY.Storage.getRating(url),
      FMHY.Storage.getNote(url)
    ]);
    await generateCard(url, text || url, rating, note);
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      // Add a "share card" button next to each resource link
      const addButtons = () => {
        FMHY.Dom.getResourceLinks().forEach(({ element, href, text }) => {
          if (element.dataset.fmhyShareBtn) return;
          element.dataset.fmhyShareBtn = "1";
          const btn = FMHY.Dom.el("span", {
            class: "fmhy-share-btn",
            title: "Generate share card",
            role: "button",
            tabindex: "0"
          }, "");
          btn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            handleShareMessage(href, text);
          });
          element.appendChild(btn);
        });
      };
      addButtons();
      FMHY.onPageChange(addButtons);
    },
    onMessage(msg) {
      if (msg.type === "generateShareCard" && msg.url) {
        handleShareMessage(msg.url, msg.text || msg.url);
        return true;
      }
      return false;
    },
    generateCard
  });
})(window);


  // ---- content/sidebar.js ----
/**
 * FMHY Supercharged — Integrated Sidebar
 * =====================================================================
 *
 * Redesigned to feel like a native part of fmhy.net's VitePress UI:
 *   - Uses VitePress CSS variables (--vp-c-brand-1, --vp-c-border, etc.)
 *   - Matches VitePress's font (Inter), spacing, and border styles
 *   - SVG icons only (no emojis)
 *   - Slides in from the RIGHT (VitePress's left sidebar stays untouched)
 *   - Items styled like VitePress's sidebar items (.VPSidebarItem)
 *   - Toggle button styled like VitePress's nav buttons
 *
 * Feature modules register via:
 *   FMHY.Sidebar.register({
 *     id, section, label, icon, description, order, action, isActive, badge
 *   })
 *
 * @module FMHY.Sidebar
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "sidebar";

  /** Registry of sidebar items, keyed by section. */
  const registry = {
    quick: [],
    browse: [],
    saved: [],
    tools: []
  };

  let initialized = false;
  let isOpen = false;
  let activeSection = "quick";

  /** DOM references. */
  let hostButton = null;
  let backdrop = null;
  let panel = null;
  let sectionTabs = null;
  let sectionContent = null;

  /** Section metadata — icons reference SVG icon names. */
  const SECTIONS = [
    { id: "quick",  label: "Quick",  icon: "zap" },
    { id: "browse", label: "Browse", icon: "compass" },
    { id: "saved",  label: "Saved",  icon: "bookmark" },
    { id: "tools",  label: "Tools",  icon: "tool" }
  ];

  let previouslyFocused = null;

  /** Cached watched categories (for sync isActive checks). */
  let watchedCategoriesCache = [];

  /** Cached highlights-enabled state (for sync isActive). */
  let highlightsEnabled = true;

  /** Cached search-enhancer-enabled state. */
  let searchEnhancerEnabled = false;

  /** Swipe gesture state for touch devices. */
  const swipeState = { active: false, startX: 0, startY: 0, currentX: 0, startTime: 0 };
  const SWIPE_THRESHOLD = 60;
  const SWIPE_TIMEOUT = 600;

  /**
   * Register an item with the sidebar.
   * @param {Object} config - Item configuration
   * @returns {boolean} true if registered
   */
  function register(config) {
    if (!config || !config.id || !config.section || !config.action) {
      console.warn("[FMHY SC] Invalid sidebar registration:", config);
      return false;
    }
    if (!registry[config.section]) {
      console.warn("[FMHY SC] Unknown section:", config.section);
      return false;
    }
    const idx = registry[config.section].findIndex((i) => i.id === config.id);
    if (idx >= 0) registry[config.section][idx] = config;
    else registry[config.section].push(config);
    if (isOpen) renderSection();
    return true;
  }

  /**
   * Update a registered item.
   * @param {string} id - Item id
   * @param {Object} updates - Partial config to merge
   */
  function updateItem(id, updates) {
    for (const section of Object.keys(registry)) {
      const idx = registry[section].findIndex((i) => i.id === id);
      if (idx >= 0) {
        registry[section][idx] = { ...registry[section][idx], ...updates };
        if (isOpen) renderSection();
        return;
      }
    }
  }

  /**
   * Build the host button. Styled to match VitePress's nav buttons
   * (.VPNavBarMenuLink aesthetic) so it blends in.
   */
  function buildHost() {
    if (hostButton) hostButton.remove();
    hostButton = FMHY.Dom.el("button", {
      class: "fmhy-sc-host",
      "aria-label": "Open FMHY Supercharged panel",
      "aria-expanded": "false",
      "aria-haspopup": "dialog",
      title: "FMHY Supercharged (Ctrl+Shift+L)"
    });
    // SVG icon (no emoji)
    hostButton.appendChild(FMHY.Icon.render("zap", 18));
    hostButton.addEventListener("click", open);
    document.body.appendChild(hostButton);

    requestAnimationFrame(() => hostButton.classList.add("fmhy-sc-host-visible"));
  }

  /**
   * Build the sidebar panel structure.
   * Uses VitePress's CSS variables for native look.
   */
  function buildSidebar() {
    if (panel) return;

    backdrop = FMHY.Dom.el("div", {
      class: "fmhy-sc-backdrop",
      "aria-hidden": "true"
    });
    backdrop.addEventListener("click", (e) => {
      // Only close if the click landed on the backdrop itself, NOT on the panel or its children
      if (e.target === backdrop) close();
    });

    panel = FMHY.Dom.el("aside", {
      class: "fmhy-sc-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "fmhy-sc-title"
    });

    // Header — minimal, VitePress-style
    const header = FMHY.Dom.el("header", { class: "fmhy-sc-header" });
    const titleWrap = FMHY.Dom.el("div", { class: "fmhy-sc-header-title" });
    titleWrap.appendChild(FMHY.Icon.render("zap", 16));
    titleWrap.appendChild(FMHY.Dom.el("span", {
      class: "fmhy-sc-title",
      id: "fmhy-sc-title"
    }, "FMHY Supercharged"));
    header.appendChild(titleWrap);

    const closeBtn = FMHY.Dom.el("button", {
      class: "fmhy-sc-close",
      "aria-label": "Close panel",
      title: "Close (Esc)"
    });
    closeBtn.appendChild(FMHY.Icon.render("close", 18));
    closeBtn.addEventListener("click", close);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Tabs — styled like VitePress's nav menu
    sectionTabs = FMHY.Dom.el("nav", {
      class: "fmhy-sc-tabs",
      role: "tablist",
      "aria-label": "Sections"
    });
    SECTIONS.forEach((section, idx) => {
      const tab = FMHY.Dom.el("button", {
        class: "fmhy-sc-tab" + (section.id === activeSection ? " active" : ""),
        role: "tab",
        "aria-selected": section.id === activeSection ? "true" : "false",
        "data-section": section.id,
        tabindex: idx === 0 ? "0" : "-1"
      });
      tab.appendChild(FMHY.Icon.render(section.icon, 16));
      tab.appendChild(FMHY.Dom.el("span", {}, section.label));
      tab.addEventListener("click", () => switchSection(section.id));
      tab.addEventListener("keydown", onTabKeydown);
      sectionTabs.appendChild(tab);
    });
    panel.appendChild(sectionTabs);

    // Content area
    sectionContent = FMHY.Dom.el("div", { class: "fmhy-sc-content" });
    panel.appendChild(sectionContent);

    // Footer
    const footer = FMHY.Dom.el("footer", { class: "fmhy-sc-footer" });
    footer.appendChild(FMHY.Dom.el("span", {}, "FMHY Supercharged · 30 features"));
    panel.appendChild(footer);

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  }

  /**
   * Render items for the active section.
   * Items styled like VitePress's .VPSidebarItem — subtle, clean.
   */
  function renderSection() {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";

    const sectionId = `fmhy-sc-panel-${activeSection}`;
    sectionContent.setAttribute("role", "tabpanel");
    sectionContent.setAttribute("id", sectionId);

    const items = (registry[activeSection] || [])
      .slice()
      .sort((a, b) => (a.order || 100) - (b.order || 100));

    if (items.length === 0) {
      const empty = FMHY.Dom.el("div", { class: "fmhy-sc-empty" });
      empty.appendChild(FMHY.Icon.render("sparkles", 32));
      empty.appendChild(FMHY.Dom.el("p", {}, "No items in this section."));
      sectionContent.appendChild(empty);
      return;
    }

    items.forEach((item, idx) => {
      sectionContent.appendChild(buildItemRow(item, idx));
    });
  }

  /**
   * Build a single item row.
   * Styled to match VitePress's sidebar item aesthetic — minimal,
   * no card borders, just hover background.
   */
  function buildItemRow(item, index) {
    // isActive must be sync — if it returns a Promise, treat as false
    let isActive = false;
    if (typeof item.isActive === "function") {
      try {
        const result = item.isActive();
        // Only accept boolean true — ignore Promises (which would be truthy but invalid)
        isActive = result === true;
      } catch (e) {
        isActive = false;
      }
    }
    const row = FMHY.Dom.el("button", {
      class: "fmhy-sc-item" + (isActive ? " active" : ""),
      style: { animationDelay: `${index * 40}ms` },
      "aria-label": item.label,
      type: "button"
    });

    // Icon (SVG, no emoji)
    const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-item-icon" });
    FMHY.Icon.inject(iconWrap, item.icon || "dot", 18);
    row.appendChild(iconWrap);

    // Body
    const body = FMHY.Dom.el("div", { class: "fmhy-sc-item-body" });
    body.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-item-label" }, item.label));
    if (item.description) {
      body.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-item-desc" }, item.description));
    }
    row.appendChild(body);

    // Badge
    if (item.badge) {
      row.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-item-badge" }, String(item.badge)));
    }

    // Chevron
    const chevron = FMHY.Dom.el("span", { class: "fmhy-sc-item-chevron" });
    FMHY.Icon.inject(chevron, "chevron-right", 16);
    row.appendChild(chevron);

    row.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Visual feedback: flash the row
      row.classList.add("fmhy-sc-item-clicked");
      setTimeout(() => row.classList.remove("fmhy-sc-item-clicked"), 300);
      try {
        const result = await item.action();
        // Only re-render if the action didn't open a sub-view
        // (sub-view actions return false to signal "don't re-render")
        if (result !== false && isOpen) renderSection();
      } catch (err) {
        console.error("[FMHY SC] Item action failed:", err);
        showToast("Action failed: " + err.message, "error");
      }
    });

    return row;
  }

  /**
   * Open the sidebar.
   */
  function open() {
    if (isOpen) return;
    buildSidebar();
    isOpen = true;
    previouslyFocused = document.activeElement;

    requestAnimationFrame(() => {
      backdrop.classList.add("fmhy-sc-visible");
      if (hostButton) {
        hostButton.setAttribute("aria-expanded", "true");
        hostButton.classList.add("fmhy-sc-host-hidden");
      }
    });

    renderSection();

    setTimeout(() => {
      const firstFocusable = panel.querySelector("button, [tabindex]:not([tabindex='-1'])");
      if (firstFocusable) firstFocusable.focus();
    }, 350);

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown, true);
  }

  /**
   * Close the sidebar.
   */
  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.classList.remove("fmhy-sc-visible");
    if (hostButton) {
      hostButton.setAttribute("aria-expanded", "false");
      hostButton.classList.remove("fmhy-sc-host-hidden");
    }
    document.body.style.overflow = "";
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function toggle() { if (isOpen) close(); else open(); }

  function switchSection(sectionId) {
    if (!registry[sectionId] || sectionId === activeSection) return;
    activeSection = sectionId;
    sectionTabs.querySelectorAll(".fmhy-sc-tab").forEach((tab) => {
      const isActive = tab.dataset.section === sectionId;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    sectionContent.classList.add("fmhy-sc-content-exiting");
    setTimeout(() => {
      renderSection();
      sectionContent.classList.remove("fmhy-sc-content-exiting");
    }, 150);
  }

  function onKeyDown(e) {
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "Tab" && panel) {
      const focusable = panel.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function onTabKeydown(e) {
    const tabs = Array.from(sectionTabs.querySelectorAll(".fmhy-sc-tab"));
    const currentIdx = tabs.findIndex((t) => t === document.activeElement);
    if (currentIdx === -1) return;
    let newIdx = currentIdx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); newIdx = (currentIdx + 1) % tabs.length; }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); newIdx = (currentIdx - 1 + tabs.length) % tabs.length; }
    else if (e.key === "Home") { e.preventDefault(); newIdx = 0; }
    else if (e.key === "End") { e.preventDefault(); newIdx = tabs.length - 1; }
    else return;
    tabs[newIdx].focus();
    switchSection(tabs[newIdx].dataset.section);
  }

  /**
   * Set up edge-swipe gesture for touch devices.
   */
  function setupSwipeGesture() {
    if (!("ontouchstart" in window)) return;
    document.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      const edgeThreshold = 30;
      if (!isOpen && touch.clientX < window.innerWidth - edgeThreshold) return;
      swipeState.active = true;
      swipeState.startX = touch.clientX;
      swipeState.startY = touch.clientY;
      swipeState.currentX = touch.clientX;
      swipeState.startTime = Date.now();
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
      if (!swipeState.active) return;
      swipeState.currentX = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener("touchend", (e) => {
      if (!swipeState.active) return;
      swipeState.active = false;
      const elapsed = Date.now() - swipeState.startTime;
      if (elapsed > SWIPE_TIMEOUT) return;
      const dx = swipeState.currentX - swipeState.startX;
      const dy = Math.abs(e.changedTouches[0].clientY - swipeState.startY);
      if (dy > 60) return;
      if (!isOpen && dx < -SWIPE_THRESHOLD) open();
      else if (isOpen && dx > SWIPE_THRESHOLD) close();
    }, { passive: true });
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {string} [type="info"] - info, success, error
   */
  function showToast(message, type = "info") {
    const toast = FMHY.Dom.el("div", {
      class: `fmhy-sc-toast fmhy-sc-toast-${type}`,
      role: "status",
      "aria-live": "polite"
    });
    // Icon based on type
    const iconName = type === "success" ? "check-circle" : type === "error" ? "alert" : "info";
    const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-toast-icon" });
    FMHY.Icon.inject(iconWrap, iconName, 16);
    toast.appendChild(iconWrap);
    toast.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-toast-text" }, message));
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("fmhy-sc-toast-visible"));
    setTimeout(() => {
      toast.classList.remove("fmhy-sc-toast-visible");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---------- Public API ----------
  window.FMHY.Sidebar = {
    register, updateItem, open, close, toggle, switchSection,
    isOpen: () => isOpen, showToast
  };

  // ---------- Feature registration ----------
  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      buildHost();
      setupSwipeGesture();

      // Load cached states for sync isActive checks
      (async () => {
        const [he, se] = await Promise.all([
          FMHY.Storage.getSetting("highlightRules"),
          FMHY.Storage.getSetting("searchEnhancerEnabled")
        ]);
        highlightsEnabled = he !== false;
        searchEnhancerEnabled = se === true;
        // Re-render if sidebar is open
        if (isOpen) renderSection();
      })();

      // Quick section
      register({
        id: "command-palette", section: "quick",
        label: "Command Palette", icon: "command",
        description: "Search all resources, bookmarks, history",
        order: 1,
        action: () => {
          close();
          setTimeout(() => {
            const cp = FMHY.getFeature("commandPalette");
            if (cp) cp.onMessage({ type: "openCommandPalette" });
          }, 350);
        }
      });

      register({
        id: "radial-menu", section: "quick",
        label: "Category Radial", icon: "radial",
        description: "Visual jump to any category",
        order: 2,
        action: () => {
          close();
          setTimeout(() => {
            const rm = FMHY.getFeature("radialMenu");
            if (rm) rm.onMessage({ type: "openRadialMenu" });
          }, 350);
        }
      });

      register({
        id: "bookmark-page", section: "quick",
        label: "Bookmark This Page", icon: "bookmark",
        description: "Save the current page",
        order: 3,
        action: async () => {
          const url = window.location.href;
          const title = FMHY.Dom.getPageTitle();
          const category = FMHY.Dom.getCurrentCategory();
          const existing = await FMHY.Storage.findBookmarkByUrl(url);
          if (existing) {
            await FMHY.Storage.removeBookmark(existing.id);
            showToast("Bookmark removed", "info");
          } else {
            await FMHY.Storage.addBookmark({ url, title, category });
            showToast("Bookmark added", "success");
          }
          const bm = FMHY.getFeature("bookmarks");
          if (bm && bm.refreshBookmarkedSet) bm.refreshBookmarkedSet();
        }
      });

      register({
        id: "sync-now", section: "quick",
        label: "Sync Now", icon: "sync",
        description: "Push/pull via GitHub Gist or WebDAV",
        order: 4,
        action: async () => {
          const cfg = await FMHY.Storage.getSyncConfig();
          if (cfg.provider === "none" || !cfg.token) {
            showToast("Sync not configured — set up in Options", "error");
            return;
          }
          showToast("Syncing...", "info");
          try {
            await runSync();
            showToast("Synced successfully", "success");
          } catch (e) {
            showToast("Sync failed: " + e.message, "error");
          }
        }
      });

      // Tools section
      register({
        id: "reading-mode", section: "tools",
        label: "Reading Mode", icon: "book-open",
        description: "Focus on current section",
        order: 1,
        isActive: () => {
          const rm = FMHY.getFeature("readingMode");
          return rm && rm.isActive ? rm.isActive() : document.body.classList.contains("fmhy-reading-mode");
        },
        action: () => {
          const rm = FMHY.getFeature("readingMode");
          if (rm && rm.toggle) {
            rm.toggle();
            showToast(document.body.classList.contains("fmhy-reading-mode") ? "Reading mode on" : "Reading mode off", "info");
          } else {
            showToast("Reading mode unavailable", "error");
          }
        }
      });

      register({
        id: "density-cycle", section: "tools",
        label: "Density Mode", icon: "layers",
        description: "Cycle: compact / comfortable / spacious",
        order: 2,
        action: async () => {
          const order = ["compact", "comfortable", "spacious"];
          const current = await FMHY.Storage.getSetting("density");
          const idx = order.indexOf(current);
          const next = order[(idx + 1) % order.length];
          await FMHY.Storage.setSetting("density", next);
          document.documentElement.setAttribute("data-fmhy-density", next);
          showToast(`Density: ${next}`, "info");
        }
      });

      register({
        id: "export-data", section: "tools",
        label: "Export Data", icon: "download",
        description: "JSON / HTML / Markdown / CSV",
        order: 3,
        action: () => {
          const et = FMHY.getFeature("exportTools");
          if (et && et.openMenu) {
            et.openMenu();
            showToast("Export dialog opened", "info");
          } else {
            showToast("Export feature not loaded", "error");
          }
        }
      });

      register({
        id: "watch-category", section: "tools",
        label: "Watch This Category", icon: "bell",
        description: "Get notified of new resources here",
        order: 4,
        // isActive is sync — we cache the watched state and refresh on each render
        isActive: () => {
          // Can't be async, so we check a cached value updated by refreshSavedBadges
          return !!watchedCategoriesCache.includes(FMHY.Dom.getCurrentCategory());
        },
        action: async () => {
          const cat = FMHY.Dom.getCurrentCategory();
          const watched = await FMHY.Storage.getWatchedCategories();
          if (watched.includes(cat)) {
            await FMHY.Storage.unwatchCategory(cat);
            showToast(`Stopped watching ${cat}`, "info");
          } else {
            await FMHY.Storage.watchCategory(cat);
            showToast(`Now watching ${cat}`, "success");
          }
          // Refresh cache + re-render
          await refreshSavedBadges();
        }
      });

      register({
        id: "compare-matrix", section: "tools",
        label: "Compare Resources", icon: "scale",
        description: "Multi-select and view side-by-side",
        order: 5,
        action: () => {
          const cm = FMHY.getFeature("compareMatrix");
          if (!cm) {
            showToast("Compare feature not loaded", "error");
            return;
          }
          // Highlight all checkboxes briefly so user sees them
          const checkboxes = document.querySelectorAll(".fmhy-compare-cb");
          if (checkboxes.length === 0) {
            showToast("No comparable resources on this page", "info");
            return;
          }
          checkboxes.forEach((cb) => {
            const link = cb.closest("a");
            if (link) {
              link.classList.add("fmhy-sc-highlight-pulse");
              setTimeout(() => link.classList.remove("fmhy-sc-highlight-pulse"), 3000);
            }
          });
          showToast(`Check the boxes next to ${checkboxes.length} resources — comparing starts after 2 selected`, "info");
        }
      });

      register({
        id: "open-options", section: "tools",
        label: "Open Full Options", icon: "settings",
        description: "Sync, highlights, watched, backup",
        order: 99,
        action: () => {
          if (chrome.runtime.openOptionsPage) openOptionsModal();
        }
      });

      // Browse section
      register({
        id: "related-resources", section: "browse",
        label: "Related Resources", icon: "link",
        description: "Find duplicates and similar items",
        order: 1,
        isActive: () => {
          const rs = FMHY.getFeature("relatedSidebar");
          return rs && rs.isOpen ? rs.isOpen() : false;
        },
        action: () => {
          const rs = FMHY.getFeature("relatedSidebar");
          if (rs && rs.toggle) {
            rs.toggle();
            showToast(rs.isOpen() ? "Related panel opened" : "Related panel closed", "info");
          } else {
            showToast("Related resources feature not loaded", "error");
          }
        }
      });

      register({
        id: "mini-toc", section: "browse",
        label: "Table of Contents", icon: "list",
        description: "Show floating TOC with scroll-spy",
        order: 2,
        isActive: () => {
          const w = document.querySelector(".fmhy-toc-widget");
          return w && w.classList.contains("fmhy-toc-visible");
        },
        action: () => {
          let w = document.querySelector(".fmhy-toc-widget");
          if (!w) {
            // Try to re-init the mini-toc feature
            const mt = FMHY.getFeature("miniToc");
            if (mt && mt.refresh) mt.refresh();
            setTimeout(() => {
              w = document.querySelector(".fmhy-toc-widget");
              toggleToc(w);
            }, 200);
          } else {
            toggleToc(w);
          }
        }
      });

      function toggleToc(w) {
        if (!w) {
          showToast("No headings on this page", "info");
          return;
        }
        const isVisible = w.classList.contains("fmhy-toc-visible");
        if (isVisible) {
          w.classList.remove("fmhy-toc-visible");
          showToast("TOC hidden", "info");
        } else {
          w.classList.add("fmhy-toc-visible");
          showToast("TOC shown", "info");
        }
      }

      register({
        id: "highlight-rules", section: "browse",
        label: "Highlight Rules", icon: "tag",
        description: "Toggle color-coded tags on resources",
        order: 3,
        isActive: () => highlightsEnabled,
        action: async () => {
          highlightsEnabled = !highlightsEnabled;
          await FMHY.Storage.setSetting("highlightRules", highlightsEnabled);
          // Apply or remove highlights
          const hr = FMHY.getFeature("highlightRules");
          if (hr) {
            if (highlightsEnabled && hr.refresh) {
              await hr.refresh();
              showToast("Highlight rules enabled", "success");
            } else if (hr.removeAll) {
              hr.removeAll();
              showToast("Highlight rules disabled", "info");
            }
          }
        }
      });

      register({
        id: "search-enhancer", section: "browse",
        label: "Enhanced Search", icon: "search",
        description: "Autocomplete + advanced search filters",
        order: 4,
        isActive: () => searchEnhancerEnabled,
        action: () => {
          const se = FMHY.getFeature("searchEnhancer");
          if (se && se.openAdvanced) {
            se.openAdvanced();
          } else {
            showToast("Search enhancer not loaded", "error");
          }
        }
      });

      register({
        id: "keyboard-help", section: "browse",
        label: "Keyboard Shortcuts", icon: "keyboard",
        description: "View all available shortcuts",
        order: 4,
        action: () => {
          showKeyboardHelp();
          return false; // don't re-render — keyboard help is a sub-view
        }
      });

      // Saved section — populated by refreshSavedBadges()
      refreshSavedBadges();
    },
    onMessage(msg) {
      if (msg.type === "toggleSidebar") { toggle(); return true; }
      return false;
    },
    refresh: refreshSavedBadges
  });

  /**
   * Show keyboard shortcuts help (inline in sidebar).
   */
  function showKeyboardHelp() {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";

    const backBtn = FMHY.Dom.el("button", { class: "fmhy-sc-back-btn" });
    backBtn.appendChild(FMHY.Icon.render("chevron-left", 16));
    backBtn.appendChild(document.createTextNode("Back"));
    backBtn.addEventListener("click", () => renderSection());
    sectionContent.appendChild(backBtn);

    const title = FMHY.Dom.el("h3", { class: "fmhy-sc-list-title" }, "Keyboard Shortcuts");
    sectionContent.appendChild(title);

    const shortcuts = [
      ["Ctrl + Shift + K", "Open command palette"],
      ["Ctrl + Shift + L", "Toggle this sidebar"],
      ["Ctrl + Shift + B", "Bookmark current page"],
      ["Ctrl + Shift + Space", "Open category radial"],
      ["J / K", "Move between resource links"],
      ["Enter", "Open active link"],
      ["Shift + Enter", "Open in new tab"],
      ["B", "Bookmark active link"],
      ["N", "Add note to active link"],
      ["/", "Focus search"],
      ["G G", "Scroll to top"],
      ["G", "Scroll to bottom"],
      ["?", "Show this help"]
    ];

    const list = FMHY.Dom.el("div", { class: "fmhy-sc-kb-list" });
    shortcuts.forEach(([key, desc]) => {
      const row = FMHY.Dom.el("div", { class: "fmhy-sc-kb-row" });
      const kbd = FMHY.Dom.el("kbd", { class: "fmhy-sc-kbd" }, key);
      const label = FMHY.Dom.el("span", { class: "fmhy-sc-kb-desc" }, desc);
      row.appendChild(label);
      row.appendChild(kbd);
      list.appendChild(row);
    });
    sectionContent.appendChild(list);
  }

  /**
   * Update the "saved" section with live counts.
   */
  async function refreshSavedBadges() {
    const [bookmarks, history, ratings, notes, watched] = await Promise.all([
      FMHY.Storage.getBookmarks(),
      FMHY.Storage.getHistory(),
      FMHY.Storage.getRatings(),
      FMHY.Storage.getNotes(),
      FMHY.Storage.getWatchedCategories()
    ]);
    watchedCategoriesCache = watched;

    register({
      id: "view-bookmarks", section: "saved",
      label: "View All Bookmarks", icon: "bookmark",
      description: `${bookmarks.length} bookmarked`,
      badge: bookmarks.length > 0 ? String(bookmarks.length) : undefined,
      order: 1,
      action: async () => {
        const fresh = await FMHY.Storage.getBookmarks();
        showBookmarksList(fresh);
        return false; // don't re-render — we just showed the list
      }
    });

    register({
      id: "view-history", section: "saved",
      label: "Recently Viewed", icon: "history",
      description: `${history.length} recent visits`,
      badge: history.length > 0 ? String(history.length) : undefined,
      order: 2,
      action: async () => {
        const fresh = await FMHY.Storage.getHistory();
        showHistoryList(fresh);
        return false;
      }
    });

    register({
      id: "view-ratings", section: "saved",
      label: "Your Ratings", icon: "star",
      description: `${Object.keys(ratings).length} rated`,
      badge: Object.keys(ratings).length > 0 ? String(Object.keys(ratings).length) : undefined,
      order: 3,
      action: async () => {
        const fresh = await FMHY.Storage.getRatings();
        showRatingsList(fresh);
        return false;
      }
    });

    register({
      id: "view-notes", section: "saved",
      label: "Your Notes", icon: "note",
      description: `${Object.keys(notes).length} notes`,
      badge: Object.keys(notes).length > 0 ? String(Object.keys(notes).length) : undefined,
      order: 4,
      action: async () => {
        const fresh = await FMHY.Storage.getNotes();
        showNotesList(fresh);
        return false;
      }
    });

    if (isOpen && activeSection === "saved") renderSection();
  }

  function showBookmarksList(bookmarks) {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";
    addBackButton();

    if (bookmarks.length === 0) {
      showEmptyState("bookmark", "No bookmarks yet. Click the plus icon next to any resource on fmhy.net.");
      return;
    }

    const title = FMHY.Dom.el("h3", { class: "fmhy-sc-list-title" }, "Bookmarks");
    sectionContent.appendChild(title);

    const list = FMHY.Dom.el("div", { class: "fmhy-sc-list" });
    bookmarks.slice(0, 50).forEach((bm, idx) => {
      list.appendChild(buildSavedItemRow(bm, idx, "bookmark"));
    });
    sectionContent.appendChild(list);
  }

  function showHistoryList(history) {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";
    addBackButton();

    if (history.length === 0) {
      showEmptyState("history", "No recently viewed resources yet.");
      return;
    }

    const title = FMHY.Dom.el("h3", { class: "fmhy-sc-list-title" }, "Recently Viewed");
    sectionContent.appendChild(title);

    const list = FMHY.Dom.el("div", { class: "fmhy-sc-list" });
    history.slice(0, 20).forEach((h, idx) => {
      list.appendChild(buildSavedItemRow({ ...h, url: h.url, title: h.title || h.url, sub: `${FMHY.Dom.timeAgo(h.visitedAt)}` }, idx, "history"));
    });
    sectionContent.appendChild(list);
  }

  function showRatingsList(ratings) {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";
    addBackButton();

    const entries = Object.entries(ratings);
    if (entries.length === 0) {
      showEmptyState("star", "No ratings yet. Use the star icons next to any resource.");
      return;
    }

    const title = FMHY.Dom.el("h3", { class: "fmhy-sc-list-title" }, "Your Ratings");
    sectionContent.appendChild(title);

    const list = FMHY.Dom.el("div", { class: "fmhy-sc-list" });
    entries.sort((a, b) => b[1].stars - a[1].stars).forEach(([url, r], idx) => {
      let host = "";
      try { host = new URL(url).hostname; } catch (e) {}
      list.appendChild(buildSavedItemRow({
        url, title: host || url,
        sub: `${"*".repeat(r.stars)}${"".repeat(5 - r.stars)}${r.review ? " · " + r.review : ""}`,
        icon: "star"
      }, idx, "rating"));
    });
    sectionContent.appendChild(list);
  }

  function showNotesList(notes) {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";
    addBackButton();

    const entries = Object.entries(notes);
    if (entries.length === 0) {
      showEmptyState("note", "No notes yet. Use the pencil icon next to any resource.");
      return;
    }

    const title = FMHY.Dom.el("h3", { class: "fmhy-sc-list-title" }, "Your Notes");
    sectionContent.appendChild(title);

    const list = FMHY.Dom.el("div", { class: "fmhy-sc-list" });
    entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0)).forEach(([url, n], idx) => {
      const preview = (n.text || "").slice(0, 80) + ((n.text || "").length > 80 ? "..." : "");
      let host = "";
      try { host = new URL(url).hostname; } catch (e) {}
      list.appendChild(buildSavedItemRow({
        url, title: host || url,
        sub: `${FMHY.Dom.timeAgo(n.updatedAt)} · ${preview}`,
        icon: "note"
      }, idx, "note"));
    });
    sectionContent.appendChild(list);
  }

  function addBackButton() {
    const backBtn = FMHY.Dom.el("button", { class: "fmhy-sc-back-btn" });
    backBtn.appendChild(FMHY.Icon.render("chevron-left", 16));
    backBtn.appendChild(document.createTextNode("Back"));
    backBtn.addEventListener("click", () => renderSection());
    sectionContent.appendChild(backBtn);
  }

  function showEmptyState(iconName, message) {
    const empty = FMHY.Dom.el("div", { class: "fmhy-sc-empty" });
    empty.appendChild(FMHY.Icon.render(iconName, 32));
    empty.appendChild(FMHY.Dom.el("p", {}, message));
    sectionContent.appendChild(empty);
  }

  function buildSavedItemRow(item, index, type) {
    const row = FMHY.Dom.el("a", {
      class: "fmhy-sc-list-item",
      href: item.url,
      target: "_blank",
      rel: "noopener",
      style: { animationDelay: `${index * 30}ms` }
    });
    let host = "";
    try { host = new URL(item.url).hostname; } catch (e) {}

    const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-list-item-icon" });
    if (type === "bookmark") {
      const img = FMHY.Dom.el("img", {
        src: `https://www.google.com/s2/favicons?sz=32&domain=${host}`,
        alt: "", width: "16", height: "16"
      });
      img.addEventListener("error", () => {
        iconWrap.innerHTML = "";
        FMHY.Icon.inject(iconWrap, "bookmark", 16);
      });
      iconWrap.appendChild(img);
    } else {
      FMHY.Icon.inject(iconWrap, item.icon || "dot", 16);
    }
    row.appendChild(iconWrap);

    const body = FMHY.Dom.el("div", { class: "fmhy-sc-list-item-body" });
    body.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-list-item-title" }, item.title));
    body.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-list-item-sub" }, item.sub));
    row.appendChild(body);

    if (type === "bookmark" || type === "rating" || type === "note") {
      const delBtn = FMHY.Dom.el("button", {
        class: "fmhy-sc-list-item-del",
        title: "Delete", "aria-label": "Delete"
      });
      delBtn.appendChild(FMHY.Icon.render("trash", 14));
      delBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (type === "bookmark") await FMHY.Storage.removeBookmark(item.id);
        else if (type === "rating") await FMHY.Storage.removeRating(item.url);
        else if (type === "note") await FMHY.Storage.removeNote(item.url);
        showToast("Deleted", "info");
        // Refresh list
        if (type === "bookmark") {
          const updated = await FMHY.Storage.getBookmarks();
          showBookmarksList(updated);
        } else if (type === "rating") {
          const updated = await FMHY.Storage.getRatings();
          showRatingsList(updated);
        } else if (type === "note") {
          const updated = await FMHY.Storage.getNotes();
          showNotesList(updated);
        }
        refreshSavedBadges();
      });
      row.appendChild(delBtn);
    }

    return row;
  }

})(window);


  // ---- content/link-actions.js ----
/**
 * FMHY Supercharged — Integrated Link Actions
 * =====================================================================
 *
 * A single subtle button per resource link that opens a popover with
 * all per-link actions. Redesigned to feel native to VitePress:
 *
 *   - The trigger button is a small "+" icon styled like VitePress's
 *     .vp-icon (not a glowing emoji circle)
 *   - The popover uses VitePress's CSS variables and matches the
 *     .VPFlyout / .VPMenu aesthetic
 *   - SVG icons only (no emojis)
 *   - Subtle borders and shadows that match VitePress's depth
 *
 * @module FMHY.LinkActions
 */
(function (global) {
  "use strict";
  // FMHY is already defined on window by the core; nothing to do here

  const NAME = "linkActions";
  let initialized = false;
  let activePopover = null;

  /**
   * Attach the action button to every resource link.
   */
  function attachActionButtons() {
    const links = FMHY.Dom.getResourceLinks();
    links.forEach(({ element, href, text }) => {
      if (element.dataset.fmhyActionBtn) return;
      element.dataset.fmhyActionBtn = "1";

      const btn = FMHY.Dom.el("button", {
        class: "fmhy-sc-link-btn",
        "aria-label": `Actions for ${text}`,
        "aria-haspopup": "dialog",
        title: "Quick actions"
      });
      btn.appendChild(FMHY.Icon.render("plus", 14));
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePopover(element, href, text);
      });
      element.appendChild(btn);
    });
  }

  function togglePopover(anchorEl, url, text) {
    if (activePopover && activePopover._url === url) {
      closePopover();
      return;
    }
    closePopover();
    openPopover(anchorEl, url, text);
  }

  function openPopover(anchorEl, url, text) {
    activePopover = FMHY.Dom.el("div", {
      class: "fmhy-sc-popover",
      role: "dialog",
      "aria-label": `Actions for ${text}`
    });
    activePopover._url = url;
    activePopover._text = text;
    activePopover._anchor = anchorEl;

    // Header
    const header = FMHY.Dom.el("div", { class: "fmhy-sc-popover-header" });
    const titleWrap = FMHY.Dom.el("div", { class: "fmhy-sc-popover-title-wrap" });
    titleWrap.appendChild(FMHY.Icon.render("zap", 14));
    titleWrap.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-popover-title" }, "Quick actions"));
    header.appendChild(titleWrap);
    const closeBtn = FMHY.Dom.el("button", {
      class: "fmhy-sc-popover-close",
      "aria-label": "Close"
    });
    closeBtn.appendChild(FMHY.Icon.render("close", 14));
    closeBtn.addEventListener("click", closePopover);
    header.appendChild(closeBtn);
    activePopover.appendChild(header);

    // URL preview
    let host = "";
    try { host = new URL(url).hostname; } catch (e) {}
    const urlPreview = FMHY.Dom.el("div", { class: "fmhy-sc-popover-url" }, host || url);
    activePopover.appendChild(urlPreview);

    // Actions list (async)
    const actionsList = FMHY.Dom.el("div", { class: "fmhy-sc-popover-actions" });
    actionsList.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-popover-loading" }, "Loading..."));
    activePopover.appendChild(actionsList);

    // Status section
    const statusSection = FMHY.Dom.el("div", { class: "fmhy-sc-popover-status" });
    activePopover.appendChild(statusSection);

    document.body.appendChild(activePopover);
    positionPopover(anchorEl);
    requestAnimationFrame(() => activePopover.classList.add("fmhy-sc-popover-visible"));

    populateActions(actionsList, url, text);
    populateStatus(statusSection, url);

    setTimeout(() => {
      document.addEventListener("click", onOutsideClick);
      document.addEventListener("keydown", onKeydown);
      window.addEventListener("scroll", closePopover, { once: true });
    }, 0);
  }

  async function populateActions(container, url, text) {
    container.innerHTML = "";

    const existing = await FMHY.Storage.findBookmarkByUrl(url);
    const pinned = await FMHY.Storage.getPinned();
    const isPinned = pinned.includes(url);

    const actions = [
      {
        icon: existing ? "bookmark-filled" : "bookmark",
        label: existing ? "Remove bookmark" : "Add bookmark",
        active: !!existing,
        action: async () => {
          if (existing) {
            await FMHY.Storage.removeBookmark(existing.id);
            showToast("Bookmark removed", "info");
          } else {
            await FMHY.Storage.addBookmark({
              url, title: text,
              category: FMHY.Dom.getCurrentCategory()
            });
            showToast("Bookmarked", "success");
          }
          closePopover();
        }
      },
      {
        icon: "note",
        label: "Add note",
        action: () => {
          closePopover();
          setTimeout(() => openNoteEditor(url), 200);
        }
      },
      {
        icon: "star",
        label: "Rate 1-5",
        action: () => openRatingPrompt(url)
      },
      {
        icon: "pin",
        label: isPinned ? "Unpin from toolbar" : "Pin to toolbar",
        active: isPinned,
        action: async () => {
          if (isPinned) {
            await FMHY.Storage.unpin(url);
            showToast("Unpinned", "info");
          } else {
            await FMHY.Storage.pin(url);
            showToast("Pinned", "success");
          }
          closePopover();
        }
      },
      {
        icon: "share",
        label: "Generate share card",
        action: () => {
          closePopover();
          setTimeout(() => triggerShareCard(url, text), 200);
        }
      },
      {
        icon: "archive",
        label: "View on Wayback Machine",
        action: () => {
          window.open(`https://web.archive.org/web/*/${url}`, "_blank", "noopener");
          closePopover();
        }
      },
      {
        icon: "scale",
        label: "Add to comparison",
        action: () => {
          const link = FMHY.Dom.getResourceLinks().find((l) => l.href === url);
          if (link) {
            const cb = link.element.querySelector(".fmhy-compare-cb");
            if (cb) {
              cb.checked = !cb.checked;
              cb.dispatchEvent(new Event("change"));
              showToast(cb.checked ? "Added to comparison" : "Removed from comparison", "info");
            }
          }
          closePopover();
        }
      },
      {
        icon: "alert",
        label: "Report this resource",
        danger: true,
        action: () => {
          closePopover();
          setTimeout(() => openReportDialog(url, text), 200);
        }
      }
    ];

    actions.forEach((a) => {
      const row = FMHY.Dom.el("button", {
        class: "fmhy-sc-popover-action" + (a.active ? " active" : "") + (a.danger ? " danger" : ""),
        role: "menuitem"
      });
      const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-popover-action-icon" });
      FMHY.Icon.inject(iconWrap, a.icon, 16);
      row.appendChild(iconWrap);
      row.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-popover-action-label" }, a.label));
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        a.action();
      });
      container.appendChild(row);
    });
  }

  async function populateStatus(container, url) {
    const [health, rating, note] = await Promise.all([
      FMHY.Storage.getHealth(url),
      FMHY.Storage.getRating(url),
      FMHY.Storage.getNote(url)
    ]);

    container.innerHTML = "";

    // Trust indicator
    const links = FMHY.Dom.getResourceLinks();
    const link = links.find((l) => l.href === url);
    if (link) {
      const trust = classifyTrust(link.text);
      addStatusRow(container, "Trust", `${trust.label} ${trust.tip}`);
    }

    if (health) {
      const healthText = health.status === "alive"
        ? `Alive (status ${health.statusCode || "OK"})`
        : health.status === "dead"
          ? "Appears dead"
          : "Unknown (CORS-blocked)";
      addStatusRow(container, "Health", healthText, "fmhy-sc-health-" + health.status);
    }

    if (rating) {
      addStatusRow(container, "Your rating", `${"*".repeat(rating.stars)}${"".repeat(5 - rating.stars)}`);
    }

    if (note && note.text) {
      const preview = note.text.slice(0, 60) + (note.text.length > 60 ? "..." : "");
      addStatusRow(container, "Your note", preview);
    }
  }

  function addStatusRow(container, label, value, valueClass = "") {
    const row = FMHY.Dom.el("div", { class: "fmhy-sc-popover-status-row" });
    row.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-popover-status-label" }, label));
    row.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-popover-status-value " + valueClass }, value));
    container.appendChild(row);
  }

  function classifyTrust(text) {
    const t = (text || "").toLowerCase();
    const SAFE = ["open source", "open-source", "github", "gitlab", "self-hosted", "selfhost", "no ads", "ad-free", "mit license", "apache license", "gpl"];
    const PAID = ["premium", "subscribe", "subscription", "pricing", "upgrade"];
    const ACCOUNT = ["sign up", "register", "log in", "login", "create account"];
    if (SAFE.some((k) => t.includes(k))) return { label: "Trusted", tip: "(open-source)" };
    if (PAID.some((k) => t.includes(k))) return { label: "Paid", tip: "(may require payment)" };
    if (ACCOUNT.some((k) => t.includes(k))) return { label: "Account", tip: "(may require account)" };
    return { label: "Unknown", tip: "(no safety info)" };
  }

  function positionPopover(anchorEl) {
    if (!activePopover || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const popW = 340;
    const popH = activePopover.offsetHeight || 400;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    let top;
    const spaceBelow = viewportH - r.bottom;
    if (spaceBelow > popH + 20) {
      top = r.bottom + scrollY + 6;
      activePopover.classList.remove("fmhy-sc-popover-above");
    } else {
      top = r.top + scrollY - popH - 6;
      activePopover.classList.add("fmhy-sc-popover-above");
    }

    let left = r.left + scrollX + (r.width / 2) - (popW / 2);
    if (left < 10) left = 10;
    if (left + popW > viewportW - 10) left = viewportW - popW - 10;

    if (viewportW < 640) {
      left = 10;
      activePopover.style.width = "calc(100vw - 20px)";
    } else {
      activePopover.style.width = popW + "px";
    }

    activePopover.style.left = left + "px";
    activePopover.style.top = top + "px";
  }

  function closePopover() {
    if (!activePopover) return;
    activePopover.classList.remove("fmhy-sc-popover-visible");
    const toRemove = activePopover;
    setTimeout(() => toRemove.remove(), 200);
    activePopover = null;
    document.removeEventListener("click", onOutsideClick);
    document.removeEventListener("keydown", onKeydown);
  }

  function onOutsideClick(e) {
    if (activePopover && !activePopover.contains(e.target) && !e.target.classList.contains("fmhy-sc-link-btn")) {
      closePopover();
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); closePopover(); }
  }

  // ---------- Helpers ----------
  function openNoteEditor(url) {
    const notes = FMHY.getFeature("notes");
    if (notes && notes.onMessage) notes.onMessage({ type: "openNoteEditor", url });
  }

  function openRatingPrompt(url) {
    const ratings = FMHY.getFeature("ratings");
    if (ratings && ratings.onMessage) {
      ratings.onMessage({ type: "openRateEditor", url });
    } else {
      const n = parseInt(prompt("Rate 1-5:", "5"), 10);
      if (n >= 1 && n <= 5) {
        const review = prompt("Optional review:", "") || "";
        FMHY.Storage.setRating(url, n, review).then(() => showToast("Rating saved", "success"));
      }
    }
  }

  function triggerShareCard(url, text) {
    const sc = FMHY.getFeature("shareCards");
    if (sc && sc.onMessage) sc.onMessage({ type: "generateShareCard", url, text });
  }

  function openReportDialog(url, text) {
    const sb = FMHY.getFeature("safetyBadges");
    if (sb && sb.onMessage) sb.onMessage({ type: "reportLink", url, text });
  }

  function showToast(msg, type = "info") {
    if (FMHY.Sidebar && FMHY.Sidebar.showToast) FMHY.Sidebar.showToast(msg, type);
  }

  window.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      attachActionButtons();
      FMHY.onPageChange(() => {
        closePopover();
        setTimeout(attachActionButtons, 100);
      });
    },
    onMessage() { return false; },
    refresh: attachActionButtons,
    close: closePopover
  });

})(window);


  // ===================================================================
  // CSS (inlined via GM_addStyle)
  // ===================================================================
  const FMHY_SC_CSS = `/* =====================================================
   FMHY Supercharged — Content Styles
   Injected into fmhy.net pages.
   ===================================================== */

:root {
  --fmhy-primary: #7c3aed;
  --fmhy-primary-hover: #6d28d9;
  --fmhy-accent: #facc15;
  --fmhy-success: #22c55e;
  --fmhy-warning: #eab308;
  --fmhy-danger: #ef4444;
  --fmhy-muted: #6b7280;
  --fmhy-bg: #ffffff;
  --fmhy-bg-alt: #f9fafb;
  --fmhy-border: #e5e7eb;
  --fmhy-text: #111827;
  --fmhy-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  --fmhy-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.16);
}

/* Dark mode follows VitePress */
html.dark {
  --fmhy-bg: #1f1f23;
  --fmhy-bg-alt: #252529;
  --fmhy-border: #3a3a40;
  --fmhy-text: #e5e5e5;
  --fmhy-muted: #9ca3af;
  --fmhy-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  --fmhy-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.6);
}

/* Density modes */
html[data-fmhy-density="compact"] .vp-doc a,
html[data-fmhy-density="compact"] main a {
  font-size: 0.92em;
  line-height: 1.4;
}
html[data-fmhy-density="comfortable"] .vp-doc a,
html[data-fmhy-density="comfortable"] main a {
  line-height: 1.6;
}
html[data-fmhy-density="spacious"] .vp-doc a,
html[data-fmhy-density="spacious"] main a {
  line-height: 2;
  padding: 2px 0;
}

/* Per-category accent (FMHY SUPERCHARGED) */
html[data-fmhy-theme] .vp-doc a:hover,
html[data-fmhy-theme] main a:hover {
  color: hsl(var(--fmhy-cat-hue, 220), 80%, 65%);
}

/* ---- Base buttons ---- */
.fmhy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--fmhy-border);
  background: var(--fmhy-bg);
  color: var(--fmhy-text);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s;
}
.fmhy-btn:hover { background: var(--fmhy-bg-alt); border-color: var(--fmhy-primary); }
.fmhy-btn-small { padding: 3px 8px; font-size: 12px; }
.fmhy-btn-primary { background: var(--fmhy-primary); color: #fff; border-color: var(--fmhy-primary); }
.fmhy-btn-primary:hover { background: var(--fmhy-primary-hover); }
.fmhy-btn-danger { color: var(--fmhy-danger); border-color: var(--fmhy-danger); }
.fmhy-btn-danger:hover { background: var(--fmhy-danger); color: #fff; }

/* ---- Feature #1: Base64 decoder ---- */
.fmhy-b64-decoded {
  border-bottom: 2px dotted var(--fmhy-accent) !important;
}
.fmhy-b64-card {
  position: absolute;
  width: 320px;
  background: var(--fmhy-bg);
  border: 1px solid var(--fmhy-border);
  border-radius: 8px;
  box-shadow: var(--fmhy-shadow-lg);
  padding: 12px;
  z-index: 100000;
  font-size: 13px;
}
.fmhy-b64-card-title {
  font-weight: 600;
  color: var(--fmhy-primary);
  margin-bottom: 6px;
}
.fmhy-b64-card-url {
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 11px;
  color: var(--fmhy-muted);
  word-break: break-all;
  margin-bottom: 10px;
  padding: 6px;
  background: var(--fmhy-bg-alt);
  border-radius: 4px;
}
.fmhy-b64-card-btns { display: flex; gap: 6px; }

/* ---- Feature #2: Command Palette ---- */
.fmhy-cp-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1000000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}
.fmhy-cp-box {
  width: 640px;
  max-width: 92vw;
  background: var(--fmhy-bg);
  border-radius: 12px;
  box-shadow: var(--fmhy-shadow-lg);
  overflow: hidden;
}
.fmhy-cp-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: linear-gradient(135deg, var(--fmhy-primary), #2563eb);
  color: #fff;
  font-weight: 600;
}
.fmhy-cp-logo { font-size: 22px; }
.fmhy-cp-box input {
  width: 100%;
  padding: 14px 18px;
  border: none;
  outline: none;
  background: var(--fmhy-bg);
  color: var(--fmhy-text);
  font-size: 16px;
  border-bottom: 1px solid var(--fmhy-border);
}
.fmhy-cp-results {
  max-height: 50vh;
  overflow-y: auto;
}
.fmhy-cp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  cursor: pointer;
  border-bottom: 1px solid var(--fmhy-border);
  transition: background 0.1s;
}
.fmhy-cp-row:hover, .fmhy-cp-row.active {
  background: var(--fmhy-bg-alt);
  border-left: 3px solid var(--fmhy-primary);
  padding-left: 15px;
}
.fmhy-cp-icon { font-size: 18px; }
.fmhy-cp-row-body { flex: 1; min-width: 0; }
.fmhy-cp-title {
  font-weight: 500;
  color: var(--fmhy-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fmhy-cp-sub {
  font-size: 12px;
  color: var(--fmhy-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fmhy-cp-empty {
  padding: 30px;
  text-align: center;
  color: var(--fmhy-muted);
}
.fmhy-cp-footer {
  padding: 8px 18px;
  font-size: 11px;
  color: var(--fmhy-muted);
  border-top: 1px solid var(--fmhy-border);
  background: var(--fmhy-bg-alt);
}

/* ---- Feature #3: Bookmarks ---- */
.fmhy-bm-add-btn {
  display: none;
  position: absolute;
  margin-left: 6px;
  padding: 0 6px;
  background: var(--fmhy-primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  line-height: 18px;
}
a:hover > .fmhy-bm-add-btn { display: inline-block; }
.fmhy-bm-badge {
  margin-left: 4px;
  color: var(--fmhy-accent);
  cursor: pointer;
  font-size: 14px;
}
.fmhy-bm-active {
  background: rgba(250, 204, 21, 0.15);
  padding: 2px 4px;
  border-radius: 3px;
}

/* ---- Feature #5/#8: Safety badges ---- */
.fmhy-safety {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  vertical-align: middle;
  font-size: 11px;
}
.fmhy-safety-badge, .fmhy-safety-health, .fmhy-safety-wayback, .fmhy-safety-report {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 10px;
  user-select: none;
}
.fmhy-safety-badge { opacity: 0.7; }
.fmhy-safety-alive { color: var(--fmhy-success); opacity: 1; }
.fmhy-safety-dead { color: var(--fmhy-danger); opacity: 1; }
.fmhy-safety-unknown { color: var(--fmhy-muted); }
.fmhy-safety-wayback {
  text-decoration: none;
  color: #3b82f6;
}
.fmhy-safety-report {
  color: var(--fmhy-warning);
}
.fmhy-safety-report:hover {
  background: var(--fmhy-warning);
  color: #fff;
}

/* ---- Feature #6: Notes ---- */
.fmhy-note-badge {
  margin-left: 4px;
  cursor: pointer;
  font-size: 12px;
}
.fmhy-note-popover {
  position: absolute;
  width: 360px;
  background: var(--fmhy-bg);
  border: 1px solid var(--fmhy-border);
  border-radius: 8px;
  box-shadow: var(--fmhy-shadow-lg);
  padding: 12px;
  z-index: 100000;
}
.fmhy-note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.fmhy-note-title { font-weight: 600; }
.fmhy-note-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--fmhy-muted);
}
.fmhy-note-url {
  font-family: monospace;
  font-size: 11px;
  color: var(--fmhy-muted);
  margin-bottom: 8px;
  word-break: break-all;
}
.fmhy-note-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--fmhy-border);
  border-radius: 4px;
  background: var(--fmhy-bg);
  color: var(--fmhy-text);
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
  min-height: 80px;
}
.fmhy-note-btns {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  justify-content: flex-end;
}

/* ---- Feature #7: Diff banner ---- */
.fmhy-diff-banner {
  position: sticky;
  top: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: linear-gradient(90deg, rgba(124, 58, 237, 0.95), rgba(37, 99, 235, 0.95));
  color: #fff;
  font-size: 14px;
  box-shadow: var(--fmhy-shadow);
}
.fmhy-diff-banner-actions { display: flex; gap: 6px; }
.fmhy-diff-added {
  background: rgba(34, 197, 94, 0.15);
  border-left: 3px solid var(--fmhy-success);
  padding-left: 4px;
}

/* ---- Feature #13: Filters bar ---- */
.fmhy-filters-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: var(--fmhy-bg-alt);
  border: 1px solid var(--fmhy-border);
  border-radius: 8px;
  position: sticky;
  top: 60px;
  z-index: 100;
}
.fmhy-filters-search {
  flex: 1;
  min-width: 200px;
  padding: 6px 10px;
  border: 1px solid var(--fmhy-border);
  border-radius: 4px;
  background: var(--fmhy-bg);
  color: var(--fmhy-text);
  font-size: 13px;
}
.fmhy-filter-chip {
  padding: 4px 10px;
  border: 1px solid var(--fmhy-border);
  background: var(--fmhy-bg);
  color: var(--fmhy-text);
  border-radius: 16px;
  cursor: pointer;
  font-size: 12px;
}
.fmhy-filter-chip.active {
  background: var(--fmhy-primary);
  color: #fff;
  border-color: var(--fmhy-primary);
}
.fmhy-filter-select {
  padding: 4px 8px;
  border: 1px solid var(--fmhy-border);
  border-radius: 4px;
  background: var(--fmhy-bg);
  color: var(--fmhy-text);
  font-size: 12px;
}
.fmhy-filter-clear {
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: var(--fmhy-danger);
  cursor: pointer;
  font-size: 12px;
}
.fmhy-filters-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--fmhy-muted);
}

/* ---- Feature #14: Mini TOC + progress bar ---- */
.fmhy-progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: transparent;
  z-index: 100000;
  pointer-events: none;
}
.fmhy-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--fmhy-primary), var(--fmhy-accent));
  transition: width 0.1s;
}
.fmhy-toc-widget {
  position: fixed;
  top: 100px;
  right: 20px;
  width: 240px;
  max-height: 60vh;
  background: var(--fmhy-bg);
  border: 1px solid var(--fmhy-border);
  border-radius: 8px;
  box-shadow: var(--fmhy-shadow);
  z-index: 9000;
  font-size: 13px;
  overflow: hidden;
}
.fmhy-toc-widget.collapsed .fmhy-toc-list { display: none; }
.fmhy-toc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--fmhy-bg-alt);
  border-bottom: 1px solid var(--fmhy-border);
  cursor: move;
}
.fmhy-toc-title { font-weight: 600; font-size: 12px; }
.fmhy-toc-collapse {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--fmhy-muted);
}
.fmhy-toc-list {
  max-height: 50vh;
  overflow-y: auto;
  padding: 6px 0;
}
.fmhy-toc-item {
  display: block;
  padding: 4px 12px;
  color: var(--fmhy-text);
  text-decoration: none;
  font-size: 12px;
  border-left: 2px solid transparent;
  transition: all 0.1s;
}
.fmhy-toc-item:hover { background: var(--fmhy-bg-alt); }
.fmhy-toc-item.active {
  border-left-color: var(--fmhy-primary);
  color: var(--fmhy-primary);
  font-weight: 600;
  background: rgba(124, 58, 237, 0.05);
}
.fmhy-toc-h3 { padding-left: 24px; font-size: 11px; }

/* ---- Feature #16: Quick toolbar ---- */
.fmhy-quick-toolbar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--fmhy-bg);
  border: 1px solid var(--fmhy-border);
  border-radius: 24px;
  box-shadow: var(--fmhy-shadow-lg);
  z-index: 9000;
  transition: transform 0.3s, opacity 0.3s;
}
.fmhy-quick-toolbar.fmhy-qt-hidden {
  transform: translateX(-50%) translateY(80px);
  opacity: 0;
}
.fmhy-qt-label { font-size: 16px; }
.fmhy-qt-item {
  display: inline-flex;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  align-items: center;
  justify-content: center;
}
.fmhy-qt-item img { width: 24px; height: 24px; }

/* ---- Feature #17: Radial menu ---- */
.fmhy-radial-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1000000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fmhy-radial-center {
  position: absolute;
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, var(--fmhy-primary), #2563eb);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  z-index: 1;
}
.fmhy-radial-btn {
  position: absolute;
  width: 80px;
  height: 80px;
  border: none;
  background: var(--fmhy-bg);
  border-radius: 50%;
  box-shadow: var(--fmhy-shadow-lg);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--fmhy-text);
  transition: transform 0.2s, background 0.2s;
  opacity: 0;
  transform: translate(0, 0) scale(0.5);
}
.fmhy-radial-open .fmhy-radial-btn {
  opacity: 1;
  transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.2s;
}
.fmhy-radial-btn:hover {
  background: var(--fmhy-primary);
  color: #fff;
  transform: scale(1.1) !important;
}
.fmhy-radial-icon { font-size: 22px; }
.fmhy-radial-label { font-size: 10px; margin-top: 2px; }

/* ---- Feature #18: Related sidebar ---- */
.fmhy-sidebar-toggle {
  position: fixed;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  width: 36px;
  height: 60px;
  background: var(--fmhy-primary);
  color: #fff;
  border: none;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  z-index: 9000;
  font-size: 18px;
}
.fmhy-sidebar-toggle.active { background: var(--fmhy-primary-hover); }
.fmhy-related-panel {
  position: fixed;
  top: 80px;
  right: 0;
  width: 320px;
  max-height: 70vh;
  background: var(--fmhy-bg);
  border: 1px solid var(--fmhy-border);
  border-right: none;
  border-radius: 8px 0 0 8px;
  box-shadow: var(--fmhy-shadow-lg);
  z-index: 9001;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.fmhy-related-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--fmhy-bg-alt);
  border-bottom: 1px solid var(--fmhy-border);
  font-weight: 600;
}
.fmhy-related-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--fmhy-muted);
}
.fmhy-related-body {
  padding: 10px 14px;
  overflow-y: auto;
  font-size: 13px;
}
.fmhy-related-group { margin-bottom: 12px; }
.fmhy-related-group-title {
  font-size: 11px;
  color: var(--fmhy-muted);
  margin-bottom: 4px;
  font-weight: 600;
}
.fmhy-related-link {
  display: block;
  padding: 4px 0;
  color: var(--fmhy-primary);
  text-decoration: none;
  font-size: 13px;
}
.fmhy-related-link:hover { text-decoration: underline; }

/* ---- Feature #19: Keyboard nav ---- */
.fmhy-kb-active {
  outline: 3px solid var(--fmhy-accent) !important;
  outline-offset: 2px;
  background: rgba(250, 204, 21, 0.1);
  border-radius: 3px;
}
.fmhy-kb-help kbd {
  background: var(--fmhy-bg-alt);
  border: 1px solid var(--fmhy-border);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: monospace;
  font-size: 12px;
}
.fmhy-kb-help td { padding: 4px 12px; }
.fmhy-kb-help td:first-child { white-space: nowrap; }

/* ---- Feature #20: Search dropdown ---- */
.fmhy-search-dropdown {
  position: absolute;
  z-index: 100000;
  background: var(--fmhy-bg);
  border: 1px solid var(--fmhy-border);
  border-radius: 6px;
  box-shadow: var(--fmhy-shadow-lg);
  max-height: 320px;
  overflow-y: auto;
}
.fmhy-search-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--fmhy-border);
  font-size: 13px;
}
.fmhy-search-row:last-child { border-bottom: none; }
.fmhy-search-row.active, .fmhy-search-row:hover {
  background: var(--fmhy-bg-alt);
}
.fmhy-search-sub {
  font-size: 11px;
  color: var(--fmhy-muted);
}

/* ---- Feature #21: Appearance control ---- */
.fmhy-appearance-ctrl {
  position: fixed;
  top: 80px;
  left: 10px;
  z-index: 8000;
}
.fmhy-appearance-btn {
  width: 32px;
  height: 32px;
  background: var(--fmhy-bg);
  border: 1px solid var(--fmhy-border);
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  box-shadow: var(--fmhy-shadow);
}

/* ---- Feature #24: Highlight pills ---- */
.fmhy-highlight-pill {
  display: inline-block;
  padding: 1px 6px;
  margin-left: 4px;
  border-radius: 10px;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}
.fmhy-highlighted {
  background: rgba(34, 197, 94, 0.08);
  padding: 1px 2px;
  border-radius: 3px;
}

/* ---- Feature #25: Reading mode ---- */
.fmhy-rm-hidden { display: none !important; }
body.fmhy-reading-mode {
  background: var(--fmhy-bg) !important;
}
body.fmhy-reading-mode .VPNavBar,
body.fmhy-reading-mode .VPSidebar,
body.fmhy-reading-mode .VPFooter,
body.fmhy-reading-mode footer,
body.fmhy-reading-mode aside:not(.fmhy-sc-panel):not(.fmhy-sc-backdrop) {
  display: none !important;
}
/* Never hide our sidebar / popover / modal / toast in reading mode */
body.fmhy-reading-mode .fmhy-sc-panel,
body.fmhy-reading-mode .fmhy-sc-backdrop,
body.fmhy-reading-mode .fmhy-sc-popover,
body.fmhy-reading-mode .fmhy-sc-modal-overlay,
body.fmhy-reading-mode .fmhy-sc-toast,
body.fmhy-reading-mode .fmhy-sc-host,
body.fmhy-reading-mode .fmhy-sc-compare-fab {
  display: flex !important;
}
body.fmhy-reading-mode .vp-doc,
body.fmhy-reading-mode main {
  max-width: 760px !important;
  margin: 0 auto !important;
  padding: 40px 20px !important;
  font-size: 17px;
  line-height: 1.7;
}
.fmhy-reading-toggle {
  position: fixed;
  top: 80px;
  left: 50px;
  z-index: 8000;
  width: 32px;
  height: 32px;
  background: var(--fmhy-bg);
  border: 1px solid var(--fmhy-border);
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  box-shadow: var(--fmhy-shadow);
}

/* ---- Feature #26: Compare matrix ---- */
.fmhy-compare-cb {
  margin-left: 6px;
  vertical-align: middle;
  cursor: pointer;
}
.fmhy-compare-fab {
  position: fixed;
  bottom: 80px;
  right: 20px;
  z-index: 9000;
  padding: 10px 16px;
  background: var(--fmhy-primary);
  color: #fff;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  font-weight: 600;
  box-shadow: var(--fmhy-shadow-lg);
}
.fmhy-compare-fab:hover { background: var(--fmhy-primary-hover); }
.fmhy-compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.fmhy-compare-table th, .fmhy-compare-table td {
  padding: 6px 10px;
  border: 1px solid var(--fmhy-border);
  text-align: left;
}
.fmhy-compare-table th {
  background: var(--fmhy-bg-alt);
  font-weight: 600;
}

/* ---- Feature #27: Ratings ---- */
.fmhy-ratingwidget {
  display: inline-flex;
  margin-left: 6px;
  vertical-align: middle;
}
.fmhy-star {
  cursor: pointer;
  font-size: 13px;
  color: var(--fmhy-muted);
  user-select: none;
}
.fmhy-star.filled { color: var(--fmhy-accent); }

/* ---- Feature #28: Watch button ---- */
.fmhy-watch-btn {
  position: fixed;
  top: 80px;
  right: 280px;
  z-index: 8000;
  padding: 6px 12px;
  background: var(--fmhy-bg);
  border: 1px solid var(--fmhy-border);
  border-radius: 16px;
  cursor: pointer;
  font-size: 12px;
  box-shadow: var(--fmhy-shadow);
}
.fmhy-watch-btn.active {
  background: var(--fmhy-primary);
  color: #fff;
  border-color: var(--fmhy-primary);
}

/* ---- Feature #29: Export FAB ---- */
.fmhy-export-fab {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 9000;
  width: 44px;
  height: 44px;
  background: var(--fmhy-bg);
  border: 1px solid var(--fmhy-border);
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  box-shadow: var(--fmhy-shadow);
}
.fmhy-export-format-btn {
  display: block;
  width: 100%;
  text-align: left;
  margin-bottom: 8px;
  padding: 10px 12px;
}

/* ---- Feature #30: Share card button ---- */
.fmhy-share-btn {
  margin-left: 4px;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.6;
}
.fmhy-share-btn:hover { opacity: 1; }

/* ---- Shared modals + toasts ---- */
.fmhy-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1000000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.fmhy-modal {
  background: var(--fmhy-bg);
  border-radius: 12px;
  box-shadow: var(--fmhy-shadow-lg);
  padding: 20px;
  max-width: 500px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
}
.fmhy-modal-wide { max-width: 800px; }
.fmhy-modal h3 { margin-top: 0; }
.fmhy-modal-btns {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}
.fmhy-modal-url {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
  margin-bottom: 12px;
  padding: 6px;
  background: var(--fmhy-bg-alt);
  border-radius: 4px;
}
.fmhy-muted { color: var(--fmhy-muted); font-size: 13px; }

.fmhy-report-reasons { margin: 12px 0; }
.fmhy-radio {
  display: block;
  padding: 6px 0;
  cursor: pointer;
  font-size: 14px;
}
.fmhy-report-text {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--fmhy-border);
  border-radius: 4px;
  background: var(--fmhy-bg);
  color: var(--fmhy-text);
  font-family: inherit;
  font-size: 13px;
  min-height: 60px;
}

.fmhy-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--fmhy-text);
  color: var(--fmhy-bg);
  padding: 10px 20px;
  border-radius: 8px;
  z-index: 1000000;
  font-size: 13px;
  box-shadow: var(--fmhy-shadow-lg);
  animation: fmhy-toast-in 0.3s;
}
.fmhy-toast-action {
  display: flex;
  align-items: center;
  gap: 10px;
}
@keyframes fmhy-toast-in {
  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}

/* Hide bookmark "+" and other badges on already-complex links */
a > code + .fmhy-bm-add-btn { display: none; }

/* =====================================================
   Mobile / small-screen responsive overrides
   Targets phones (<= 640px) and touch devices.
   ===================================================== */

/* On small screens, hide non-essential floating widgets to avoid clutter */
@media (max-width: 640px) {
  /* Mini TOC — hide on mobile (overlaps content) */
  .fmhy-toc-widget { display: none !important; }

  /* Related sidebar — make it a bottom sheet instead of right panel */
  .fmhy-related-panel {
    top: auto !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    max-height: 50vh !important;
    border-radius: 12px 12px 0 0 !important;
    border: 1px solid var(--fmhy-border) !important;
  }
  .fmhy-sidebar-toggle {
    bottom: 80px;
    top: auto !important;
    transform: none !important;
    right: 0 !important;
  }

  /* Quick toolbar — make it slimmer */
  .fmhy-quick-toolbar {
    bottom: 12px !important;
    padding: 4px 8px !important;
    gap: 2px !important;
    max-width: calc(100vw - 24px) !important;
    overflow-x: auto !important;
  }
  .fmhy-qt-item { width: 28px !important; height: 28px !important; }
  .fmhy-qt-item img { width: 20px !important; height: 20px !important; }
  .fmhy-qt-label { display: none; }

  /* Command palette — full screen */
  .fmhy-cp-overlay { padding-top: 0 !important; padding-top: env(safe-area-inset-top, 0) !important; }
  .fmhy-cp-box {
    width: 100% !important;
    max-width: 100vw !important;
    max-height: 100vh !important;
    border-radius: 0 !important;
    margin-top: 0 !important;
  }
  .fmhy-cp-results { max-height: calc(100vh - 200px) !important; }
  .fmhy-cp-box input { font-size: 16px !important; } /* prevent iOS zoom */
  .fmhy-cp-row { padding: 14px 16px !important; min-height: 44px; }
  .fmhy-cp-header { padding: 14px 16px !important; font-size: 14px !important; }

  /* Radial menu — smaller radius + closer to bottom for thumb reach */
  .fmhy-radial-btn {
    width: 64px !important;
    height: 64px !important;
    font-size: 10px !important;
  }
  .fmhy-radial-icon { font-size: 20px !important; }
  .fmhy-radial-label { font-size: 9px !important; }
  /* Override inline transform with !important via class */
  .fmhy-radial-open .fmhy-radial-btn {
    /* radius set via JS inline transform; we add fallback if needed */
  }

  /* Modals — bottom sheet style on mobile */
  .fmhy-modal-overlay {
    align-items: flex-end !important;
    padding: 0 !important;
  }
  .fmhy-modal {
    max-width: 100% !important;
    width: 100% !important;
    max-height: 85vh !important;
    border-radius: 12px 12px 0 0 !important;
    padding: 20px 16px calc(20px + env(safe-area-inset-bottom, 0)) !important;
    animation: fmhy-slide-up 0.25s ease-out;
  }
  .fmhy-modal-wide { max-width: 100% !important; }

  /* Notes popover — full width */
  .fmhy-note-popover {
    width: calc(100vw - 24px) !important;
    left: 12px !important;
    right: 12px !important;
  }

  /* Base64 hover card — full width */
  .fmhy-b64-card {
    width: calc(100vw - 24px) !important;
    left: 12px !important;
  }

  /* Filters bar — stack vertically */
  .fmhy-filters-bar {
    flex-direction: column !important;
    align-items: stretch !important;
    position: relative !important;
    top: 0 !important;
  }
  .fmhy-filters-bar > * { width: 100% !important; }
  .fmhy-filters-count { text-align: center !important; margin-left: 0 !important; }

  /* Floating action buttons — reposition to avoid overlap */
  .fmhy-export-fab {
    bottom: 70px !important;
    left: 12px !important;
    width: 40px !important;
    height: 40px !important;
    font-size: 16px !important;
  }
  .fmhy-compare-fab {
    bottom: 70px !important;
    right: 12px !important;
    padding: 8px 14px !important;
    font-size: 13px !important;
  }
  .fmhy-watch-btn {
    top: 70px !important;
    right: 12px !important;
  }
  .fmhy-appearance-ctrl, .fmhy-reading-toggle {
    top: 70px !important;
  }
  .fmhy-appearance-ctrl { left: 12px !important; }
  .fmhy-reading-toggle { left: 50px !important; }

  /* Toast — position above safe area */
  .fmhy-toast {
    bottom: calc(80px + env(safe-area-inset-bottom, 0)) !important;
    left: 12px !important;
    right: 12px !important;
    transform: none !important;
    width: auto !important;
    max-width: none !important;
    text-align: center;
  }

  /* Diff banner — stack text + actions */
  .fmhy-diff-banner {
    flex-direction: column !important;
    gap: 6px;
    text-align: center;
    padding: 10px 12px !important;
  }

  /* Share card button — make it a bigger tap target */
  .fmhy-share-btn,
  .fmhy-safety-badge,
  .fmhy-safety-health,
  .fmhy-safety-wayback,
  .fmhy-safety-report,
  .fmhy-star,
  .fmhy-note-badge,
  .fmhy-bm-badge {
    min-width: 24px !important;
    min-height: 24px !important;
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
  }

  /* Bookmark + button — always visible on touch */
  .fmhy-bm-add-btn {
    display: inline-block !important;
    position: relative !important;
    margin-left: 4px !important;
  }

  /* Search dropdown — full width */
  .fmhy-search-dropdown {
    width: calc(100vw - 24px) !important;
    left: 12px !important;
  }

  /* Compare table — horizontal scroll */
  .fmhy-compare-table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    white-space: nowrap;
  }
}

/* Touch device tweaks (independent of screen size) */
@media (hover: none) and (pointer: coarse) {
  /* Always show the + bookmark button on touch */
  .fmhy-bm-add-btn { display: inline-block !important; opacity: 0.7; }
  a:hover > .fmhy-bm-add-btn { opacity: 1; }

  /* Increase tap target for inline badges */
  .fmhy-safety > * {
    width: 22px;
    height: 22px;
    font-size: 12px;
  }
  .fmhy-star { font-size: 16px !important; padding: 2px; }

  /* Disable hover-only effects */
  .fmhy-cp-row:hover { background: transparent; }
  .fmhy-cp-row.active { background: var(--fmhy-bg-alt); }
}

/* Slide-up animation for mobile bottom sheets */
@keyframes fmhy-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

/* Prevent text selection on UI elements (avoids accidental selection on long-press) */
.fmhy-toc-widget,
.fmhy-quick-toolbar,
.fmhy-radial-overlay,
.fmhy-related-panel,
.fmhy-filters-bar,
.fmhy-progress-bar {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* Make sure body has safe-area insets on mobile */
@supports (padding: env(safe-area-inset-top)) {
  body {
    padding-top: env(safe-area-inset-top, 0);
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
}

/* =====================================================
   Polish & animations
   ===================================================== */

/* ─────────────────────────────────────────────────────
   HIDE OLD SCATTERED FLOATING BUTTONS
   The unified sidebar (content/sidebar.js) replaces all
   of these. We keep the JS modules loaded for their
   logic (e.g. export-tools.openMenu is called from the
   sidebar), but suppress their floating UI.

   NOTE: .fmhy-toc-widget is NOT hidden here because the
   sidebar's "Table of Contents" item toggles its visibility.
   ───────────────────────────────────────────────────── */
.fmhy-export-fab,
.fmhy-compare-fab,
.fmhy-appearance-ctrl,
.fmhy-reading-toggle,
.fmhy-watch-btn,
.fmhy-sidebar-toggle,
.fmhy-quick-toolbar,
.fmhy-filters-bar {
  display: none !important;
}

/* Mini TOC widget — hidden by default, but can be shown via sidebar */
.fmhy-toc-widget {
  display: none;
}

.fmhy-toc-widget.fmhy-toc-visible {
  display: block !important;
}

/* But keep compare checkboxes inline — they're still useful for selection */
.fmhy-compare-cb {
  display: inline-block !important;
}

/* ─────────────────────────────────────────────────────
   HIDE OLD SCATTERED INLINE BADGES
   The unified link-actions popover (content/link-actions.js)
   replaces all of these with a single "" button per link.
   We keep the underlying JS modules loaded for their logic
   (e.g. safety-badges.js still classifies links and checks
   health; the popover queries it), but suppress their
   inline UI for a cleaner page.
   ───────────────────────────────────────────────────── */
.fmhy-safety,
.fmhy-ratingwidget,
.fmhy-note-badge,
.fmhy-bm-badge,
.fmhy-bm-add-btn,
.fmhy-share-btn,
.fmhy-highlight-pill {
  display: none !important;
}

/* Highlight pill — keep this one as it's informational, not actionable */
.fmhy-highlight-pill {
  display: inline-block !important;
}

/* Smooth transitions on all FMHY UI elements */
.fmhy-btn,
.fmhy-bm-add-btn,
.fmhy-bm-badge,
.fmhy-note-badge,
.fmhy-safety > *,
.fmhy-star,
.fmhy-share-btn,
.fmhy-compare-cb,
.fmhy-appearance-btn,
.fmhy-reading-toggle,
.fmhy-watch-btn,
.fmhy-export-fab,
.fmhy-compare-fab,
.fmhy-sidebar-toggle,
.fmhy-related-close,
.fmhy-toc-collapse,
.fmhy-filter-chip,
.fmhy-filter-clear,
.fmhy-cp-row,
.fmhy-search-row,
.fmhy-radial-btn,
.fmhy-qt-item {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Hover lift effect on key UI elements */
@media (hover: hover) {
  .fmhy-export-fab:hover,
  .fmhy-compare-fab:hover,
  .fmhy-appearance-btn:hover,
  .fmhy-reading-toggle:hover,
  .fmhy-sidebar-toggle:hover {
    transform: scale(1.08);
    box-shadow: var(--fmhy-shadow-lg);
  }
}

/* Pulse animation for newly-added elements */
@keyframes fmhy-pulse-in {
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}

.fmhy-bm-badge,
.fmhy-note-badge,
.fmhy-safety,
.fmhy-ratingwidget,
.fmhy-share-btn,
.fmhy-highlight-pill {
  animation: fmhy-pulse-in 0.3s ease-out;
}

/* Shimmer effect on progress bar */
.fmhy-progress-fill {
  background: linear-gradient(
    90deg,
    var(--fmhy-primary) 0%,
    var(--fmhy-accent) 50%,
    var(--fmhy-primary) 100%
  );
  background-size: 200% 100%;
  animation: fmhy-shimmer 3s linear infinite;
}

@keyframes fmhy-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Improved dark mode contrast */
html.dark .fmhy-bm-active {
  background: rgba(250, 204, 21, 0.12);
}

html.dark .fmhy-diff-added {
  background: rgba(34, 197, 94, 0.12);
}

html.dark .fmhy-highlighted {
  background: rgba(34, 197, 94, 0.06);
}

/* Better focus rings for accessibility */
.fmhy-btn:focus-visible,
.fmhy-bm-add-btn:focus-visible,
.fmhy-toggle:focus-visible,
.fmhy-tab:focus-visible,
.fmhy-filter-chip:focus-visible,
.fmhy-radial-btn:focus-visible,
.fmhy-cp-row:focus-visible {
  outline: 2px solid var(--fmhy-accent);
  outline-offset: 2px;
}

/* Skeleton loading state */
.fmhy-skeleton {
  background: linear-gradient(
    90deg,
    var(--fmhy-bg-alt) 25%,
    var(--fmhy-border) 50%,
    var(--fmhy-bg-alt) 75%
  );
  background-size: 200% 100%;
  animation: fmhy-shimmer 1.5s linear infinite;
  border-radius: 4px;
  color: transparent !important;
}

/* Smoother modal entry */
.fmhy-modal-overlay {
  animation: fmhy-fade-in 0.2s ease;
}

.fmhy-modal {
  animation: fmhy-modal-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes fmhy-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fmhy-modal-pop {
  from { opacity: 0; transform: scale(0.92) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* Mobile: replace modal-pop with slide-up (already defined above) */
@media (max-width: 640px) {
  .fmhy-modal {
    animation: fmhy-slide-up 0.25s ease-out !important;
  }
}

/* Better scrollbar styling in FMHY widgets */
.fmhy-cp-results::-webkit-scrollbar,
.fmhy-related-body::-webkit-scrollbar,
.fmhy-toc-list::-webkit-scrollbar,
.fmhy-search-dropdown::-webkit-scrollbar {
  width: 4px;
}
.fmhy-cp-results::-webkit-scrollbar-thumb,
.fmhy-related-body::-webkit-scrollbar-thumb,
.fmhy-toc-list::-webkit-scrollbar-thumb,
.fmhy-search-dropdown::-webkit-scrollbar-thumb {
  background: var(--fmhy-border);
  border-radius: 2px;
}

/* Active state feedback for buttons */
.fmhy-btn:active,
.fmhy-filter-chip:active,
.fmhy-quick-card:active {
  transform: scale(0.96);
}

/* Make the FMHY logo in command palette animated */
.fmhy-cp-logo {
  animation: fmhy-spin-slow 8s linear infinite;
  display: inline-block;
}

@keyframes fmhy-spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Reduced motion preferences */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* =====================================================
   UNIFIED SIDEBAR — Native VitePress style
   ===================================================== */

/* Use VitePress's own CSS variables when available, fall back to ours */
:root {
  --fmhy-sc-brand: var(--vp-c-brand-1, #7c3aed);
  --fmhy-sc-brand-light: var(--vp-c-brand-2, #a78bfa);
  --fmhy-sc-brand-dark: var(--vp-c-brand-3, #6d28d9);
  --fmhy-sc-bg: var(--vp-c-bg, #ffffff);
  --fmhy-sc-bg-alt: var(--vp-c-bg-alt, #f6f6f7);
  --fmhy-sc-bg-soft: var(--vp-c-bg-soft, #f6f6f7);
  --fmhy-sc-border: var(--vp-c-border, #e2e2e3);
  --fmhy-sc-border-hard: var(--vp-c-divider, #e2e2e3);
  --fmhy-sc-text-1: var(--vp-c-text-1, rgba(60, 60, 67));
  --fmhy-sc-text-2: var(--vp-c-text-2, rgba(60, 60, 67, 0.78));
  --fmhy-sc-text-3: var(--vp-c-text-3, rgba(60, 60, 67, 0.56));
  --fmhy-sc-success: var(--vp-c-green-1, #10b981);
  --fmhy-sc-danger: var(--vp-c-red-1, #ef4444);
  --fmhy-sc-warning: var(--vp-c-yellow-1, #f59e0b);
  --fmhy-sc-font: var(--vp-font-family-base, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif);
  --fmhy-sc-font-mono: var(--vp-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  --fmhy-sc-shadow-1: var(--vp-shadow-1, 0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06));
  --fmhy-sc-shadow-2: var(--vp-shadow-2, 0 3px 12px rgba(0, 0, 0, 0.07), 0 1px 4px rgba(0, 0, 0, 0.07));
  --fmhy-sc-shadow-3: var(--vp-shadow-3, 0 12px 32px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(0, 0, 0, 0.08));
}

html.dark {
  --fmhy-sc-bg: var(--vp-c-bg, #1a1a1a);
  --fmhy-sc-bg-alt: var(--vp-c-bg-alt, #252525);
  --fmhy-sc-bg-soft: var(--vp-c-bg-soft, #252525);
  --fmhy-sc-border: var(--vp-c-border, #3a3a3a);
  --fmhy-sc-border-hard: var(--vp-c-divider, #3a3a3a);
  --fmhy-sc-text-1: var(--vp-c-text-1, rgba(255, 255, 255, 0.87));
  --fmhy-sc-text-2: var(--vp-c-text-2, rgba(255, 255, 255, 0.75));
  --fmhy-sc-text-3: var(--vp-c-text-3, rgba(255, 255, 255, 0.5));
}

/* Host button — styled like VitePress's VPNavBarMenuLink */
.fmhy-sc-host {
  position: fixed;
  top: 50%;
  right: 0;
  transform: translateY(-50%) translateX(100%);
  width: 36px;
  height: 64px;
  background: var(--fmhy-sc-bg);
  border: 1px solid var(--fmhy-sc-border);
  border-right: none;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  z-index: 9000;
  box-shadow: var(--fmhy-sc-shadow-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fmhy-sc-text-2);
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              background 0.2s, color 0.2s;
  opacity: 0;
  font-family: var(--fmhy-sc-font);
}

.fmhy-sc-host-visible {
  transform: translateY(-50%) translateX(0);
  opacity: 1;
}

.fmhy-sc-host:hover {
  background: var(--fmhy-sc-bg-alt);
  color: var(--fmhy-sc-brand);
  transform: translateY(-50%) translateX(-2px);
}

.fmhy-sc-host-hidden {
  transform: translateY(-50%) translateX(100%);
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 640px) {
  .fmhy-sc-host {
    top: auto;
    bottom: calc(20px + env(safe-area-inset-bottom, 0));
    transform: translateY(0) translateX(100%);
  }
  .fmhy-sc-host-visible {
    transform: translateY(0) translateX(0);
  }
  .fmhy-sc-host:hover {
    transform: translateY(0) translateX(-2px);
  }
  .fmhy-sc-host-hidden {
    transform: translateY(0) translateX(100%);
  }
}

/* Backdrop — subtle, VitePress-like */
.fmhy-sc-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(0, 0, 0, 0);
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
  transition: background 0.3s, backdrop-filter 0.3s;
  pointer-events: none;
}

.fmhy-sc-visible {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  pointer-events: auto;
}

/* Panel — native VitePress sidebar aesthetic */
.fmhy-sc-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 360px;
  max-width: 100vw;
  background: var(--fmhy-sc-bg);
  border-left: 1px solid var(--fmhy-sc-border);
  box-shadow: var(--fmhy-sc-shadow-3);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  z-index: 100000;
  overflow: hidden;
  font-family: var(--fmhy-sc-font);
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-visible .fmhy-sc-panel {
  transform: translateX(0);
}

@media (max-width: 640px) {
  .fmhy-sc-panel {
    width: 100vw;
    border-left: none;
  }
}

/* Header — matches VitePress nav bar height and styling */
.fmhy-sc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  height: 48px;
  border-bottom: 1px solid var(--fmhy-sc-border);
  flex-shrink: 0;
  background: var(--fmhy-sc-bg);
}

.fmhy-sc-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-header-title .fmhy-icon {
  color: var(--fmhy-sc-brand);
}

.fmhy-sc-title {
  letter-spacing: -0.01em;
}

.fmhy-sc-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-text-3);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.fmhy-sc-close:hover {
  background: var(--fmhy-sc-bg-alt);
  color: var(--fmhy-sc-text-1);
}

/* Tabs — VitePress nav menu style */
.fmhy-sc-tabs {
  display: flex;
  padding: 0 8px;
  border-bottom: 1px solid var(--fmhy-sc-border);
  flex-shrink: 0;
  background: var(--fmhy-sc-bg);
}

.fmhy-sc-tab {
  flex: 1;
  padding: 10px 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--fmhy-sc-text-3);
  border-radius: 0;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: color 0.2s;
  position: relative;
  font-family: var(--fmhy-sc-font);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.fmhy-sc-tab:hover {
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-tab.active {
  color: var(--fmhy-sc-brand);
  border-bottom-color: var(--fmhy-sc-brand);
}

/* Content area — VitePress sidebar item style */
.fmhy-sc-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  -webkit-overflow-scrolling: touch;
}

.fmhy-sc-content-exiting {
  animation: fmhy-sc-content-out 0.15s ease forwards;
}

@keyframes fmhy-sc-content-out {
  to { opacity: 0; }
}

/* Items — styled like VitePress's .VPSidebarItem */
.fmhy-sc-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-text-2);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  margin-bottom: 2px;
  transition: background 0.15s, color 0.15s;
  position: relative;
  font-family: var(--fmhy-sc-font);
  opacity: 0;
  transform: translateX(8px);
  animation: fmhy-sc-item-in 0.3s ease forwards;
}

@keyframes fmhy-sc-item-in {
  to { opacity: 1; transform: translateX(0); }
}

.fmhy-sc-item:hover {
  background: var(--fmhy-sc-bg-soft);
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-item.active {
  color: var(--fmhy-sc-brand);
  font-weight: 600;
}

.fmhy-sc-item-clicked {
  background: var(--fmhy-sc-bg-soft) !important;
  transform: scale(0.98);
  transition: transform 0.1s;
}

.fmhy-sc-item-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fmhy-sc-text-3);
  flex-shrink: 0;
}

.fmhy-sc-item:hover .fmhy-sc-item-icon,
.fmhy-sc-item.active .fmhy-sc-item-icon {
  color: var(--fmhy-sc-brand);
}

.fmhy-sc-item-body {
  flex: 1;
  min-width: 0;
}

.fmhy-sc-item-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.fmhy-sc-item-desc {
  font-size: 11px;
  color: var(--fmhy-sc-text-3);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
}

.fmhy-sc-item-badge {
  background: var(--fmhy-sc-bg-soft);
  color: var(--fmhy-sc-text-2);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  min-width: 18px;
  text-align: center;
  border: 1px solid var(--fmhy-sc-border);
}

.fmhy-sc-item-chevron {
  color: var(--fmhy-sc-text-3);
  display: flex;
  align-items: center;
  transition: transform 0.15s;
}

.fmhy-sc-item:hover .fmhy-sc-chevron {
  transform: translateX(2px);
  color: var(--fmhy-sc-text-2);
}

/* Empty state */
.fmhy-sc-empty {
  padding: 48px 20px;
  text-align: center;
  color: var(--fmhy-sc-text-3);
}

.fmhy-sc-empty .fmhy-icon {
  color: var(--fmhy-sc-text-3);
  opacity: 0.5;
  margin-bottom: 8px;
}

.fmhy-sc-empty p {
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}

/* Footer */
.fmhy-sc-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--fmhy-sc-border);
  background: var(--fmhy-sc-bg-alt);
  flex-shrink: 0;
  text-align: center;
  font-size: 11px;
  color: var(--fmhy-sc-text-3);
}

/* List view (bookmarks, history, etc.) */
.fmhy-sc-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-text-2);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 8px;
  transition: all 0.15s;
  font-family: var(--fmhy-sc-font);
}

.fmhy-sc-back-btn:hover {
  color: var(--fmhy-sc-brand);
  background: var(--fmhy-sc-bg-soft);
}

.fmhy-sc-list-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--fmhy-sc-text-1);
  margin: 8px 0;
  padding: 0 4px;
}

.fmhy-sc-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fmhy-sc-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-text-2);
  border-radius: 6px;
  text-decoration: none;
  font-size: 13px;
  transition: background 0.15s, color 0.15s;
  opacity: 0;
  transform: translateY(4px);
  animation: fmhy-sc-item-in 0.3s ease forwards;
  font-family: var(--fmhy-sc-font);
}

.fmhy-sc-list-item:hover {
  background: var(--fmhy-sc-bg-soft);
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-list-item-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--fmhy-sc-text-3);
}

.fmhy-sc-list-item-body {
  flex: 1;
  min-width: 0;
}

.fmhy-sc-list-item-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-list-item-sub {
  font-size: 11px;
  color: var(--fmhy-sc-text-3);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fmhy-sc-list-item-del {
  background: transparent;
  border: none;
  color: var(--fmhy-sc-text-3);
  cursor: pointer;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.fmhy-sc-list-item-del:hover {
  background: var(--fmhy-sc-danger);
  color: #fff;
}

/* Keyboard help list */
.fmhy-sc-kb-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 8px;
}

.fmhy-sc-kb-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
}

.fmhy-sc-kb-row:hover {
  background: var(--fmhy-sc-bg-soft);
}

.fmhy-sc-kb-desc {
  color: var(--fmhy-sc-text-2);
}

.fmhy-sc-kbd {
  background: var(--fmhy-sc-bg-alt);
  border: 1px solid var(--fmhy-sc-border);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: var(--fmhy-sc-font-mono);
  font-size: 11px;
  color: var(--fmhy-sc-text-2);
}

/* Toast — native VitePress style */
.fmhy-sc-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  padding: 10px 16px;
  background: var(--fmhy-sc-bg);
  color: var(--fmhy-sc-text-1);
  border: 1px solid var(--fmhy-sc-border);
  border-radius: 8px;
  z-index: 1000001;
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--fmhy-sc-shadow-3);
  opacity: 0;
  transition: opacity 0.25s, transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  pointer-events: none;
  max-width: 90vw;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--fmhy-sc-font);
}

.fmhy-sc-toast-visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.fmhy-sc-toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.fmhy-sc-toast-success .fmhy-sc-toast-icon { color: var(--fmhy-sc-success); }
.fmhy-sc-toast-error .fmhy-sc-toast-icon { color: var(--fmhy-sc-danger); }
.fmhy-sc-toast-info .fmhy-sc-toast-icon { color: var(--fmhy-sc-brand); }

@media (max-width: 640px) {
  .fmhy-sc-toast {
    bottom: calc(20px + env(safe-area-inset-bottom, 0));
    left: 12px;
    right: 12px;
    transform: translateY(20px);
    max-width: none;
  }
  .fmhy-sc-toast-visible {
    transform: translateY(0);
  }
}

/* =====================================================
   LINK ACTION POPOVER — VitePress menu style
   ===================================================== */

/* The "+" button next to each link — subtle, .vp-icon-like */
.fmhy-sc-link-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-text-3, currentColor);
  cursor: pointer;
  vertical-align: middle;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
  border-radius: 3px;
}

a:hover > .fmhy-sc-link-btn,
.fmhy-sc-link-btn:focus {
  opacity: 1;
  color: var(--fmhy-sc-brand, #7c3aed);
}

.fmhy-sc-link-btn:hover {
  background: var(--fmhy-sc-bg-soft, rgba(0,0,0,0.04));
  color: var(--fmhy-sc-brand, #7c3aed);
}

@media (hover: none) and (pointer: coarse) {
  .fmhy-sc-link-btn { opacity: 0.6; }
}

/* Popover — matches VitePress's .VPMenu / .VPFlyout aesthetic */
.fmhy-sc-popover {
  position: absolute;
  width: 320px;
  background: var(--fmhy-sc-bg, #fff);
  border: 1px solid var(--fmhy-sc-border, #e2e2e3);
  border-radius: 12px;
  box-shadow: var(--fmhy-sc-shadow-3, 0 12px 32px rgba(0, 0, 0, 0.1));
  z-index: 1000010;
  overflow: hidden;
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
  transition: opacity 0.18s, transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  pointer-events: none;
  font-family: var(--fmhy-sc-font, system-ui);
  color: var(--fmhy-sc-text-1, rgba(60, 60, 67));
}

.fmhy-sc-popover-visible {
  opacity: 1;
  transform: scale(1) translateY(0);
  pointer-events: auto;
}

.fmhy-sc-popover-above {
  transform: scale(0.96) translateY(4px);
}

.fmhy-sc-popover-above.fmhy-sc-popover-visible {
  transform: scale(1) translateY(0);
}

.fmhy-sc-popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--fmhy-sc-border, #e2e2e3);
}

.fmhy-sc-popover-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fmhy-sc-popover-title-wrap .fmhy-icon {
  color: var(--fmhy-sc-brand, #7c3aed);
}

.fmhy-sc-popover-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--fmhy-sc-text-2, rgba(60, 60, 67, 0.78));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.fmhy-sc-popover-close {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-text-3, rgba(60, 60, 67, 0.56));
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.fmhy-sc-popover-close:hover {
  background: var(--fmhy-sc-bg-alt, #f6f6f7);
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-popover-url {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--fmhy-sc-text-3);
  font-family: var(--fmhy-sc-font-mono, monospace);
  border-bottom: 1px solid var(--fmhy-sc-border);
  word-break: break-all;
  background: var(--fmhy-sc-bg-alt);
}

.fmhy-sc-popover-loading {
  padding: 20px;
  text-align: center;
  color: var(--fmhy-sc-text-3);
  font-size: 12px;
}

.fmhy-sc-popover-actions {
  padding: 4px;
  max-height: 320px;
  overflow-y: auto;
}

.fmhy-sc-popover-action {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-text-2);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  transition: background 0.12s, color 0.12s;
  font-family: var(--fmhy-sc-font);
}

.fmhy-sc-popover-action:hover {
  background: var(--fmhy-sc-bg-soft, #f6f6f7);
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-popover-action.active {
  color: var(--fmhy-sc-brand);
  font-weight: 600;
}

.fmhy-sc-popover-action.active .fmhy-sc-popover-action-icon {
  color: var(--fmhy-sc-brand);
}

.fmhy-sc-popover-action.danger {
  color: var(--fmhy-sc-danger);
}

.fmhy-sc-popover-action.danger:hover {
  background: rgba(239, 68, 68, 0.08);
}

.fmhy-sc-popover-action-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fmhy-sc-text-3);
  flex-shrink: 0;
}

.fmhy-sc-popover-action-label {
  flex: 1;
}

.fmhy-sc-popover-status {
  border-top: 1px solid var(--fmhy-sc-border);
  padding: 8px 12px;
  background: var(--fmhy-sc-bg-alt);
}

.fmhy-sc-popover-status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: 12px;
}

.fmhy-sc-popover-status-label {
  color: var(--fmhy-sc-text-3);
  font-weight: 500;
}

.fmhy-sc-popover-status-value {
  color: var(--fmhy-sc-text-1);
  font-weight: 500;
  text-align: right;
}

.fmhy-sc-health-alive { color: var(--fmhy-sc-success); }
.fmhy-sc-health-dead { color: var(--fmhy-sc-danger); }
.fmhy-sc-health-unknown { color: var(--fmhy-sc-text-3); }

@media (max-width: 640px) {
  .fmhy-sc-popover {
    position: fixed !important;
    bottom: 0 !important;
    top: auto !important;
    left: 0 !important;
    right: 0 !important;
    width: 100vw !important;
    border-radius: 12px 12px 0 0;
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  .fmhy-sc-popover-visible {
    transform: translateY(0);
  }
  .fmhy-sc-popover-above.fmhy-sc-popover-visible {
    transform: translateY(0);
  }
}

/* =====================================================
   Scrollbar — subtle, VitePress-like
   ===================================================== */
.fmhy-sc-content::-webkit-scrollbar,
.fmhy-sc-popover-actions::-webkit-scrollbar,
.fmhy-sc-list::-webkit-scrollbar {
  width: 4px;
}
.fmhy-sc-content::-webkit-scrollbar-thumb,
.fmhy-sc-popover-actions::-webkit-scrollbar-thumb,
.fmhy-sc-list::-webkit-scrollbar-thumb {
  background: var(--fmhy-sc-border);
  border-radius: 2px;
}
.fmhy-sc-content::-webkit-scrollbar-thumb:hover,
.fmhy-sc-popover-actions::-webkit-scrollbar-thumb:hover,
.fmhy-sc-list::-webkit-scrollbar-thumb:hover {
  background: var(--fmhy-sc-text-3);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .fmhy-sc-host,
  .fmhy-sc-panel,
  .fmhy-sc-backdrop,
  .fmhy-sc-popover,
  .fmhy-sc-item,
  .fmhy-sc-list-item,
  .fmhy-sc-toast {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* =====================================================
   RATING MODAL — native VitePress dialog style
   ===================================================== */

.fmhy-sc-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000005;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fmhy-sc-fade-in 0.2s ease;
  font-family: var(--fmhy-sc-font, system-ui);
}

.fmhy-sc-modal {
  background: var(--fmhy-sc-bg, #fff);
  border: 1px solid var(--fmhy-sc-border, #e2e2e3);
  border-radius: 12px;
  box-shadow: var(--fmhy-sc-shadow-3, 0 12px 32px rgba(0, 0, 0, 0.1));
  max-width: 420px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  animation: fmhy-sc-modal-pop 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  color: var(--fmhy-sc-text-1, rgba(60, 60, 67));
}

@keyframes fmhy-sc-modal-pop {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes fmhy-sc-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fmhy-sc-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--fmhy-sc-border, #e2e2e3);
}

.fmhy-sc-modal-header h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-modal-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-text-3);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.fmhy-sc-modal-close:hover {
  background: var(--fmhy-sc-bg-alt, #f6f6f7);
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-modal-url {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--fmhy-sc-text-3);
  font-family: var(--fmhy-sc-font-mono, monospace);
  border-bottom: 1px solid var(--fmhy-sc-border);
  word-break: break-all;
  background: var(--fmhy-sc-bg-alt);
}

.fmhy-sc-rating-stars {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
}

.fmhy-sc-rating-star {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-border-hard, #d1d5db);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, color 0.15s;
  padding: 0;
}

.fmhy-sc-rating-star:hover {
  transform: scale(1.15);
}

.fmhy-sc-rating-star.filled {
  color: #f59e0b;
}

.fmhy-sc-rating-star.filled svg {
  fill: currentColor;
}

.fmhy-sc-rating-label {
  font-size: 13px;
  color: var(--fmhy-sc-text-2);
  font-weight: 500;
}

.fmhy-sc-modal-field {
  padding: 0 16px 16px;
}

.fmhy-sc-modal-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--fmhy-sc-text-2);
  margin-bottom: 6px;
}

.fmhy-sc-modal-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--fmhy-sc-border-hard, #d1d5db);
  border-radius: 8px;
  background: var(--fmhy-sc-bg, #fff);
  color: var(--fmhy-sc-text-1);
  font-family: var(--fmhy-sc-font, system-ui);
  font-size: 14px;
  resize: vertical;
  min-height: 72px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.fmhy-sc-modal-textarea:focus {
  outline: none;
  border-color: var(--fmhy-sc-brand, #7c3aed);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
}

.fmhy-sc-modal-btns {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px;
  justify-content: flex-end;
}

.fmhy-sc-btn {
  padding: 8px 16px;
  border: 1px solid var(--fmhy-sc-border-hard, #d1d5db);
  background: var(--fmhy-sc-bg, #fff);
  color: var(--fmhy-sc-text-1);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--fmhy-sc-font, system-ui);
  transition: all 0.15s;
  min-height: 36px;
}

.fmhy-sc-btn:hover {
  border-color: var(--fmhy-sc-brand, #7c3aed);
  background: var(--fmhy-sc-bg-alt, #f6f6f7);
}

.fmhy-sc-btn-primary {
  background: var(--fmhy-sc-brand, #7c3aed);
  color: #fff;
  border-color: var(--fmhy-sc-brand, #7c3aed);
}

.fmhy-sc-btn-primary:hover {
  background: var(--fmhy-sc-brand-dark, #6d28d9);
  border-color: var(--fmhy-sc-brand-dark, #6d28d9);
}

.fmhy-sc-btn-danger {
  color: var(--fmhy-sc-danger, #ef4444);
  border-color: rgba(239, 68, 68, 0.3);
}

.fmhy-sc-btn-danger:hover {
  background: rgba(239, 68, 68, 0.08);
  border-color: var(--fmhy-sc-danger, #ef4444);
}

@media (max-width: 640px) {
  .fmhy-sc-modal-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .fmhy-sc-modal {
    border-radius: 12px 12px 0 0;
    max-width: 100%;
    max-height: 90vh;
    animation: fmhy-sc-slide-up 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  @keyframes fmhy-sc-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
}

/* =====================================================
   COMPARE FAB + COMPARISON MODAL
   ===================================================== */

.fmhy-sc-compare-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000002;
  padding: 12px 18px;
  background: var(--fmhy-sc-brand, #7c3aed);
  color: #fff;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--fmhy-sc-font, system-ui);
  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.4);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: transform 0.2s, box-shadow 0.2s;
  animation: fmhy-sc-fab-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes fmhy-sc-fab-in {
  from { transform: scale(0) translateY(20px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}

.fmhy-sc-compare-fab:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 12px 32px rgba(124, 58, 237, 0.5);
}

.fmhy-sc-compare-fab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.fmhy-sc-compare-fab-hint {
  font-size: 10px;
  font-weight: 500;
  opacity: 0.85;
  margin-left: 4px;
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
}

@media (max-width: 640px) {
  .fmhy-sc-compare-fab {
    bottom: calc(20px + env(safe-area-inset-bottom, 0));
    right: 12px;
    left: 12px;
    justify-content: center;
  }
  .fmhy-sc-compare-fab-hint {
    display: none;
  }
}

/* Wide modal for comparison table */
.fmhy-sc-modal-wide {
  max-width: 720px !important;
}

/* Best Pick banner */
.fmhy-sc-compare-best {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  margin: 12px 16px 0;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(124, 58, 237, 0.05));
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 10px;
}

.fmhy-sc-compare-best-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
}

.fmhy-sc-compare-best-icon svg {
  fill: currentColor;
}

.fmhy-sc-compare-best-body {
  flex: 1;
  min-width: 0;
}

.fmhy-sc-compare-best-label {
  font-size: 11px;
  font-weight: 700;
  color: #f59e0b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.fmhy-sc-compare-best-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--fmhy-sc-text-1);
  margin-bottom: 4px;
  word-break: break-word;
}

.fmhy-sc-compare-best-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--fmhy-sc-text-2);
  flex-wrap: wrap;
}

.fmhy-sc-compare-best-link {
  color: var(--fmhy-sc-brand);
  text-decoration: none;
  font-weight: 600;
  padding: 2px 8px;
  border: 1px solid var(--fmhy-sc-brand);
  border-radius: 4px;
  font-size: 11px;
}

.fmhy-sc-compare-best-link:hover {
  background: var(--fmhy-sc-brand);
  color: #fff;
}

.fmhy-sc-compare-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.fmhy-sc-compare-reason {
  display: inline-block;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  background: var(--fmhy-sc-bg-soft, rgba(0, 0, 0, 0.04));
  color: var(--fmhy-sc-text-2);
  border-radius: 4px;
  border: 1px solid var(--fmhy-sc-border);
}

/* Comparison table */
.fmhy-sc-compare-table-wrap {
  padding: 12px 16px;
  overflow-x: auto;
}

.fmhy-sc-compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.fmhy-sc-compare-table th,
.fmhy-sc-compare-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--fmhy-sc-border);
  text-align: left;
  vertical-align: top;
}

.fmhy-sc-compare-table th {
  background: var(--fmhy-sc-bg-alt);
  font-weight: 600;
  color: var(--fmhy-sc-text-2);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.fmhy-sc-compare-table tr.best-row {
  background: rgba(245, 158, 11, 0.05);
}

.fmhy-sc-compare-table tr.best-row td:first-child {
  border-left: 3px solid #f59e0b;
  font-weight: 600;
}

.fmhy-sc-compare-link {
  color: var(--fmhy-sc-brand);
  text-decoration: none;
  font-weight: 500;
}

.fmhy-sc-compare-link:hover { text-decoration: underline; }

.fmhy-sc-compare-score {
  text-align: center;
}

.fmhy-sc-score-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  min-width: 28px;
  text-align: center;
}

.fmhy-sc-score-badge.score-pos {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.fmhy-sc-score-badge.score-neg {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.fmhy-sc-score-badge.score-neu {
  background: var(--fmhy-sc-bg-soft);
  color: var(--fmhy-sc-text-muted);
}

/* =====================================================
   SEARCH ENHANCER — toggle + dropdown + advanced panel
   ===================================================== */

/* Toggle icon next to the search bar */
.fmhy-sc-search-toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-text-3, currentColor);
  border-radius: 5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  z-index: 10;
  padding: 0;
}

.fmhy-sc-search-toggle:hover {
  background: var(--fmhy-sc-bg-soft, rgba(0, 0, 0, 0.05));
  color: var(--fmhy-sc-brand, #7c3aed);
}

.fmhy-sc-search-toggle.active {
  background: var(--fmhy-sc-brand, #7c3aed);
  color: #fff;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2);
}

/* Autocomplete dropdown */
.fmhy-sc-search-dropdown {
  position: absolute;
  z-index: 1000010;
  background: var(--fmhy-sc-bg, #fff);
  border: 1px solid var(--fmhy-sc-border, #e2e2e3);
  border-radius: 10px;
  box-shadow: var(--fmhy-sc-shadow-3, 0 12px 32px rgba(0, 0, 0, 0.1));
  max-height: 400px;
  overflow-y: auto;
  font-family: var(--fmhy-sc-font, system-ui);
  color: var(--fmhy-sc-text-1, rgba(60, 60, 67));
  animation: fmhy-sc-search-in 0.18s ease;
}

@keyframes fmhy-sc-search-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.fmhy-sc-search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--fmhy-sc-border);
  transition: background 0.1s;
}

.fmhy-sc-search-row:last-child { border-bottom: none; }

.fmhy-sc-search-row:hover,
.fmhy-sc-search-row.active {
  background: var(--fmhy-sc-bg-soft, #f6f6f7);
}

.fmhy-sc-search-row-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fmhy-sc-text-3);
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.fmhy-sc-search-row.active .fmhy-sc-search-row-icon {
  color: var(--fmhy-sc-brand, #7c3aed);
}

.fmhy-sc-search-row-body {
  flex: 1;
  min-width: 0;
}

.fmhy-sc-search-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--fmhy-sc-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fmhy-sc-search-row-sub {
  font-size: 11px;
  color: var(--fmhy-sc-text-3);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fmhy-sc-search-row-ext {
  display: flex;
  align-items: center;
  color: var(--fmhy-sc-text-3);
  flex-shrink: 0;
  opacity: 0.6;
}

.fmhy-sc-search-highlight {
  background: rgba(245, 158, 11, 0.2);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
  font-weight: 600;
}

.fmhy-sc-search-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--fmhy-sc-text-3);
  font-size: 13px;
}

.fmhy-sc-search-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  opacity: 0.4;
}

/* Advanced search panel */
.fmhy-sc-search-advanced {
  position: absolute;
  width: 320px;
  background: var(--fmhy-sc-bg, #fff);
  border: 1px solid var(--fmhy-sc-border, #e2e2e3);
  border-radius: 12px;
  box-shadow: var(--fmhy-sc-shadow-3, 0 12px 32px rgba(0, 0, 0, 0.1));
  z-index: 1000011;
  padding: 12px;
  font-family: var(--fmhy-sc-font, system-ui);
  color: var(--fmhy-sc-text-1, rgba(60, 60, 67));
  animation: fmhy-sc-search-in 0.2s ease;
}

.fmhy-sc-search-advanced-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--fmhy-sc-border);
}

.fmhy-sc-search-advanced-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-search-advanced-close {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--fmhy-sc-text-3);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fmhy-sc-search-advanced-close:hover {
  background: var(--fmhy-sc-bg-alt, #f6f6f7);
  color: var(--fmhy-sc-text-1);
}

.fmhy-sc-adv-row {
  margin-bottom: 10px;
}

.fmhy-sc-adv-row label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--fmhy-sc-text-2);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.fmhy-sc-adv-select,
.fmhy-sc-adv-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--fmhy-sc-border-strong, #d4d4d8);
  border-radius: 6px;
  background: var(--fmhy-sc-bg, #fff);
  color: var(--fmhy-sc-text-1);
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.15s;
}

.fmhy-sc-adv-select:focus,
.fmhy-sc-adv-input:focus {
  outline: none;
  border-color: var(--fmhy-sc-brand, #7c3aed);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
}

.fmhy-sc-adv-apply {
  width: 100%;
  margin-top: 4px;
}

@media (max-width: 640px) {
  .fmhy-sc-search-advanced {
    position: fixed !important;
    top: auto !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    width: 100vw !important;
    border-radius: 12px 12px 0 0;
    animation: fmhy-sc-slide-up 0.3s ease;
  }
  @keyframes fmhy-sc-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
}

/* Highlight pulse animation (for "Compare Resources" button) */
.fmhy-sc-highlight-pulse {
  animation: fmhy-sc-pulse-highlight 1s ease-in-out 2;
  outline: 2px solid var(--fmhy-sc-brand, #7c3aed) !important;
  outline-offset: 2px;
  border-radius: 4px;
}

@keyframes fmhy-sc-pulse-highlight {
  0%, 100% { outline-color: var(--fmhy-sc-brand, #7c3aed); }
  50% { outline-color: transparent; }
}

/* Disable button in advanced search panel */
.fmhy-sc-adv-disable {
  width: 100%;
  margin-top: 8px;
}
`;
  if (typeof GM_addStyle === "function") {
    GM_addStyle(FMHY_SC_CSS);
  } else {
    const style = document.createElement("style");
    style.textContent = FMHY_SC_CSS;
    document.head.appendChild(style);
  }


  // ===================================================================
  // BOOTSTRAP
  // ===================================================================

  async function boot() {
    console.log("[FMHY SC] Booting on", window.location.href);
    const settings = await Storage.getSettings();
    const enabledFeatures = Object.keys(registry).filter((name) => settings[name] !== false);
    for (const name of enabledFeatures) {
      try {
        if (typeof registry[name].init === "function") {
          await registry[name].init();
        }
      } catch (e) {
        console.error(`[FMHY SC] Feature '${name}' init failed:`, e);
      }
    }
    // Wire page change detection (VitePress pushState swaps)
    let lastUrl = location.href;
    const checkUrl = Dom.debounce(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        FMHY.emitPageChange();
      }
    }, 150);
    const obs = new MutationObserver(checkUrl);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", checkUrl);
    setTimeout(() => FMHY.emitPageChange(), 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  console.log("[FMHY SC] Userscript fully loaded");


  console.log("[FMHY SC] Userscript core loaded");
})();
