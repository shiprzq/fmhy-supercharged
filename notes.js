/**
 * Feature #6 — Inline Notes & Private Annotations
 *
 * Right-click any resource link → "Add Note" → opens a popover editor.
 * Notes persist forever, show as a  icon next to the link, searchable
 * from the popup's note list.
 *
 * Responds to "openNoteEditor" message from the context menu.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "notes";
  let initialized = false;
  let popover = null;

  async function applyNoteBadges() {
    const notes = await FMHY.Storage.getNotes();
    const noteUrls = new Set(Object.keys(notes));
    FMHY.Dom.getResourceLinks().forEach(({ element, href }) => {
      let badge = element.querySelector(".fmhy-note-badge");
      if (noteUrls.has(href) && !badge) {
        badge = FMHY.Dom.el("span", { class: "fmhy-note-badge", title: "You have a note — click to view/edit" }, "md");
        badge.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          openEditor(href, element);
        });
        element.appendChild(badge);
      } else if (!noteUrls.has(href) && badge) {
        badge.remove();
      }
    });
  }

  function openEditor(url, anchorEl) {
    closeEditor();
    FMHY.Storage.getNote(url).then((note) => {
      popover = FMHY.Dom.el("div", { class: "fmhy-note-popover", role: "dialog" });
      const header = FMHY.Dom.el("div", { class: "fmhy-note-header" }, [
        FMHY.Dom.el("span", { class: "fmhy-note-title" }, " Note"),
        FMHY.Dom.el("button", { class: "fmhy-note-close", title: "Close (Esc)" }, "")
      ]);
      const urlLabel = FMHY.Dom.el("div", { class: "fmhy-note-url" }, url);
      const ta = FMHY.Dom.el("textarea", {
        class: "fmhy-note-textarea",
        placeholder: "Add a private note about this resource…",
        rows: "5"
      });
      ta.value = note ? note.text : "";
      const btns = FMHY.Dom.el("div", { class: "fmhy-note-btns" });
      const saveBtn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-primary" }, "Save");
      const delBtn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-danger" }, "Delete");
      const cancelBtn = FMHY.Dom.el("button", { class: "fmhy-btn" }, "Cancel");
      saveBtn.addEventListener("click", async () => {
        await FMHY.Storage.setNote(url, ta.value);
        await applyNoteBadges();
        closeEditor();
      });
      delBtn.addEventListener("click", async () => {
        await FMHY.Storage.removeNote(url);
        await applyNoteBadges();
        closeEditor();
      });
      cancelBtn.addEventListener("click", closeEditor);
      header.querySelector(".fmhy-note-close").addEventListener("click", closeEditor);
      btns.appendChild(saveBtn);
      btns.appendChild(delBtn);
      btns.appendChild(cancelBtn);
      popover.appendChild(header);
      popover.appendChild(urlLabel);
      popover.appendChild(ta);
      popover.appendChild(btns);
      document.body.appendChild(popover);

      // Position
      if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        const popW = 360;
        let left = r.left + window.scrollX;
        let top = r.bottom + window.scrollY + 6;
        if (left + popW > window.innerWidth) left = window.innerWidth - popW - 10;
        if (top + 260 > window.innerHeight + window.scrollY) top = r.top + window.scrollY - 270;
        popover.style.left = left + "px";
        popover.style.top = top + "px";
      } else {
        popover.style.left = "50%";
        popover.style.top = "30%";
        popover.style.transform = "translateX(-50%)";
      }
      ta.focus();
      // Esc to close
      popover.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditor(); });
      // Click outside to close
      setTimeout(() => {
        document.addEventListener("mousedown", function onDown(e) {
          if (popover && !popover.contains(e.target)) {
            closeEditor();
            document.removeEventListener("mousedown", onDown);
          }
        });
      }, 0);
    });
  }

  function closeEditor() {
    if (popover) { popover.remove(); popover = null; }
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      applyNoteBadges();
      FMHY.onPageChange(() => applyNoteBadges());
    },
    refresh() { return applyNoteBadges(); },
    onMessage(msg) {
      if (msg.type === "openNoteEditor" && msg.url) {
        // Find the anchor element on the page matching msg.url
        try {
          const anchor = document.querySelector(`a[href="${CSS.escape(msg.url)}"]`);
          openEditor(msg.url, anchor);
        } catch (e) {
          openEditor(msg.url, null);
        }
        return true;
      }
      return false;
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
