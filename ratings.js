/**
 * FMHY Supercharged — Personal Ratings & Reviews Log
 * =====================================================================
 *
 * Redesigned rating flow:
 *   1. User clicks a star next to a resource link
 *   2. A beautiful modal opens with the selected star rating
 *   3. User can adjust stars + write a review in a text area
 *   4. Click "Save" to persist, or "Delete" to remove
 *
 * @module FMHY.ratings
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "ratings";
  let initialized = false;
  let activeModal = null;

  /**
   * Attach star widgets to resource links.
   * Each widget shows the current rating (if any) and opens the
   * rating modal on click.
   */
  async function applyRatings() {
    const ratings = await FMHY.Storage.getRatings();
    FMHY.Dom.getResourceLinks().forEach(({ element, href }) => {
      let widget = element.querySelector(".fmhy-ratingwidget");
      if (widget) {
        updateStars(widget, ratings[href]);
        return;
      }
      widget = FMHY.Dom.el("span", { class: "fmhy-ratingwidget", "data-url": href });
      for (let i = 1; i <= 5; i++) {
        const star = FMHY.Dom.el("span", {
          class: "fmhy-star",
          "data-star": i,
          title: `Rate ${i} star${i > 1 ? "s" : ""}`,
          role: "button",
          tabindex: "0"
        });
        star.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openRatingModal(href, i);
        });
        star.addEventListener("mouseenter", () => previewStars(widget, i));
        star.addEventListener("mouseleave", () => updateStars(widget, ratings[href]));
        widget.appendChild(star);
      }
      element.appendChild(widget);
      updateStars(widget, ratings[href]);
    });
  }

  /** Temporarily fill stars on hover. */
  function previewStars(widget, n) {
    widget.querySelectorAll(".fmhy-star").forEach((s, i) => {
      s.classList.toggle("filled", i < n);
    });
  }

  /** Set the widget's star display to match a rating record. */
  function updateStars(widget, rating) {
    const n = rating ? rating.stars : 0;
    widget.querySelectorAll(".fmhy-star").forEach((s, i) => {
      s.classList.toggle("filled", i < n);
    });
    widget.title = rating ? `You rated ${n}/5${rating.review ? " — " + rating.review : ""}` : "Rate this resource";
  }

  /**
   * Open the rating modal for a URL.
   * @param {string} url - The resource URL
   * @param {number} [initialStars=0] - Pre-selected star count
   */
  async function openRatingModal(url, initialStars = 0) {
    closeRatingModal();

    const existing = await FMHY.Storage.getRating(url);
    const stars = initialStars || (existing ? existing.stars : 0);
    const review = existing ? existing.review : "";

    let host = "";
    try { host = new URL(url).hostname; } catch (e) {}

    activeModal = FMHY.Dom.el("div", {
      class: "fmhy-sc-modal-overlay",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Rate resource"
    });

    const box = FMHY.Dom.el("div", { class: "fmhy-sc-modal" });

    // Header
    const header = FMHY.Dom.el("div", { class: "fmhy-sc-modal-header" });
    header.appendChild(FMHY.Dom.el("h3", {}, "Rate this resource"));
    const closeBtn = FMHY.Dom.el("button", {
      class: "fmhy-sc-modal-close",
      "aria-label": "Close"
    });
    closeBtn.appendChild(FMHY.Icon.render("close", 18));
    closeBtn.addEventListener("click", closeRatingModal);
    header.appendChild(closeBtn);
    box.appendChild(header);

    // URL preview
    const urlBox = FMHY.Dom.el("div", { class: "fmhy-sc-modal-url" }, host || url);
    box.appendChild(urlBox);

    // Star selector
    const starSection = FMHY.Dom.el("div", { class: "fmhy-sc-rating-stars" });
    let selectedStars = stars;
    const starEls = [];
    for (let i = 1; i <= 5; i++) {
      const star = FMHY.Dom.el("button", {
        class: "fmhy-sc-rating-star" + (i <= stars ? " filled" : ""),
        "data-star": i,
        title: `${i} star${i > 1 ? "s" : ""}`,
        "aria-label": `${i} star${i > 1 ? "s" : ""}`
      });
      star.appendChild(FMHY.Icon.render("star", 28));
      star.addEventListener("click", () => {
        selectedStars = i;
        starEls.forEach((s, idx) => s.classList.toggle("filled", idx < i));
        label.textContent = i === 0 ? "No rating" : `${i} out of 5`;
      });
      starEls.push(star);
      starSection.appendChild(star);
    }
    const label = FMHY.Dom.el("div", { class: "fmhy-sc-rating-label" },
      stars === 0 ? "Select a rating" : `${stars} out of 5`);
    starSection.appendChild(label);
    box.appendChild(starSection);

    // Review textarea
    const reviewSection = FMHY.Dom.el("div", { class: "fmhy-sc-modal-field" });
    reviewSection.appendChild(FMHY.Dom.el("label", { class: "fmhy-sc-modal-label" }, "Review (optional)"));
    const ta = FMHY.Dom.el("textarea", {
      class: "fmhy-sc-modal-textarea",
      placeholder: "What did you think of this resource?",
      rows: "3"
    });
    ta.value = review;
    reviewSection.appendChild(ta);
    box.appendChild(reviewSection);

    // Buttons
    const btns = FMHY.Dom.el("div", { class: "fmhy-sc-modal-btns" });
    if (existing) {
      const delBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn fmhy-sc-btn-danger" }, "Delete rating");
      delBtn.addEventListener("click", async () => {
        await FMHY.Storage.removeRating(url);
        await applyRatings();
        closeRatingModal();
        showToast("Rating deleted", "info");
      });
      btns.appendChild(delBtn);
    }
    const cancelBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn" }, "Cancel");
    cancelBtn.addEventListener("click", closeRatingModal);
    btns.appendChild(cancelBtn);
    const saveBtn = FMHY.Dom.el("button", { class: "fmhy-sc-btn fmhy-sc-btn-primary" }, "Save rating");
    saveBtn.addEventListener("click", async () => {
      if (selectedStars < 1) {
        showToast("Please select at least 1 star", "error");
        return;
      }
      await FMHY.Storage.setRating(url, selectedStars, ta.value.trim());
      await applyRatings();
      closeRatingModal();
      showToast("Rating saved", "success");
    });
    btns.appendChild(saveBtn);
    box.appendChild(btns);

    activeModal.appendChild(box);
    document.body.appendChild(activeModal);

    // Close on overlay click
    activeModal.addEventListener("click", (e) => {
      if (e.target === activeModal) closeRatingModal();
    });

    // Close on Escape
    document.addEventListener("keydown", onModalKeydown);

    // Focus the save button
    setTimeout(() => saveBtn.focus(), 100);
  }

  function onModalKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeRatingModal();
    }
  }

  function closeRatingModal() {
    if (!activeModal) return;
    activeModal.remove();
    activeModal = null;
    document.removeEventListener("keydown", onModalKeydown);
  }

  function showToast(msg, type = "info") {
    if (FMHY.Sidebar && FMHY.Sidebar.showToast) FMHY.Sidebar.showToast(msg, type);
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      applyRatings();
      FMHY.onPageChange(() => applyRatings());
    },
    refresh() { return applyRatings(); },
    onMessage(msg) {
      if (msg.type === "openRateEditor" && msg.url) {
        openRatingModal(msg.url, 5);
        return true;
      }
      return false;
    },
    openRatingModal
  });

})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
