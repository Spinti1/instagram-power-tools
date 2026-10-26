# IG Tools - V1.0 Release Hardening & GitHub Publication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Friends Who Liked UI leak on home feed posts (restrict strictly to Reels), fix the post action bar download button layout and styling, harden against DOM-XSS and security exploits, scope permissions strictly to Instagram, verify zero private data persistence, generate modern obsidian/neon icons, and publish the repository publicly to GitHub under the user's account (`Spinti1`).

**Architecture:**
- **Friends Who Liked (`content/friends-liked.js`):** Strict route guard excluding `/` (home feed) and non-reel views; immediate card teardown on route change away from Reels.
- **Download Action Bar (`content/download.js`, `styles/styles.css`):** Inject download button directly into the native post action button row next to the Share button; native Instagram button styling (transparent background, 24px SVG, hover opacity, inline carousel pill).
- **Security & Scope (`manifest.json`, `rules.json`, `background.js`):** Remove Facebook from host permissions; add `initiatorDomains: ["instagram.com"]` to any cross-origin DNR rules; sanitize all `innerHTML` interpolations with an HTML entity escaper.
- **Privacy Audit (`tests/test-privacy-zero-retention.js`):** Assert no user IDs, auth tokens, cookies, or chat messages are stored persistently.
- **Icons (`icons/`):** High-resolution obsidian/neon gradient icon suite (16x16, 32x32, 48x48, 128x128) generated via .NET `System.Drawing`.
- **GitHub Publication:** Clean repository initialization, MIT license, bilingual README.md, and automated creation/push to public GitHub repository `Spinti1/instagram-power-tools`.

**Tech Stack:** Chrome Extensions Manifest V3, DeclarativeNetRequest, JavaScript (ES2022), CSS3 (Flexbox/Obsidian Dark Theme), Node.js (test runner), PowerShell / System.Drawing, GitHub REST API v3.

**Spec:** User prompt requirements (Reels-only friends liked, aligned post download button, security audit, Instagram-only domain scope, zero data retention, modern icons, public GitHub repo).

## Global Constraints

- Extension MUST NOT execute or request permissions on websites other than Instagram (`*.instagram.com`, `instagram.com`) and required media CDNs (`*.cdninstagram.com`, `*.fbcdn.net`).
- "Friends who liked" card MUST NEVER be displayed on home feed (`/`) posts or non-reel content.
- No user tokens, private chat contents, session cookies, or user IDs may ever be stored in `chrome.storage.local` or persistent files.
- All code changes must pass the full test suite (`node tests/run-all-tests.js`) with 0 errors.

## Review Focus

1. **Friends Liked Route Leak:** Opening Instagram home page `/` with vertical video posts must NOT show the "Friends who liked" card.
2. **Post Action Row Misalignment:** Download button on post action bars must align horizontally with Like, Comment, and Share without dropping below the row.
3. **DOM XSS Vulnerability:** Profile notes, usernames, and comment links containing special characters (`<`, `>`, `"`, `&`) must be escaped before HTML insertion.
4. **Third-Party Site Interference:** DNR rules blocking WebSockets must not intercept or affect Facebook or Messenger opened in other browser tabs.
5. **Clean GitHub Repository:** No sensitive local files (logs, API tokens, temp artifacts) committed to git.

---

### Task 1: Restrict Friends Who Liked Strictly to Reels

**Files:**
- Modify: `d:\Test\ig-tools\content\friends-liked.js`
- Modify: `d:\Test\ig-tools\tests\test-friends-liked.js`

- [ ] **Step 1.1: Update `tests/test-friends-liked.js` to assert home feed `/` returns false**
  - Change line 101 in `tests/test-friends-liked.js` so that `testIsReelContext('/', ...)` is asserted to be `false`.
  - Add explicit test cases for `/reels`, `/reel/DF123/`, and `/` feed posts.

