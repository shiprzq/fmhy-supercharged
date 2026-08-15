/**
 * Feature #23 — Scroll Memory (stub — actual implementation in mini-toc.js)
 * This module is intentionally minimal; logic is in mini-toc.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};
  const NAME = "scrollMemory";
  let initialized = false;
  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      // mini-toc.js handles this when both are enabled
    },
    onMessage() { return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
