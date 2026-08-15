/**
 * FMHY Supercharged — Background Service Worker
 *
 * Responsibilities:
 *  - Wire keyboard commands → content-script messages
 *  - Run periodic health checks on bookmarked links (alarms API)
 *  - Send desktop notifications (watched categories / dead links)
 *  - Handle context-menu actions (bookmark / note / report)
 *  - Perform cross-device sync (Gist / WebDAV)
 *  - Expose a message router for content scripts
 *
 * MV3 service workers can't use importScripts() with `"type": "module"`.
 * We set the manifest to non-module and use importScripts to load the lib
 * files (which are written as IIFE globals on `self.FMHY`).
 */

importScripts("../lib/storage.js", "../lib/sync-client.js");

const { Storage, SyncClient } = self.FMHY;

const HEALTH_ALARM = "fmhy-health-check";
const SYNC_ALARM = "fmhy-sync";
const WATCH_ALARM = "fmhy-watch-check";

// ---------- Lifecycle ----------
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[FMHY SC] Installed. Setting up alarms + context menus.");
  chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: 360 });
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
  chrome.alarms.create(WATCH_ALARM, { periodInMinutes: 120 });
  setupContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[FMHY SC] Browser started.");
  chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: 360 });
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
  chrome.alarms.create(WATCH_ALARM, { periodInMinutes: 120 });
  setupContextMenus();
});

// ---------- Context menus ----------
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    const items = [
      ["fmhy-bookmark-link", "Bookmark this link (FMHY SC)"],
      ["fmhy-note-link",     "Add note to this link (FMHY SC)"],
      ["fmhy-rate-link",     "Rate this link (FMHY SC)"],
      ["fmhy-pin-link",      "Pin to quick toolbar (FMHY SC)"],
      ["fmhy-report-link",   "Report this link (FMHY SC)"],
      ["fmhy-share-card",    "Generate share card (FMHY SC)"],
      ["fmhy-wayback-link",  "View on Wayback Machine (FMHY SC)"]
    ];
    items.forEach(([id, title]) => {
      chrome.contextMenus.create({ id, title, contexts: ["link"] });
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl;
  if (!url || !tab) return;
  const text = info.selectionText || info.linkText || url;
  const msg = (action, extra = {}) => chrome.tabs.sendMessage(tab.id, { type: action, url, text, ...extra });

  switch (info.menuItemId) {
    case "fmhy-bookmark-link": msg("bookmarkLink"); break;
    case "fmhy-note-link":     msg("openNoteEditor"); break;
    case "fmhy-rate-link":     msg("openRateEditor"); break;
    case "fmhy-pin-link":      msg("pinLink"); break;
    case "fmhy-report-link":   msg("reportLink"); break;
    case "fmhy-share-card":    msg("generateShareCard"); break;
    case "fmhy-wayback-link":  chrome.tabs.create({ url: `https://web.archive.org/web/*/${url}` }); break;
  }
});

// ---------- Keyboard commands ----------
chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  const msg = (type) => chrome.tabs.sendMessage(tab.id, { type });

  switch (cmd) {
    case "open-command-palette": msg("openCommandPalette"); break;
    case "toggle-bookmark":      msg("toggleBookmarkCurrent"); break;
    case "open-radial-menu":     msg("openRadialMenu"); break;
    case "toggle-sidebar":       msg("toggleSidebar"); break;
  }
});

