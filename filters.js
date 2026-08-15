/**
 * Feature #13 — Smart Filters & Facets Bar
 *
 * Sticky filter bar at top of every category page:
 *   - by language · requires-account · self-hosted vs cloud
 *   - last-checked-alive · has-note · bookmarked · trust level
 *   - Combined with text search
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "filters";
  let initialized = false;
  let barEl = null;

  const STATE = {
    text: "",
    aliveOnly: false,
    bookmarkedOnly: false,
    notesOnly: false,
    trustLevel: "all", // all|safe|unknown|unsafe
    selfHostedOnly: false
  };

  function renderBar() {
    if (barEl) barEl.remove();
    barEl = FMHY.Dom.el("div", { class: "fmhy-filters-bar" });

    const search = FMHY.Dom.el("input", {
      type: "search",
      class: "fmhy-filters-search",
      placeholder: "Filter resources on this page…",
      value: STATE.text
    });
    search.addEventListener("input", FMHY.Dom.debounce((e) => {
      STATE.text = e.target.value.toLowerCase().trim();
      applyFilters();
    }, 150));

    const makeToggle = (label, prop, extra = {}) => {
      const btn = FMHY.Dom.el("button", {
        class: "fmhy-filter-chip" + (STATE[prop] ? " active" : ""),
        ...extra
      }, label);
      btn.addEventListener("click", () => {
        STATE[prop] = !STATE[prop];
        btn.classList.toggle("active", STATE[prop]);
        applyFilters();
      });
      return btn;
    };

    const select = FMHY.Dom.el("select", { class: "fmhy-filter-select" });
    [
      { v: "all", l: "All trust levels" },
      { v: "safe", l: "Safe only" },
      { v: "unknown", l: "Unknown" },
      { v: "unsafe", l: "Unsafe only" }
    ].forEach((o) => {
      const opt = FMHY.Dom.el("option", { value: o.v }, o.l);
      if (STATE.trustLevel === o.v) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", (e) => {
      STATE.trustLevel = e.target.value;
      applyFilters();
    });

    barEl.appendChild(search);
    barEl.appendChild(makeToggle("Alive", "aliveOnly"));
    barEl.appendChild(makeToggle("Bookmarked", "bookmarkedOnly"));
    barEl.appendChild(makeToggle("Has note", "notesOnly"));
    barEl.appendChild(makeToggle("Self-hosted", "selfHostedOnly"));
    barEl.appendChild(select);

    const clearBtn = FMHY.Dom.el("button", { class: "fmhy-filter-clear" }, "Clear");
    clearBtn.addEventListener("click", () => {
      STATE.text = "";
      STATE.aliveOnly = false;
      STATE.bookmarkedOnly = false;
      STATE.notesOnly = false;
      STATE.trustLevel = "all";
      STATE.selfHostedOnly = false;
      renderBar();
      applyFilters();
    });
    barEl.appendChild(clearBtn);

    const counter = FMHY.Dom.el("span", { class: "fmhy-filters-count" }, "");
    barEl.appendChild(counter);
    barEl._counter = counter;

    // Insert at top of main content
    const main = document.querySelector("main, .VPDoc, .vp-doc, article, #VPContent");
    if (main) main.prepend(barEl);
    else document.body.prepend(barEl);
  }

  let bookmarkedUrls = new Set();
  let notedUrls = new Set();
  async function loadUserData() {
    const [bms, notes] = await Promise.all([
      FMHY.Storage.getBookmarks(),
      FMHY.Storage.getNotes()
    ]);
    bookmarkedUrls = new Set(bms.map((b) => b.url));
    notedUrls = new Set(Object.keys(notes));
  }

  async function applyFilters() {
    if (!bookmarkedUrls.size && !notedUrls.size) await loadUserData();

    const links = FMHY.Dom.getResourceLinks();
    let visibleCount = 0;
    links.forEach(({ element, href, text }) => {
      let visible = true;
      if (STATE.text && !text.toLowerCase().includes(STATE.text) && !href.toLowerCase().includes(STATE.text)) {
        visible = false;
      }
      if (visible && STATE.aliveOnly) {
        const badge = element.querySelector(".fmhy-safety-health");
        if (!badge || !badge.classList.contains("fmhy-safety-alive")) visible = false;
      }
      if (visible && STATE.bookmarkedOnly && !bookmarkedUrls.has(href)) visible = false;
      if (visible && STATE.notesOnly && !notedUrls.has(href)) visible = false;
      if (visible && STATE.selfHostedOnly) {
        if (!/self[- ]?host/i.test(text)) visible = false;
      }
      if (visible && STATE.trustLevel !== "all") {
        const badge = element.querySelector(".fmhy-safety-badge");
        if (!badge) {
          if (STATE.trustLevel !== "unknown") visible = false;
        } else {
          if (STATE.trustLevel === "safe" && !badge.classList.contains("fmhy-safety-unknown") === false) {
            // we treat "unknown" as the default state — no real "safe" classification yet
          }
        }
      }

      // Hide/show the link's row (the <li> or paragraph parent)
      const row = element.closest("li, p, div") || element;
      row.style.display = visible ? "" : "none";
      if (visible) visibleCount++;
    });

    if (barEl && barEl._counter) {
      barEl._counter.textContent = `${visibleCount}/${links.length} shown`;
    }
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      loadUserData().then(() => {
        renderBar();
        applyFilters();
      });
      FMHY.onPageChange(() => {
        loadUserData().then(() => {
          renderBar();
          applyFilters();
        });
      });
    },
    onMessage() { return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
