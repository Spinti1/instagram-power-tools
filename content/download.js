/**
 * IG Tools - Media Downloader Module
 * Highest quality downloader for Reels, Posts, Stories, and Carousels.
 * Prevents video pause on click using capture-phase event isolation.
 */

window.IGTools = window.IGTools || {};

window.IGTools.download = (() => {
  const LOG_PREFIX = '[IG Tools] [Download]';

  if (window.self !== window.top) {
    return {
      init: () => {},
      scanAndInjectButtons: () => {}
    };
  }

  const mediaCache = new Map();
  let isInitialized = false;

  const SVG_DOWNLOAD_ICON = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  `;

  const SVG_CHECK_ICON = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;

  function init() {
    if (window.self !== window.top) return;
    if (isInitialized) return;
    isInitialized = true;
    console.log(`${LOG_PREFIX} Module initialized.`);

    // Cache metadata dispatched from ghost.js
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.type !== 'IG_TOOLS_MEDIA_METADATA') {
        return;
      }
      const { code, data } = event.data;
      if (code && data) {
        mediaCache.set(code, data);
        if (data.shortcode) mediaCache.set(data.shortcode, data);
        if (data.id) mediaCache.set(String(data.id), data);
      }
    });

    const onReady = () => {
      scanAndInjectButtons();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
      onReady();
    }

    window.addEventListener('scroll', () => {
      updateFloatingReelButton();
    }, { passive: true });
  }

  function shortcodeToMediaId(shortcode) {
    if (!shortcode) return null;
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

  function formatFilename(username, type, extension, dateObj = new Date()) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const safeUser = (username || 'instagram_user').replace(/[^a-zA-Z0-9._-]/g, '');
    return `${safeUser}_${yyyy}-${mm}-${dd}_${type}.${extension}`;
  }

  function getHighestQualityFromSrcset(srcset) {
    if (!srcset) return null;
    try {
      const candidates = srcset.split(',').map((entry) => {
        const parts = entry.trim().split(/\s+/);
        const url = parts[0];
        const width = parts[1] ? parseInt(parts[1].replace('w', ''), 10) : 0;
        return { url, width };
      });
      candidates.sort((a, b) => b.width - a.width);
      return candidates[0]?.url || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Traverses React Fiber attached to DOM elements to extract full-res video URL.
   */
  function findVideoFromReact(element) {
    if (!element) return null;

    const keys = Object.keys(element);
    const fiberKey = keys.find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
    if (!fiberKey) return null;

    let curr = element[fiberKey];
    let depth = 0;

    while (curr && depth < 35) {
      const props = curr.memoizedProps || curr.props;
      if (props) {
        if (props.video_versions && Array.isArray(props.video_versions) && props.video_versions.length > 0) {
          return props.video_versions[0].url;
        }

        const media = props.media || props.item || props.post || props.videoData;
        if (media && media.video_versions && Array.isArray(media.video_versions) && media.video_versions.length > 0) {
          return media.video_versions[0].url;
        }

        if (props.videoUrl && typeof props.videoUrl === 'string' && props.videoUrl.startsWith('http')) {
          return props.videoUrl;
        }
      }
      curr = curr.return;
      depth++;
    }

    return null;
  }

  function getCsrfToken() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
  }

  /**
   * Requests high-resolution Reel video URL from MAIN world script (ghost.js).
   */
  function requestVideoFromMainWorld(shortcode, mediaId) {
    return new Promise((resolve) => {
      const requestId = 'req_' + Math.random().toString(36).slice(2, 9);
      let timer = null;

      function listener(event) {
        if (
          event.source === window &&
          event.data &&
          event.data.type === 'IG_TOOLS_RESPONSE_REEL_VIDEO' &&
          event.data.requestId === requestId
        ) {
          clearTimeout(timer);
          window.removeEventListener('message', listener);
          resolve(event.data);
        }
      }

      window.addEventListener('message', listener);

      timer = setTimeout(() => {
        window.removeEventListener('message', listener);
        resolve(null);
      }, 1400);

      window.postMessage(
        {
          type: 'IG_TOOLS_REQUEST_REEL_VIDEO',
          requestId,
          shortcode,
          mediaId
        },
        '*'
      );
    });
  }

  /**
   * Fetches media info from Instagram API as guaranteed high-res fallback.
   */
  async function fetchMediaInfo(mediaId) {
    try {
      const csrfToken = getCsrfToken();
      const headers = {
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        'X-ASBD-ID': '129477'
      };
      if (csrfToken) {
        headers['X-CSRFToken'] = csrfToken;
      }
      const resp = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
        method: 'GET',
        credentials: 'include',
        headers
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.items?.[0] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Triggers file download via background service worker or direct link.
   */
  async function triggerDownload(url, filename) {
    if (!url) return false;

    // 1. Direct blob URL
    if (url.startsWith('blob:')) {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 1000);
        return true;
      } catch (e) {}
    }

    // 2. Direct HTTP MP4 stream (bypasses CORS via Chrome Downloads in background)
    if (url.startsWith('http')) {
      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: 'DOWNLOAD_MEDIA', url, filename },
            (res) => {
              if (chrome.runtime.lastError) resolve(null);
              else resolve(res);
            }
          );
        });

        if (response && response.success) {
          console.log(`${LOG_PREFIX} Chrome Downloads successfully started:`, filename);
          return true;
        }
      } catch (e) {
        console.warn(`${LOG_PREFIX} Background download failed, using fetch fallback...`, e);
      }
    }

    // 3. Fallback: fetch to blob
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(objectUrl);
      }, 10000);
      return true;
    } catch (err) {
      window.open(url, '_blank');
      return false;
    }
  }

  /**
   * Scans performance resource entries to locate active video CDN streams.
   * Strictly filters out audio-only DASH streams.
   */
  function findRecentVideoFromPerformance() {
    try {
      const entries = performance.getEntriesByType('resource');
      for (let i = entries.length - 1; i >= 0; i--) {
        const url = entries[i].name;
        const lower = url.toLowerCase();

        // Strictly ignore audio-only tracks and audio codecs
        if (
          lower.includes('audio') ||
          lower.includes('mime_type=audio') ||
          lower.includes('itag=140') ||
          lower.includes('/t50.2886-16/')
        ) {
          continue;
        }

        if (
          (lower.includes('cdninstagram.com') || lower.includes('fbcdn.net')) &&
          (lower.includes('.mp4') || lower.includes('/o1/v/') || lower.includes('/v/t'))
        ) {
          return url.replace(/([?&])bytestart=\d+(&byteend=\d+)?(&|$)/i, '$1').replace(/[?&]$/, '');
        }
      }
    } catch (e) {}
    return null;
  }

  function extractShortcode(element) {
    // URL check: /reel/{code}/, /reels/{code}/, /p/{code}/
    const match = location.pathname.match(/\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
    if (match && match[1] !== 'reels' && match[1] !== 'videos') return match[1];

    if (element) {
      const links = element.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        const linkMatch = href.match(/\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
        if (linkMatch && linkMatch[1] !== 'reels' && linkMatch[1] !== 'videos') return linkMatch[1];
      }
    }
    return null;
  }

  function extractUsername(container) {
    if (location.pathname.startsWith('/stories/')) {
      const parts = location.pathname.split('/').filter(Boolean);
      if (parts[1] && parts[1] !== 'highlights') return parts[1];
    }

    if (container) {
      const userLink = container.querySelector('header a[role="link"], a[href^="/"][role="link"], header a[href^="/"]');
      if (userLink) {
        const username = userLink.textContent.trim().replace(/^@/, '');
        if (username && !username.includes(' ') && username.length < 35) {
          return username;
        }
      }
    }

    const titleMatch = document.title.match(/@([a-zA-Z0-9._]+)/);
    if (titleMatch) return titleMatch[1];

    return 'instagram_user';
  }

  function extractDate(container) {
    if (container) {
      const timeEl = container.querySelector('time[datetime]');
      if (timeEl) {
        const iso = timeEl.getAttribute('datetime');
        if (iso) return new Date(iso);
      }
    }
    return new Date();
  }

  // =========================================================================
  // Download Action Handlers
  // =========================================================================

  async function handleStoryDownload(button) {
    setButtonLoading(button);
    try {
      const username = extractUsername(null);
      const date = extractDate(document);

      const videoEl = document.querySelector('section video, div[role="dialog"] video');
      if (videoEl) {
        let videoUrl = videoEl.currentSrc || videoEl.src;
        if (videoUrl.startsWith('blob:')) {
          videoUrl = findVideoFromReact(videoEl) || videoUrl;
        }
        if (videoUrl) {
          await triggerDownload(videoUrl, formatFilename(username, 'story', 'mp4', date));
          setButtonSuccess(button);
          return;
        }
      }

      const imgEl = document.querySelector('section img[srcset], section img[currentSrc]');
      if (imgEl) {
        const highResUrl = getHighestQualityFromSrcset(imgEl.getAttribute('srcset')) || imgEl.currentSrc || imgEl.src;
        if (highResUrl) {
          await triggerDownload(highResUrl, formatFilename(username, 'story', 'jpg', date));
          setButtonSuccess(button);
          return;
        }
      }
      setButtonError(button);
    } catch (e) {
      setButtonError(button);
    }
  }

  async function resolveActiveReelData() {
    const videos = Array.from(document.querySelectorAll('video'));
    let activeVideo = videos.find((v) => !v.paused && v.readyState > 1);

    if (!activeVideo && videos.length > 0) {
      const windowCenter = window.innerHeight / 2;
      let minDistance = Infinity;
      for (const v of videos) {
        const rect = v.getBoundingClientRect();
        if (rect.height > 100) {
          const vCenter = rect.top + rect.height / 2;
          const dist = Math.abs(vCenter - windowCenter);
          if (dist < minDistance) {
            minDistance = dist;
            activeVideo = v;
          }
        }
      }
      if (!activeVideo) activeVideo = videos[0];
    }

    const container = activeVideo ? (
      activeVideo.closest('div[data-pressable-container="true"]') ||
      activeVideo.closest('div.x1ypdohk') ||
      activeVideo.closest('article') ||
      activeVideo.closest('div[role="dialog"]') ||
      activeVideo.parentElement
    ) : null;

    const shortcode =
      window.IGTools?.activeReelCode ||
      extractShortcode(container) ||
      (activeVideo ? extractShortcode(activeVideo.parentElement) : null) ||
      extractShortcode(document);

    const mediaId = shortcode ? shortcodeToMediaId(shortcode) : null;
    const cached = shortcode ? mediaCache.get(shortcode) : null;
    let username = cached?.username || extractUsername(container);
    let date = cached?.taken_at ? new Date(cached.taken_at * 1000) : extractDate(container);

    let videoUrl = null;

    // Priority 1: Official Instagram media info API (guaranteed progressive 1080p MP4)
    if (mediaId) {
      console.log(`${LOG_PREFIX} Fetching official media info for Reel mediaId ${mediaId}...`);
      const info = await fetchMediaInfo(mediaId);
      if (info?.video_versions?.length > 0) {
        const sorted = [...info.video_versions].sort(
          (a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
        );
        videoUrl = sorted[0].url;
        if (info.user?.username) username = info.user.username;
        if (info.taken_at) date = new Date(info.taken_at * 1000);
        console.log(`${LOG_PREFIX} Retrieved highest quality 1080p MP4 from info API:`, videoUrl);
      }
    }

    // Priority 2: Query MAIN world bridge (React Fiber & page-level cache)
    if (!videoUrl) {
      console.log(`${LOG_PREFIX} Requesting Reel video from MAIN world (code: ${shortcode || 'auto'})...`);
      const mainResult = await requestVideoFromMainWorld(shortcode, mediaId);
      if (mainResult && mainResult.videoUrl) {
        videoUrl = mainResult.videoUrl;
        if (mainResult.username) username = mainResult.username;
        if (mainResult.taken_at) date = new Date(mainResult.taken_at * 1000);
      }
    }

    // Priority 3: Local content script media cache
    if (!videoUrl && cached?.video_versions?.length > 0) {
      const sorted = [...cached.video_versions].sort(
        (a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
      );
      videoUrl = sorted[0].url;
    }

    // Priority 4: OpenGraph meta tag
    if (!videoUrl) {
      const ogMeta = document.querySelector('meta[property="og:video"], meta[property="og:video:secure_url"]');
      if (ogMeta && ogMeta.content) {
        videoUrl = ogMeta.content;
      }
    }

    // Priority 5: Fallback to video element src if direct HTTP mp4 (not blob)
    if (!videoUrl && activeVideo) {
      const src = activeVideo.currentSrc || activeVideo.src;
      if (src && !src.startsWith('blob:')) {
        videoUrl = src;
      }
    }

    // Priority 6: Network performance entries (last resort fallback, filtering out DASH audio)
    if (!videoUrl) {
      const perfVideoUrl = findRecentVideoFromPerformance();
      if (perfVideoUrl) {
        console.log(`${LOG_PREFIX} Fallback: detected Reel video from performance entries:`, perfVideoUrl);
        videoUrl = perfVideoUrl;
      }
    }

    return {
      activeVideo,
      container,
      shortcode,
      mediaId,
      username,
      date,
      videoUrl
    };
  }

  async function downloadCurrentReel(button = null) {
    let textEl = button?.querySelector('.ig-tools-frb-text, .ig-tools-reel-native-text');
    let iconEl = button?.querySelector('.ig-tools-frb-icon, .ig-tools-reel-native-icon-box');

    if (button) {
      button.classList.add('ig-tools-btn-loading');
      if (textEl) textEl.textContent = 'Downloading...';
      if (iconEl) iconEl.innerHTML = `<span class="ig-tools-btn-spinner"></span>`;
    }

    try {
      const data = await resolveActiveReelData();
      if (data && data.videoUrl) {
        const filename = formatFilename(data.username, 'reel', 'mp4', data.date);
        console.log(`${LOG_PREFIX} Initiating Reel download:`, filename);
        const success = await triggerDownload(data.videoUrl, filename);
        if (success) {
          if (button) {
            button.classList.remove('ig-tools-btn-loading');
            button.classList.add('ig-tools-btn-success');
            if (textEl) textEl.textContent = 'Downloaded!';
            if (iconEl) iconEl.innerHTML = SVG_CHECK_ICON;
            setTimeout(() => {
              button.classList.remove('ig-tools-btn-success');
              if (textEl) textEl.textContent = 'Download';
              if (iconEl) iconEl.innerHTML = SVG_DOWNLOAD_ICON;
            }, 2500);
          }
          if (window.IGTools?.showToast) {
            window.IGTools.showToast(`📥 Downloaded ${filename}`);
          }
          return true;
        }
      }

      throw new Error('Could not resolve video stream URL');
    } catch (e) {
      console.error(`${LOG_PREFIX} Reel download exception:`, e);
      if (button) {
        button.classList.remove('ig-tools-btn-loading');
        button.classList.add('ig-tools-btn-error');
        if (textEl) textEl.textContent = 'Failed';
        if (iconEl) iconEl.innerHTML = '⚠️';
        setTimeout(() => {
          button.classList.remove('ig-tools-btn-error');
          if (textEl) textEl.textContent = 'Download';
          if (iconEl) iconEl.innerHTML = SVG_DOWNLOAD_ICON;
        }, 2500);
      }
      if (window.IGTools?.showToast) {
        window.IGTools.showToast('⚠️ Reel download failed');
      }
      return false;
    }
  }

  async function handleFloatingReelDownload(button) {
    return await downloadCurrentReel(button);
  }

  async function handlePostDownload(container, button, downloadAllCarousel = false) {
    setButtonLoading(button);
    try {
      const shortcode = extractShortcode(container);
      const cached = shortcode ? mediaCache.get(shortcode) : null;
      const username = cached?.username || extractUsername(container);
      const date = cached?.taken_at ? new Date(cached.taken_at * 1000) : extractDate(container);

      if (downloadAllCarousel && cached?.carousel_media?.length > 0) {
        let index = 1;
        for (const item of cached.carousel_media) {
          if (item.video_versions?.length > 0) {
            const url = item.video_versions[0].url;
            await triggerDownload(url, formatFilename(username, `carousel_${index}`, 'mp4', date));
          } else if (item.image_versions2?.candidates?.length > 0) {
            const url = item.image_versions2.candidates[0].url;
            await triggerDownload(url, formatFilename(username, `carousel_${index}`, 'jpg', date));
          }
          index++;
        }
        setButtonSuccess(button);
        return;
      }

      // Single item
      const videoEl = container.querySelector('video');
      if (videoEl) {
        let videoUrl = findVideoFromReact(videoEl) || (videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:') ? videoEl.currentSrc : null);
        if (!videoUrl && cached?.video_versions?.length > 0) {
          videoUrl = cached.video_versions[0].url;
        }
        if (videoUrl) {
          await triggerDownload(videoUrl, formatFilename(username, 'post', 'mp4', date));
          setButtonSuccess(button);
          return;
        }
      }

      const imgs = Array.from(container.querySelectorAll('img')).filter((img) => {
        const rect = img.getBoundingClientRect();
        return rect.width > 150 || (img.getAttribute('srcset') && !img.src.includes('avatar'));
      });

      if (imgs.length > 0) {
        const targetImg = imgs[0];
        const highResUrl = getHighestQualityFromSrcset(targetImg.getAttribute('srcset')) || targetImg.currentSrc || targetImg.src;
        if (highResUrl) {
          await triggerDownload(highResUrl, formatFilename(username, 'post', 'jpg', date));
          setButtonSuccess(button);
          return;
        }
      }

      setButtonError(button);
    } catch (e) {
      setButtonError(button);
    }
  }

  // Button state helpers
  function setButtonLoading(btn) {
    btn.classList.add('ig-tools-btn-loading');
    btn.innerHTML = `<span class="ig-tools-btn-spinner"></span>`;
  }

  function setButtonSuccess(btn) {
    btn.classList.remove('ig-tools-btn-loading');
    btn.classList.add('ig-tools-btn-success');
    btn.innerHTML = SVG_CHECK_ICON;
    setTimeout(() => {
      btn.classList.remove('ig-tools-btn-success');
      btn.innerHTML = SVG_DOWNLOAD_ICON;
    }, 2200);
  }

  function setButtonError(btn) {
    btn.classList.remove('ig-tools-btn-loading');
    btn.classList.add('ig-tools-btn-error');
    btn.innerHTML = `⚠️`;
    setTimeout(() => {
      btn.classList.remove('ig-tools-btn-error');
      btn.innerHTML = SVG_DOWNLOAD_ICON;
    }, 2200);
  }

  /**
   * Attaches pointer isolation to prevent triggering Instagram's video click-to-pause.
   */
  function isolateButtonEvents(btn, actionHandler) {
    const stopEvents = [
      'pointerdown', 'pointerup',
      'mousedown', 'mouseup',
      'touchstart', 'touchend'
    ];

    stopEvents.forEach((evtName) => {
      // Capture phase
      btn.addEventListener(
        evtName,
        (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
        },
        true
      );
      // Bubble phase
      btn.addEventListener(
        evtName,
        (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
        },
        false
      );
    });

    btn.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Check if video was playing and prevent pausing
        const root = btn.closest('article, div[role="dialog"], div.x1ypdohk') || btn.parentElement?.parentElement || document;
        const video = root.querySelector('video') || document.querySelector('video');
        const wasPlaying = video && !video.paused;

        if (wasPlaying && video) {
          const keepPlaying = () => {
            if (video.paused) {
              video.play().catch(() => {});
            }
          };
          requestAnimationFrame(keepPlaying);
          setTimeout(keepPlaying, 40);
          setTimeout(keepPlaying, 120);
          setTimeout(keepPlaying, 250);
          setTimeout(keepPlaying, 450);
        }

        actionHandler();
      },
      true
    );
  }

  // =========================================================================
  // UI Injections & Media Actions
  // =========================================================================

  function scanAndInjectButtons() {
    injectStoryButton();
    injectReelNativeActionButtons();
    updateFloatingReelButton();
    injectPostButtons();
  }

  function injectStoryButton() {
    if (!location.pathname.startsWith('/stories/')) return;

    const header = document.querySelector('section header, div[role="dialog"] header');
    if (!header || header.querySelector('.ig-tools-story-dl-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'ig-tools-glass-icon-btn ig-tools-story-dl-btn';
    btn.title = 'Download Story';
    btn.innerHTML = SVG_DOWNLOAD_ICON;

    isolateButtonEvents(btn, () => handleStoryDownload(btn));
    header.appendChild(btn);
  }

  /**
   * Injects the Download action directly into the Reel's native vertical action column
   * on the right side (alongside Like, Comment, Share, and Save).
   * Matches Instagram's native styling and isolates pointer events.
   * Guarantees EXACTLY ONE button per Reel.
   */
  function injectReelNativeActionButtons() {
    const isReelPage =
      location.pathname.startsWith('/reel/') ||
      location.pathname.startsWith('/reels/') ||
      location.pathname === '/reels' ||
      location.pathname === '/reels/';

    if (!isReelPage) return;

    // Clean up any floating reel button overlapping Messages widget
    const floatingBtn = document.getElementById('ig-tools-reel-floating-dl');
    if (floatingBtn) floatingBtn.remove();

    // Prefer Save bookmark button, fallback to Share button (NEVER Comment)
    let actionMarkers = Array.from(document.querySelectorAll('svg[aria-label="Save"], svg[aria-label="Remove"]'));
    if (actionMarkers.length === 0) {
      actionMarkers = Array.from(document.querySelectorAll('svg[aria-label="Share Post"], svg[aria-label="Share"]'));
    }

    actionMarkers.forEach((svg) => {
      const actionBtn = svg.closest('div[role="button"], button');
      if (!actionBtn) return;

      const actionItemWrapper = actionBtn.parentElement;
      if (!actionItemWrapper) return;

      const columnContainer = actionItemWrapper.parentElement;
      if (!columnContainer) return;

      // Check the entire reel container to ensure ONLY ONE download button per reel
      const reelRoot =
        actionBtn.closest('article, div[role="dialog"], div.x1ypdohk') ||
        actionBtn.closest('div[data-pressable-container="true"]')?.parentElement ||
        columnContainer.parentElement;

      if (reelRoot && reelRoot.querySelector('.ig-tools-reel-native-action-wrapper')) {
        // Clean up any duplicates in this reel
        const duplicates = reelRoot.querySelectorAll('.ig-tools-reel-native-action-wrapper');
        if (duplicates.length > 1) {
          for (let i = 1; i < duplicates.length; i++) duplicates[i].remove();
        }
        return;
      }

      if (columnContainer.querySelector('.ig-tools-reel-native-action-wrapper')) {
        return;
      }

      const dlItem = document.createElement('div');
      dlItem.className = 'ig-tools-reel-native-action-wrapper';
      dlItem.setAttribute('role', 'button');
      dlItem.setAttribute('tabindex', '0');
      dlItem.setAttribute('title', 'Download Reel (Highest 1080p Quality)');

      dlItem.innerHTML = `
        <div class="ig-tools-reel-native-icon-box">
          <svg class="ig-tools-reel-native-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </div>
        <span class="ig-tools-reel-native-text">Download</span>
      `;

      isolateButtonEvents(dlItem, async () => {
        await downloadCurrentReel(dlItem);
      });

      if (actionItemWrapper.nextSibling) {
        columnContainer.insertBefore(dlItem, actionItemWrapper.nextSibling);
      } else {
        columnContainer.appendChild(dlItem);
      }
    });
  }

  /**
   * Permanently removed floating pill button to avoid overlapping Instagram's bottom-right Messages bar.
   */
  function updateFloatingReelButton() {
    const btn = document.getElementById('ig-tools-reel-floating-dl');
    if (btn) btn.remove();
  }

  function injectPostButtons() {
    // Remove any leftover overlay buttons covering profile avatars
    document.querySelectorAll('.ig-tools-post-overlay-dl').forEach((el) => el.remove());

    const articles = document.querySelectorAll('article:not([data-ig-tools-post-injected])');

    articles.forEach((article) => {
      article.dataset.igToolsPostInjected = 'true';

      if (article.querySelector('.ig-tools-post-dl-container')) return;

      const container = document.createElement('div');
      container.className = 'ig-tools-post-dl-container';

      const btnSingle = document.createElement('button');
      btnSingle.className = 'ig-tools-post-bar-btn';
      btnSingle.title = 'Download Media';
      btnSingle.setAttribute('aria-label', 'Download Media');
      btnSingle.innerHTML = SVG_DOWNLOAD_ICON;

      isolateButtonEvents(btnSingle, () => handlePostDownload(article, btnSingle, false));
      container.appendChild(btnSingle);

      // Only add Carousel All Button if article genuinely has multiple carousel slides
      const carouselDots = article.querySelector('div._aaoe, div._acaz, div._aamf, div[aria-label*="Next"]');
      if (carouselDots) {
        const btnAll = document.createElement('button');
        btnAll.className = 'ig-tools-carousel-pill-btn';
        btnAll.title = 'Download All Items in Carousel';
        btnAll.setAttribute('aria-label', 'Download All Items in Carousel');
        btnAll.innerHTML = `All`;

        isolateButtonEvents(btnAll, () => handlePostDownload(article, btnAll, true));
        container.appendChild(btnAll);
      }

      // 1. Locate the native action button row inside the article
      const shareSvg = article.querySelector(
        'svg[aria-label*="Share" i], svg[aria-label*="Trimite" i], svg[aria-label*="Partajeaz" i], svg[aria-label*="Teilen" i]'
      );
      if (shareSvg) {
        const shareBtn = shareSvg.closest('button, div[role="button"]');
        if (shareBtn && shareBtn.parentElement) {
          const anchorSpan = shareBtn.closest('span') || shareBtn;
          if (anchorSpan.nextSibling) {
            anchorSpan.parentElement.insertBefore(container, anchorSpan.nextSibling);
          } else {
            anchorSpan.parentElement.appendChild(container);
          }
          return;
        }
      }

      // 2. Fallback to Save button on the right
      const saveSvg = article.querySelector(
        'svg[aria-label*="Save" i], svg[aria-label*="Salveaz" i], svg[aria-label*="Salvați" i], svg[aria-label*="Speichern" i]'
      );
      if (saveSvg) {
        const saveBtn = saveSvg.closest('button, div[role="button"]');
        if (saveBtn && saveBtn.parentElement) {
          const anchorSpan = saveBtn.closest('span') || saveBtn;
          anchorSpan.parentElement.insertBefore(container, anchorSpan);
          return;
        }
      }

      // 3. Fallback to first row of section
      const actionSection = article.querySelector('section');
      if (actionSection) {
        const firstRow = actionSection.querySelector('div:has(button), div:has(div[role="button"])') || actionSection.firstElementChild || actionSection;
        firstRow.appendChild(container);
      }
    });
  }

  // =========================================================================
  // Media Utility API
  // =========================================================================

  function setPlaybackSpeed(speed) {
    const num = parseFloat(speed);
    if (isNaN(num)) return 1;
    const videos = Array.from(document.querySelectorAll('video'));
    let activeVideo = videos.find((v) => !v.paused && v.readyState > 1) || videos[0];
    if (activeVideo) {
      activeVideo.playbackRate = num;
      console.log(`${LOG_PREFIX} Video playback speed set to ${num}x`);
      if (window.IGTools?.showToast) {
        window.IGTools.showToast(`⚡ Playback Speed: ${num}x`);
      }
      return num;
    }
    return 1;
  }

  function getPlaybackSpeed() {
    const videos = Array.from(document.querySelectorAll('video'));
    let activeVideo = videos.find((v) => !v.paused && v.readyState > 1) || videos[0];
    return activeVideo ? activeVideo.playbackRate : 1;
  }

  async function copyDirectMediaUrl() {
    try {
      const data = await resolveActiveReelData();
      if (data && data.videoUrl) {
        await navigator.clipboard.writeText(data.videoUrl);
        if (window.IGTools?.showToast) {
          window.IGTools.showToast('📋 Direct video link copied!');
        }
        return data.videoUrl;
      }

      const activeVideo = document.querySelector('article video, section video');
      if (activeVideo && activeVideo.src && !activeVideo.src.startsWith('blob:')) {
        await navigator.clipboard.writeText(activeVideo.src);
        if (window.IGTools?.showToast) {
          window.IGTools.showToast('📋 Direct video link copied!');
        }
        return activeVideo.src;
      }

      const activeImg = document.querySelector('article img[srcset], section img[srcset]');
      if (activeImg) {
        const url = getHighestQualityFromSrcset(activeImg.getAttribute('srcset')) || activeImg.currentSrc || activeImg.src;
        if (url) {
          await navigator.clipboard.writeText(url);
          if (window.IGTools?.showToast) {
            window.IGTools.showToast('📋 Direct image link copied!');
          }
          return url;
        }
      }
    } catch (e) {
      console.warn(`${LOG_PREFIX} Failed to copy media link:`, e);
    }
    if (window.IGTools?.showToast) {
      window.IGTools.showToast('⚠️ Could not copy media link');
    }
    return null;
  }

  async function downloadHighlights() {
    const storyBtn = document.querySelector('.ig-tools-story-dl-btn');
    if (storyBtn) {
      await handleStoryDownload(storyBtn);
      return true;
    }
    if (location.pathname.includes('/highlights/') || location.pathname.startsWith('/stories/')) {
      const dummyBtn = document.createElement('button');
      await handleStoryDownload(dummyBtn);
      return true;
    }
    if (window.IGTools?.showToast) {
      window.IGTools.showToast('ℹ️ Please open a Highlight story to download');
    }
    return false;
  }

  return {
    init,
    scanAndInjectButtons,
    formatFilename,
    downloadCurrentReel,
    resolveActiveReelData,
    setPlaybackSpeed,
    getPlaybackSpeed,
    copyDirectMediaUrl,
    downloadHighlights
  };
})();
