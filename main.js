/**
 * FMHY Supercharged — Content Script Main Entry
 *
 * Registers all feature modules and boots them once the page is ready.
 * Each feature module attaches itself to `FMHY.FeatureRegistry` via
 * `FMHY.registerFeature(name, api)`.
 *
 * Lifecycle:
 *   1. DOMContentLoaded → boot()
 *   2. boot() reads settings, then calls init() on every enabled feature
 *   3. VitePress page changes are detected via MutationObserver; features
 *      can subscribe to "pagechange" events to re-run their hooks.
 */
(function (global) {
  "use strict";

  global.FMHY = global.FMHY || {};
  const registry = {};
  const pageChangeListeners = [];
  let booted = false;

  global.FMHY.registerFeature = function (name, api) {
    registry[name] = api;
  };

  global.FMHY.getFeature = function (name) { return registry[name]; };

  global.FMHY.onPageChange = function (cb) {
    pageChangeListeners.push(cb);
  };

  global.FMHY.emitPageChange = function () {
    pageChangeListeners.forEach((cb) => {
      try { cb(); } catch (e) { console.error("[FMHY SC] pagechange handler error:", e); }
    });
  };

  async function boot() {
    if (booted) return;
    booted = true;
    console.log("[FMHY SC] Booting on", window.location.href);

    const settings = await FMHY.Storage.getSettings();
    const enabledFeatures = Object.keys(registry).filter((name) => {
      // Each feature's key in settings matches the registered name
      return settings[name] !== false;
    });

    for (const name of enabledFeatures) {
      try {
        if (typeof registry[name].init === "function") {
          await registry[name].init();
        }
      } catch (e) {
        console.error(`[FMHY SC] Feature '${name}' init failed:`, e);
      }
    }

    // Wire page change detection (VitePress swaps content via pushState).
    let lastUrl = location.href;
    const checkUrl = FMHY.Dom.debounce(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        FMHY.emitPageChange();
      }
    }, 150);
    const obs = new MutationObserver(checkUrl);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", checkUrl);

    // First page-change emit so features that wait for it do their first pass.
    setTimeout(() => FMHY.emitPageChange(), 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Background message router (commands + context-menu actions)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      try {
        // Dispatch to the right feature
        const target = msg.type;
        // Try each registered feature's onMessage handler
        for (const name of Object.keys(registry)) {
          if (typeof registry[name].onMessage === "function") {
            const handled = await registry[name].onMessage(msg, sender);
            if (handled) {
              sendResponse({ ok: true });
              return;
            }
          }
        }
        // No handler matched — respond gracefully
        if (target) {
          sendResponse({ ok: false, error: "No feature handled: " + target });
        }
      } catch (e) {
        console.error("[FMHY SC] onMessage error:", e);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
