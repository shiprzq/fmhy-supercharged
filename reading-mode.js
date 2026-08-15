/**
 * Feature #25 — Distraction-Free Reading Mode
 *
 * One-click toggle hides everything except the current section's content.
 * Auto-detects long single-section scrolls and offers to enter reading mode.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

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

  global.FMHY.registerFeature(NAME, {
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
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
