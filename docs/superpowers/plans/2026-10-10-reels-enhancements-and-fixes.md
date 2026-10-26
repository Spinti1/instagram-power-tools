# Instagram Reels Enhancements & Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all extension errors on `brave://extensions/?errors=kenccpjbbpimegdmlghblkmknlbibbhe`, anchor the "Friends Who Liked" UI reliably above the Reel author on the left side of Reels, make video player mouse scrubbing fully interactive, fix volume mute and 2x speed desyncs across Reel scrolling, constrain mouse wheel volume to the video player, and suppress Instagram's native audio overlay.

**Architecture:** 
- DeclarativeNetRequest static rules in `rules.json` and dynamic rules in `background.js` are audited, normalized, and protected with defensive state checks (`getEnabledRulesets`) to guarantee zero extension errors.
- "Friends Who Liked" UI (`friends-liked.js`) mounts to `document.body`, locates the true Reel container ancestor (beyond `data-pressable-container="true"`), accurately pinpoints the author element (`@username • Follow`) in the left gutter, and anchors ~12px directly above it (matching the user's annotated red box), while extracting likers through DOM parsing, React Fiber bridge (`ghost.js`), and API fallback.
- Video Player Controls (`reel-slider.js` & `styles.css`) implement seamless mouse drag/click seeking with robust duration calculation for DASH/MSE streams, persistent playback rate enforcement across Reel transitions, real-time volume/mute icon synchronization, strict cursor-over-video wheel volume stepping ($\le 5\% \to 1\%$, $> 5\% \to 2\%$), and total suppression of Instagram's native bottom-right audio button.

**Tech Stack:** Chrome Extension Manifest V3, JavaScript (ES6+), DeclarativeNetRequest API, HTML5 Video & DOM APIs, CSS3 (backdrop-filter, glassmorphism), Node.js (for verification scripts).

**Spec:** User requirements from chat history & visual specifications from screenshots:
- `media_1791592603878_a8b92c44.png`: Red rectangle in left gutter directly above creator `@username • Follow`; yellow circle around Instagram native speaker button in bottom-right corner to be removed.
- `media_1791595573152_3a779559.png`: Player controls layout with play/pause, -5s/+5s, range bar, timestamp, speed badge, volume toggle.
- `media_1791589337196_8172c31a.png`: Right action column with "Liked by [username] and [count] others".

## Global Constraints

- Manifest V3 compliance with zero browser-reported errors on `brave://extensions/?errors=kenccpjbbpimegdmlghblkmknlbibbhe`.
- "Friends Who Liked" UI must only display on Reels routes (`/reels/*`, `/reel/*`).
- Mouse wheel volume control must strictly activate ONLY when the mouse cursor is directly within the active Reel `<video>` boundaries.
- Volume stepping must be exactly 1% when volume $\le 5\%$, and 2% when volume $> 5\%$.
- Instagram's built-in speaker/audio overlay button in the bottom-right corner of Reels must be completely hidden.
- Video scrubber must support both direct clicking and smooth dragging with the mouse.
- Playback rate (e.g. 2x) selected by the user must persist when scrolling to subsequent Reels.
- Volume mute state must accurately reflect actual audio playback and never falsely show muted when audio is playing.

## Review Focus

1. **Reel Virtualization & Scroll Snap:** When the user rapidly scrolls through Reels, old video listeners are detached, new video elements are cleanly attached, and the UI anchors to the new active Reel without flicker, memory leaks, or ghost cards.
2. **Dynamic Duration in DASH/MSE Streams:** If a Reel's `video.duration` reports `Infinity` or `NaN` prior to full buffering, the duration fallbacks (seekable buffer, buffered end, ghost metadata) prevent scrubber NaN states and seek lockups.
3. **Multi-Language Instagram UI:** Author detection and "Liked by" extraction support multiple languages (English: "Liked by", "Follow"; Romanian: "Apreciat de", "Urmărește"; Spanish, German, etc.) and fallback gracefully to structural DOM attributes.
4. **Mouse Seeking vs Play/Pause Conflict:** Clicking or dragging on the scrubber track or slider thumb must never propagate click events to Instagram's underlying video element (which would unintentionally pause/play the Reel).
5. **Extension Reload Stability:** Unpacked extension reloads without throwing runtime errors when storage is initialized or background worker restarts.

---

### Task 1: DeclarativeNetRequest & Background Zero-Error Hardening

**Files:**
- Modify: `d:/Test/ig-tools/rules.json`
- Modify: `d:/Test/ig-tools/background.js`
- Modify: `d:/Test/ig-tools/manifest.json`
- Create: `d:/Test/ig-tools/tests/test-extension-health.js`

**Interfaces:**
- Consumes: DeclarativeNetRequest API, `chrome.storage.local`
- Produces: Sanitized static rule set `ruleset_1`, error-free `syncDNRRules()` function in `background.js`

- [ ] **Step 1: Write verification test for DNR rules, manifest, and background syntax**
Create `tests/test-extension-health.js` using Node.js to validate `manifest.json`, verify all rule conditions in `rules.json` against Chrome MV3 DNR schema constraints (no invalid wildcards, valid resource types, valid regex patterns), and test `background.js` rule generation logic.

- [ ] **Step 2: Run test to verify initial health & identify rule edge cases**
Run: `node tests/test-extension-health.js`
Expected: Output showing rule validation results and identifying any schema warnings.

- [ ] **Step 3: Sanitize `rules.json` and harden `background.js`**
In `rules.json`:
- Ensure all `urlFilter` entries strictly conform to Chrome DNR specification (replace any leading wildcards or ambiguous patterns with valid domain or path filters).
- Ensure Rule 4 and Rule 14 regex patterns are valid RE2 expressions.
- Verify `requestMethods` entries are uppercase `["POST"]` for strict compatibility.

In `background.js`:
- In `syncDNRRules()`: query `chrome.declarativeNetRequest.getEnabledRulesets()` before calling `updateEnabledRulesets()`, avoiding redundant or conflicting enable/disable calls that throw unhandled Promise rejections.
- Wrap all async operations in comprehensive `try/catch` blocks.
- Ensure all `chrome.runtime.onMessage` async handlers return `true` only when `sendResponse` will be called asynchronously, and `false` otherwise.

- [ ] **Step 4: Run test to verify zero errors in extension configuration**
Run: `node tests/test-extension-health.js`
Expected: PASS with 0 errors.

---

### Task 2: "Friends Who Liked" Rock-Solid Left-Gutter Anchoring & Multi-Layer Extraction

**Files:**
- Modify: `d:/Test/ig-tools/content/friends-liked.js`
- Modify: `d:/Test/ig-tools/styles/styles.css`
- Create: `d:/Test/ig-tools/tests/test-friends-liked.js`

**Interfaces:**
- Consumes: Active Reel DOM elements, `window.postMessage` from `ghost.js`, Instagram `/api/v1/media/{id}/likers/`
- Produces: `#ig-tools-auto-friends-card` fixed directly above the Reel author row in the left gutter on `/reels/*` routes

- [ ] **Step 1: Write DOM unit test for author locator and friends parser**
Create `tests/test-friends-liked.js` simulating Instagram's Reels DOM structure:
- Left gutter with creator avatar, `@username`, and `Follow` button.
- Video container in center.
- Right actions column with `Liked by [friend] and [count] others`.
Verify that `findReelAuthorElement` correctly selects the Reel creator (and never matches the global navigation sidebar) and extracts likers from both DOM and data structures.

- [ ] **Step 2: Run test to verify failure on current container boundary**
Run: `node tests/test-friends-liked.js`
Expected: Highlights failure where narrow `data-pressable-container="true"` prevents finding sibling columns.

- [ ] **Step 3: Update `friends-liked.js` with comprehensive Reel ancestor scope and left-gutter positioning**
In `friends-liked.js`:
1. **True Reel Item Resolution:** Instead of stopping at `div[data-pressable-container="true"]`, traverse upward to find the full Reel viewport unit (`article`, `section`, or outer container enclosing the video, left info, and right action bar).
2. **Strict Author Locator (`findReelAuthorElement`):**
   - Must only inspect elements strictly within the horizontal left gutter of the active video (between `nav.right` and `video.left + 50px`).
   - Specifically exclude any element inside `nav`, `div[role="navigation"]`, or with `left < nav.right`.
   - Match author username link, avatar, or follow button in the left gutter.
3. **Exact Positioning (`updateCardPosition`):**
   - Position the card in the left gutter, horizontally aligned with the creator info (`left = authorRect.left`).
   - Vertically anchor ~12px to 16px directly ABOVE the creator row (`bottom = window.innerHeight - authorRect.top + 14`), matching the red box in `media_1791592603878_a8b92c44.png`.
   - Fallback position: if author element is delayed in rendering, calculate position directly from `activeVideo.getBoundingClientRect()` left edge minus card width, placing it directly in the red box zone.
   - Guard route check: only render when `location.pathname.startsWith('/reels') || location.pathname.startsWith('/reel')`.
4. **Multi-Source Likers Pipeline:**
   - Source 1: Parse "Liked by" text and links from the right action column across languages (`Liked by`, `Apreciat de`, `Gefällt`, `Aime`).
   - Source 2: Read facepile data pushed via `ghost.js` and React Fiber.
   - Source 3: Retrieve from session cache.
   - Source 4: Fetch via REST API endpoint `/api/v1/media/${mediaId}/likers/`.
5. **Persistence Across Scrolling:** Keep card mounted to `document.body`, update coordinates smoothly on `scroll` and `resize`, and re-check on video `play` events.

- [ ] **Step 4: Update CSS in `styles/styles.css`**
- Refine `.ig-tools-auto-friends-card` styling with sleek dark frosted glass (`background: rgba(14, 14, 18, 0.94)`, `backdrop-filter: blur(16px)`).
- Ensure `pointer-events: auto !important`, `z-index: 2147483640 !important`, and proper responsive width (240px - 260px).

- [ ] **Step 5: Run unit tests to verify author detection & liker extraction**
Run: `node tests/test-friends-liked.js`
Expected: PASS.

---

### Task 3: Interactive Video Player Seeking & Full Mouse Scrubbing

**Files:**
- Modify: `d:/Test/ig-tools/content/reel-slider.js`
- Modify: `d:/Test/ig-tools/styles/styles.css`
- Create: `d:/Test/ig-tools/tests/test-player-scrubbing.js`

**Interfaces:**
- Consumes: HTML5 `<video>` element events (`timeupdate`, `seeking`, `seeked`, `loadedmetadata`)
- Produces: Interactive range scrubber `#ig-tools-active-reel-slider` with instant mouse seeking and drag tracking

- [ ] **Step 1: Write test for time formatting, duration extraction, and seek percentage calculation**
Create `tests/test-player-scrubbing.js` testing:
- Duration extraction handling `Infinity`, `NaN`, and buffered ranges.
- Percentage-to-seconds conversion.
- Event propagation isolation (ensuring controls clicks do not reach underlying video).

- [ ] **Step 2: Run test to verify initial logic**
Run: `node tests/test-player-scrubbing.js`
Expected: Identifies duration edge cases.

- [ ] **Step 3: Overhaul mouse seeking in `reel-slider.js`**
1. **DASH / MSE Duration Resiliency:**
   - In `getVideoDuration(video)`: if `video.duration` is `Infinity` or `NaN`, extract maximum buffered range from `video.buffered` or `video.seekable`.
   - Fall back to metadata duration provided by `ghost.js` (`video.dataset.igDuration`).
2. **Unified Mouse Drag & Click Seeking:**
   - Allow both native range `<input type="range">` interaction and custom track click/drag.
   - On `input` event on range input: immediately update `video.currentTime` and update the fill bar width.
   - On track `pointerdown`/`mousedown`: calculate click percentage relative to track width, update thumb, and apply seek immediately.
   - Attach window-level `pointermove` and `pointerup` handlers during active scrubbing so rapid dragging outside the slider bar does not drop focus.
   - Isolate all mouse events (`pointerdown`, `mousedown`, `click`) with `stopPropagation()` and `stopImmediatePropagation()` so the click never toggles Reel playback or triggers Instagram gestures.
3. **Active Video Center Proximity:**
   - Maintain robust detection of the active Reel video using viewport center proximity so controls always lock onto the currently viewed video.

- [ ] **Step 4: Update CSS in `styles/styles.css`**
- Set `.ig-tools-slider-input { pointer-events: auto !important; cursor: pointer !important; }`.
- Style slider thumb with glow and smooth hover expansion (`transform: scale(1.3)`).
- Ensure range box has `touch-action: none` to prevent scroll interference during dragging.

- [ ] **Step 5: Run scrubbing tests to verify seek calculations**
Run: `node tests/test-player-scrubbing.js`
Expected: PASS.

---

### Task 4: Volume Desync Fix, Playback Speed Persistence & Native Audio Suppression

**Files:**
- Modify: `d:/Test/ig-tools/content/reel-slider.js`
- Modify: `d:/Test/ig-tools/styles/styles.css`
- Create: `d:/Test/ig-tools/tests/test-audio-speed.js`

**Interfaces:**
- Consumes: `<video>` audio/playback properties (`volume`, `muted`, `playbackRate`), mouse `wheel` events
- Produces: Reliable volume toggle, persistent speed playback (1x, 1.25x, 1.5x, 2x), video-scoped wheel volume control, suppressed native audio button

- [ ] **Step 1: Write test for wheel volume stepping and playback rate persistence**
Create `tests/test-audio-speed.js` validating:
- Volume step: $\le 0.05 \implies \Delta = 0.01$; $> 0.05 \implies \Delta = 0.02$.
- Cursor bounding box check (wheel only triggers when mouse $(X,Y)$ is inside video bounds).
- Speed cycling order: `[1, 1.25, 1.5, 2, 0.5]`.

- [ ] **Step 2: Run test to verify audio and speed logic**
Run: `node tests/test-audio-speed.js`
Expected: PASS on math/logic tests.

- [ ] **Step 3: Implement volume synchronization, speed persistence, and native audio hiding in `reel-slider.js`**
1. **Fix Volume Mute Icon Desync:**
   - In `syncSliderAudioState()`: check both `targetVideo.muted` and `targetVideo.volume`.
   - Listen to `volumechange`, `play`, and `timeupdate` on the active video.
   - When user clicks Mute button: if video is muted or volume is 0, unmute and restore volume (defaulting to saved volume or 0.5); if unmuted, mute. Update SVG icon immediately to match state.
   - Persist volume preference in `localStorage.setItem('ig_tools_volume', ...)`.
2. **Fix Playback Speed Persistence:**
   - Store `currentPlaybackRate` in module state and `localStorage`.
   - When scrolling to a new Reel or when a new video fires `play`, `playing`, or `loadedmetadata`, automatically enforce `video.playbackRate = currentPlaybackRate`.
   - Sync the speed badge text (`1x`, `1.5x`, `2x`) so it never desyncs from the actual playing speed.
3. **Cursor-Strict Mouse Wheel Volume:**
   - In `initGlobalWheelListener()`: inspect `e.clientX` and `e.clientY`. Check whether coordinates fall strictly within the active video's `getBoundingClientRect()`.
   - If not strictly over the video, allow normal page scroll (do NOT prevent default, do NOT change volume).
   - If strictly over the video: prevent default scroll, calculate step ($\le 5\% \to 1\%$, $> 5\% \to 2\%$), adjust `video.volume`, show volume HUD overlay, and sync slider mute icon.
4. **Total Removal of Instagram's Native Audio Overlay:**
   - In `hideNativeAudioControls()`: query elements with `aria-label` or titles containing audio keywords (`sound`, `audio`, `mute`, `sunet`, `volum`, `piesă`, `comut`) AND buttons located in the bottom-right corner of the video.
   - Set `display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important;`.
   - In `styles/styles.css`: add comprehensive CSS attribute and positional selectors targeting Instagram's bottom-right speaker button.

- [ ] **Step 4: Run audio & speed tests**
Run: `node tests/test-audio-speed.js`
Expected: PASS.

---

### Task 5: End-to-End Integration Verification & Browser Validation

**Files:**
- Create: `d:/Test/ig-tools/tests/run-all-tests.js`

**Interfaces:**
- Consumes: All modules in `ig-tools`
- Produces: Full regression test report confirming zero errors and valid module interfaces

- [ ] **Step 1: Create master test runner**
Create `tests/run-all-tests.js` to execute all unit tests and verify all JS files with Node's `vm.createScript` compiler for syntax and schema integrity.

- [ ] **Step 2: Run master test suite**
Run: `node tests/run-all-tests.js`
Expected: All suites PASS with 0 warnings and 0 errors.

- [ ] **Step 3: Prepare reload & verification steps for Brave**
Provide clear verification instructions for the user:
1. Navigate to `brave://extensions`.
2. Click **Errors** on IG Tools (if any remaining from earlier sessions) and click **Clear all** (Șterge tot).
3. Click the **Reload** circular arrow icon on the **IG Tools** extension card.
4. Open or refresh Instagram Reels (`https://www.instagram.com/reels/`).
5. Verify:
   - "Friends Who Liked" appears in the left gutter ~12px directly above creator `@username • Follow`.
   - Instagram's built-in speaker button in the bottom-right corner is gone.
   - Video scrubber can be clicked or dragged with the mouse to any point.
   - Volume mute icon matches audio status (unmuted when sound plays).
   - Playback speed (e.g. 2x) persists as you scroll to new Reels.
   - Mouse wheel volume works exclusively when hovering over the video, stepping by 1% below 5% and 2% above 5%.
