/**
 * FMHY Supercharged — Resource Comparison Matrix
 * =====================================================================
 *
 * Redesigned flow:
 *   1. User clicks the checkbox next to 2+ resource links
 *   2. A countdown notification appears: "Comparing in 5s... add more or click Compare now"
 *   3. After 5 seconds (or user clicks "Compare Now"), the comparison modal opens
 *   4. Modal shows a side-by-side table with: name, host, trust, health, rating, note
 *   5. At the top, a "Best Pick" recommendation highlights the highest-scored resource
 *
 * Scoring algorithm for "Best Pick":
 *   - Alive health: +3 points
 *   - Has user rating: +rating.stars (1-5)
 *   - Has user note: +1 point
 *   - Bookmarked: +1 point
 *   - Open-source/SAFE keyword in title: +2 points
 *   - PAID keyword: -2 points
 *   - ACCOUNT keyword: -1 point
 *   - AD keyword: -1 point
 *   Ties broken by: shorter URL (simpler = better)
 *
 * @module FMHY.compareMatrix
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "compareMatrix";
  let initialized = false;
  const selected = new Map(); // url → { element, text }

  /** Countdown state. */
  let countdownTimer = null;
  let countdownSeconds = 0;
  let countdownToast = null;

  /** The floating "Compare now" button. */
  let compareBtn = null;
  /** The countdown display inside the button. */
  let countdownDisplay = null;

  /**
   * Attach checkboxes to resource links.
   */
  function addCheckboxes() {
    FMHY.Dom.getResourceLinks().forEach(({ element, href, text }) => {
      if (element.dataset.fmhyCompareCb) return;
      element.dataset.fmhyCompareCb = "1";
      const cb = FMHY.Dom.el("input", {
        type: "checkbox",
        class: "fmhy-compare-cb",
        title: "Add to comparison",
        "aria-label": "Add to comparison"
      });
      cb.addEventListener("change", () => {
        if (cb.checked) {
          selected.set(href, { element, text });
          onItemSelected();
        } else {
          selected.delete(href);
          onItemDeselected();
        }
      });
      element.appendChild(cb);
    });
  }

  /**
   * Called when an item is selected. If this is the 2nd+ item, start the countdown.
   */
  function onItemSelected() {
    if (selected.size === 1) {
      // First item — just show a hint
      showToast("Select 1 more to compare", "info");
      return;
    }
    if (selected.size >= 2) {
      startCountdown();
    }
  }

  /**
   * Called when an item is deselected. If we drop below 2, cancel countdown.
   */
  function onItemDeselected() {
    if (selected.size < 2) {
      cancelCountdown();
      if (selected.size === 1) {
        showToast("1 item selected — add 1 more to compare", "info");
      }
    }
    updateCompareButton();
  }

  /**
   * Start the 5-second countdown to auto-compare.
   */
  function startCountdown() {
    cancelCountdown();
    countdownSeconds = 5;
    showCompareButton();
    updateCountdownDisplay();

    countdownTimer = setInterval(() => {
      countdownSeconds--;
      if (countdownSeconds <= 0) {
        cancelCountdown();
        openComparisonModal();
      } else {
        updateCountdownDisplay();
      }
    }, 1000);
  }

  /**
   * Cancel the countdown.
   */
  function cancelCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    countdownSeconds = 0;
    hideCompareButton();
  }

  /**
   * Show the floating "Compare now" button with countdown.
   */
  function showCompareButton() {
    if (!compareBtn) {
      compareBtn = FMHY.Dom.el("button", { class: "fmhy-sc-compare-fab" });
      compareBtn.addEventListener("click", () => {
        cancelCountdown();
        openComparisonModal();
      });
      document.body.appendChild(compareBtn);
    }
    compareBtn.style.display = "flex";
    updateCompareButton();
  }

  function hideCompareButton() {
    if (compareBtn) {
      compareBtn.style.display = "none";
    }
  }

  /**
   * Update the compare button's content (countdown + count).
   */
  function updateCompareButton() {
    if (!compareBtn) return;
    if (countdownSeconds > 0) {
      compareBtn.innerHTML = "";
      const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-compare-fab-icon" });
      FMHY.Icon.inject(iconWrap, "scale", 18);
      compareBtn.appendChild(iconWrap);
      compareBtn.appendChild(FMHY.Dom.el("span", {},
        `Compare ${selected.size} in ${countdownSeconds}s`));
      compareBtn.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-compare-fab-hint" }, "Click to compare now"));
    } else {
      compareBtn.innerHTML = "";
      const iconWrap = FMHY.Dom.el("span", { class: "fmhy-sc-compare-fab-icon" });
      FMHY.Icon.inject(iconWrap, "scale", 18);
      compareBtn.appendChild(iconWrap);
      compareBtn.appendChild(FMHY.Dom.el("span", {}, `Compare ${selected.size} items`));
    }
  }

  function updateCountdownDisplay() {
    updateCompareButton();
  }

  /**
   * Open the comparison modal with side-by-side data + best pick.
   */
  async function openComparisonModal() {
    if (selected.size < 2) {
      showToast("Select at least 2 items to compare", "error");
      return;
    }

    const [notes, ratings, health, bookmarks] = await Promise.all([
      FMHY.Storage.getNotes(),
      FMHY.Storage.getRatings(),
      FMHY.Storage.getAllHealth(),
      FMHY.Storage.getBookmarks()
    ]);
    const bookmarkUrls = new Set(bookmarks.map((b) => b.url));

    // Build scored entries
    const entries = [];
    selected.forEach(({ text }, url) => {
      let host = "";
      try { host = new URL(url).hostname; } catch (e) {}
      const hRec = health[url];
      const rRec = ratings[url];
      const nRec = notes[url];
      const isBookmarked = bookmarkUrls.has(url);
      const trust = classifyTrust(text);

      // Score
      let score = 0;
      const reasons = [];
      if (hRec) {
        if (hRec.status === "alive") { score += 3; reasons.push("Alive link (+3)"); }
        else if (hRec.status === "dead") { score -= 5; reasons.push("Dead link (-5)"); }
      }
      if (rRec) { score += rRec.stars; reasons.push(`Your rating: ${rRec.stars}/5 (+${rRec.stars})`); }
      if (nRec) { score += 1; reasons.push("Has note (+1)"); }
      if (isBookmarked) { score += 1; reasons.push("Bookmarked (+1)"); }
      if (trust.level === "safe") { score += 2; reasons.push("Open-source/trusted (+2)"); }
      if (trust.level === "paid") { score -= 2; reasons.push("May require payment (-2)"); }
      if (trust.level === "account") { score -= 1; reasons.push("May require account (-1)"); }
      if (trust.level === "ads") { score -= 1; reasons.push("May have ads (-1)"); }

      entries.push({
        url, text, host, health: hRec, rating: rRec, note: nRec,
        isBookmarked, trust, score, reasons
      });
    });

    // Sort by score descending; tie-break by URL length (shorter wins)
    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.url.length - b.url.length;
    });

    const best = entries[0];

    // Build modal
    const modal = FMHY.Dom.el("div", {
      class: "fmhy-sc-modal-overlay",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Resource comparison"
    });

    const box = FMHY.Dom.el("div", { class: "fmhy-sc-modal fmhy-sc-modal-wide" });

    // Header
    const header = FMHY.Dom.el("div", { class: "fmhy-sc-modal-header" });
    header.appendChild(FMHY.Dom.el("h3", {}, `Comparing ${entries.length} resources`));
    const closeBtn = FMHY.Dom.el("button", { class: "fmhy-sc-modal-close", "aria-label": "Close" });
    closeBtn.appendChild(FMHY.Icon.render("close", 18));
    closeBtn.addEventListener("click", () => modal.remove());
    header.appendChild(closeBtn);
    box.appendChild(header);

    // Best Pick banner
    const bestBanner = FMHY.Dom.el("div", { class: "fmhy-sc-compare-best" });
    const bestIcon = FMHY.Dom.el("div", { class: "fmhy-sc-compare-best-icon" });
    FMHY.Icon.inject(bestIcon, "star-filled", 24);
    bestBanner.appendChild(bestIcon);
    const bestBody = FMHY.Dom.el("div", { class: "fmhy-sc-compare-best-body" });
    bestBody.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-compare-best-label" }, "Best Pick"));
    bestBody.appendChild(FMHY.Dom.el("div", { class: "fmhy-sc-compare-best-title" }, best.text));
    const bestMeta = FMHY.Dom.el("div", { class: "fmhy-sc-compare-best-meta" });
    bestMeta.appendChild(FMHY.Dom.el("span", {}, `${best.host} · Score: ${best.score}`));
    const bestLink = FMHY.Dom.el("a", {
      href: best.url, target: "_blank", rel: "noopener",
      class: "fmhy-sc-compare-best-link"
    }, "Open");
    bestMeta.appendChild(bestLink);
    bestBody.appendChild(bestMeta);

    // Reasons
    if (best.reasons.length > 0) {
      const reasonsBox = FMHY.Dom.el("div", { class: "fmhy-sc-compare-reasons" });
      best.reasons.forEach((r) => {
        reasonsBox.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-compare-reason" }, r));
      });
      bestBody.appendChild(reasonsBox);
    }
    bestBanner.appendChild(bestBody);
    box.appendChild(bestBanner);

    // Comparison table
    const tableWrap = FMHY.Dom.el("div", { class: "fmhy-sc-compare-table-wrap" });
    const table = FMHY.Dom.el("table", { class: "fmhy-sc-compare-table" });
    const thead = FMHY.Dom.el("thead");
    const tr = FMHY.Dom.el("tr");
    ["Resource", "Host", "Trust", "Health", "Rating", "Note", "Score"].forEach((c) => {
      tr.appendChild(FMHY.Dom.el("th", {}, c));
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = FMHY.Dom.el("tbody");
    entries.forEach((e, idx) => {
      const row = FMHY.Dom.el("tr", { class: idx === 0 ? "best-row" : "" });
      // Resource name (link)
      const nameCell = FMHY.Dom.el("td");
      const nameLink = FMHY.Dom.el("a", {
        href: e.url, target: "_blank", rel: "noopener",
        class: "fmhy-sc-compare-link"
      }, e.text);
      nameCell.appendChild(nameLink);
      row.appendChild(nameCell);
      // Host
      row.appendChild(FMHY.Dom.el("td", {}, e.host));
      // Trust
      row.appendChild(FMHY.Dom.el("td", {}, `${e.trust.label}`));
      // Health
      const healthText = e.health
        ? (e.health.status === "alive" ? "Alive" : e.health.status === "dead" ? "Dead" : "Unknown")
        : "Not checked";
      row.appendChild(FMHY.Dom.el("td", { class: "fmhy-sc-health-" + (e.health ? e.health.status : "unknown") }, healthText));
      // Rating
      row.appendChild(FMHY.Dom.el("td", {}, e.rating ? `${e.rating.stars}/5` : "—"));
      // Note
      const noteText = e.note && e.note.text
        ? (e.note.text.slice(0, 40) + (e.note.text.length > 40 ? "..." : ""))
        : "—";
      row.appendChild(FMHY.Dom.el("td", {}, noteText));
      // Score
      const scoreCell = FMHY.Dom.el("td", { class: "fmhy-sc-compare-score" });
      scoreCell.appendChild(FMHY.Dom.el("span", { class: "fmhy-sc-score-badge score-" + (e.score > 0 ? "pos" : e.score < 0 ? "neg" : "neu") }, String(e.score)));
      row.appendChild(scoreCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    box.appendChild(tableWrap);

    // Buttons
    const btns = FMHY.Dom.el("div", { class: "fmhy-sc-modal-btns" });
    const clearBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn" }, "Clear selection");
    clearBtn.addEventListener("click", () => {
      selected.clear();
      document.querySelectorAll(".fmhy-compare-cb").forEach((cb) => { cb.checked = false; });
      cancelCountdown();
      modal.remove();
      showToast("Selection cleared", "info");
    });
    const doneBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn fmhy-sc-btn-primary" }, "Done");
    doneBtn.addEventListener("click", () => modal.remove());
    btns.appendChild(clearBtn);
    btns.appendChild(doneBtn);
    box.appendChild(btns);

    modal.appendChild(box);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    // Focus the done button
    setTimeout(() => doneBtn.focus(), 100);
  }

  /**
   * Classify trust level based on link text keywords.
   */
  function classifyTrust(text) {
    const t = (text || "").toLowerCase();
    const SAFE = ["open source", "open-source", "github", "gitlab", "self-hosted", "selfhost", "no ads", "ad-free", "mit license"];
    const PAID = ["premium", "subscribe", "subscription", "pricing", "upgrade"];
    const ACCOUNT = ["sign up", "register", "log in", "login", "create account"];
    const ADS = ["ad-supported", "popups", "pop-ads"];
    if (SAFE.some((k) => t.includes(k))) return { level: "safe", label: "Trusted" };
    if (PAID.some((k) => t.includes(k))) return { level: "paid", label: "Paid" };
    if (ACCOUNT.some((k) => t.includes(k))) return { level: "account", label: "Account" };
    if (ADS.some((k) => t.includes(k))) return { level: "ads", label: "Ads" };
    return { level: "unknown", label: "Unknown" };
  }

  function showToast(msg, type = "info") {
    if (FMHY.Sidebar && FMHY.Sidebar.showToast) FMHY.Sidebar.showToast(msg, type);
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      addCheckboxes();
      FMHY.onPageChange(() => {
        selected.clear();
        cancelCountdown();
        addCheckboxes();
      });
    },
    onMessage() { return false; },
    openComparisonModal,
    getSelectedCount: () => selected.size
  });

})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
