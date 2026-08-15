/**
 * FMHY Supercharged — Options page script
 */
(function () {
  "use strict";

  const NS = "fmhy_sc_";

  // ---- Inline SVG icons (no emojis) ----
  const SVG_ICONS = {
    "zap": '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    "sync": '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    "palette": '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    "bell": '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    "info": '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    "trash": '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
  };
  function svgIcon(name, size = 16) {
    const path = SVG_ICONS[name] || SVG_ICONS["info"];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="fmhy-icon" aria-hidden="true">${path}</svg>`;
  }
  function injectIcons() {
    document.querySelectorAll("[data-icon]").forEach((el) => {
      const name = el.getAttribute("data-icon");
      el.innerHTML = svgIcon(name, 16);
    });
  }

  const DEFAULTS = {
    settings: {
      base64Decoder: true, commandPalette: true, bookmarks: true, sync: false,
      healthChecker: true, notes: true, diffViewer: true, safetyBadges: true,
      filters: true, miniToc: true, recentHistory: true, quickToolbar: true,
      radialMenu: true, relatedSidebar: true, keyboardNav: true, searchEnhancer: true,
      themeSwitcher: true, densityModes: true, scrollMemory: true, highlightRules: true,
      readingMode: true, compareMatrix: true, ratings: true, watchedNotifications: true,
      notifications: true, exportTools: true, shareCards: true, density: "comfortable"
    },
    syncConfig: { provider: "none", token: "", gistId: "", webdavUrl: "", webdavUser: "", webdavPass: "", lastSync: 0, autoSync: true },
    highlightRules: [
      { id: "r1", pattern: "open[- ]?source", color: "#22c55e", label: "OSS" },
      { id: "r2", pattern: "self[- ]?host", color: "#a855f7", label: "Self-host" },
      { id: "r3", pattern: "freemium|free trial|premium", color: "#eab308", label: "Freemium" }
    ]
  };

  const FEATURE_LABELS = [
    ["base64Decoder", "Base64 auto-decoder"],
    ["commandPalette", "Command palette (Ctrl+Shift+K)"],
    ["bookmarks", "Bookmark manager"],
    ["sync", "Cross-device sync"],
    ["healthChecker", "Dead-link monitor"],
    ["notes", "Inline notes"],
    ["diffViewer", "What's-new diff"],
    ["safetyBadges", "Safety & trust badges"],
    ["filters", "Smart filters bar"],
    ["miniToc", "Mini table of contents"],
    ["recentHistory", "Recently viewed tracking"],
    ["quickToolbar", "Quick-access toolbar"],
    ["radialMenu", "Radial category menu"],
    ["relatedSidebar", "Related resources panel"],
    ["keyboardNav", "Vim keyboard nav"],
    ["searchEnhancer", "Search autocomplete"],
    ["themeSwitcher", "Per-category themes"],
    ["densityModes", "Density modes"],
    ["scrollMemory", "Scroll memory"],
    ["highlightRules", "Highlight rules"],
    ["readingMode", "Reading mode"],
    ["compareMatrix", "Comparison matrix"],
    ["ratings", "Star ratings"],
    ["watchedNotifications", "Watched categories"],
    ["notifications", "Desktop notifications"],
    ["exportTools", "Export tools"],
    ["shareCards", "Shareable cards"]
  ];

  const CATEGORIES = [
    "adblockingvprivacy", "ai", "storage", "listening", "gaming", "reading",
    "downloading", "torrenting", "educational", "android-ios", "linux-non-free",
    "non-eng", "misc", "tools"
  ];

  function get(k) {
    return new Promise((r) => chrome.storage.local.get([NS + k], (res) => r(res[NS + k] ?? structuredClone(DEFAULTS[k] ?? null))));
  }
  function setRaw(k, v) {
    return new Promise((r) => {
      const obj = {}; obj[NS + k] = v;
      chrome.storage.local.set(obj, r);
    });
  }
  async function patchSettings(patch) {
    const cur = await get("settings");
    const next = { ...cur, ...patch };
    await setRaw("settings", next);
  }

  // ---------- Tabs ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`.panel[data-panel="${tab.dataset.tab}"]`).classList.add("active");
      if (tab.dataset.tab === "features") renderToggles();
      if (tab.dataset.tab === "sync") renderSync();
      if (tab.dataset.tab === "highlight") renderRules();
      if (tab.dataset.tab === "watch") renderWatched();
      if (tab.dataset.tab === "about") renderAbout();
    });
  });

  // ---------- Feature toggles ----------
  async function renderToggles() {
    const container = document.getElementById("feature-toggles");
    const settings = await get("settings");
    container.innerHTML = "";
    FEATURE_LABELS.forEach(([key, label]) => {
      const row = document.createElement("div");
      row.className = "toggle-row";
      const isOn = settings[key] !== false;
      row.innerHTML = `
        <label>${label}</label>
        <div class="toggle ${isOn ? "on" : ""}" data-key="${key}" role="switch" aria-checked="${isOn}" tabindex="0"></div>
      `;
      const tog = row.querySelector(".toggle");
      const lbl = row.querySelector("label");

      const handleToggle = async (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const cur = await get("settings");
        const v = cur[key] === false ? true : false;
        await patchSettings({ [key]: v });
        tog.classList.toggle("on", v);
        tog.setAttribute("aria-checked", String(v));
      };

      // Click anywhere on row, label, or toggle
      tog.addEventListener("click", handleToggle);
      lbl.addEventListener("click", handleToggle);
      row.addEventListener("click", handleToggle);
      tog.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          handleToggle(e);
        }
      });
      container.appendChild(row);
    });
  }

  // ---------- Sync ----------
  async function renderSync() {
    const cfg = await get("syncConfig");
    document.getElementById("sync-provider").value = cfg.provider || "none";
    document.getElementById("gist-token").value = cfg.token || "";
    document.getElementById("gist-id").value = cfg.gistId || "";
    document.getElementById("webdav-url").value = cfg.webdavUrl || "";
    document.getElementById("webdav-user").value = cfg.webdavUser || "";
    document.getElementById("webdav-pass").value = cfg.webdavPass || "";
    document.getElementById("auto-sync").checked = cfg.autoSync !== false;
    updateProviderVisibility(cfg.provider);
    document.getElementById("last-sync").textContent = cfg.lastSync ? new Date(cfg.lastSync).toLocaleString() : "never";
  }
  function updateProviderVisibility(provider) {
    document.getElementById("gist-config").style.display = provider === "gist" ? "" : "none";
    document.getElementById("webdav-config").style.display = provider === "webdav" ? "" : "none";
  }
  document.getElementById("sync-provider").addEventListener("change", (e) => {
    updateProviderVisibility(e.target.value);
    patchSyncConfig({ provider: e.target.value });
  });
  async function patchSyncConfig(patch) {
    const cur = await get("syncConfig");
    await setRaw("syncConfig", { ...cur, ...patch });
  }
  document.getElementById("gist-token").addEventListener("change", (e) => patchSyncConfig({ token: e.target.value }));
  document.getElementById("gist-id").addEventListener("change", (e) => patchSyncConfig({ gistId: e.target.value }));
  document.getElementById("webdav-url").addEventListener("change", (e) => patchSyncConfig({ webdavUrl: e.target.value }));
  document.getElementById("webdav-user").addEventListener("change", (e) => patchSyncConfig({ webdavUser: e.target.value }));
  document.getElementById("webdav-pass").addEventListener("change", (e) => patchSyncConfig({ webdavPass: e.target.value }));
  document.getElementById("auto-sync").addEventListener("change", (e) => patchSyncConfig({ autoSync: e.target.checked }));

  document.getElementById("verify-token").addEventListener("click", async () => {
    const token = document.getElementById("gist-token").value.trim();
    const box = document.getElementById("sync-result");
    if (!token) { box.className = "result-box err"; box.textContent = "Please enter a token first."; return; }
    box.className = "result-box processing"; box.textContent = "Verifying token…";
    chrome.runtime.sendMessage({ type: "verifyGistToken", token }, (res) => {
      if (res && res.ok) {
        box.className = "result-box ok";
        box.textContent = `Verified as @${res.info.login} (${res.info.name || "no name"})`;
      } else {
        box.className = "result-box err";
        box.textContent = `${res && res.error ? res.error : "Verification failed"}`;
      }
    });
  });

  document.getElementById("sync-now").addEventListener("click", () => {
    const box = document.getElementById("sync-result");
    box.className = "result-box processing"; box.textContent = "Syncing…";
    chrome.runtime.sendMessage({ type: "syncNow" }, (res) => {
      if (res && res.ok) {
        box.className = "result-box ok"; box.textContent = "Synced successfully";
        renderSync();
      } else {
        box.className = "result-box err"; box.textContent = `${res && res.error ? res.error : "Sync failed"}`;
      }
    });
  });

  // ---------- Highlight rules ----------
  async function renderRules() {
    const rules = await get("highlightRules");
    const list = document.getElementById("rules-list");
    list.innerHTML = "";
    rules.forEach((r) => list.appendChild(buildRuleRow(r)));
  }
  function buildRuleRow(rule) {
    const row = document.createElement("div");
    row.className = "rule-row";
    row.innerHTML = `
      <input type="text" class="rule-label" placeholder="Label" value="${escapeAttr(rule.label || "")}">
      <input type="text" class="rule-pattern" placeholder="Regex pattern" value="${escapeAttr(rule.pattern || "")}">
      <input type="color" class="rule-color" value="${rule.color || "#22c55e"}">
      <input type="text" class="rule-id" value="${rule.id || ""}" style="display:none">
      <button class="rule-delete" title="Delete" aria-label="Delete rule"></button>
    `;
    row.querySelector(".rule-delete").innerHTML = svgIcon("trash", 14);
    row.querySelector(".rule-delete").addEventListener("click", () => row.remove());
    return row;
  }
  document.getElementById("add-rule").addEventListener("click", () => {
    document.getElementById("rules-list").appendChild(buildRuleRow({
      id: "r_" + Date.now(), pattern: "", color: "#3b82f6", label: ""
    }));
  });
  document.getElementById("save-rules").addEventListener("click", async () => {
    const rows = document.querySelectorAll(".rule-row");
    const rules = [];
    rows.forEach((r) => {
      rules.push({
        id: r.querySelector(".rule-id").value || "r_" + Date.now(),
        label: r.querySelector(".rule-label").value,
        pattern: r.querySelector(".rule-pattern").value,
        color: r.querySelector(".rule-color").value
      });
    });
    await setRaw("highlightRules", rules);
    flashSaved();
  });

  // ---------- Watched categories ----------
  async function renderWatched() {
    const watched = await get("watchedCategories");
    const list = document.getElementById("watched-list");
    list.innerHTML = "";
    CATEGORIES.forEach((cat) => {
      const isWatched = watched.includes(cat);
      const item = document.createElement("div");
      item.className = "watch-item" + (isWatched ? " active" : "");
      item.innerHTML = `<span>${cat}</span><span class="watch-toggle ${isWatched ? "on" : "off"}">${isWatched ? "Watching" : "Off"}</span>`;
      item.querySelector(".watch-toggle").addEventListener("click", async () => {
        const cur = await get("watchedCategories");
        const next = isWatched ? cur.filter((c) => c !== cat) : [...cur, cat];
        await setRaw("watchedCategories", next);
        renderWatched();
      });
      list.appendChild(item);
    });
  }

  // ---------- Backup ----------
  document.getElementById("export-backup").addEventListener("click", async () => {
    const keys = ["bookmarks", "notes", "ratings", "healthCache", "pageSnapshots",
                  "recentHistory", "watchedCategories", "highlightRules", "pinnedResources",
                  "lastVisit", "settings", "syncConfig"];
    const data = { _meta: { app: "FMHY Supercharged", version: 1, exportedAt: Date.now() }, data: {} };
    for (const k of keys) {
      data.data[k] = await get(k);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fmhy-supercharged-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.getElementById("import-backup").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload.data) throw new Error("Invalid backup file");
      for (const k of Object.keys(payload.data)) {
        await setRaw(k, payload.data[k]);
      }
      alert("Backup imported successfully!");
      renderToggles();
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  });

  document.getElementById("reset-all").addEventListener("click", async () => {
    if (!confirm("Wipe ALL FMHY Supercharged data from this browser? This cannot be undone.")) return;
    if (!confirm("Are you absolutely sure?")) return;
    const keys = Object.keys(DEFAULTS);
    for (const k of keys) {
      await setRaw(k, structuredClone(DEFAULTS[k]));
    }
    alert("All data wiped.");
    renderToggles();
  });

  // ---------- About ----------
  function renderAbout() {
    const list = document.getElementById("feature-list-about");
    if (list.children.length > 0) return; // already rendered
    FEATURE_LABELS.forEach(([key, label]) => {
      const li = document.createElement("li");
      li.textContent = label;
      list.appendChild(li);
    });
  }

  // ---------- Helpers ----------
  function escapeAttr(s) { return String(s || "").replace(/"/g, "&quot;"); }
  function flashSaved() {
    const btn = document.getElementById("save-rules");
    const orig = btn.textContent;
    btn.textContent = "Saved!";
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
  }

  // Initial render
  injectIcons();
  renderToggles();
})();