- [ ] **Step 1.2: Refactor `isReelContext()` in `content/friends-liked.js`**
  - Exclude `location.pathname === '/'` or `location.pathname === ''`.
  - Strictly require pathname to match `/(?:reels?\/videos|reels?)\/([A-Za-z0-9_-]+)/` or `location.pathname.startsWith('/reels')` or `location.pathname.startsWith('/reel')`.
  - If not in Reel context, immediately set `card.style.display = 'none'` and return false.
  - Set initial card display to `none` on creation in `getOrCreateCard()`.

- [ ] **Step 1.3: Run test suite**
  - Run `node tests/test-friends-liked.js` to verify test passes.

---

### Task 2: Fix Post Action Bar Download Button Layout & Styling

**Files:**
- Modify: `d:\Test\ig-tools\content\download.js`
- Modify: `d:\Test\ig-tools\styles\styles.css`
- Create: `d:\Test\ig-tools\tests\test-post-download-button.js`

- [ ] **Step 2.1: Write failing test in `tests/test-post-download-button.js`**
  - Test action bar button insertion logic: verifies container is inserted inline into the action row (next to Share or Save button) rather than appended to the outer section.

- [ ] **Step 2.2: Refactor `injectPostButtons()` in `content/download.js`**
  - Query the native action button row inside `article` (locating `svg[aria-label*="Share" i]` or `svg[aria-label*="Trimite" i]` or `svg[aria-label*="Save" i]`).
  - Insert `.ig-tools-post-dl-container` directly into the flex row next to the Share button.
  - If a post is a carousel, add a compact `.ig-tools-carousel-pill-btn` alongside the single download button.

- [ ] **Step 2.3: Update CSS in `styles/styles.css`**
  - Update `.ig-tools-post-dl-container`: `display: inline-flex; align-items: center; justify-content: center; height: 36px; margin: 0 4px; vertical-align: middle;`.
  - Update `.ig-tools-post-bar-btn`: remove heavy border and dark glass background; set `background: transparent; color: currentColor; border: none; width: 36px; height: 36px; padding: 6px; cursor: pointer; border-radius: 50%;`. Add subtle hover background.
  - Style `.ig-tools-carousel-pill-btn` to match native Instagram UI.

- [ ] **Step 2.4: Run test**
  - Run `node tests/test-post-download-button.js` and verify pass.

---

### Task 3: Security & Exploit Hardening (DOM XSS, Sanitization & Domain Scope)

**Files:**
- Modify: `d:\Test\ig-tools\manifest.json`
- Modify: `d:\Test\ig-tools\rules.json`
- Modify: `d:\Test\ig-tools\background.js`
- Modify: `d:\Test\ig-tools\content\friends-liked.js`
- Modify: `d:\Test\ig-tools\content\account.js`
- Modify: `d:\Test\ig-tools\content\comments.js`
- Create: `d:\Test\ig-tools\tests\test-security-hardening.js`

- [ ] **Step 3.1: Scope permissions strictly to Instagram in `manifest.json`**
  - Remove `*://*.facebook.com/*` from `host_permissions`.
  - Keep strictly `*://*.instagram.com/*`, `*://instagram.com/*`, `https://*.cdninstagram.com/*`, `https://*.fbcdn.net/*`.

- [ ] **Step 3.2: Scope DNR WebSocket rules with `initiatorDomains: ["instagram.com"]`**
  - In `rules.json` and `background.js`, add `initiatorDomains: ["instagram.com"]` to any rules matching facebook or messenger endpoints (rules 21, 22, and dynamic rules).

- [ ] **Step 3.3: Implement `escapeHtml()` and sanitize dynamic interpolations**
  - In `content/friends-liked.js`: sanitize `username` and `avatar` attributes.
  - In `content/account.js`: sanitize `note` and `username`.
  - In `content/comments.js`: sanitize media attachment URLs.

- [ ] **Step 3.4: Write and run `tests/test-security-hardening.js`**
  - Verify manifest host permissions, rule initiator domains, and XSS sanitizer.

