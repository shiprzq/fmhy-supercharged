/**
 * FMHY Supercharged — Integrated Sidebar
 * =====================================================================
 *
 * Redesigned to feel like a native part of fmhy.net's VitePress UI:
 *   - Uses VitePress CSS variables (--vp-c-brand-1, --vp-c-border, etc.)
 *   - Matches VitePress's font (Inter), spacing, and border styles
 *   - SVG icons only (no emojis)
 *   - Slides in from the RIGHT (VitePress's left sidebar stays untouched)
 *   - Items styled like VitePress's sidebar items (.VPSidebarItem)
 *   - Toggle button styled like VitePress's nav buttons
 *
 * Feature modules register via:
 *   FMHY.Sidebar.register({
 *     id, section, label, icon, description, order, action, isActive, badge
 *   })
 *
 * @module FMHY.Sidebar
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "sidebar";

  /** Registry of sidebar items, keyed by section. */
  const registry = {
    quick: [],
    browse: [],
    saved: [],
    tools: []
  };

  let initialized = false;
  let isOpen = false;
  let activeSection = "quick";

  /** DOM references. */
  let hostButton = null;
  let backdrop = null;
  let panel = null;
  let sectionTabs = null;
  let sectionContent = null;

  /** Section metadata — icons reference SVG icon names. */
  const SECTIONS = [
    { id: "quick",  label: "Quick",  icon: "zap" },
    { id: "browse", label: "Browse", icon: "compass" },
    { id: "saved",  label: "Saved",  icon: "bookmark" },
    { id: "tools",  label: "Tools",  icon: "tool" }
  ];

  let previouslyFocused = null;

  /** Cached watched categories (for sync isActive checks). */
  let watchedCategoriesCache = [];

  /** Swipe gesture state for touch devices. */
  const swipeState = { active: false, startX: 0, startY: 0, currentX: 0, startTime: 0 };
  const SWIPE_THRESHOLD = 60;
  const SWIPE_TIMEOUT = 600;

  /**
   * Register an item with the sidebar.
   * @param {Object} config - Item configuration
   * @returns {boolean} true if registered
   */
  function register(config) {
    if (!config || !config.id || !config.section || !config.action) {
      console.warn("[FMHY SC] Invalid sidebar registration:", config);
      return false;
    }
    if (!registry[config.section]) {
      console.warn("[FMHY SC] Unknown section:", config.section);
      return false;
    }
    const idx = registry[config.section].findIndex((i) => i.id === config.id);
    if (idx >= 0) registry[config.section][idx] = config;
    else registry[config.section].push(config);
    if (isOpen) renderSection();
    return true;
  }

  /**
   * Update a registered item.
   * @param {string} id - Item id
   * @param {Object} updates - Partial config to merge
   */
  function updateItem(id, updates) {
    for (const section of Object.keys(registry)) {
      const idx = registry[section].findIndex((i) => i.id === id);
      if (idx >= 0) {
        registry[section][idx] = { ...registry[section][idx], ...updates };
        if (isOpen) renderSection();
        return;
      }
    }
  }

  /**
   * Build the host button. Styled to match VitePress's nav buttons
   * (.VPNavBarMenuLink aesthetic) so it blends in.
   */
  function buildHost() {
    if (hostButton) hostButton.remove();
    hostButton = FMHY.Dom.el("button", {
      class: "fmhy-sc-host",
      "aria-label": "Open FMHY Supercharged panel",
      "aria-expanded": "false",
      "aria-haspopup": "dialog",
      title: "FMHY Supercharged (Ctrl+Shift+L)"
    });
    // SVG icon (no emoji)
    hostButton.appendChild(FMHY.Icon.render("zap", 18));
    hostButton.addEventListener("click", open);
    document.body.appendChild(hostButton);

    requestAnimationFrame(() => hostButton.classList.add("fmhy-sc-host-visible"));
  }

  /**
   * Build the sidebar panel structure.
   * Uses VitePress's CSS variables for native look.
   */
  function buildSidebar() {
    if (panel) return;

    backdrop = FMHY.Dom.el("div", {
      class: "fmhy-sc-backdrop",
      "aria-hidden": "true"
    });
    backdrop.addEventListener("click", close);

    panel = FMHY.Dom.el("aside", {
      class: "fmhy-sc-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "fmhy-sc-title"
    });

    // Header — minimal, VitePress-style
    const header = FMHY.Dom.el("header", { class: "fmhy-sc-header" });
    const titleWrap = FMHY.Dom.el("div", { class: "fmhy-sc-header-title" });
    titleWrap.appendChild(FMHY.Icon.render("zap", 16));
    titleWrap.appendChild(FMHY.Dom.el("span", {
      class: "fmhy-sc-title",
      id: "fmhy-sc-title"
    }, "FMHY Supercharged"));
    header.appendChild(titleWrap);

    const closeBtn = FMHY.Dom.el("button", {
      class: "fmhy-sc-close",
      "aria-label": "Close panel",
      title: "Close (Esc)"
    });
    closeBtn.appendChild(FMHY.Icon.render("close", 18));
    closeBtn.addEventListener("click", close);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Tabs — styled like VitePress's nav menu
    sectionTabs = FMHY.Dom.el("nav", {
      class: "fmhy-sc-tabs",
      role: "tablist",
      "aria-label": "Sections"
    });
    SECTIONS.forEach((section, idx) => {
      const tab = FMHY.Dom.el("button", {
        class: "fmhy-sc-tab" + (section.id === activeSection ? " active" : ""),
        role: "tab",
        "aria-selected": section.id === activeSection ? "true" : "false",
        "data-section": section.id,
        tabindex: idx === 0 ? "0" : "-1"
      });
      tab.appendChild(FMHY.Icon.render(section.icon, 16));
      tab.appendChild(FMHY.Dom.el("span", {}, section.label));
      tab.addEventListener("click", () => switchSection(section.id));
      tab.addEventListener("keydown", onTabKeydown);
      sectionTabs.appendChild(tab);
    });
    panel.appendChild(sectionTabs);

    // Content area
    sectionContent = FMHY.Dom.el("div", { class: "fmhy-sc-content" });
    panel.appendChild(sectionContent);

    // Footer
    const footer = FMHY.Dom.el("footer", { class: "fmhy-sc-footer" });
    footer.appendChild(FMHY.Dom.el("span", {}, "FMHY Supercharged · 30 features"));
    panel.appendChild(footer);

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  }

  /**
   * Render items for the active section.
   * Items styled like VitePress's .VPSidebarItem — subtle, clean.
   */
  function renderSection() {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";

    const sectionId = `fmhy-sc-panel-${activeSection}`;
    sectionContent.setAttribute("role", "tabpanel");
    sectionContent.setAttribute("id", sectionId);

    const items = (registry[activeSection] || [])
      .slice()
      .sort((a, b) => (a.order || 100) - (b.order || 100));

    if (items.length === 0) {
      const empty = FMHY.Dom.el("div", { class: "fmhy-sc-empty" });
      empty.appendChild(FMHY.Icon.render("sparkles", 32));
      empty.appendChild(FMHY.Dom.el("p", {}, "No items in this section."));
      sectionContent.appendChild(empty);
      return;
    }

    items.forEach((item, idx) => {
      sectionContent.appendChild(buildItemRow(item, idx));
    });
  }

  /**
   * Build a single item row.
   * Styled to match VitePress's sidebar item aesthetic — minimal,
   * no card borders, just hover background.
   */
  function buildItemRow(item, index) {
    // isActive must be sync — if it returns a Promise, treat as false
    let isActive = false;
    if (typeof item.isActive === "function") {
      try {
        const result = item.isActive();
        // Only accept boolean true — ignore Promises (which would be truthy but invalid)
        isActive = result === true;
      } catch (e) {
        isActive = false;
      }
    }
    const row = FMHY.Dom.el("button", {
      class: "fmhy-sc-item" + (isActive ? " active" : ""),
      style: { animationDelay: `${index * 40}ms` },
      "aria-label": item.label,
      type: "button"
    });

    // Icon (SVG, no emoji)
    const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-item-icon" });
    FMHY.Icon.inject(iconWrap, item.icon || "dot", 18);
    row.appendChild(iconWrap);

    // Body
    const body = FMHY.Dom.el("div", { class: "fmhy-sc-item-body" });
    body.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-item-label" }, item.label));
    if (item.description) {
      body.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-item-desc" }, item.description));
    }
    row.appendChild(body);

    // Badge
    if (item.badge) {
      row.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-item-badge" }, String(item.badge)));
    }

    // Chevron
    const chevron = FMHY.Dom.el("span", { class: "fmhy-sc-item-chevron" });
    FMHY.Icon.inject(chevron, "chevron-right", 16);
    row.appendChild(chevron);

    row.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Visual feedback: flash the row
      row.classList.add("fmhy-sc-item-clicked");
      setTimeout(() => row.classList.remove("fmhy-sc-item-clicked"), 300);
      try {
        await item.action();
        // Re-render to update active state — but only if sidebar is still open
        if (isOpen) renderSection();
      } catch (err) {
        console.error("[FMHY SC] Item action failed:", err);
        showToast("Action failed: " + err.message, "error");
      }
    });

    return row;
  }

  /**
   * Open the sidebar.
   */
  function open() {
    if (isOpen) return;
    buildSidebar();
    isOpen = true;
    previouslyFocused = document.activeElement;

    requestAnimationFrame(() => {
      backdrop.classList.add("fmhy-sc-visible");
      if (hostButton) {
        hostButton.setAttribute("aria-expanded", "true");
        hostButton.classList.add("fmhy-sc-host-hidden");
      }
    });

    renderSection();

    setTimeout(() => {
      const firstFocusable = panel.querySelector("button, [tabindex]:not([tabindex='-1'])");
      if (firstFocusable) firstFocusable.focus();
    }, 350);

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown, true);
  }

  /**
   * Close the sidebar.
   */
  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.classList.remove("fmhy-sc-visible");
    if (hostButton) {
      hostButton.setAttribute("aria-expanded", "false");
      hostButton.classList.remove("fmhy-sc-host-hidden");
    }
    document.body.style.overflow = "";
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function toggle() { if (isOpen) close(); else open(); }

  function switchSection(sectionId) {
    if (!registry[sectionId] || sectionId === activeSection) return;
    activeSection = sectionId;
    sectionTabs.querySelectorAll(".fmhy-sc-tab").forEach((tab) => {
      const isActive = tab.dataset.section === sectionId;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    sectionContent.classList.add("fmhy-sc-content-exiting");
    setTimeout(() => {
      renderSection();
      sectionContent.classList.remove("fmhy-sc-content-exiting");
    }, 150);
  }

  function onKeyDown(e) {
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "Tab" && panel) {
      const focusable = panel.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function onTabKeydown(e) {
    const tabs = Array.from(sectionTabs.querySelectorAll(".fmhy-sc-tab"));
    const currentIdx = tabs.findIndex((t) => t === document.activeElement);
    if (currentIdx === -1) return;
    let newIdx = currentIdx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); newIdx = (currentIdx + 1) % tabs.length; }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); newIdx = (currentIdx - 1 + tabs.length) % tabs.length; }
    else if (e.key === "Home") { e.preventDefault(); newIdx = 0; }
    else if (e.key === "End") { e.preventDefault(); newIdx = tabs.length - 1; }
    else return;
    tabs[newIdx].focus();
    switchSection(tabs[newIdx].dataset.section);
  }

  /**
   * Set up edge-swipe gesture for touch devices.
   */
  function setupSwipeGesture() {
    if (!("ontouchstart" in window)) return;
    document.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      const edgeThreshold = 30;
      if (!isOpen && touch.clientX < window.innerWidth - edgeThreshold) return;
      swipeState.active = true;
      swipeState.startX = touch.clientX;
      swipeState.startY = touch.clientY;
      swipeState.currentX = touch.clientX;
      swipeState.startTime = Date.now();
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
      if (!swipeState.active) return;
      swipeState.currentX = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener("touchend", (e) => {
      if (!swipeState.active) return;
      swipeState.active = false;
      const elapsed = Date.now() - swipeState.startTime;
      if (elapsed > SWIPE_TIMEOUT) return;
      const dx = swipeState.currentX - swipeState.startX;
      const dy = Math.abs(e.changedTouches[0].clientY - swipeState.startY);
      if (dy > 60) return;
      if (!isOpen && dx < -SWIPE_THRESHOLD) open();
      else if (isOpen && dx > SWIPE_THRESHOLD) close();
    }, { passive: true });
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {string} [type="info"] - info, success, error
   */
  function showToast(message, type = "info") {
    const toast = FMHY.Dom.el("div", {
      class: `fmhy-sc-toast fmhy-sc-toast-${type}`,
      role: "status",
      "aria-live": "polite"
    });
    // Icon based on type
    const iconName = type === "success" ? "check-circle" : type === "error" ? "alert" : "info";
    const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-toast-icon" });
    FMHY.Icon.inject(iconWrap, iconName, 16);
    toast.appendChild(iconWrap);
    toast.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-toast-text" }, message));
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("fmhy-sc-toast-visible"));
    setTimeout(() => {
      toast.classList.remove("fmhy-sc-toast-visible");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---------- Public API ----------
  global.FMHY.Sidebar = {
    register, updateItem, open, close, toggle, switchSection,
    isOpen: () => isOpen, showToast
  };

  // ---------- Feature registration ----------
  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      buildHost();
      setupSwipeGesture();

      // Quick section
      register({
        id: "command-palette", section: "quick",
        label: "Command Palette", icon: "command",
        description: "Search all resources, bookmarks, history",
        order: 1,
        action: () => {
          close();
          setTimeout(() => {
            const cp = FMHY.getFeature("commandPalette");
            if (cp) cp.onMessage({ type: "openCommandPalette" });
          }, 350);
        }
      });

      register({
        id: "radial-menu", section: "quick",
        label: "Category Radial", icon: "radial",
        description: "Visual jump to any category",
        order: 2,
        action: () => {
          close();
          setTimeout(() => {
            const rm = FMHY.getFeature("radialMenu");
            if (rm) rm.onMessage({ type: "openRadialMenu" });
          }, 350);
        }
      });

      register({
        id: "bookmark-page", section: "quick",
        label: "Bookmark This Page", icon: "bookmark",
        description: "Save the current page",
        order: 3,
        action: async () => {
          const url = window.location.href;
          const title = FMHY.Dom.getPageTitle();
          const category = FMHY.Dom.getCurrentCategory();
          const existing = await FMHY.Storage.findBookmarkByUrl(url);
          if (existing) {
            await FMHY.Storage.removeBookmark(existing.id);
            showToast("Bookmark removed", "info");
          } else {
            await FMHY.Storage.addBookmark({ url, title, category });
            showToast("Bookmark added", "success");
          }
          const bm = FMHY.getFeature("bookmarks");
          if (bm && bm.refreshBookmarkedSet) bm.refreshBookmarkedSet();
        }
      });

      register({
        id: "sync-now", section: "quick",
        label: "Sync Now", icon: "sync",
        description: "Push/pull via GitHub Gist or WebDAV",
        order: 4,
        action: async () => {
          const cfg = await FMHY.Storage.getSyncConfig();
          if (cfg.provider === "none" || !cfg.token) {
            showToast("Sync not configured — set up in Options", "error");
            return;
          }
          showToast("Syncing...", "info");
          try {
            await chrome.runtime.sendMessage({ type: "syncNow" });
            showToast("Synced successfully", "success");
          } catch (e) {
            showToast("Sync failed: " + e.message, "error");
          }
        }
      });

      // Tools section
      register({
        id: "reading-mode", section: "tools",
        label: "Reading Mode", icon: "book-open",
        description: "Focus on current section",
        order: 1,
        isActive: () => {
          const rm = FMHY.getFeature("readingMode");
          return rm && rm.isActive ? rm.isActive() : document.body.classList.contains("fmhy-reading-mode");
        },
        action: () => {
          const rm = FMHY.getFeature("readingMode");
          if (rm && rm.toggle) {
            rm.toggle();
            showToast(document.body.classList.contains("fmhy-reading-mode") ? "Reading mode on" : "Reading mode off", "info");
          } else {
            showToast("Reading mode unavailable", "error");
          }
        }
      });

      register({
        id: "density-cycle", section: "tools",
        label: "Density Mode", icon: "layers",
        description: "Cycle: compact / comfortable / spacious",
        order: 2,
        action: async () => {
          const order = ["compact", "comfortable", "spacious"];
          const current = await FMHY.Storage.getSetting("density");
          const idx = order.indexOf(current);
          const next = order[(idx + 1) % order.length];
          await FMHY.Storage.setSetting("density", next);
          document.documentElement.setAttribute("data-fmhy-density", next);
          showToast(`Density: ${next}`, "info");
        }
      });

      register({
        id: "export-data", section: "tools",
        label: "Export Data", icon: "download",
        description: "JSON / HTML / Markdown / CSV",
        order: 3,
        action: () => {
          const et = FMHY.getFeature("exportTools");
          if (et && et.openMenu) {
            et.openMenu();
            showToast("Export dialog opened", "info");
          } else {
            showToast("Export feature not loaded", "error");
          }
        }
      });

      register({
        id: "watch-category", section: "tools",
        label: "Watch This Category", icon: "bell",
        description: "Get notified of new resources here",
        order: 4,
        // isActive is sync — we cache the watched state and refresh on each render
        isActive: () => {
          // Can't be async, so we check a cached value updated by refreshSavedBadges
          return !!watchedCategoriesCache.includes(FMHY.Dom.getCurrentCategory());
        },
        action: async () => {
          const cat = FMHY.Dom.getCurrentCategory();
          const watched = await FMHY.Storage.getWatchedCategories();
          if (watched.includes(cat)) {
            await FMHY.Storage.unwatchCategory(cat);
            showToast(`Stopped watching ${cat}`, "info");
          } else {
            await FMHY.Storage.watchCategory(cat);
            showToast(`Now watching ${cat}`, "success");
          }
          // Refresh cache + re-render
          await refreshSavedBadges();
        }
      });

      register({
        id: "compare-matrix", section: "tools",
        label: "Compare Resources", icon: "scale",
        description: "Multi-select and view side-by-side",
        order: 5,
        action: () => {
          const cm = FMHY.getFeature("compareMatrix");
          if (cm) {
            showToast("Checkboxes are next to each link — select 2+ then click Compare", "info");
          } else {
            showToast("Compare feature not loaded", "error");
          }
        }
      });

      register({
        id: "open-options", section: "tools",
        label: "Open Full Options", icon: "settings",
        description: "Sync, highlights, watched, backup",
        order: 99,
        action: () => {
          if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        }
      });

      // Browse section
      register({
        id: "related-resources", section: "browse",
        label: "Related Resources", icon: "link",
        description: "Find duplicates and similar items",
        order: 1,
        action: () => {
          const rs = FMHY.getFeature("relatedSidebar");
          if (rs && rs.toggle) rs.toggle();
        }
      });

      register({
        id: "mini-toc", section: "browse",
        label: "Table of Contents", icon: "list",
        description: "Show floating TOC with scroll-spy",
        order: 2,
        isActive: () => {
          const w = document.querySelector(".fmhy-toc-widget");
          return w && w.style.display !== "none";
        },
        action: () => {
          const w = document.querySelector(".fmhy-toc-widget");
          if (w) {
            const isHidden = w.style.display === "none";
            w.style.display = isHidden ? "" : "none";
            showToast(isHidden ? "TOC shown" : "TOC hidden", "info");
          } else {
            showToast("No headings on this page", "info");
          }
        }
      });

      register({
        id: "highlight-rules", section: "browse",
        label: "Highlight Rules", icon: "tag",
        description: "Custom color-coded tags for resources",
        order: 3,
        action: () => {
          showToast("Configure highlight rules in Options", "info");
          if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        }
      });

      register({
        id: "keyboard-help", section: "browse",
        label: "Keyboard Shortcuts", icon: "keyboard",
        description: "View all available shortcuts",
        order: 4,
        action: () => {
          const kn = FMHY.getFeature("keyboardNav");
          if (kn) showKeyboardHelp();
        }
      });

      // Saved section — populated by refreshSavedBadges()
      refreshSavedBadges();
    },
    onMessage(msg) {
      if (msg.type === "toggleSidebar") { toggle(); return true; }
      return false;
    },
    refresh: refreshSavedBadges
  });

  /**
   * Show keyboard shortcuts help (inline in sidebar).
   */
  function showKeyboardHelp() {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";

    const backBtn = FMHY.Dom.el("button", { class: "fmhy-sc-back-btn" });
    backBtn.appendChild(FMHY.Icon.render("chevron-left", 16));
    backBtn.appendChild(document.createTextNode("Back"));
    backBtn.addEventListener("click", () => renderSection());
    sectionContent.appendChild(backBtn);

    const title = FMHY.Dom.el("h3", { class: "fmhy-sc-list-title" }, "Keyboard Shortcuts");
    sectionContent.appendChild(title);

    const shortcuts = [
      ["Ctrl + Shift + K", "Open command palette"],
      ["Ctrl + Shift + L", "Toggle this sidebar"],
      ["Ctrl + Shift + B", "Bookmark current page"],
      ["Ctrl + Shift + Space", "Open category radial"],
      ["J / K", "Move between resource links"],
      ["Enter", "Open active link"],
      ["Shift + Enter", "Open in new tab"],
      ["B", "Bookmark active link"],
      ["N", "Add note to active link"],
      ["/", "Focus search"],
      ["G G", "Scroll to top"],
      ["G", "Scroll to bottom"],
      ["?", "Show this help"]
    ];

    const list = FMHY.Dom.el("div", { class: "fmhy-sc-kb-list" });
    shortcuts.forEach(([key, desc]) => {
      const row = FMHY.Dom.el("div", { class: "fmhy-sc-kb-row" });
      const kbd = FMHY.Dom.el("kbd", { class: "fmhy-sc-kbd" }, key);
      const label = FMHY.Dom.el("span", { class: "fmhy-sc-kb-desc" }, desc);
      row.appendChild(label);
      row.appendChild(kbd);
      list.appendChild(row);
    });
    sectionContent.appendChild(list);
  }

  /**
   * Update the "saved" section with live counts.
   */
  async function refreshSavedBadges() {
    const [bookmarks, history, ratings, notes, watched] = await Promise.all([
      FMHY.Storage.getBookmarks(),
      FMHY.Storage.getHistory(),
      FMHY.Storage.getRatings(),
      FMHY.Storage.getNotes(),
      FMHY.Storage.getWatchedCategories()
    ]);
    watchedCategoriesCache = watched;

    register({
      id: "view-bookmarks", section: "saved",
      label: "View All Bookmarks", icon: "bookmark",
      description: `${bookmarks.length} bookmarked`,
      badge: bookmarks.length > 0 ? String(bookmarks.length) : undefined,
      order: 1,
      action: async () => {
        const fresh = await FMHY.Storage.getBookmarks();
        showBookmarksList(fresh);
      }
    });

    register({
      id: "view-history", section: "saved",
      label: "Recently Viewed", icon: "history",
      description: `${history.length} recent visits`,
      badge: history.length > 0 ? String(history.length) : undefined,
      order: 2,
      action: async () => {
        const fresh = await FMHY.Storage.getHistory();
        showHistoryList(fresh);
      }
    });

    register({
      id: "view-ratings", section: "saved",
      label: "Your Ratings", icon: "star",
      description: `${Object.keys(ratings).length} rated`,
      badge: Object.keys(ratings).length > 0 ? String(Object.keys(ratings).length) : undefined,
      order: 3,
      action: async () => {
        const fresh = await FMHY.Storage.getRatings();
        showRatingsList(fresh);
      }
    });

    register({
      id: "view-notes", section: "saved",
      label: "Your Notes", icon: "note",
      description: `${Object.keys(notes).length} notes`,
      badge: Object.keys(notes).length > 0 ? String(Object.keys(notes).length) : undefined,
      order: 4,
      action: async () => {
        const fresh = await FMHY.Storage.getNotes();
        showNotesList(fresh);
      }
    });

    if (isOpen && activeSection === "saved") renderSection();
  }

  function showBookmarksList(bookmarks) {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";
    addBackButton();

    if (bookmarks.length === 0) {
      showEmptyState("bookmark", "No bookmarks yet. Click the plus icon next to any resource on fmhy.net.");
      return;
    }

    const title = FMHY.Dom.el("h3", { class: "fmhy-sc-list-title" }, "Bookmarks");
    sectionContent.appendChild(title);

    const list = FMHY.Dom.el("div", { class: "fmhy-sc-list" });
    bookmarks.slice(0, 50).forEach((bm, idx) => {
      list.appendChild(buildSavedItemRow(bm, idx, "bookmark"));
    });
    sectionContent.appendChild(list);
  }

  function showHistoryList(history) {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";
    addBackButton();

    if (history.length === 0) {
      showEmptyState("history", "No recently viewed resources yet.");
      return;
    }

    const title = FMHY.Dom.el("h3", { class: "fmhy-sc-list-title" }, "Recently Viewed");
    sectionContent.appendChild(title);

    const list = FMHY.Dom.el("div", { class: "fmhy-sc-list" });
    history.slice(0, 20).forEach((h, idx) => {
      list.appendChild(buildSavedItemRow({ ...h, url: h.url, title: h.title || h.url, sub: `${FMHY.Dom.timeAgo(h.visitedAt)}` }, idx, "history"));
    });
    sectionContent.appendChild(list);
  }

  function showRatingsList(ratings) {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";
    addBackButton();

    const entries = Object.entries(ratings);
    if (entries.length === 0) {
      showEmptyState("star", "No ratings yet. Use the star icons next to any resource.");
      return;
    }

    const title = FMHY.Dom.el("h3", { class: "fmhy-sc-list-title" }, "Your Ratings");
    sectionContent.appendChild(title);

    const list = FMHY.Dom.el("div", { class: "fmhy-sc-list" });
    entries.sort((a, b) => b[1].stars - a[1].stars).forEach(([url, r], idx) => {
      let host = "";
      try { host = new URL(url).hostname; } catch (e) {}
      list.appendChild(buildSavedItemRow({
        url, title: host || url,
        sub: `${"*".repeat(r.stars)}${"".repeat(5 - r.stars)}${r.review ? " · " + r.review : ""}`,
        icon: "star"
      }, idx, "rating"));
    });
    sectionContent.appendChild(list);
  }

  function showNotesList(notes) {
    if (!sectionContent) return;
    sectionContent.innerHTML = "";
    addBackButton();

    const entries = Object.entries(notes);
    if (entries.length === 0) {
      showEmptyState("note", "No notes yet. Use the pencil icon next to any resource.");
      return;
    }

    const title = FMHY.Dom.el("h3", { class: "fmhy-sc-list-title" }, "Your Notes");
    sectionContent.appendChild(title);

    const list = FMHY.Dom.el("div", { class: "fmhy-sc-list" });
    entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0)).forEach(([url, n], idx) => {
      const preview = (n.text || "").slice(0, 80) + ((n.text || "").length > 80 ? "..." : "");
      let host = "";
      try { host = new URL(url).hostname; } catch (e) {}
      list.appendChild(buildSavedItemRow({
        url, title: host || url,
        sub: `${FMHY.Dom.timeAgo(n.updatedAt)} · ${preview}`,
        icon: "note"
      }, idx, "note"));
    });
    sectionContent.appendChild(list);
  }

  function addBackButton() {
    const backBtn = FMHY.Dom.el("button", { class: "fmhy-sc-back-btn" });
    backBtn.appendChild(FMHY.Icon.render("chevron-left", 16));
    backBtn.appendChild(document.createTextNode("Back"));
    backBtn.addEventListener("click", () => renderSection());
    sectionContent.appendChild(backBtn);
  }

  function showEmptyState(iconName, message) {
    const empty = FMHY.Dom.el("div", { class: "fmhy-sc-empty" });
    empty.appendChild(FMHY.Icon.render(iconName, 32));
    empty.appendChild(FMHY.Dom.el("p", {}, message));
    sectionContent.appendChild(empty);
  }

  function buildSavedItemRow(item, index, type) {
    const row = FMHY.Dom.el("a", {
      class: "fmhy-sc-list-item",
      href: item.url,
      target: "_blank",
      rel: "noopener",
      style: { animationDelay: `${index * 30}ms` }
    });
    let host = "";
    try { host = new URL(item.url).hostname; } catch (e) {}

    const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-list-item-icon" });
    if (type === "bookmark") {
      const img = FMHY.Dom.el("img", {
        src: `https://www.google.com/s2/favicons?sz=32&domain=${host}`,
        alt: "", width: "16", height: "16"
      });
      img.addEventListener("error", () => {
        iconWrap.innerHTML = "";
        FMHY.Icon.inject(iconWrap, "bookmark", 16);
      });
      iconWrap.appendChild(img);
    } else {
      FMHY.Icon.inject(iconWrap, item.icon || "dot", 16);
    }
    row.appendChild(iconWrap);

    const body = FMHY.Dom.el("div", { class: "fmhy-sc-list-item-body" });
    body.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-list-item-title" }, item.title));
    body.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-list-item-sub" }, item.sub));
    row.appendChild(body);

    if (type === "bookmark" || type === "rating" || type === "note") {
      const delBtn = FMHY.Dom.el("button", {
        class: "fmhy-sc-list-item-del",
        title: "Delete", "aria-label": "Delete"
      });
      delBtn.appendChild(FMHY.Icon.render("trash", 14));
      delBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (type === "bookmark") await FMHY.Storage.removeBookmark(item.id);
        else if (type === "rating") await FMHY.Storage.removeRating(item.url);
        else if (type === "note") await FMHY.Storage.removeNote(item.url);
        showToast("Deleted", "info");
        // Refresh list
        if (type === "bookmark") {
          const updated = await FMHY.Storage.getBookmarks();
          showBookmarksList(updated);
        } else if (type === "rating") {
          const updated = await FMHY.Storage.getRatings();
          showRatingsList(updated);
        } else if (type === "note") {
          const updated = await FMHY.Storage.getNotes();
          showNotesList(updated);
        }
        refreshSavedBadges();
      });
      row.appendChild(delBtn);
    }

    return row;
  }

})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
