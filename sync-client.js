/**
 * FMHY Supercharged — Sync Client
 * Cross-device sync via GitHub Gist or WebDAV.
 * Used by the background service worker (not content scripts).
 *
 * Payload format (JSON):
 * {
 *   "app": "fmhy-supercharged",
 *   "version": 1,
 *   "exportedAt": 1234567890,
 *   "bookmarks": [...],
 *   "notes": {...},
 *   "ratings": {...},
 *   "pinnedResources": [...],
 *   "highlightRules": [...]
 * }
 */
(function (global) {
  "use strict";

  const GIST_FILENAME = "fmhy-supercharged-sync.json";
  const GIST_DESC = "FMHY Supercharged sync data (auto-managed)";

  const SyncClient = {
    /** Push local data to the configured sync provider. */
    async push(localData, config) {
      if (!config || config.provider === "none") {
        throw new Error("No sync provider configured");
      }
      const payload = {
        app: "fmhy-supercharged",
        version: 1,
        exportedAt: Date.now(),
        ...localData
      };
      if (config.provider === "gist") {
        return this._pushGist(payload, config);
      } else if (config.provider === "webdav") {
        return this._pushWebDAV(payload, config);
      }
      throw new Error("Unknown sync provider: " + config.provider);
    },

    /** Pull remote data from the configured sync provider. */
    async pull(config) {
      if (!config || config.provider === "none") {
        throw new Error("No sync provider configured");
      }
      if (config.provider === "gist") {
        return this._pullGist(config);
      } else if (config.provider === "webdav") {
        return this._pullWebDAV(config);
      }
      throw new Error("Unknown sync provider: " + config.provider);
    },

    // ---- GitHub Gist ----
    async _pushGist(payload, config) {
      if (!config.token) throw new Error("GitHub token required");
      const body = {
        description: GIST_DESC,
        files: {
          [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) }
        }
      };
      let url = "https://api.github.com/gists";
      let method = "POST";
      if (config.gistId) {
        url = `https://api.github.com/gists/${config.gistId}`;
        method = "PATCH";
      }
      const res = await fetch(url, {
        method,
        headers: {
          "Authorization": `token ${config.token}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Gist push failed (${res.status}): ${txt}`);
      }
      const data = await res.json();
      return { gistId: data.id, url: data.html_url };
    },

    async _pullGist(config) {
      if (!config.token) throw new Error("GitHub token required");
      if (!config.gistId) throw new Error("Gist ID required (run push first)");
      const res = await fetch(`https://api.github.com/gists/${config.gistId}`, {
        headers: {
          "Authorization": `token ${config.token}`,
          "Accept": "application/vnd.github.v3+json"
        }
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Gist pull failed (${res.status}): ${txt}`);
      }
      const data = await res.json();
      const file = data.files && data.files[GIST_FILENAME];
      if (!file) throw new Error(`Sync file '${GIST_FILENAME}' not found in gist`);
      return JSON.parse(file.content);
    },

    /** Verify a GitHub token by hitting /user. */
    async verifyGistToken(token) {
      const res = await fetch("https://api.github.com/user", {
        headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" }
      });
      if (!res.ok) throw new Error(`Invalid token (${res.status})`);
      const data = await res.json();
      return { login: data.login, name: data.name };
    },

    // ---- WebDAV (Nextcloud, etc.) ----
    async _pushWebDAV(payload, config) {
      const url = config.webdavUrl.replace(/\/$/, "") + "/fmhy-supercharged-sync.json";
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": "Basic " + btoa(`${config.webdavUser}:${config.webdavPass}`),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload, null, 2)
      });
      if (!res.ok) throw new Error(`WebDAV push failed (${res.status})`);
      return { url };
    },

    async _pullWebDAV(config) {
      const url = config.webdavUrl.replace(/\/$/, "") + "/fmhy-supercharged-sync.json";
      const res = await fetch(url, {
        headers: { "Authorization": "Basic " + btoa(`${config.webdavUser}:${config.webdavPass}`) }
      });
      if (!res.ok) throw new Error(`WebDAV pull failed (${res.status})`);
      return res.json();
    },

    /** Merge local + remote, preferring newer timestamps on conflict. */
    merge(local, remote) {
      if (!remote) return local;
      if (!local) return remote;
      // bookmarks: union by URL, prefer the more recently added entry
      const bmByUrl = new Map();
      [...(local.bookmarks || []), ...(remote.bookmarks || [])].forEach((b) => {
        const ex = bmByUrl.get(b.url);
        if (!ex || (b.addedAt || 0) > (ex.addedAt || 0)) bmByUrl.set(b.url, b);
      });
      // notes: union by URL, prefer newer
      const notes = {};
      [local.notes || {}, remote.notes || {}].forEach((src) => {
        Object.entries(src).forEach(([url, n]) => {
          const ex = notes[url];
          if (!ex || (n.updatedAt || 0) > (ex.updatedAt || 0)) notes[url] = n;
        });
      });
      // ratings: union by URL, prefer newer
      const ratings = {};
      [local.ratings || {}, remote.ratings || {}].forEach((src) => {
        Object.entries(src).forEach(([url, r]) => {
          const ex = ratings[url];
          if (!ex || (r.updatedAt || 0) > (ex.updatedAt || 0)) ratings[url] = r;
        });
      });
      // pinned: union
      const pinned = [...new Set([...(local.pinnedResources || []), ...(remote.pinnedResources || [])])];
      // highlight rules: prefer the side with more (likely intentional)
      const rules = (local.highlightRules || []).length >= (remote.highlightRules || []).length
        ? local.highlightRules
        : remote.highlightRules;
      return {
        app: "fmhy-supercharged",
        version: 1,
        exportedAt: Date.now(),
        bookmarks: Array.from(bmByUrl.values()),
        notes,
        ratings,
        pinnedResources: pinned,
        highlightRules: rules
      };
    }
  };

  global.FMHY = global.FMHY || {};
  global.FMHY.SyncClient = SyncClient;
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
