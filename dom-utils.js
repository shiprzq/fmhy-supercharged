/**
 * FMHY Supercharged — DOM Utilities
 * Helpers for querying the VitePress page structure on fmhy.net.
 */
(function (global) {
  "use strict";

  const Dom = {
    /**
     * Wait for a selector to appear in the DOM (VitePress loads content async).
     * Resolves with the matched element, or null after timeout.
     */
    waitFor(selector, timeout = 10000) {
      return new Promise((resolve) => {
        const existing = document.querySelector(selector);
        if (existing) return resolve(existing);
        const obs = new MutationObserver(() => {
          const el = document.querySelector(selector);
          if (el) {
            obs.disconnect();
            resolve(el);
          }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
      });
    },

    /** Run a callback whenever VitePress swaps page content. */
    onPageChange(cb) {
      // VitePress uses a #app container that gets its children replaced
      const target = document.getElementById("app") || document.body;
      const obs = new MutationObserver(() => {
        cb();
      });
      obs.observe(target, { childList: true, subtree: true });
      return () => obs.disconnect();
    },

    /** Debounce a function. */
    debounce(fn, ms = 200) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
      };
    },

    /** Throttle a function (trailing edge). */
    throttle(fn, ms = 100) {
      let last = 0, timer = null;
      return (...args) => {
        const now = Date.now();
        const remaining = ms - (now - last);
        if (remaining <= 0) {
          last = now;
          fn(...args);
        } else {
          clearTimeout(timer);
          timer = setTimeout(() => { last = Date.now(); fn(...args); }, remaining);
        }
      };
    },

    /** Find all resource links on the current page (excludes nav/footer). */
    getResourceLinks() {
      const main = document.querySelector("main, .VPDoc, .vp-doc, article, #VPContent");
      const root = main || document;
      const links = [];
      const anchors = root.querySelectorAll('a[href^="http"]');
      anchors.forEach((a) => {
        const href = a.href;
        if (!href) return;
        // Skip fmhy.net internal + known social/sponsor links
        try {
          const u = new URL(href);
          if (u.hostname.endsWith("fmhy.net") || u.hostname.endsWith("fmhy.xyz")) return;
          if (["reddit.com", "github.com", "discord.com", "discord.gg", "t.me"].includes(u.hostname)) {
            // keep github links if they're resources, skip pure community links
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

    /** Get the current category from URL pathname. */
    getCurrentCategory() {
      const path = window.location.pathname.replace(/^\//, "").replace(/\/$/, "");
      if (!path) return "home";
      const seg = path.split("/")[0];
      return seg;
    },

    /** Get the page title (heading). */
    getPageTitle() {
      const h1 = document.querySelector("h1");
      return h1 ? h1.textContent.trim() : document.title;
    },

    /** Create an element with attributes + children. */
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

    /** Inject a uniquely-ID'd style block once. */
    injectStyle(id, css) {
      if (document.getElementById(id)) return;
      const s = document.createElement("style");
      s.id = id;
      s.textContent = css;
      document.head.appendChild(s);
    },

    /** Check if an element is visible in viewport. */
    isVisible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      return true;
    },

    /** Compute a stable hash for a string (used for IDs / dedupe). */
    hash(s) {
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
      return (h >>> 0).toString(36);
    },

    /** Improved fuzzy match score with ranking (0 = no match, higher = better).
     *  Rewards: consecutive matches, word-boundary matches, prefix matches.
     */
    fuzzyMatch(query, text) {
      if (!query) return 1;
      query = query.toLowerCase();
      text = (text || "").toLowerCase();

      // Exact substring match — highest score
      const idx = text.indexOf(query);
      if (idx !== -1) {
        let score = 100 + query.length * 2;
        // Bonus for matching at start
        if (idx === 0) score += 50;
        // Bonus for matching at word boundary
        if (idx === 0 || /[\s\-_/.]/.test(text[idx - 1])) score += 30;
        return score;
      }

      // Fuzzy subsequence match
      let qi = 0, score = 0, lastIdx = -1, consecutive = 0;
      for (let i = 0; i < text.length && qi < query.length; i++) {
        if (text[i] === query[qi]) {
          // Bonus for consecutive matches
          if (i - lastIdx === 1) {
            consecutive++;
            score += 5 + consecutive * 2;
          } else {
            consecutive = 0;
            score += 1;
          }
          // Bonus for word-boundary matches
          if (i === 0 || /[\s\-_/.]/.test(text[i - 1])) score += 8;
          lastIdx = i;
          qi++;
        }
      }
      // Penalize length difference (prefer shorter matches)
      if (qi === query.length) {
        score = Math.max(1, score - Math.floor((text.length - query.length) / 20));
        return score;
      }
      return 0;
    },

    /** Copy text to clipboard, returns Promise<boolean>. */
    async copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); return true; }
        catch (_) { return false; }
        finally { ta.remove(); }
      }
    },

    /** Get favicon URL for a link (uses Google's favicon service). */
    faviconUrl(url, size = 16) {
      try {
        const u = new URL(url);
        return `https://www.google.com/s2/favicons?sz=${size}&domain=${u.hostname}`;
      } catch (e) { return ""; }
    },

    /** Format a timestamp as relative ("2h ago"). */
    timeAgo(ts) {
      if (!ts) return "never";
      const s = Math.floor((Date.now() - ts) / 1000);
      if (s < 60) return "just now";
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      if (d < 30) return `${d}d ago`;
      const mo = Math.floor(d / 30);
      if (mo < 12) return `${mo}mo ago`;
      return `${Math.floor(mo / 12)}y ago`;
    }
  };

  global.FMHY = global.FMHY || {};
  global.FMHY.Dom = Dom;
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
