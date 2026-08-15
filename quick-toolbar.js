/**
 * Feature #16 — Quick-Access Pinned Toolbar
 *
 * Floating toolbar with your pinned resources as icons.
 * Auto-hides on scroll down, reappears on scroll up.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "quickToolbar";
  let initialized = false;
  let toolbar = null;
  let lastScrollY = 0;

  async function renderToolbar() {
    if (toolbar) toolbar.remove();
    const pinned = await FMHY.Storage.getPinned();
    if (pinned.length === 0) return; // don't render empty toolbar

    toolbar = FMHY.Dom.el("div", { class: "fmhy-quick-toolbar" });
    const label = FMHY.Dom.el("span", { class: "fmhy-qt-label" }, FMHY.Icon.render("pin", 16) ? "" : "");
    toolbar.appendChild(label);

    pinned.forEach((url) => {
      const a = FMHY.Dom.el("a", {
        class: "fmhy-qt-item",
        href: url,
        target: "_blank",
        rel: "noopener",
        title: url
      });
      const img = FMHY.Dom.el("img", {
        src: FMHY.Dom.faviconUrl(url, 32),
        alt: "",
        width: "24",
        height: "24",
        onerror: "this.style.display='none'"
      });
      a.appendChild(img);
      toolbar.appendChild(a);
    });

    document.body.appendChild(toolbar);
  }

  function setupAutoHide() {
    window.addEventListener("scroll", FMHY.Dom.throttle(() => {
      if (!toolbar) return;
      const y = window.scrollY;
      if (y > lastScrollY + 5 && y > 200) {
        toolbar.classList.add("fmhy-qt-hidden");
      } else if (y < lastScrollY - 5) {
        toolbar.classList.remove("fmhy-qt-hidden");
      }
      lastScrollY = y;
    }, 100), { passive: true });
  }

  async function handlePinMessage(url) {
    const pinned = await FMHY.Storage.getPinned();
    if (pinned.includes(url)) {
      await FMHY.Storage.unpin(url);
    } else {
      await FMHY.Storage.pin(url);
    }
    await renderToolbar();
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      renderToolbar();
      setupAutoHide();
      FMHY.onPageChange(() => renderToolbar());
    },
    onMessage(msg) {
      if (msg.type === "pinLink" && msg.url) {
        handlePinMessage(msg.url);
        return true;
      }
      return false;
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
