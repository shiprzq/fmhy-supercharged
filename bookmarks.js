/**
 * Feature #3 — Personal Bookmark Manager with Tags, Folders & Search
 * Feature #5 (UI side) — bookmark health badges
 * Feature #15 — Recently Viewed dropdown (also feeds command palette)
 *
 * This module wires:
 *   - A floating "+" button on every resource link to one-click bookmark
 *   - A "Manage bookmarks" panel launched from the popup
 *   - "bookmarkLink" / "toggleBookmarkCurrent" message handlers
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "bookmarks";
  let initialized = false;
  const bookmarkedSet = new Set(); // urls

  async function refreshBookmarkedSet() {
    const bms = await FMHY.Storage.getBookmarks();
    bookmarkedSet.clear();
    bms.forEach((b) => bookmarkedSet.add(b.url));
    updateAllLinkBadges();
  }

  function updateAllLinkBadges() {
    FMHY.Dom.getResourceLinks().forEach(({ element, href }) => {
      const isBm = bookmarkedSet.has(href);
      let badge = element.querySelector(".fmhy-bm-badge");
      if (isBm && !badge) {
        badge = FMHY.Dom.el("span", { class: "fmhy-bm-badge", title: "Bookmarked — click to remove" }, "*");
        badge.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          removeByUrl(href);
        });
        element.appendChild(badge);
        element.classList.add("fmhy-bm-active");
      } else if (!isBm && badge) {
        badge.remove();
        element.classList.remove("fmhy-bm-active");
      }
    });
  }

  function addHoverButtons() {
    FMHY.Dom.getResourceLinks().forEach(({ element, href, text }) => {
      if (element.dataset.fmhyBmHover) return;
      element.dataset.fmhyBmHover = "1";
      // Build hover "+" button (positioned via CSS)
      const btn = FMHY.Dom.el("button", {
        class: "fmhy-bm-add-btn",
        title: "Add to FMHY SC bookmarks",
        "aria-label": "Bookmark this resource"
      }, "＋");
      btn.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const existing = await FMHY.Storage.findBookmarkByUrl(href);
        if (existing) {
          await FMHY.Storage.removeBookmark(existing.id);
        } else {
          const category = FMHY.Dom.getCurrentCategory();
          await FMHY.Storage.addBookmark({
            url: href,
            title: text,
            category
          });
        }
        await refreshBookmarkedSet();
      });
      element.appendChild(btn);
    });
  }

  async function removeByUrl(url) {
    const bm = await FMHY.Storage.findBookmarkByUrl(url);
    if (bm) {
      await FMHY.Storage.removeBookmark(bm.id);
      await refreshBookmarkedSet();
    }
  }

  async function bookmarkCurrentResource() {
    // Bookmark the page itself
    const url = window.location.href;
    const title = FMHY.Dom.getPageTitle();
    const category = FMHY.Dom.getCurrentCategory();
    const existing = await FMHY.Storage.findBookmarkByUrl(url);
    if (existing) {
      await FMHY.Storage.removeBookmark(existing.id);
    } else {
      await FMHY.Storage.addBookmark({ url, title, category });
    }
    await refreshBookmarkedSet();
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      refreshBookmarkedSet();
      addHoverButtons();
      FMHY.onPageChange(() => {
        addHoverButtons();
        refreshBookmarkedSet();
      });
    },
    onMessage(msg) {
      if (msg.type === "bookmarkLink" && msg.url) {
        (async () => {
          const existing = await FMHY.Storage.findBookmarkByUrl(msg.url);
          if (!existing) {
            await FMHY.Storage.addBookmark({
              url: msg.url,
              title: msg.text || msg.url,
              category: FMHY.Dom.getCurrentCategory()
            });
            await refreshBookmarkedSet();
          }
        })();
        return true;
      }
      if (msg.type === "toggleBookmarkCurrent") {
        bookmarkCurrentResource();
        return true;
      }
      return false;
    },
    refreshBookmarkedSet,
    isBookmarked: (url) => bookmarkedSet.has(url)
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
