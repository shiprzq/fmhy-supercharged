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
  global.FMHY = global.FMHY || {};

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

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      loadRules().then(applyHighlights);
      FMHY.onPageChange(() => {
        loadRules().then(applyHighlights);
      });
    },
    onMessage() { return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
