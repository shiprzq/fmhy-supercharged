/**
 * Feature #22 — Density Modes (logic side; rendering happens via CSS attribute
 *   `data-fmhy-density` set by theme-switcher.js). This module just ensures
 *   the attribute is set even if theme-switcher is disabled.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "densityModes";
  let initialized = false;

  async function apply() {
    const density = await FMHY.Storage.getSetting("density");
    document.documentElement.setAttribute("data-fmhy-density", density || "comfortable");
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      apply();
      FMHY.onPageChange(apply);
    },
    onMessage() { return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
