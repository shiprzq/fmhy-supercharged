/**
 * Feature #14 — Floating Mini Table of Contents
 * Feature #23 — Reading Progress & Scroll Memory (combined here)
 *
 * A draggable, collapsible floating widget showing all H2/H3 headings on
 * the current page with scroll-spy highlighting. Also remembers scroll
 * position per URL across sessions + shows a reading progress bar at top.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "miniToc";
  let initialized = false;
  let widget = null;
  let progressbar = null;

  function buildWidget() {
    if (widget) widget.remove();
    widget = FMHY.Dom.el("div", { class: "fmhy-toc-widget", role: "navigation", "aria-label": "Page TOC" });
    widget.innerHTML = "";

    const header = FMHY.Dom.el("div", { class: "fmhy-toc-header" }, [
      FMHY.Dom.el("span", { class: "fmhy-toc-title" }, "On this page"),
      FMHY.Dom.el("button", { class: "fmhy-toc-collapse", title: "Collapse/expand" }, "–")
    ]);
    const list = FMHY.Dom.el("div", { class: "fmhy-toc-list" });

    const headings = document.querySelectorAll("main h2, main h3, .vp-doc h2, .vp-doc h3, article h2, article h3");
    if (headings.length === 0) {
      // No headings — hide widget
      widget.style.display = "none";
      return;
    }

    headings.forEach((h, i) => {
      if (!h.id) h.id = `fmhy-toc-${i}`;
      const item = FMHY.Dom.el("a", {
        class: "fmhy-toc-item fmhy-toc-h" + h.tagName.toLowerCase(),
        href: "#" + h.id
      }, h.textContent.trim());
      item.addEventListener("click", (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      list.appendChild(item);
    });

    widget.appendChild(header);
    widget.appendChild(list);
    document.body.appendChild(widget);

    // Make draggable by header
    makeDraggable(widget, header);

    // Collapse
    header.querySelector(".fmhy-toc-collapse").addEventListener("click", () => {
      list.style.display = list.style.display === "none" ? "" : "none";
      widget.classList.toggle("collapsed");
    });

    // Restore last position
    const pos = localStorage.getItem("fmhy_toc_pos");
    if (pos) {
      try {
        const { left, top } = JSON.parse(pos);
        widget.style.left = left + "px";
        widget.style.top = top + "px";
        widget.style.right = "auto";
      } catch (e) {}
    }

    // Scroll-spy
    setupScrollSpy(headings, list);
  }

  function makeDraggable(el, handle) {
    let dragging = false, offX = 0, offY = 0;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      dragging = true;
      const r = el.getBoundingClientRect();
      offX = e.clientX - r.left;
      offY = e.clientY - r.top;
      el.style.right = "auto";
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.left = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - offX)) + "px";
      el.style.top = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - offY)) + "px";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      localStorage.setItem("fmhy_toc_pos", JSON.stringify({
        left: parseInt(el.style.left || 0, 10),
        top: parseInt(el.style.top || 0, 10)
      }));
    });
  }

  let spyObs = null;
  function setupScrollSpy(headings, list) {
    if (spyObs) spyObs.disconnect();
    const items = list.querySelectorAll(".fmhy-toc-item");
    spyObs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          items.forEach((it) => it.classList.toggle("active", it.getAttribute("href") === "#" + id));
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    headings.forEach((h) => spyObs.observe(h));
  }

  function setupProgressBar() {
    if (progressbar) progressbar.remove();
    progressbar = FMHY.Dom.el("div", { class: "fmhy-progress-bar" });
    const fill = FMHY.Dom.el("div", { class: "fmhy-progress-fill" });
    progressbar.appendChild(fill);
    document.body.appendChild(progressbar);

    const update = FMHY.Dom.throttle(() => {
      const scroll = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(100, (scroll / max) * 100) : 0;
      fill.style.width = pct + "%";
    }, 100);
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  async function restoreScroll() {
    const key = "fmhy_scroll_" + window.location.pathname;
    const saved = parseInt(localStorage.getItem(key) || "0", 10);
    if (saved > 100) {
      // Delay so VitePress content has loaded
      setTimeout(() => window.scrollTo({ top: saved, behavior: "instant" in window ? "instant" : "auto" }), 600);
    }
    // Save on scroll
    const save = FMHY.Dom.debounce(() => {
      localStorage.setItem(key, String(window.scrollY));
    }, 300);
    window.addEventListener("scroll", save, { passive: true });
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      setupProgressBar();
      restoreScroll();
      setTimeout(buildWidget, 800);
      FMHY.onPageChange(() => {
        setTimeout(buildWidget, 800);
        restoreScroll();
      });
    },
    onMessage() { return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
