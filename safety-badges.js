/**
 * Feature #5 — Resource Health Checker (UI side)
 * Feature #8 — Safety / Trust Badges
 * Feature #9 — Community Reports System (local stub)
 * Feature #10 — Auto-Wayback Machine Fallback
 * Feature #11 — Ad / Tracker Density Indicator
 * Feature #12 — Account-Required Indicator
 *
 * Combined here because they all attach badges to the same resource links
 * and share the same per-link UI layout.
 *
 * Badge layout (after each link):
 *   [///]  [⏱ alive 3d ago]  [ Wayback]  [/]  [ report]
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "safetyBadges";
  let initialized = false;

  // Local curated "unsafe" hostnames (FMHY's unsafe-sites page subset)
  // In production this would be fetched; here we ship a small starter list.
  const UNSAFE_HOSTS = new Set([
    // intentionally minimal — community reports extend this at runtime
  ]);

  // Heuristic keywords that suggest account/payment required
  const ACCOUNT_KEYWORDS = [
    "sign up", "register", "log in", "login", "create account", "sign in",
    "account required", "free account", "must register"
  ];
  const PAID_KEYWORDS = [
    "premium", "subscribe", "subscription", "pricing", "upgrade",
    "paid plan", "pro version", "buy now", "starts at $"
  ];
  const AD_KEYWORDS = [
    "ad-supported", "ads", "popups", "pop-ads", "popunder", "adfly",
    "shorte.st", "banner ads"
  ];
  const SAFE_KEYWORDS = [
    "open source", "open-source", "github", "gitlab", "self-hosted", "selfhost",
    "no ads", "ad-free", "non-profit", "creative commons", "mit license",
    "apache license", "gpl", "bsd license"
  ];

  async function loadCommunityReports() {
    // Future: fetch from GitHub issues / community JSON
    // For now, return empty — users can add reports via context menu
    return {};
  }

  function classifyLink(text, hostname) {
    const t = (text || "").toLowerCase();
    if (UNSAFE_HOSTS.has(hostname)) return { level: "unsafe", label: "", tip: "Reported unsafe" };
    // Safe keywords take precedence (open source, etc.)
    if (SAFE_KEYWORDS.some((k) => t.includes(k))) return { level: "safe", label: "", tip: "Open-source / trusted" };
    if (PAID_KEYWORDS.some((k) => t.includes(k))) return { level: "paid", label: "", tip: "May require payment" };
    if (ACCOUNT_KEYWORDS.some((k) => t.includes(k))) return { level: "account", label: "", tip: "May require account" };
    if (AD_KEYWORDS.some((k) => t.includes(k))) return { level: "ads", label: "", tip: "May have ads" };
    return { level: "unknown", label: "", tip: "No safety info yet" };
  }

  function applyBadges() {
    const links = FMHY.Dom.getResourceLinks();
    links.forEach(({ element, href, text }) => {
      if (element.dataset.fmhySafetyDone) return;
      element.dataset.fmhySafetyDone = "1";

      let host = "";
      try { host = new URL(href).hostname; } catch (e) { return; }

      const container = FMHY.Dom.el("span", { class: "fmhy-safety" });

      // Trust badge
      const trust = classifyLink(text, host);
      const trustBadge = FMHY.Dom.el("span", {
        class: `fmhy-safety-badge fmhy-safety-${trust.level}`,
        title: trust.tip
      }, trust.label);
      container.appendChild(trustBadge);

      // Health badge (initially "checking…")
      const healthBadge = FMHY.Dom.el("span", {
        class: "fmhy-safety-health",
        "data-url": href,
        title: "Checking link health…"
      }, "⏱");
      container.appendChild(healthBadge);

      // Wayback badge (initially hidden — shown only when dead)
      const waybackBadge = FMHY.Dom.el("a", {
        class: "fmhy-safety-wayback",
        target: "_blank",
        rel: "noopener",
        title: "View on Wayback Machine"
      }, "");
      waybackBadge.style.display = "none";
      waybackBadge.href = `https://web.archive.org/web/*/${href}`;
      container.appendChild(waybackBadge);

      // Report button
      const reportBtn = FMHY.Dom.el("span", {
        class: "fmhy-safety-report",
        title: "Report this link (dead / malware / ads / etc.)",
        role: "button",
        tabindex: "0"
      }, "");
      reportBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        openReportDialog(href, text);
      });
      container.appendChild(reportBtn);

      element.appendChild(container);
    });

    // Trigger health checks for visible links (throttled)
    scheduleHealthChecks();
  }

  let healthQueue = [];
  let healthRunning = false;
  function scheduleHealthChecks() {
    document.querySelectorAll(".fmhy-safety-health").forEach((b) => {
      const url = b.getAttribute("data-url");
      if (!url || b.dataset.fmhyHealthChecked) return;
      b.dataset.fmhyHealthChecked = "1";
      healthQueue.push({ badge: b, url });
    });
    if (!healthRunning) runHealthQueue();
  }

  async function runHealthQueue() {
    healthRunning = true;
    while (healthQueue.length > 0) {
      const { badge, url } = healthQueue.shift();
      // Check cached health first
      const cached = await FMHY.Storage.getHealth(url);
      const ONE_DAY = 24 * 60 * 60 * 1000;
      let record = cached;
      if (!cached || (Date.now() - cached.checkedAt) > ONE_DAY) {
        // Ask background to check
        try {
          const res = await chrome.runtime.sendMessage({ type: "healthCheck", url });
          if (res && res.ok) record = res.result;
        } catch (e) { /* background may be unavailable */ }
      }
      updateHealthBadge(badge, record);
    }
    healthRunning = false;
  }

  function updateHealthBadge(badge, record) {
    if (!record) return;
    const wayback = badge.parentElement.querySelector(".fmhy-safety-wayback");
    if (record.status === "alive") {
      badge.textContent = "";
      badge.classList.add("fmhy-safety-alive");
      badge.title = `Alive (status ${record.statusCode || "OK"}, checked ${FMHY.Dom.timeAgo(record.checkedAt)})`;
    } else if (record.status === "dead") {
      badge.textContent = "";
      badge.classList.add("fmhy-safety-dead");
      badge.title = `Appears dead (status ${record.statusCode || "?"})`;
      if (wayback) {
        wayback.style.display = "inline";
        wayback.title = "Site appears dead — view archived version";
      }
    } else {
      badge.textContent = "?";
      badge.classList.add("fmhy-safety-unknown");
      badge.title = "Health unknown (CORS-blocked)";
    }
  }

  function openReportDialog(url, text) {
    const modal = FMHY.Dom.el("div", { class: "fmhy-modal-overlay" });
    const box = FMHY.Dom.el("div", { class: "fmhy-modal" });
    box.appendChild(FMHY.Dom.el("h3", {}, " Report this resource"));
    const urlLabel = FMHY.Dom.el("div", { class: "fmhy-muted fmhy-modal-url" }, url);
    box.appendChild(urlLabel);

    const reasons = [
      { id: "dead", label: " Dead link (404 / unavailable)" },
      { id: "malware", label: " Malware / phishing / scam" },
      { id: "ads", label: " Excessive ads / popups" },
      { id: "paid", label: " Not actually free / requires payment" },
      { id: "account", label: " Requires account / invasive signup" },
      { id: "misleading", label: " Misleading / not what it claims" }
    ];
    const reasonBox = FMHY.Dom.el("div", { class: "fmhy-report-reasons" });
    reasons.forEach((r) => {
      const id = `fmhy-r-${r.id}`;
      const lbl = FMHY.Dom.el("label", { class: "fmhy-radio", for: id });
      const inp = FMHY.Dom.el("input", { type: "radio", name: "fmhy-report-reason", id, value: r.id });
      lbl.appendChild(inp);
      lbl.appendChild(document.createTextNode(" " + r.label));
      reasonBox.appendChild(lbl);
    });
    box.appendChild(reasonBox);

    const ta = FMHY.Dom.el("textarea", {
      class: "fmhy-report-text",
      placeholder: "Optional details…",
      rows: "3"
    });
    box.appendChild(ta);

    const btns = FMHY.Dom.el("div", { class: "fmhy-modal-btns" });
    const submit = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-primary" }, "Submit report");
    const cancel = FMHY.Dom.el("button", { class: "fmhy-btn" }, "Cancel");
    submit.addEventListener("click", async () => {
      const sel = reasonBox.querySelector('input[name="fmhy-report-reason"]:checked');
      if (!sel) { alert("Please pick a reason."); return; }
      // Local report store (in production this would POST to a backend)
      const reports = (await FMHY.Storage.get("reports")) || {};
      reports[url] = reports[url] || [];
      reports[url].push({
        reason: sel.value,
        detail: ta.value,
        at: Date.now()
      });
      await FMHY.Storage.set("reports", reports);
      modal.remove();
      // Show toast
      showToast("Report submitted — thank you!");
    });
    cancel.addEventListener("click", () => modal.remove());
    btns.appendChild(submit);
    btns.appendChild(cancel);
    box.appendChild(btns);
    modal.appendChild(box);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function showToast(msg) {
    const t = FMHY.Dom.el("div", { class: "fmhy-toast" }, msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      applyBadges();
      FMHY.onPageChange(() => applyBadges());
    },
    onMessage(msg) {
      if (msg.type === "reportLink" && msg.url) {
        openReportDialog(msg.url, msg.text || msg.url);
        return true;
      }
      return false;
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
