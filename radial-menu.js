/**
 * Feature #17 — Category Quick-Jump Radial Menu
 *
 * Hotkey Ctrl+Shift+Space opens a radial menu in the center of the screen
 * with all FMHY main categories + tool categories as icons.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

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

  global.FMHY.registerFeature(NAME, {
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
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
