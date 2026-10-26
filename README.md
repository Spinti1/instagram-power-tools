<div align="center">

# ⚡ IG Tools - Ultimate Instagram Power Suite

**Personal power tools for Instagram on desktop: Ghost Mode, Clean 1080p Downloader, Friends Who Liked, and Pro Video Controls.**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Privacy: Zero Data Retention](https://img.shields.io/badge/Privacy-Zero%20Data%20Retention-purple.svg?style=for-the-badge&logo=shield&logoColor=white)](#-privacy--security-guarantee)
[![Support: Buy Me A Coffee](https://img.shields.io/badge/Support-Buy%20Me%20A%20Coffee-yellow.svg?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/spinti)

---

</div>

## 🌟 Key Features

### 👻 Ghost Mode (100% Stealth)
- **Unseen Stories:** Watch any Instagram Story without adding your name or account to the viewer list.
- **Unread DMs:** Read direct messages and threads completely stealthily without triggering seen receipts, typing indicators, or delivery timestamps.
- **Dual Firewall:** Employs hardware-level Chrome `declarativeNetRequest` dynamic filtering alongside real-time MQTT WebSocket interceptors (`edge-chat` & `gateway`).

### 📥 Clean Native Media Downloader
- **Highest 1080p Quality:** Downloads the highest available progressive MP4 video stream or maximum-resolution JPEG image directly from official Instagram CDN endpoints.
- **Reel & Post Actions:** Seamlessly integrated into Instagram's native action bar (Like, Comment, Share, **Download**). No awkward floating bubbles or UI displacement.
- **Carousel Support:** Download single slides or one-click download all photos/videos in a carousel via the inline `All` badge.
- **Stories Downloader:** One-click download button in the top Story header.
- **Smart Filenames:** Cleanly formatted as `{username}_{YYYY-MM-DD}_{type}.{ext}`.

### 👥 Friends Who Liked (Reels Only)
- **Zero-Click Intelligence:** Detects mutual friends who liked a Reel automatically without opening modal dialogs or menus.
- **Reels Scoped:** Strictly active on Reels (`/reels/*`, `/reel/*`) and guaranteed never to leak onto home feed posts or explore grids.
- **Author-Anchored UI:** Elegantly anchored directly above the username of the Reel creator in an obsidian glass card.

### 🎬 Advanced Video Player Controls
- **Scrubbing Bar:** Smooth time-scrubbing progress bar across Instagram Reels and video posts.
- **Precision Volume Control:** Ultra-fine audio stepping (1% steps under 5%, 2% steps above) with a visible Volume HUD.
- **Persistent Sound Toggle:** Never get muted again when scrolling between videos.
- **Speed Multiplier:** Instant 1x ↔ 2x playback speed toggle button.
- **Keyboard Shortcuts:** Press <kbd>Space</kbd> to play/pause, <kbd>M</kbd> to mute/unmute.

### 📊 Account & Focus Utilities
- **Safe Unfollowers Scanner:** Discover accounts you follow that don't follow you back, with rate-limited, safe API pacing.
- **Private Profile Notes:** Keep private local notes on any user profile.

---

## ☕ Support the Project

If you find IG Tools helpful and want to support ongoing maintenance and new features, consider buying me a coffee:

<div align="center">

[![Buy Me A Coffee](https://img.shields.io/badge/☕%20Buy%20Me%20A%20Coffee-spinti-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/spinti)

👉 **[https://buymeacoffee.com/spinti](https://buymeacoffee.com/spinti)**

</div>

---

## 🚀 Installation Guide

This extension runs on any Chromium-based browser (**Google Chrome**, **Brave**, **Microsoft Edge**, **Opera**, **Vivaldi**).

1. **Download / Clone the Repository:**
   ```bash
   git clone https://github.com/Spinti1/instagram-power-tools.git
   ```
   *(Or download the ZIP file and extract it to a folder on your computer).*

2. **Open Extensions in your Browser:**
   - **Chrome / Brave:** Navigate to `chrome://extensions` (or `brave://extensions`)
   - **Edge:** Navigate to `edge://extensions`

3. **Enable Developer Mode:**
   - Toggle the **Developer mode** switch in the top-right corner.

4. **Load the Extension:**
   - Click **Load unpacked** (or **Încarcă despachetat**).
   - Select the `ig-tools` folder.

5. **Enjoy:**
   - Navigate to [instagram.com](https://www.instagram.com) and start enjoying stealth browsing and enhanced controls!

---

## 🛡️ Privacy & Security Guarantee

We take privacy and security with absolute seriousness:

- **Zero Data Collection:** The extension does **not** collect, store, or transmit your passwords, cookies, auth tokens, chat messages, or browsing history.
- **Zero Third-Party Telemetry:** Absolutely zero analytics, Google Analytics, Sentry, or tracking pixels are included.
- **Strict Domain Scope:** Extension permissions are strictly limited to `*.instagram.com` and official Instagram media CDNs (`*.cdninstagram.com`, `*.fbcdn.net`). It cannot read or modify any other website.
- **Local Settings Only:** Only your UI toggles (e.g. Ghost Mode on/off) and local volume preferences are stored locally in Chrome's sandboxed extension storage.
- **Open Source:** Full source code is open and audited for DOM-based XSS, injection vectors, and network isolation.

---

## 🧪 Testing & Verification

IG Tools includes an automated test suite verifying DNR rules, DOM insertion, route boundaries, and security hardening:

```bash
node tests/run-all-tests.js
```

---

## 🇷🇴 Rezumat în Limba Română

**IG Tools** este o extensie gratuită și open-source pentru Instagram Desktop:
- **Ghost Mode:** Vezi Story-uri și citești mesaje private fără ca expeditorul să primească confirmare de citire (Seen).
- **Descărcare Media 1080p:** Buton curat integrat nativ lângă butonul de Share pentru descărcat Reels, Postări, Carusel și Story-uri la rezoluție maximă.
- **Friends Who Liked:** Îți arată automat prietenii care au dat like la un Reel, poziționat deasupra numelui autorului (exclusiv pe Reels).
- **Control Video Complet:** Bară de derulare (scrubbing), control fin al volumului, buton de sunet permanent și viteză 2x.
- **100% Privat:** Nu salvează parole, mesaje sau date personale. Fără reclame sau urmărire.

---

## 📄 License

Released under the [MIT License](LICENSE). Copyright © 2026 Spinti.
