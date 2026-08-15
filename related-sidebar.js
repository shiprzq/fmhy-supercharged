/**
 * Feature #18 — "Related Resources" Sidebar
 *
 * Right-side panel showing related resources:
 *   - same domain listed elsewhere on FMHY
 *   - "users who bookmarked this also bookmarked…" (local heuristic)
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "relatedSidebar";
  let initialized = false;
  let panel = null;
  let toggleBtn = null;

  function buildToggle() {
    if (toggleBtn) toggleBtn.remove();
    toggleBtn = FMHY.Dom.el("button", {
      class: "fmhy-sidebar-toggle",
      title: "Show related resources panel"
    }, "");
    toggleBtn.addEventListener("click", toggle);
    document.body.appendChild(toggleBtn);
  }

  function toggle() {
    if (panel) {
      panel.remove();
      panel = null;
      toggleBtn.classList.remove("active");
      return;
    }
    panel = FMHY.Dom.el("div", { class: "fmhy-related-panel" });
    panel.appendChild(FMHY.Dom.el("div", { class: "fmhy-related-header" }, [
      FMHY.Dom.el("span", {}, " Related resources"),
      FMHY.Dom.el("button", { class: "fmhy-related-close", title: "Close" }, "")
    ]));
    panel.querySelector(".fmhy-related-close").addEventListener("click", toggle);
    const body = FMHY.Dom.el("div", { class: "fmhy-related-body" }, "Loading…");
    panel.appendChild(body);
    document.body.appendChild(panel);
    toggleBtn.classList.add("active");
    populate(body);
  }

  async function populate(body) {
    const links = FMHY.Dom.getResourceLinks();
    const byHost = new Map();
    links.forEach((l) => {
      try {
        const host = new URL(l.href).hostname;
        if (!byHost.has(host)) byHost.set(host, []);
        byHost.get(host).push(l);
      } catch (e) {}
    });

    const duplicates = [...byHost.entries()].filter(([, arr]) => arr.length > 1);
    body.innerHTML = "";

    if (duplicates.length > 0) {
      body.appendChild(FMHY.Dom.el("h4", {}, " Listed multiple times on this page"));
      duplicates.slice(0, 8).forEach(([host, arr]) => {
        const group = FMHY.Dom.el("div", { class: "fmhy-related-group" });
        group.appendChild(FMHY.Dom.el("div", { class: "fmhy-related-group-title" }, `${host} (${arr.length})`));
        arr.slice(0, 3).forEach((l) => {
          group.appendChild(FMHY.Dom.el("a", {
            href: l.href,
            target: "_blank",
            rel: "noopener",
            class: "fmhy-related-link"
          }, l.text));
        });
        body.appendChild(group);
      });
    }

    // "Similar bookmarks" — same category as current page
    const bookmarks = await FMHY.Storage.getBookmarks();
    const cat = FMHY.Dom.getCurrentCategory();
    const sameCat = bookmarks.filter((b) => b.category === cat).slice(0, 8);
    if (sameCat.length > 0) {
      body.appendChild(FMHY.Dom.el("h4", {}, ` Your bookmarks in ${cat}`));
      sameCat.forEach((b) => {
        body.appendChild(FMHY.Dom.el("a", {
          href: b.url,
          target: "_blank",
          rel: "noopener",
          class: "fmhy-related-link"
        }, b.title));
      });
    }

    if (duplicates.length === 0 && sameCat.length === 0) {
      body.appendChild(FMHY.Dom.el("p", { class: "fmhy-muted" }, "No related resources found yet. Bookmark some resources to see recommendations here."));
    }
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      buildToggle();
    },
    onMessage() { return false; },
    toggle,
    isOpen: () => panel !== null
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
