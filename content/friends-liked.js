/**
 * IG Tools - Friends Who Liked on Reels Module
 * Body-anchored, zero-clipping, automatic zero-click friends detector.
 * Mounted directly to document.body so it CAN NEVER be clipped by Instagram's
 * overflow:hidden containers or unmounted by React virtual list rendering.
 */

window.IGTools = window.IGTools || {};

window.IGTools.friendsLiked = (() => {
  const LOG_PREFIX = '[IG Tools] [FriendsLiked]';

  if (window.self !== window.top) {
    return {
      init: () => {},
      scanAndInjectReelFriendsButton: () => {}
    };
  }

  const friendsCache = new Map();
  try {
    const raw = sessionStorage.getItem('ig_tools_friends_cache');
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        friendsCache.set(k, v);
      }
    }
  } catch (e) {}

  function saveCacheToSession() {
    try {
      const obj = {};
      friendsCache.forEach((val, key) => {
        obj[key] = val;
      });
      sessionStorage.setItem('ig_tools_friends_cache', JSON.stringify(obj));
    } catch (e) {}
  }

  const pendingRequests = new Set();
  let isInitialized = false;
  let currentActiveVideo = null;
  let currentActiveShortcode = null;

  function shortcodeToMediaId(shortcode) {
    if (!shortcode) return null;
    if (shortcode.startsWith('id_')) return shortcode.slice(3);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = BigInt(0);
    for (let i = 0; i < shortcode.length; i++) {
      const char = shortcode[i];
      const index = alphabet.indexOf(char);
      if (index === -1) return null;
      id = id * BigInt(64) + BigInt(index);
    }
    return id.toString();
  }

  function getCsrfToken() {
    const fromDom = document.documentElement.dataset.igToolsCsrfToken;
    if (fromDom) return fromDom;
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    if (match) return match[1];
    const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (input && input.value) return input.value;
    return '';
  }

  function init() {
    if (window.self !== window.top) return;
    if (isInitialized) return;
    isInitialized = true;
    console.log(`${LOG_PREFIX} Module initialized (Body-Anchored Persistent Card).`);

    const onReady = () => {
      getOrCreateCard();
      checkActiveReel();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
      onReady();
    }

    const onRouteChanged = () => {
      const card = document.getElementById('ig-tools-auto-friends-card');
      if (card && !isReelContext(null)) {
        card.style.display = 'none';
      }
      setTimeout(checkActiveReel, 120);
    };

    // Listen to scroll, resize, play, and navigation events
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    window.addEventListener('play', onScrollOrPlay, true);
    window.addEventListener('popstate', onRouteChanged);

    // Patch pushState and replaceState for instant route detection
    try {
      const origPush = history.pushState;
      if (origPush) {
        history.pushState = function(...args) {
          const res = origPush.apply(this, args);
          onRouteChanged();
          return res;
        };
      }
      const origReplace = history.replaceState;
      if (origReplace) {
        history.replaceState = function(...args) {
          const res = origReplace.apply(this, args);
          onRouteChanged();
          return res;
        };
      }
    } catch (e) {}

    // Listen for metadata updates from ghost.js (MAIN world)
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data) return;
      if (event.data.type === 'IG_TOOLS_ACTIVE_REEL_UPDATE') {
        const { shortcode, mediaId, author, friendsLiked } = event.data;
        if (author) {
          document.documentElement.dataset.igToolsActiveAuthor = author;
          if (currentActiveVideo) currentActiveVideo.dataset.igAuthor = author;
        }
        const code = shortcode || (mediaId ? `id_${mediaId}` : null);
        if (code) {
          if (Array.isArray(friendsLiked) && friendsLiked.length > 0) {
            friendsCache.set(code, friendsLiked);
            if (shortcode) friendsCache.set(shortcode, friendsLiked);
            if (mediaId) friendsCache.set(`id_${mediaId}`, friendsLiked);
            saveCacheToSession();
            currentActiveShortcode = code;
            const card = getOrCreateCard();
            if (card && currentActiveVideo) {
              updateCardPosition(currentActiveVideo);
              renderFriendsContent(card, friendsLiked, code);
              return;
            }
          }
        }
        checkActiveReel();
      } else if (event.data.type === 'IG_TOOLS_MEDIA_METADATA') {
        const { code, shortcode, data } = event.data;
        const targetCode = shortcode || code;
        if (targetCode && Array.isArray(data?.friendsLiked) && data.friendsLiked.length > 0) {
          friendsCache.set(targetCode, data.friendsLiked);
          if (data.shortcode) friendsCache.set(data.shortcode, data.friendsLiked);
          if (data.id) friendsCache.set(`id_${data.id}`, data.friendsLiked);
          saveCacheToSession();
          if (
            currentActiveShortcode === targetCode ||
            currentActiveShortcode === data.shortcode ||
            currentActiveShortcode === `id_${data.id}`
          ) {
            const card = getOrCreateCard();
            if (card && currentActiveVideo) {
              updateCardPosition(currentActiveVideo);
              renderFriendsContent(card, data.friendsLiked, currentActiveShortcode);
            }
          }
        }
      }
    });

    // Periodic heartbeat
    setInterval(checkActiveReel, 500);
  }

  let scrollThrottle = null;
  function onScrollOrResize() {
    if (currentActiveVideo) {
      updateCardPosition(currentActiveVideo);
    }
    if (!scrollThrottle) {
      scrollThrottle = setTimeout(() => {
        checkActiveReel();
        scrollThrottle = null;
      }, 120);
    }
  }

  function onScrollOrPlay() {
    if (!scrollThrottle) {
      scrollThrottle = setTimeout(() => {
        checkActiveReel();
        scrollThrottle = null;
      }, 150);
    }
  }

  /**
   * Determines whether the user is viewing a Reel context.
   * Strictly matches /reels/*, /reel/*, /reels/videos/*, /<username>/reels/*, /<username>/reel/*.
   * Strictly EXCLUDES Home feed (/), Stories, Direct chats, Accounts, and Explore photo posts.
   */
  function isReelContext(activeVideo) {
    const path = location.pathname;
    if (
      !path ||
      path === '/' ||
      path === '' ||
      path.startsWith('/direct') ||
      path.includes('/direct/') ||
      path.startsWith('/accounts') ||
      path.startsWith('/stories') ||
      path.includes('/stories/') ||
      (path.startsWith('/explore') && !path.includes('/reel'))
    ) {
      return false;
    }

    if (
      activeVideo &&
      activeVideo.closest &&
      activeVideo.closest(
        '[aria-label*="Direct" i], [aria-label*="Messages" i], [aria-label*="Chat" i], ' +
        '[aria-label*="Mesaje" i], [aria-label*="Conversa" i], ' +
        'div[data-pagelet*="Direct" i], div[data-pagelet*="Chat" i]'
      )
    ) {
      return false;
    }

    const isReelUrl =
      path.startsWith('/reels') ||
      path.startsWith('/reel') ||
      path.includes('/reel/') ||
      path.includes('/reels/');

    return isReelUrl;
  }

  /**
   * Safely measures the true left-docked navigation sidebar width.
   * Guaranteed never to return full-width top headers or backdrops.
   */
  function getLeftSidebarWidth() {
    const candidates = document.querySelectorAll('nav, div[role="navigation"], header, aside');
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.left >= 0 && r.left <= 25 && r.width >= 40 && r.width <= 320 && r.height > window.innerHeight * 0.4) {
        return Math.round(r.right);
      }
    }
    const slimNav = document.querySelector('svg[aria-label="Instagram"], svg[aria-label="Reels"]')?.closest('div[style*="width"]');
    if (slimNav) {
      const sr = slimNav.getBoundingClientRect();
      if (sr.width >= 40 && sr.width <= 320) return Math.round(sr.right);
    }
    return 72;
  }

  /**
   * Retrieves or creates the single persistent card directly attached to document.body.
   * Being a direct child of document.body guarantees:
   * 1. It is NEVER clipped by overflow:hidden on Instagram containers.
   * 2. React virtual list re-renders CANNOT delete it.
   */
  function getOrCreateCard() {
    let card = document.getElementById('ig-tools-auto-friends-card');
    if (!card) {
      if (!document.body) return null;
      card = document.createElement('div');
      card.id = 'ig-tools-auto-friends-card';
      card.className = 'ig-tools-auto-friends-card';
      card.style.display = 'none'; // Initially hidden until a valid Reel is actively confirmed

      // Initialize with visible Obsidian card template so it is never an empty 0-height element
      card.innerHTML = `
        <div class="ig-tools-afc-container">
          <div class="ig-tools-afc-header">
            <span class="ig-tools-afc-badge-icon">👥</span>
            <span class="ig-tools-afc-header-text">Friends who liked:</span>
          </div>
          <div class="ig-tools-afc-loading">
            <span class="ig-tools-afc-spinner"></span>
            <span>Checking likers...</span>
          </div>
        </div>
      `;

      // Event isolation: clicking anywhere inside card NEVER pauses the Reel
      const stopEvents = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'];
      stopEvents.forEach((evt) => {
        card.addEventListener(evt, (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
        }, true);
      });

      document.body.appendChild(card);
    }
    return card;
  }

  /**
   * Locates the author/user element of the current playing Reel strictly in the left gutter.
   */
  function findReelAuthorElement(activeVideo, navRight) {
    if (!activeVideo) return null;
    const vRect = activeVideo.getBoundingClientRect();

    // STRICT: Element must be in the left gutter (between navRight and the Reel video)
    // and vertically within the bounds of the active Reel.
    function isStrictlyInLeftGutter(r) {
      if (!r || r.width <= 0 || r.height <= 0) return false;
      // Must NOT be in the global navigation sidebar
      if (r.left < navRight - 5) return false;
      // Must be on the left side of the Reel video (gutter or bottom-left)
      const maxAllowedLeft = vRect.left + (vRect.width * 0.25);
      if (r.left > maxAllowedLeft) return false;
      // Must be within vertical span of active Reel
      if (r.bottom < vRect.top - 80 || r.top > vRect.bottom + 100) return false;
      return true;
    }

    // 1. Check if ghost.js synced the author username
    const activeAuthor = document.documentElement.dataset.igToolsActiveAuthor || activeVideo.dataset?.igAuthor;
    if (activeAuthor) {
      const candidates = document.querySelectorAll(`a[href*="/${activeAuthor}"], a[href*="/${activeAuthor}/"]`);
      for (const link of candidates) {
        const href = link.getAttribute('href') || '';
        const cleanHref = href.split('?')[0].replace(/^\/+|\/+$/g, '');
        if (cleanHref.toLowerCase() === activeAuthor.toLowerCase()) {
          const r = link.getBoundingClientRect();
          if (isStrictlyInLeftGutter(r)) {
            const row = link.closest('div[role="button"]') || link.parentElement;
            return row || link;
          }
        }
      }
    }

    // 2. Scan for Follow / Following button strictly in the left gutter
    const buttons = document.querySelectorAll('button, div[role="button"]');
    for (const btn of buttons) {
      const text = btn.innerText?.trim()?.toLowerCase() || '';
      if (
        text.includes('follow') ||
        text.includes('following') ||
        text.includes('urmăre') ||
        text.includes('urmari') ||
        text.includes('suivre') ||
        text.includes('folgen')
      ) {
        const bRect = btn.getBoundingClientRect();
        if (isStrictlyInLeftGutter(bRect)) {
          const row = btn.parentElement;
          return row || btn;
        }
      }
    }

    // 3. Scan for author profile links strictly in the left gutter
    const routeWords = ['reels', 'reel', 'videos', 'explore', 'direct', 'stories', 'p', 'audio', 'tagged'];
    const links = document.querySelectorAll('a[role="link"][href^="/"], a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const parts = href.split('?')[0].split('/').filter(Boolean);
      if (parts.length === 1 && !routeWords.includes(parts[0].toLowerCase())) {
        const lRect = link.getBoundingClientRect();
        if (lRect.width > 15 && lRect.height > 10 && lRect.height < 45 && isStrictlyInLeftGutter(lRect)) {
          return link;
        }
      }
    }

    // 4. Check for avatar img strictly in the left gutter
    const imgs = document.querySelectorAll('img[alt*="profile" i], img[alt*="profil" i]');
    for (const img of imgs) {
      const iRect = img.getBoundingClientRect();
      if (iRect.width >= 18 && isStrictlyInLeftGutter(iRect)) {
        return img.parentElement || img;
      }
    }

    return null;
  }

  /**
   * Dynamically anchors the Who Liked card directly ABOVE the user/author who posted the current playing video.
   */
  function updateCardPosition(activeVideo) {
    const card = getOrCreateCard();
    if (!card) return;

    if (!activeVideo || !activeVideo.isConnected) {
      card.style.display = 'none';
      return;
    }

    if (!isReelContext(activeVideo)) {
      card.style.display = 'none';
      return;
    }

    const rect = activeVideo.getBoundingClientRect();
    const windowH = window.innerHeight;

    // Check if Reel video is actually visible in viewport
    if (rect.height < 60 || rect.bottom < 60 || rect.top > windowH - 60) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'flex';
    const cardWidth = 240;

    const navRight = getLeftSidebarWidth();
    const authorEl = findReelAuthorElement(activeVideo, navRight);

    if (authorEl) {
      const aRect = authorEl.getBoundingClientRect();
      // Position card directly ABOVE the user/author row (~12px to 14px gap)
      const bottomFromWindow = Math.max(70, Math.min(windowH - 100, windowH - aRect.top + 12));

      let targetLeft = aRect.left;
      targetLeft = Math.max(navRight + 12, targetLeft);
      // Ensure it NEVER spills into the video
      if (rect.left > navRight + cardWidth + 15) {
        targetLeft = Math.min(rect.left - cardWidth - 10, targetLeft);
      }

      card.style.position = 'fixed';
      card.style.left = `${Math.round(targetLeft)}px`;
      card.style.bottom = `${Math.round(bottomFromWindow)}px`;
      card.style.top = 'auto';
      card.style.right = 'auto';
      card.style.width = `${cardWidth}px`;
    } else {
      // Fallback: gutter directly to the left of the Reel (red box zone)
      const availableLeftGutter = rect.left - navRight;
      let targetLeft;
      if (availableLeftGutter >= cardWidth + 14) {
        targetLeft = Math.max(navRight + 16, Math.round(rect.left - cardWidth - 24));
      } else {
        targetLeft = Math.max(navRight + 12, 16);
      }
      const fallbackBottom = Math.max(70, Math.min(windowH - 120, windowH - (rect.bottom - 110)));
      card.style.position = 'fixed';
      card.style.left = `${Math.round(targetLeft)}px`;
      card.style.bottom = `${Math.round(fallbackBottom)}px`;
      card.style.top = 'auto';
      card.style.right = 'auto';
      card.style.width = `${cardWidth}px`;
    }
  }

  /**
   * Resolves the true outer Reel container that encloses the video, left gutter, and right actions.
   */
  function findReelOuterContainer(video) {
    if (!video) return null;
    let cur = video.parentElement;
    while (cur && cur !== document.body) {
      const r = cur.getBoundingClientRect();
      if (r.width >= video.getBoundingClientRect().width + 80) {
        return cur;
      }
      if (['ARTICLE', 'SECTION'].includes(cur.tagName) || cur.getAttribute('role') === 'region') {
        return cur;
      }
      cur = cur.parentElement;
    }
    return video.closest('article, section, main') || video.parentElement;
  }

  /**
   * Scans container and right action column for rendered "Liked by" text or links to extract friends.
   */
  function extractFriendsFromDom(container, video) {
    const likers = [];
    const searchScopes = [container].filter(Boolean);

    // Look for text nodes matching "Liked by", "Apreciat de", "Gefällt", etc.
    const textNodes = [];
    searchScopes.forEach((sc) => {
      textNodes.push(...Array.from(sc.querySelectorAll('span, div, p')));
    });

    if (video) {
      const vRect = video.getBoundingClientRect();
      // Also query elements within vertical bounds of active Reel
      const allText = document.querySelectorAll('span, div, p');
      for (const node of allText) {
        const nr = node.getBoundingClientRect();
        if (nr.height > 0 && nr.bottom >= vRect.top - 60 && nr.top <= vRect.bottom + 60 && nr.left >= vRect.left) {
          textNodes.push(node);
        }
      }
    }

    for (const node of textNodes) {
      const text = (node.textContent || '').trim();
      if (text.length < 5 || text.length > 150) continue;
      const lower = text.toLowerCase();
      if (
        lower.includes('liked by') ||
        lower.includes('apreciat de') ||
        lower.includes('gefällt') ||
        lower.includes('aimé par') ||
        lower.includes('and others') ||
        lower.includes('și alți')
      ) {
        const links = node.querySelectorAll('a[href^="/"]');
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          const parts = href.split('?')[0].split('/').filter(Boolean);
          if (parts.length === 1 && !['reels', 'reel', 'explore', 'stories', 'direct', 'p'].includes(parts[0].toLowerCase())) {
            const uName = parts[0];
            const img = node.querySelector('img') || document.querySelector(`img[alt*="${uName}"]`);
            if (!likers.some((l) => l.username.toLowerCase() === uName.toLowerCase())) {
              likers.push({
                username: uName,
                profile_pic_url: img?.src || ''
              });
            }
          }
        }
      }
    }

    return likers;
  }

  /**
   * Robust shortcode extractor for a Reel container or video element.
   */
  function getReelShortcode(container, video) {
    const routeKeywords = ['reel', 'reels', 'videos', 'audio', 'explore', 'direct', 'stories', 'p'];

    // 1. Direct dataset set synchronously by ghost.js in MAIN world React Fiber
    const mainWorldCode = document.documentElement.dataset.igToolsActiveShortcode;
    if (mainWorldCode && !routeKeywords.includes(mainWorldCode.toLowerCase())) {
      return mainWorldCode;
    }

    // 2. Video element dataset directly set by ghost.js
    if (video?.dataset?.igShortcode && !routeKeywords.includes(video.dataset.igShortcode.toLowerCase())) {
      return video.dataset.igShortcode;
    }

    // 3. Direct pathname check on /reels/videos/{code}, /reel/{code}, or /p/{code}
    const pathMatch = location.pathname.match(/\/(?:reels?\/videos|reels?|p)\/([A-Za-z0-9_-]+)/i);
    if (pathMatch && !routeKeywords.includes(pathMatch[1].toLowerCase())) {
      return pathMatch[1];
    }

    // 4. Links inside container or video parent
    const targetParents = [
      container,
      video?.parentElement,
      video?.parentElement?.parentElement,
      video?.closest('article'),
      video?.closest('div[role="dialog"]'),
      video?.closest('div.x1qjc9v5, div.x1ypdohk, section, main')
    ].filter(Boolean);

    for (const parent of targetParents) {
      const links = parent.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        const match = href?.match(/\/(?:reels?\/videos|reels?|p)\/([A-Za-z0-9_-]+)/i);
        if (match && !routeKeywords.includes(match[1].toLowerCase())) {
          return match[1];
        }
      }
    }

    // 5. Proximity scan for links within 800px of video
    if (video) {
      const vRect = video.getBoundingClientRect();
      const allLinks = document.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"]');
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        const match = href?.match(/\/(?:reels?\/videos|reels?|p)\/([A-Za-z0-9_-]+)/i);
        if (match && !routeKeywords.includes(match[1].toLowerCase())) {
          const lRect = link.getBoundingClientRect();
          if (Math.abs(lRect.top - vRect.top) < 800) {
            return match[1];
          }
        }
      }
    }

    // 6. Global cache or mediaId fallback
    if (window.IGTools?.activeReelCode) {
      return window.IGTools.activeReelCode;
    }

    const fallbackMediaId = document.documentElement.dataset.igToolsActiveMediaId || video?.dataset?.igMediaId;
    if (fallbackMediaId && /^\d{7,25}$/.test(fallbackMediaId)) {
      return `id_${fallbackMediaId}`;
    }

    // 7. Request on-demand from ghost.js in MAIN world
    try {
      window.postMessage({ type: 'IG_TOOLS_REQUEST_ACTIVE_REEL_METADATA' }, '*');
    } catch (e) {}

    return null;
  }

  async function fetchMediaLikers(mediaId) {
    const csrfToken = getCsrfToken();
    const endpoint = `https://www.instagram.com/api/v1/media/${mediaId}/likers/`;

    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477'
    };
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include',
      headers
    });

    if (!response.ok) {
      throw new Error(`Likers HTTP ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Scans for the active Reel video and triggers friends rendering.
   */
  function checkActiveReel() {
    if (!document.body) return;
    const card = getOrCreateCard();
    if (!card) return;

    const videos = Array.from(document.querySelectorAll('video'));
    const visibleVideos = videos.filter((v) => {
      const r = v.getBoundingClientRect();
      return r.height > 80 && r.bottom > 80 && r.top < window.innerHeight - 80;
    });

    if (visibleVideos.length === 0) {
      card.style.display = 'none';
      return;
    }

    const windowCenter = window.innerHeight / 2;
    // Prefer playing visible videos, but ALWAYS select the one closest to the viewport center!
    const playingVisible = visibleVideos.filter((v) => !v.paused);
    const candidateList = playingVisible.length > 0 ? playingVisible : visibleVideos;
    let activeVideo = null;
    let minDistance = Infinity;
    for (const v of candidateList) {
      const rect = v.getBoundingClientRect();
      const vCenter = rect.top + rect.height / 2;
      const dist = Math.abs(vCenter - windowCenter);
      if (dist < minDistance) {
        minDistance = dist;
        activeVideo = v;
      }
    }

    if (!activeVideo && visibleVideos.length > 0) {
      activeVideo = visibleVideos[0];
    }

    if (!activeVideo || !isReelContext(activeVideo)) {
      card.style.display = 'none';
      return;
    }

    currentActiveVideo = activeVideo;
    updateCardPosition(activeVideo);

    const reelContainer = findReelOuterContainer(activeVideo) || activeVideo.parentElement;

    // 1. Check DOM directly for rendered "Liked by" friends across outer container and right actions
    const domFriends = extractFriendsFromDom(reelContainer, activeVideo);
    if (domFriends.length > 0) {
      renderFriendsContent(card, domFriends, currentActiveShortcode || 'dom');
      return;
    }

    // 2. Check React Fiber facepile data pushed from ghost.js
    const activeFacepile = document.documentElement.dataset.igToolsActiveFriends || activeVideo?.dataset?.igFriends;
    if (activeFacepile) {
      try {
        const parsed = JSON.parse(activeFacepile);
        if (Array.isArray(parsed) && parsed.length > 0) {
          renderFriendsContent(card, parsed, 'fiber');
          return;
        }
      } catch (e) {}
    }

    const shortcode = getReelShortcode(reelContainer, activeVideo);
    if (!shortcode) {
      if (!card.innerHTML || card.innerHTML.trim() === '') {
        renderEmptyState(card, 'No friends liked this Reel');
      }
      return;
    }

    window.IGTools.activeReelCode = shortcode;
    window.IGTools.activeReelVideo = activeVideo;

    // If card is already showing friends for this exact shortcode, do nothing
    if (card.dataset.code === shortcode && currentActiveShortcode === shortcode) {
      return;
    }

    currentActiveShortcode = shortcode;
    renderFriendsForShortcode(card, shortcode);
  }

  /**
   * Renders friends who liked for the active shortcode.
   */
  async function renderFriendsForShortcode(card, shortcode) {
    if (!card) return;
    card.dataset.code = shortcode;

    // Priority 1: Check in-memory cache
    if (friendsCache.has(shortcode)) {
      const cached = friendsCache.get(shortcode);
      renderFriendsContent(card, cached, shortcode);
      return;
    }

    // Priority 2: Check React Fiber facepile data pushed from ghost.js (0ms display)
    const activeFacepile = document.documentElement.dataset.igToolsActiveFriends || currentActiveVideo?.dataset?.igFriends;
    if (activeFacepile) {
      try {
        const parsed = JSON.parse(activeFacepile);
        if (Array.isArray(parsed)) {
          friendsCache.set(shortcode, parsed);
          saveCacheToSession();
          renderFriendsContent(card, parsed, shortcode);
          return;
        }
      } catch (e) {}
    }

    // Priority 3: Fetch from API
    card.innerHTML = `
      <div class="ig-tools-afc-container">
        <div class="ig-tools-afc-header">
          <span class="ig-tools-afc-badge-icon">👥</span>
          <span class="ig-tools-afc-header-text">Friends who liked:</span>
        </div>
        <div class="ig-tools-afc-loading">
          <span class="ig-tools-afc-spinner"></span>
          <span>Checking likers...</span>
        </div>
      </div>
    `;

    if (pendingRequests.has(shortcode)) {
      return;
    }

    pendingRequests.add(shortcode);

    try {
      const mediaId = shortcodeToMediaId(shortcode) || document.documentElement.dataset.igToolsActiveMediaId;
      if (!mediaId) {
        renderEmptyState(card, 'No friends liked this Reel');
        return;
      }

      const data = await fetchMediaLikers(mediaId);
      const users = data.users || [];
      const friends = users.filter((u) => {
        return Boolean(
          (u.friendship_status && (u.friendship_status.following === true || u.friendship_status.is_following === true)) ||
          u.is_following === true ||
          u.following === true ||
          u.is_bestie === true
        );
      });

      if (friends.length > 0) {
        friendsCache.set(shortcode, friends);
        saveCacheToSession();
      }

      if (card.dataset.code === shortcode) {
        renderFriendsContent(card, friends, shortcode);
      }
    } catch (e) {
      console.warn(`${LOG_PREFIX} Fetch likers failed for ${shortcode}:`, e);
      if (card.dataset.code === shortcode) {
        renderEmptyState(card, 'No friends liked this Reel');
      }
    } finally {
      pendingRequests.delete(shortcode);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderFriendsContent(card, friends, shortcode) {
    if (!friends || friends.length === 0) {
      renderEmptyState(card, 'No friends liked this Reel');
      return;
    }

    let friendsListHtml = '';
    const displayFriends = friends.slice(0, 4);
    for (const friend of displayFriends) {
      const rawUser = friend.username || friend.user?.username || 'user';
      const safeUsername = escapeHtml(rawUser);
      const encodedUser = encodeURIComponent(rawUser);
      const rawAvatar = friend.profile_pic_url || friend.user?.profile_pic_url || '';
      const safeAvatar = rawAvatar ? escapeHtml(rawAvatar) : '';

      friendsListHtml += `
        <a href="/${encodedUser}/" target="_blank" class="ig-tools-afc-user" title="@${safeUsername}">
          ${safeAvatar ? `<img class="ig-tools-afc-avatar" src="${safeAvatar}" alt="${safeUsername}" />` : '👤'}
          <span class="ig-tools-afc-username">@${safeUsername}</span>
        </a>
      `;
    }

    const extraCount = friends.length - displayFriends.length;
    const extraHtml = extraCount > 0 ? `<span class="ig-tools-afc-extra">+${extraCount} more</span>` : '';

    card.innerHTML = `
      <div class="ig-tools-afc-container">
        <div class="ig-tools-afc-header">
          <span class="ig-tools-afc-badge-icon">👥</span>
          <span class="ig-tools-afc-header-text">Friends who liked (${friends.length}):</span>
        </div>
        <div class="ig-tools-afc-users-row">
          ${friendsListHtml}
          ${extraHtml}
        </div>
      </div>
    `;
    card.classList.remove('ig-tools-afc-dimmed');
  }

  function renderEmptyState(card, text) {
    card.innerHTML = `
      <div class="ig-tools-afc-container">
        <div class="ig-tools-afc-header">
          <span class="ig-tools-afc-badge-icon">👥</span>
          <span class="ig-tools-afc-header-text">Friends who liked:</span>
        </div>
        <div class="ig-tools-afc-empty-msg">
          <span>${text}</span>
        </div>
      </div>
    `;
    card.classList.remove('ig-tools-afc-dimmed');
  }

  return {
    init,
    scanAndInjectReelFriendsButton: checkActiveReel
  };
})();

// Self-initialize safely if running in browser top window
try {
  if (typeof window !== 'undefined' && window.self === window.top) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        window.IGTools?.friendsLiked?.init();
      }, { once: true });
    } else {
      setTimeout(() => {
        window.IGTools?.friendsLiked?.init();
      }, 50);
    }
  }
} catch (e) {}


