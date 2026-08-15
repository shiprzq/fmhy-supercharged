/**
 * Feature #21 — Per-Category Custom Themes
 * Feature #22 — Compact / Comfortable / Spacious Density Modes
 *
 * Auto-switches theme based on category + applies a density preset.
 * Both share a small "appearance" UI in the floating control panel.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

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

  global.FMHY.registerFeature(NAME, {
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
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
