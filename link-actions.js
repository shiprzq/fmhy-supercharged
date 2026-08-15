/**
 * FMHY Supercharged — Integrated Link Actions
 * =====================================================================
 *
 * A single subtle button per resource link that opens a popover with
 * all per-link actions. Redesigned to feel native to VitePress:
 *
 *   - The trigger button is a small "+" icon styled like VitePress's
 *     .vp-icon (not a glowing emoji circle)
 *   - The popover uses VitePress's CSS variables and matches the
 *     .VPFlyout / .VPMenu aesthetic
 *   - SVG icons only (no emojis)
 *   - Subtle borders and shadows that match VitePress's depth
 *
 * @module FMHY.LinkActions
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "linkActions";
  let initialized = false;
  let activePopover = null;

  /**
   * Attach the action button to every resource link.
   */
  function attachActionButtons() {
    const links = FMHY.Dom.getResourceLinks();
    links.forEach(({ element, href, text }) => {
      if (element.dataset.fmhyActionBtn) return;
      element.dataset.fmhyActionBtn = "1";

      const btn = FMHY.Dom.el("button", {
        class: "fmhy-sc-link-btn",
        "aria-label": `Actions for ${text}`,
        "aria-haspopup": "dialog",
        title: "Quick actions"
      });
      btn.appendChild(FMHY.Icon.render("plus", 14));
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePopover(element, href, text);
      });
      element.appendChild(btn);
    });
  }

  function togglePopover(anchorEl, url, text) {
    if (activePopover && activePopover._url === url) {
      closePopover();
      return;
    }
    closePopover();
    openPopover(anchorEl, url, text);
  }

  function openPopover(anchorEl, url, text) {
    activePopover = FMHY.Dom.el("div", {
      class: "fmhy-sc-popover",
      role: "dialog",
      "aria-label": `Actions for ${text}`
    });
    activePopover._url = url;
    activePopover._text = text;
    activePopover._anchor = anchorEl;

    // Header
    const header = FMHY.Dom.el("div", { class: "fmhy-sc-popover-header" });
    const titleWrap = FMHY.Dom.el("div", { class: "fmhy-sc-popover-title-wrap" });
    titleWrap.appendChild(FMHY.Icon.render("zap", 14));
    titleWrap.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-popover-title" }, "Quick actions"));
    header.appendChild(titleWrap);
    const closeBtn = FMHY.Dom.el("button", {
      class: "fmhy-sc-popover-close",
      "aria-label": "Close"
    });
    closeBtn.appendChild(FMHY.Icon.render("close", 14));
    closeBtn.addEventListener("click", closePopover);
    header.appendChild(closeBtn);
    activePopover.appendChild(header);

    // URL preview
    let host = "";
    try { host = new URL(url).hostname; } catch (e) {}
    const urlPreview = FMHY.Dom.el("div", { class: "fmhy-sc-popover-url" }, host || url);
    activePopover.appendChild(urlPreview);

    // Actions list (async)
    const actionsList = FMHY.Dom.el("div", { class: "fmhy-sc-popover-actions" });
    actionsList.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-popover-loading" }, "Loading..."));
    activePopover.appendChild(actionsList);

    // Status section
    const statusSection = FMHY.Dom.el("div", { class: "fmhy-sc-popover-status" });
    activePopover.appendChild(statusSection);

    document.body.appendChild(activePopover);
    positionPopover(anchorEl);
    requestAnimationFrame(() => activePopover.classList.add("fmhy-sc-popover-visible"));

    populateActions(actionsList, url, text);
    populateStatus(statusSection, url);

    setTimeout(() => {
      document.addEventListener("click", onOutsideClick);
      document.addEventListener("keydown", onKeydown);
      window.addEventListener("scroll", closePopover, { once: true });
    }, 0);
  }

  async function populateActions(container, url, text) {
    container.innerHTML = "";

    const existing = await FMHY.Storage.findBookmarkByUrl(url);
    const pinned = await FMHY.Storage.getPinned();
    const isPinned = pinned.includes(url);

    const actions = [
      {
        icon: existing ? "bookmark-filled" : "bookmark",
        label: existing ? "Remove bookmark" : "Add bookmark",
        active: !!existing,
        action: async () => {
          if (existing) {
            await FMHY.Storage.removeBookmark(existing.id);
            showToast("Bookmark removed", "info");
          } else {
            await FMHY.Storage.addBookmark({
              url, title: text,
              category: FMHY.Dom.getCurrentCategory()
            });
            showToast("Bookmarked", "success");
          }
          closePopover();
        }
      },
      {
        icon: "note",
        label: "Add note",
        action: () => {
          closePopover();
          setTimeout(() => openNoteEditor(url), 200);
        }
      },
      {
        icon: "star",
        label: "Rate 1-5",
        action: () => openRatingPrompt(url)
      },
      {
        icon: "pin",
        label: isPinned ? "Unpin from toolbar" : "Pin to toolbar",
        active: isPinned,
        action: async () => {
          if (isPinned) {
            await FMHY.Storage.unpin(url);
            showToast("Unpinned", "info");
          } else {
            await FMHY.Storage.pin(url);
            showToast("Pinned", "success");
          }
          closePopover();
        }
      },
      {
        icon: "share",
        label: "Generate share card",
        action: () => {
          closePopover();
          setTimeout(() => triggerShareCard(url, text), 200);
        }
      },
      {
        icon: "archive",
        label: "View on Wayback Machine",
        action: () => {
          window.open(`https://web.archive.org/web/*/${url}`, "_blank", "noopener");
          closePopover();
        }
      },
      {
        icon: "scale",
        label: "Add to comparison",
        action: () => {
          const link = FMHY.Dom.getResourceLinks().find((l) => l.href === url);
          if (link) {
            const cb = link.element.querySelector(".fmhy-compare-cb");
            if (cb) {
              cb.checked = !cb.checked;
              cb.dispatchEvent(new Event("change"));
              showToast(cb.checked ? "Added to comparison" : "Removed from comparison", "info");
            }
          }
          closePopover();
        }
      },
      {
        icon: "alert",
        label: "Report this resource",
        danger: true,
        action: () => {
          closePopover();
          setTimeout(() => openReportDialog(url, text), 200);
        }
      }
    ];

    actions.forEach((a) => {
      const row = FMHY.Dom.el("button", {
        class: "fmhy-sc-popover-action" + (a.active ? " active" : "") + (a.danger ? " danger" : ""),
        role: "menuitem"
      });
      const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-popover-action-icon" });
      FMHY.Icon.inject(iconWrap, a.icon, 16);
      row.appendChild(iconWrap);
      row.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-popover-action-label" }, a.label));
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        a.action();
      });
      container.appendChild(row);
    });
  }

  async function populateStatus(container, url) {
    const [health, rating, note] = await Promise.all([
      FMHY.Storage.getHealth(url),
      FMHY.Storage.getRating(url),
      FMHY.Storage.getNote(url)
    ]);

    container.innerHTML = "";

    // Trust indicator
    const links = FMHY.Dom.getResourceLinks();
    const link = links.find((l) => l.href === url);
    if (link) {
      const trust = classifyTrust(link.text);
      addStatusRow(container, "Trust", `${trust.label} ${trust.tip}`);
    }

    if (health) {
      const healthText = health.status === "alive"
        ? `Alive (status ${health.statusCode || "OK"})`
        : health.status === "dead"
          ? "Appears dead"
          : "Unknown (CORS-blocked)";
      addStatusRow(container, "Health", healthText, "fmhy-sc-health-" + health.status);
    }

    if (rating) {
      addStatusRow(container, "Your rating", `${"*".repeat(rating.stars)}${"".repeat(5 - rating.stars)}`);
    }

    if (note && note.text) {
      const preview = note.text.slice(0, 60) + (note.text.length > 60 ? "..." : "");
      addStatusRow(container, "Your note", preview);
    }
  }

  function addStatusRow(container, label, value, valueClass = "") {
    const row = FMHY.Dom.el("div", { class: "fmhy-sc-popover-status-row" });
    row.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-popover-status-label" }, label));
    row.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-popover-status-value " + valueClass }, value));
    container.appendChild(row);
  }

  function classifyTrust(text) {
    const t = (text || "").toLowerCase();
    const SAFE = ["open source", "open-source", "github", "gitlab", "self-hosted", "selfhost", "no ads", "ad-free", "mit license", "apache license", "gpl"];
    const PAID = ["premium", "subscribe", "subscription", "pricing", "upgrade"];
    const ACCOUNT = ["sign up", "register", "log in", "login", "create account"];
    if (SAFE.some((k) => t.includes(k))) return { label: "Trusted", tip: "(open-source)" };
    if (PAID.some((k) => t.includes(k))) return { label: "Paid", tip: "(may require payment)" };
    if (ACCOUNT.some((k) => t.includes(k))) return { label: "Account", tip: "(may require account)" };
    return { label: "Unknown", tip: "(no safety info)" };
  }

  function positionPopover(anchorEl) {
    if (!activePopover || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const popW = 340;
    const popH = activePopover.offsetHeight || 400;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    let top;
    const spaceBelow = viewportH - r.bottom;
    if (spaceBelow > popH + 20) {
      top = r.bottom + scrollY + 6;
      activePopover.classList.remove("fmhy-sc-popover-above");
    } else {
      top = r.top + scrollY - popH - 6;
      activePopover.classList.add("fmhy-sc-popover-above");
    }

    let left = r.left + scrollX + (r.width / 2) - (popW / 2);
    if (left < 10) left = 10;
    if (left + popW > viewportW - 10) left = viewportW - popW - 10;

    if (viewportW < 640) {
      left = 10;
      activePopover.style.width = "calc(100vw - 20px)";
    } else {
      activePopover.style.width = popW + "px";
    }

    activePopover.style.left = left + "px";
    activePopover.style.top = top + "px";
  }

  function closePopover() {
    if (!activePopover) return;
    activePopover.classList.remove("fmhy-sc-popover-visible");
    const toRemove = activePopover;
    setTimeout(() => toRemove.remove(), 200);
    activePopover = null;
    document.removeEventListener("click", onOutsideClick);
    document.removeEventListener("keydown", onKeydown);
  }

  function onOutsideClick(e) {
    if (activePopover && !activePopover.contains(e.target) && !e.target.classList.contains("fmhy-sc-link-btn")) {
      closePopover();
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); closePopover(); }
  }

  // ---------- Helpers ----------
  function openNoteEditor(url) {
    const notes = FMHY.getFeature("notes");
    if (notes && notes.onMessage) notes.onMessage({ type: "openNoteEditor", url });
  }

  function openRatingPrompt(url) {
    const ratings = FMHY.getFeature("ratings");
    if (ratings && ratings.onMessage) {
      ratings.onMessage({ type: "openRateEditor", url });
    } else {
      const n = parseInt(prompt("Rate 1-5:", "5"), 10);
      if (n >= 1 && n <= 5) {
        const review = prompt("Optional review:", "") || "";
        FMHY.Storage.setRating(url, n, review).then(() => showToast("Rating saved", "success"));
      }
    }
  }

  function triggerShareCard(url, text) {
    const sc = FMHY.getFeature("shareCards");
    if (sc && sc.onMessage) sc.onMessage({ type: "generateShareCard", url, text });
  }

  function openReportDialog(url, text) {
    const sb = FMHY.getFeature("safetyBadges");
    if (sb && sb.onMessage) sb.onMessage({ type: "reportLink", url, text });
  }

  function showToast(msg, type = "info") {
    if (FMHY.Sidebar && FMHY.Sidebar.showToast) FMHY.Sidebar.showToast(msg, type);
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      attachActionButtons();
      FMHY.onPageChange(() => {
        closePopover();
        setTimeout(attachActionButtons, 100);
      });
    },
    onMessage() { return false; },
    refresh: attachActionButtons,
    close: closePopover
  });

})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