---

### Task 4: Privacy & Zero Data Retention Audit

**Files:**
- Create: `d:\Test\ig-tools\tests\test-privacy-zero-retention.js`
- Modify: `d:\Test\ig-tools\content\account.js` (ensure no user ID or tokens persisted)

- [ ] **Step 4.1: Audit persistent storage across all scripts**
  - Ensure `chrome.storage.local` contains ONLY user preference toggles and block stats counters.
  - Ensure `sessionStorage` contains only temporary tab-scoped likers cache.
  - Ensure no auth tokens, passwords, cookies, or chat contents are saved.

- [ ] **Step 4.2: Write and run `tests/test-privacy-zero-retention.js`**
  - Assert that default settings and stored schema contain zero sensitive fields.

---

### Task 5: Generate Modern Neon/Obsidian Icon Suite

**Files:**
- Create: `d:\Test\ig-tools\scripts\generate-icons.ps1`
- Create/Overwrite: `d:\Test\ig-tools\icons\icon-16.png`
- Create: `d:\Test\ig-tools\icons\icon-32.png`
- Create/Overwrite: `d:\Test\ig-tools\icons\icon-48.png`
- Create/Overwrite: `d:\Test\ig-tools\icons\icon-128.png`
- Create: `d:\Test\ig-tools\icons\icon.svg`
- Modify: `d:\Test\ig-tools\manifest.json`

- [ ] **Step 5.1: Create vector SVG icon `icons/icon.svg`**
  - Sleek modern design: obsidian squircle badge, vibrant Instagram gradient outer ring, clean stylized ghost/aperture icon.

- [ ] **Step 5.2: Execute `scripts/generate-icons.ps1` using `System.Drawing`**
  - Render crisp PNGs at 16x16, 32x32, 48x48, 128x128 with anti-aliasing and smooth gradients.

- [ ] **Step 5.3: Register 32x32 icon in `manifest.json`**
  - Update `action.default_icon` and `icons` to include `32: "icons/icon-32.png"`.

---

### Task 6: Documentation, Git Initialization & Public GitHub Release

**Files:**
- Create: `d:\Test\ig-tools\.gitignore`
- Create: `d:\Test\ig-tools\LICENSE` (MIT)
- Create: `d:\Test\ig-tools\README.md`

- [ ] **Step 6.1: Create `.gitignore` and `LICENSE`**
  - `.gitignore`: ignore `.superpowers`, `_metadata`, `node_modules`, `*.log`, `*.zip`.
  - `LICENSE`: standard MIT license with Spinti (Spinti1).

- [ ] **Step 6.2: Write professional bilingual `README.md`**
  - Features overview: Ghost Mode, Clean In-Line Downloader, Friends Who Liked, Player Controls, Privacy-First Architecture.
  - Installation instructions (Developer Mode in Chrome/Brave/Edge).
  - Security & Privacy Audit summary.

- [ ] **Step 6.3: Initialize git in `d:\Test\ig-tools` and commit**
  - Run `git init -b main`, stage all files, commit `feat: IG Tools v1.0.0 Release`.

- [ ] **Step 6.4: Create public GitHub repo via GitHub API and push**
  - Call GitHub REST API `/user/repos` to create `instagram-power-tools` (or `ig-tools`) as a public repository.
  - Set remote origin and push `main`.

---

### Task 7: Full Verification & Test Suite Execution

**Files:**
- Modify: `d:\Test\ig-tools\tests\run-all-tests.js`

- [ ] **Step 7.1: Register new test files in `tests/run-all-tests.js`**
  - Add `tests/test-post-download-button.js`, `tests/test-security-hardening.js`, `tests/test-privacy-zero-retention.js`.

- [ ] **Step 7.2: Run full test suite**
  - Execute `node tests/run-all-tests.js` and verify all tests pass with 0 errors.
