# ⚡ FMHY Supercharged

> A Manifest V3 browser extension that adds **30 power features** to [fmhy.net](https://fmhy.net) — the largest collection of free stuff on the internet.

![Manifest V3](https://img.shields.io/badge/manifest-v3-blue)
![Features](https://img.shields.io/badge/features-30-success)
![License](https://img.shields.io/badge/license-MIT-yellow)
![Tests](https://img.shields.io/badge/tests-39%20passed-brightgreen)

Transform fmhy.net from a static resource wiki into a personalized, searchable, synced powerhouse. Auto-decode Base64 links, fuzzy-search every resource in milliseconds, get dead-link alerts, sync bookmarks across devices via GitHub Gist, and 26 more features — all toggleable, all keyboard-friendly, all mobile-responsive.

---

## 📸 Highlights

- 🎯 **Command palette** (`Ctrl+Shift+K`) — fuzzy-search every resource, bookmark, and history entry across the entire site
- 🔓 **Base64 auto-decoder** — kills fmhy.net's most annoying popup forever
- 🔖 **Full bookmark manager** with tags, folders, search, ratings, notes, and JSON/HTML/MD/CSV export
- 🔄 **Cross-device sync** via GitHub Gist or WebDAV — your bookmarks follow you across browsers
- 💀 **Dead-link monitor** — background health checks with auto-Wayback-Machine fallback
- 🟢 **Safety badges** — trust indicators on every link (open-source / paid / account-required / ads / unsafe)
- 📝 **Inline notes** on any resource — never forget why you bookmarked something
- 🆕 **"What's new" diff** — highlights new resources added since your last visit
- 🎨 **Per-category themes** + 3 density modes + custom highlight rules
- ⌨️ **Vim-style keyboard nav** — `j`/`k` to move, `b` to bookmark, `n` to note, `?` for help
- 📱 **Mobile-friendly** — bottom-sheet modals, safe-area insets, 44px tap targets, responsive everywhere

---

## 🚀 Quick install

### Chrome / Edge / Brave (Manifest V3)

1. Download or clone this repository.
2. Open `chrome://extensions/` (or `edge://extensions/`).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** → select the `fmhy-supercharged/` folder (the one containing `manifest.json`).
5. Visit [fmhy.net](https://fmhy.net) — you should see floating controls appear.
6. Press `Ctrl+Shift+K` to open the command palette.

### Firefox

Use [web-ext](https://github.com/mozilla/web-ext) or load via `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `manifest.json`.

---

## ✨ The 30 features

### 🥇 Tier 1 — Core pain-killers

| # | Feature | Trigger |
|---|---------|---------|
| 1 | **Base64 auto-decoder + inline preview** — kills fmhy.net's most annoying popup | automatic |
| 2 | **Command palette** — fuzzy search across all resources, bookmarks, history | `Ctrl+Shift+K` |
| 3 | **Personal bookmark manager** with tags, folders, search | hover `＋` on any link |
| 4 | **Cross-device sync** via GitHub Gist or WebDAV | Options → Sync |
| 5 | **Dead-link health monitor** — background HEAD checks every 6h | automatic |
| 6 | **Inline private notes** on any resource | right-click → "Add note" |
| 7 | **"What's new since last visit" diff** — highlights new/removed resources | automatic |

### 🥈 Tier 2 — Safety & quality

| # | Feature | Trigger |
|---|---------|---------|
| 8 | **Trust badges** (🟢🟡🔴⚪) next to every link | automatic |
| 9 | **Community report dialog** (dead / malware / ads / paid / account / misleading) | right-click → "Report" |
| 10 | **Auto-Wayback Machine fallback** for dead links | automatic |
| 11 | **Ad-density indicator** (🟢/🟡/🔴) | heuristic + community |
| 12 | **Account-required / paid indicators** (🔑/💰) | heuristic + community |

### 🥉 Tier 3 — Browsing & navigation

| # | Feature | Trigger |
|---|---------|---------|
| 13 | **Smart filters bar** (alive / bookmarked / has-note / self-hosted / trust) | top of every category page |
| 14 | **Floating mini table of contents** with scroll-spy | top-right widget |
| 15 | **Recently viewed resources dropdown** | popup → "Recent" tab |
| 16 | **Quick-access pinned toolbar** | pin via right-click → "Pin" |
| 17 | **Radial category menu** — visual jump to 15 categories | `Ctrl+Shift+Space` |
| 18 | **Related resources sidebar** | right-edge toggle |
| 19 | **Vim-style keyboard navigation** | `j` `k` `Enter` `b` `n` `?` |
| 20 | **Enhanced search** with autocomplete + history + `category:` `tag:` syntax | focus the search box |

### 🎨 Tier 4 — Personalization

| # | Feature | Trigger |
|---|---------|---------|
| 21 | **Per-category themes** (auto-switches accent color) | automatic |
| 22 | **Density modes** (compact / comfortable / spacious) | click 📐 floating button |
| 23 | **Reading progress bar + scroll memory** | automatic |
| 24 | **Custom highlight rules** (regex-based color pills) | Options → Highlight rules |
| 25 | **Distraction-free reading mode** | click 📖 floating button |

### 🔧 Tier 5 — Power-user tools

| # | Feature | Trigger |
|---|---------|---------|
| 26 | **Resource comparison matrix** (multi-select → side-by-side table) | checkbox each link → "⚖ Compare" |
| 27 | **Personal 1–5 star ratings + reviews** | click stars next to each link |
| 28 | **Watched categories notifications** | click 🔔 floating button |
| 29 | **Export data to JSON / HTML / Markdown / CSV** | click 💾 floating button |
| 30 | **Shareable resource cards** (PNG + Markdown snippet) | right-click → "Generate share card" |

---

## ⌨️ Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+K` | Open command palette |
| `Ctrl+Shift+B` | Bookmark current page |
| `Ctrl+Shift+Space` | Open category radial menu |
| `j` / `k` | Move between resource links |
| `Enter` | Open active link |
| `Shift+Enter` | Open in new tab |
| `b` | Bookmark / unbookmark active link |
| `n` | Add note to active link |
| `/` | Focus search |
| `g g` | Scroll to top |
| `G` | Scroll to bottom |
| `?` | Show keyboard help |

---

## 📁 File structure

```
fmhy-supercharged/
├── manifest.json              # MV3 manifest
├── assets/                    # Icons (16/32/48/128/192 PNG)
├── background/
│   └── service-worker.js      # alarms, context menus, sync, health checks
├── lib/
│   ├── storage.js             # chrome.storage wrapper (bookmarks, notes, ratings, etc.)
│   ├── dom-utils.js           # DOM helpers (waitFor, getResourceLinks, fuzzy match, etc.)
│   └── sync-client.js         # GitHub Gist + WebDAV client with merge
├── content/                   # 25 feature modules
│   ├── main.js                # registry + boot
│   ├── base64-decoder.js      # Feature 1
│   ├── command-palette.js     # Feature 2
│   ├── bookmarks.js           # Feature 3
│   ├── notes.js               # Feature 6
│   ├── diff-viewer.js         # Feature 7 + 28 (UI)
│   ├── safety-badges.js       # Features 8, 9, 10, 11, 12
│   ├── filters.js             # Feature 13
│   ├── mini-toc.js            # Features 14 + 23
│   ├── recent-history.js      # Feature 15
│   ├── quick-toolbar.js       # Feature 16
│   ├── radial-menu.js         # Feature 17
│   ├── related-sidebar.js     # Feature 18
│   ├── keyboard-nav.js        # Feature 19
│   ├── search-enhancer.js     # Feature 20
│   ├── theme-switcher.js      # Features 21 + 22 (UI)
│   ├── density-modes.js       # Feature 22 (logic)
│   ├── scroll-memory.js       # Feature 23 (logic, mini-toc handles)
│   ├── highlight-rules.js     # Feature 24
│   ├── reading-mode.js        # Feature 25
│   ├── compare-matrix.js      # Feature 26
│   ├── ratings.js             # Feature 27
│   ├── watched-notifications.js # Feature 28 (UI)
│   ├── export-tools.js        # Feature 29
│   └── share-cards.js         # Feature 30
├── popup/                     # 4-tab popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/                   # 6-tab options page
│   ├── options.html
│   ├── options.css
│   └── options.js
└── styles/
    └── content.css            # all in-page UI styles (~1300 lines)
```

---

## 🔧 Configuration

Click the extension icon → **Settings** tab → **Open full Options page**, or right-click the icon → **Options**.

### Cross-device sync (Feature 4)

1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new) and create a token with the `gist` scope.
2. Options → **Sync** tab → select **GitHub Gist** → paste your token.
3. Click **Verify token**.
4. Click **Sync now**. The first sync creates a private Gist automatically.
5. On your other browser, repeat steps 1–4 using the same token — bookmarks/notes/ratings merge automatically by timestamp.

Your data lives only in your private Gist and your local browser storage. **Nothing is sent to any third party.** No analytics, no telemetry, no tracking.

### Highlight rules (Feature 24)

Options → **Highlight rules** tab. Each rule:
- **Label** — short text shown in the colored pill (e.g., `OSS`)
- **Pattern** — case-insensitive regex (e.g., `open[- ]?source`)
- **Color** — pill background color

Default rules included: `open-source` (green), `self-hosted` (purple), `freemium` (yellow).

### Watched categories (Feature 28)

Options → **Watched categories** tab. Toggle any category on. When FMHY adds new resources there, you'll get a browser notification next time you visit.

---

## 🔌 Permissions explained

| Permission | Why we need it |
|------------|----------------|
| `activeTab` | Read the current page to find resource links |
| `storage` + `unlimitedStorage` | Store bookmarks, notes, ratings, snapshots |
| `tabs` | Open links in new tabs from the popup |
| `scripting` | Inject content scripts on demand |
| `contextMenus` | Right-click "Bookmark / Note / Report / etc." actions |
| `notifications` | Notify when bookmarked links die or watched categories update |
| `alarms` | Schedule periodic health checks (every 6h) and sync (every 30min) |
| `clipboardWrite` | Copy decoded URLs / share cards to clipboard |
| `favicon` | Show site favicons in the popup's bookmark list |
| Host: `*://*.fmhy.net/*` + `*://fmhy.xyz/*` | Run on FMHY sites |
| Host: `*://api.github.com/*` | Sync via GitHub Gist |
| Host: `*://web.archive.org/*` + `*://archive.org/*` | Wayback Machine fallback |

**No analytics. No telemetry. No tracking.** Everything runs locally in your browser.

---

## 🧪 Testing

This project includes a jsdom-based test harness that loads every content script against **real fmhy.net HTML** (the Storage page with 787+ resource links) and verifies behavior.

```bash
npm install jsdom
node scripts/test-extension.js
```

**Latest run: 39/39 tests passing** ✅

Tests cover:
- Storage round-trips (bookmarks, notes, ratings, history cap, pinned, watched, settings)
- DOM utilities (getResourceLinks on real HTML, fuzzyMatch ranking, getCurrentCategory, el(), timeAgo)
- Feature registry (all 24 features registered)
- Base64 decoder (decode valid, ignore non-b64)
- Every feature's UI attaches correctly to the real page

---

## 🐛 Troubleshooting

**The extension doesn't show up on fmhy.net**
- Check `chrome://extensions/` → ensure "FMHY Supercharged" is enabled.
- Refresh the fmhy.net tab (content scripts only run on page load).
- Check the browser console (F12) for `[FMHY SC] Booting on…` log.

**Health badges show `?` for every link**
- This is expected for sites that block CORS. The badge means "couldn't verify" — the link may still be alive.

**Sync fails with "401 Unauthorized"**
- Your GitHub token expired or was revoked. Generate a new one and update it in Options → Sync.

**A feature is broken / you want to disable it**
- Click the extension icon → Settings tab → toggle off. Or Options → Features tab.

---

## 🏗 Architecture

### Module pattern

Every feature is a self-contained IIFE that registers itself with the central registry:

```javascript
(function (global) {
  "use strict";
  global.FMHY = global.FMHY || {};

  const NAME = "myFeature";
  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    // ... attach UI, subscribe to events
  }

  global.FMHY.registerFeature(NAME, {
    init,
    refresh() { /* re-run after data changes */ },
    onMessage(msg) { /* handle background messages */ return false; }
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
```

The main loader (`content/main.js`) reads settings, then calls `init()` on every enabled feature. VitePress page changes are detected via MutationObserver and broadcast via `FMHY.onPageChange(cb)`.

### Storage

All data lives in `chrome.storage.local` under the `fmhy_sc_*` namespace. The `lib/storage.js` module exposes a clean async API:

```javascript
await FMHY.Storage.addBookmark({ url, title, category, tags });
await FMHY.Storage.setNote(url, "remember to use adblock");
await FMHY.Storage.setRating(url, 4, "great for anime");
const bookmarks = await FMHY.Storage.getBookmarks();
```

### Sync

`lib/sync-client.js` implements a 3-way merge:
1. Pull remote state from Gist/WebDAV
2. Merge with local state (prefer newer timestamps on conflict)
3. Push merged state back

Bookmarks are deduped by URL. Notes and ratings prefer the side with the newer `updatedAt`. Pinned resources are unioned.

### Service worker

The background service worker handles:
- 7 context-menu items (bookmark, note, rate, pin, report, share card, wayback)
- 3 keyboard commands (palette, bookmark, radial menu)
- Health-check alarm (every 6h, capped at 50 bookmarks per run)
- Sync alarm (every 30min if enabled)
- Wayback Machine lookup via `archive.org/wayback/available`

---

## 📱 Mobile support

- **Popup**: 100% width up to 400px max, full-height on mobile
- **Tap targets**: all interactive elements ≥ 44×44 px (iOS HIG / Material)
- **Bottom-sheet modals** on mobile (slide-up animation)
- **Safe-area insets** for notches and home indicators
- **Touch device tweaks**: always-visible delete buttons, larger inline badges
- **Command palette**: full-screen on mobile, 16px input font (prevents iOS zoom)
- **Radial menu**: smaller radius (130px vs 180px) for thumb reach

---

## 🎨 Design system

- **Primary**: `#7c3aed` (violet-600) → `#2563eb` (blue-600) gradient
- **Accent**: `#facc15` (yellow-400)
- **Success**: `#22c55e` · **Warning**: `#f59e0b` · **Danger**: `#ef4444`
- **Glassmorphism**: `backdrop-filter: blur(20px) saturate(180%)`
- **Animated backdrop**: 3 floating gradient orbs with `filter: blur(60-80px)`
- **Auto dark mode** via `prefers-color-scheme: dark`
- **Reduced-motion support** via `@media (prefers-reduced-motion: reduce)`
- **Spring animations** using `cubic-bezier(0.34, 1.56, 0.64, 1)`

---

## 🛣 Roadmap

- [ ] Firefox AMO listing
- [ ] Chrome Web Store listing
- [ ] Community safety reports backend (currently local-only)
- [ ] i18n (currently English-only)
- [ ] End-to-end tests with Puppeteer
- [ ] Optional Firefox `browser.*` polyfill

---

## 🤝 Contributing

PRs welcome! Areas that especially need help:

- **Community safety backend** — currently reports are local-only. A simple GitHub Issues-based backend would make reports shared.
- **Internationalization** — strings are hardcoded in English.
- **More highlight rule presets** — what patterns do you care about?
- **Test coverage** — the test harness is at `scripts/test-extension.js`. Add more cases!

---

## 📜 License

MIT — do whatever you want, just don't blame us.

---

## ❤ Credits

Built for the [FMHY](https://fmhy.net) community. Not affiliated with FMHY.

Inspired by: Raycast (command palette), Vimium (keyboard nav), Pocket (read-it-later), and the amazing FMHY contributors who maintain the wiki.