// ---------- Message router ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case "healthCheck": {
          const result = await checkLinkHealth(msg.url);
          sendResponse({ ok: true, result });
          break;
        }
        case "healthCheckBatch": {
          const results = await checkLinksBatch(msg.urls);
          sendResponse({ ok: true, results });
          break;
        }
        case "getWaybackUrl": {
          const url = await getWaybackUrl(msg.url);
          sendResponse({ ok: true, url });
          break;
        }
        case "syncNow": {
          await runSync();
          sendResponse({ ok: true });
          break;
        }
        case "verifyGistToken": {
          const info = await SyncClient.verifyGistToken(msg.token);
          sendResponse({ ok: true, info });
          break;
        }
        case "notify": {
          chrome.notifications.create(`fmhy-${Date.now()}`, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("assets/icon128.png"),
            title: msg.title || "FMHY Supercharged",
            message: msg.message || "",
            priority: 2
          });
          sendResponse({ ok: true });
          break;
        }
        case "openTab": {
          chrome.tabs.create({ url: msg.url });
          sendResponse({ ok: true });
          break;
        }
        case "getSetting": {
          const v = await Storage.getSetting(msg.name);
          sendResponse({ ok: true, value: v });
          break;
        }
        case "setSetting": {
          await Storage.setSetting(msg.name, msg.value);
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message type: " + msg.type });
      }
    } catch (err) {
      console.error("[FMHY SC] msg handler error:", err);
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// ---------- Health checking ----------
const HEALTH_CONCURRENCY = 4;
const HEALTH_TIMEOUT_MS = 8000;

async function checkLinkHealth(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      signal: ctrl.signal,
      redirect: "follow"
    });
    clearTimeout(t);
    await Storage.setHealth(url, "alive", res.status || 0);
    return { url, status: "alive", statusCode: res.status || 0 };
  } catch (e) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetch(url, { method: "GET", signal: ctrl.signal, redirect: "follow" });
      clearTimeout(t);
      if (res.status < 500) {
        await Storage.setHealth(url, "alive", res.status);
        return { url, status: "alive", statusCode: res.status };
      }
      await Storage.setHealth(url, "dead", res.status);
      return { url, status: "dead", statusCode: res.status };
    } catch (e2) {
      await Storage.setHealth(url, "unknown", 0);
      return { url, status: "unknown", statusCode: 0 };
    }
  }
}

async function checkLinksBatch(urls) {
  const out = [];
  for (let i = 0; i < urls.length; i += HEALTH_CONCURRENCY) {
    const slice = urls.slice(i, i + HEALTH_CONCURRENCY);
    const results = await Promise.all(slice.map((u) => checkLinkHealth(u)));
    out.push(...results);
  }
  return out;
}

// ---------- Wayback Machine ----------
async function getWaybackUrl(url) {
  try {
    const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const closest = data.archived_snapshots && data.archived_snapshots.closest;
    if (closest && closest.available && closest.url) return closest.url;
    return null;
  } catch (e) { return null; }
}

// ---------- Sync ----------
async function runSync() {
  const cfg = await Storage.getSyncConfig();
  if (cfg.provider === "none" || !cfg.token) throw new Error("Sync not configured");
  const [bookmarks, notes, ratings, pinned, rules] = await Promise.all([
    Storage.getBookmarks(),
    Storage.getNotes(),
    Storage.getRatings(),
    Storage.getPinned(),
    Storage.getHighlightRules()
  ]);
  const localData = { bookmarks, notes, ratings, pinnedResources: pinned, highlightRules: rules };
  const result = await SyncClient.push(localData, cfg);
  if (result.gistId && result.gistId !== cfg.gistId) {
    await Storage.setSyncConfig({ gistId: result.gistId });
  }
  await Storage.setSyncConfig({ lastSync: Date.now() });
  console.log("[FMHY SC] Sync pushed:", result);
}

// ---------- Alarms ----------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === HEALTH_ALARM) {
    const enabled = await Storage.getSetting("healthChecker");
    if (!enabled) return;
    const bookmarks = await Storage.getBookmarks();
    const urls = bookmarks.slice(0, 50).map((b) => b.url);
    if (urls.length === 0) return;
    const results = await checkLinksBatch(urls);
    const dead = results.filter((r) => r.status === "dead");
    if (dead.length > 0) {
      const notifEnabled = await Storage.getSetting("notifications");
      if (notifEnabled) {
        chrome.notifications.create(`fmhy-dead-${Date.now()}`, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("assets/icon128.png"),
          title: `${dead.length} bookmarked link(s) appear dead`,
          message: dead.slice(0, 3).map((d) => d.url).join("\n") + (dead.length > 3 ? `\n…and ${dead.length - 3} more` : ""),
          priority: 2
        });
      }
    }
  } else if (alarm.name === SYNC_ALARM) {
    const cfg = await Storage.getSyncConfig();
    if (cfg.provider !== "none" && cfg.token && cfg.autoSync) {
      try { await runSync(); } catch (e) { console.warn("[FMHY SC] Auto-sync failed:", e.message); }
    }
  }
});

console.log("[FMHY SC] Background service worker loaded.");
