/**
 * Feature #1 — Base64 Auto-Decoder + Smart Inline Preview
 *
 * Intercepts clicks on Base64-encoded links on fmhy.net, decodes them inline,
 * shows the real URL in a hover tooltip, and offers a one-click "Open" button.
 * Caches decoded URLs.
 */
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "base64Decoder";
  const cache = new Map(); // base64 → decoded URL
  let initialized = false;

  // Heuristic: a base64-encoded URL fragment
  // - usually long (>16 chars)
  // - contains only [A-Za-z0-9+/=_-]
  // - decodes to something starting with http
  function looksLikeBase64(s) {
    if (!s || s.length < 16) return false;
    // VitePress/FMHY uses url-safe base64 sometimes
    if (!/^[A-Za-z0-9+/_\-]+={0,2}$/.test(s)) return false;
    // Avoid mistaking SHA hashes (40 hex / 64 hex) for b64
    if (/^[0-9a-f]+$/.test(s)) return false;
    // Avoid pure-alpha short strings (could be normal identifiers)
    if (s.length < 24 && /^[a-z]+$/i.test(s)) return false;
    return true;
  }

  function tryDecodeB64(s) {
    if (cache.has(s)) return cache.get(s);
    // Try both url-safe and standard base64
    const variants = [
      s,                                    // as-is (standard b64)
      s.replace(/-/g, "+").replace(/_/g, "/")  // url-safe → standard
    ];
    for (const variant of variants) {
      try {
        // Pad to multiple of 4
        const padded = variant + "===".slice((variant.length + 3) % 4);
        const decoded = atob(padded);
        // Validate UTF-8 + URL-like
        const trimmed = decoded.trim();
        if (/^https?:\/\//i.test(trimmed) && trimmed.length < 2000) {
          // Validate that it's a parseable URL
          try {
            new URL(trimmed);
            cache.set(s, trimmed);
            return trimmed;
          } catch (e) { /* not a valid URL */ }
        }
      } catch (e) { /* not valid b64, try next variant */ }
    }
    cache.set(s, null);
    return null;
  }

  // FMHY encodes links into a hash route like /#b64=<encoded>
  // and intercepts them with a popup. We intercept the same clicks.
  function findEncodedLinks() {
    const out = [];
    // Case A: links with hash route /#b64=... or ?b64=...
    document.querySelectorAll('a[href*="b64="]').forEach((a) => {
      const m = a.href.match(/b64=([A-Za-z0-9+/_\-=]+)/);
      if (m) {
        const decoded = tryDecodeB64(m[1]);
        if (decoded) out.push({ element: a, encoded: m[1], decoded });
      }
    });
    // Case B: links whose href is a long base64-looking string (rare)
    document.querySelectorAll('a[href^="http"]').forEach((a) => {
      // skip if it's already a real http URL
    });
    // Case C: detect raw base64 in <code> blocks marked as links
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute("href");
      if (href && looksLikeBase64(href) && href.length > 30) {
        const decoded = tryDecodeB64(href);
        if (decoded) out.push({ element: a, encoded: href, decoded });
      }
    });
    return out;
  }

  // Suppress the site's native Base64 modal
  function suppressNativeModal() {
    // The site shows a modal with class "base64-modal" or similar VitePress dialog
    // Best-effort: hide any modal whose text contains "Base64 Encoded Link"
    const modals = document.querySelectorAll(".VPModal, .vp-modal, [role='dialog'], .modal");
    modals.forEach((m) => {
      if (/base64/i.test(m.textContent) && /encoded link/i.test(m.textContent)) {
        m.style.display = "none";
        // Also try to click any "Cancel" button inside it
        const cancel = m.querySelector('button[class*="cancel"], button');
        // Don't auto-click — just hide
      }
    });
  }

  function applyDecoded() {
    const links = findEncodedLinks();
    links.forEach(({ element, encoded, decoded }) => {
      if (element.dataset.fmhyB64Done) return;
      element.dataset.fmhyB64Done = "1";

      // Replace href so native handler never fires
      element.setAttribute("href", decoded);
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");

      // Add a small visual indicator + tooltip
      element.classList.add("fmhy-b64-decoded");
      element.title = `Decoded: ${decoded}`;

      // Tooltip with copy button (lazy-built on hover)
      element.addEventListener("mouseenter", () => showHoverCard(element, decoded), { once: true });
    });
  }

  let hoverCard = null;
  function showHoverCard(anchor, url) {
    hideHoverCard();
    hoverCard = FMHY.Dom.el("div", { class: "fmhy-b64-card", role: "tooltip" });
    const title = FMHY.Dom.el("div", { class: "fmhy-b64-card-title" }, "Decoded link");
    const urlBox = FMHY.Dom.el("div", { class: "fmhy-b64-card-url" }, url);
    const btns = FMHY.Dom.el("div", { class: "fmhy-b64-card-btns" });
    const openBtn = FMHY.Dom.el("button", { class: "fmhy-btn fmhy-btn-primary" }, "Open ↗");
    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(url, "_blank", "noopener");
      hideHoverCard();
    });
    const copyBtn = FMHY.Dom.el("button", { class: "fmhy-btn" }, "Copy");
    copyBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const ok = await FMHY.Dom.copyToClipboard(url);
      copyBtn.textContent = ok ? "Copied!" : "Failed";
      setTimeout(() => copyBtn.textContent = "Copy", 1200);
    });
    btns.appendChild(openBtn);
    btns.appendChild(copyBtn);
    hoverCard.appendChild(title);
    hoverCard.appendChild(urlBox);
    hoverCard.appendChild(btns);
    document.body.appendChild(hoverCard);

    // Position
    const r = anchor.getBoundingClientRect();
    const cardW = 320;
    let left = r.left + window.scrollX;
    let top = r.bottom + window.scrollY + 6;
    if (left + cardW > window.innerWidth) left = window.innerWidth - cardW - 10;
    hoverCard.style.left = left + "px";
    hoverCard.style.top = top + "px";

    // Hide on outside click / escape / scroll
    setTimeout(() => {
      document.addEventListener("click", hideOnClickOutside, { once: true });
      document.addEventListener("keydown", hideOnEsc, { once: true });
      window.addEventListener("scroll", hideHoverCard, { once: true });
    }, 0);

    function hideOnClickOutside(e) {
      if (!hoverCard || !hoverCard.contains(e.target)) hideHoverCard();
      else document.addEventListener("click", hideOnClickOutside, { once: true });
    }
    function hideOnEsc(e) {
      if (e.key === "Escape") hideHoverCard();
      else document.addEventListener("keydown", hideOnEsc, { once: true });
    }
  }

  function hideHoverCard() {
    if (hoverCard) { hoverCard.remove(); hoverCard = null; }
  }

  global.FMHY.registerFeature(NAME, {
    init() {
      if (initialized) return;
      initialized = true;
      applyDecoded();
      suppressNativeModal();
      FMHY.onPageChange(() => {
        applyDecoded();
        setTimeout(suppressNativeModal, 50);
        setTimeout(suppressNativeModal, 500);
      });
    },
    refresh() {
      applyDecoded();
      suppressNativeModal();
    },
    onMessage() { return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));
