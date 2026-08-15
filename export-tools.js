/**
 * Feature #29 — Export to Multiple Formats
 *
 * Adds an "Export" button to the page (floating, bottom-left).
 * Exports bookmarks + notes + ratings as:
 *   - JSON (full backup)
 *   - HTML (standard browser bookmarks file)
 *   - Markdown (for Notion / Obsidian)
 *   - CSV (for Excel/Sheets)
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "exportTools";
  let initialized = false;

  function buildButton() {
    if (document.querySelector(".fmhy-export-fab")) return;
    const btn = FMHY.Dom.el("button", { class: "fmhy-export-fab", title: "Export your data" }, "Export");
    btn.addEventListener("click", openMenu);
    document.body.appendChild(btn);
  }

  async function openMenu() {
    const modal = FMHY.Dom.el("div", { class: "fmhy-modal-overlay" });
    const box = FMHY.Dom.el("div", { class: "fmhy-modal" });
    box.appendChild(FMHY.Dom.el("h3", {}, "Export your FMHY data"));

    const [bookmarks, notes, ratings] = await Promise.all([
      FMHY.Storage.getBookmarks(),
      FMHY.Storage.getNotes(),
      FMHY.Storage.getRatings()
    ]);

    box.appendChild(FMHY.Dom.el("p", { class: "fmhy-muted" },
      `You have ${bookmarks.length} bookmarks, ${Object.keys(notes).length} notes, ${Object.keys(ratings).length} ratings.`));

    const formats = [
      { id: "json", label: "JSON (full backup)", icon: "json" },
      { id: "html", label: "HTML (browser bookmarks)", icon: "html" },
      { id: "md", label: "Markdown (Notion / Obsidian)", icon: "md" },
      { id: "csv", label: "CSV (Excel / Sheets)", icon: "csv" }
    ];

    formats.forEach((f) => {
      const btn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-export-format-btn" });
      btn.appendChild(document.createTextNode(`${f.icon}  ${f.label}`));
      btn.addEventListener("click", () => {
        const content = exportAs(f.id, { bookmarks, notes, ratings });
        const filename = `fmhy-supercharged-${f.id}-${new Date().toISOString().slice(0, 10)}.${f.id}`;
        download(content, filename, f.id === "json" ? "application/json" : f.id === "html" ? "text/html" : f.id === "csv" ? "text/csv" : "text/markdown");
      });
      box.appendChild(btn);
    });

    const close = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-primary" }, "Close");
    close.addEventListener("click", () => modal.remove());
    box.appendChild(close);

    modal.appendChild(box);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function exportAs(format, { bookmarks, notes, ratings }) {
    if (format === "json") {
      return JSON.stringify({ app: "fmhy-supercharged", version: 1, exportedAt: Date.now(), bookmarks, notes, ratings }, null, 2);
    }
    if (format === "html") {
      // Standard Netscape bookmark format
      const lines = [
        "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        "<TITLE>FMHY Supercharged Bookmarks</TITLE>",
        "<H1>FMHY Supercharged Bookmarks</H1>",
        "<DL><p>"
      ];
      const byCat = {};
      bookmarks.forEach((b) => {
        const c = b.category || "Uncategorized";
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(b);
      });
      Object.keys(byCat).sort().forEach((cat) => {
        lines.push(`  <DT><H3>${escapeHtml(cat)}</H3>`);
        lines.push("  <DL><p>");
        byCat[cat].forEach((b) => {
          lines.push(`    <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${Math.floor((b.addedAt || Date.now()) / 1000)}">${escapeHtml(b.title)}</A>`);
          if (b.note) lines.push(`    <DD>${escapeHtml(b.note)}`);
        });
        lines.push("  </DL><p>");
      });
      lines.push("</DL><p>");
      return lines.join("\n");
    }
    if (format === "md") {
      const lines = ["# FMHY Supercharged — Bookmarks", ""];
      const byCat = {};
      bookmarks.forEach((b) => {
        const c = b.category || "Uncategorized";
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(b);
      });
      Object.keys(byCat).sort().forEach((cat) => {
        lines.push(`## ${cat}`);
        lines.push("");
        byCat[cat].forEach((b) => {
          const r = ratings[b.url];
          const stars = r ? ` ${r.stars}/5` : "";
          lines.push(`- [${b.title.replace(/[\[\]]/g, "")}](${b.url})${stars}`);
          const n = notes[b.url];
          if (n && n.text) lines.push(`  - Note: ${n.text}`);
          if (b.tags && b.tags.length) lines.push(`  - Tags: ${b.tags.map((t) => "`#" + t + "`").join(" ")}`);
        });
        lines.push("");
      });
      return lines.join("\n");
    }
    if (format === "csv") {
      const rows = [["Title", "URL", "Category", "Tags", "Rating", "Note", "AddedAt"]];
      bookmarks.forEach((b) => {
        const r = ratings[b.url];
        const n = notes[b.url];
        rows.push([
          csvCell(b.title),
          csvCell(b.url),
          csvCell(b.category || ""),
          csvCell((b.tags || []).join("; ")),
          r ? String(r.stars) : "",
          n ? csvCell(n.text) : "",
          new Date(b.addedAt || 0).toISOString()
        ]);
      });
      return rows.map((r) => r.join(",")).join("\n");
    }
    return "";
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function csvCell(s) {
    s = String(s || "");
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      // The floating button is replaced by the unified sidebar entry.
      // We still expose openMenu() so the sidebar can trigger the export dialog.
      // buildButton();  // legacy — disabled in favor of sidebar
    },
    onMessage() { return false; },
    openMenu  // expose so sidebar can call it
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
