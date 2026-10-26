/**
 * IG Tools - Ghost Mode Interceptor (Main World Script)
 * Complete interception of read receipts for Stories and Direct Messages (DMs).
 * Intercepts Fetch, XMLHttpRequest, Navigator.sendBeacon, and WebSockets in page context.
 */

(() => {
  const LOG_PREFIX = '[IG Tools] [Ghost Mode]';

  if (window.__IG_TOOLS_GHOST_INITIALIZED__) {
    return;
  }
  window.__IG_TOOLS_GHOST_INITIALIZED__ = true;

  // 1. Immediately eliminate SharedWorker so Instagram never connects to background workers
  try {
    delete window.SharedWorker;
  } catch (e) {}
  try {
    if (window.__proto__) delete window.__proto__.SharedWorker;
  } catch (e) {}
  try {
    Object.defineProperty(window, 'SharedWorker', {
      get() { return undefined; },
      set() {},
      configurable: false
    });
  } catch (e) {}

  // 2. Unregister any active Service Workers so background workers cannot leak seen receipts
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister().catch(() => {});
        }
      }).catch(() => {});
    } catch (e) {}
  }

  // Active configuration (restored synchronously from localStorage fallback)
  let config = {
    ghostMode: true,
    ghostStories: true,
    ghostDMs: true
  };

  try {
    const cached = localStorage.getItem('ig_tools_ghost_config');
    if (cached) {
      const parsed = JSON.parse(cached);
      config = { ...config, ...parsed };
    }
  } catch (err) {}

  // Real-time config sync from isolated content script
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'IG_TOOLS_SYNC_CONFIG') {
      return;
    }
    const newConfig = event.data.config;
    if (newConfig) {
      config = { ...config, ...newConfig };
      try {
        localStorage.setItem('ig_tools_ghost_config', JSON.stringify(config));
      } catch (e) {}
      console.log(`${LOG_PREFIX} Configuration synchronized:`, config);
    }
  });

  // Real-time audio preference sync (keeps videos unmuted across Reels in MAIN world)
  let isGlobalUnmuted = false;
  try {
    const savedMuted = localStorage.getItem('ig_tools_muted');
    if (savedMuted === 'false') {
      isGlobalUnmuted = true;
    }
  } catch (e) {}

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'IG_TOOLS_SET_AUDIO_PREF') {
      isGlobalUnmuted = Boolean(event.data.unmuted);
      if (isGlobalUnmuted) {
        const videos = document.querySelectorAll('video');
        for (const v of videos) {
          if (!v.paused && v.muted) {
            v.muted = false;
          }
        }
      }
    }
  });

  // Whenever a video starts playing in MAIN world, keep it unmuted if preference is ON
  document.addEventListener('play', (e) => {
    if (e.target && e.target.tagName === 'VIDEO' && isGlobalUnmuted) {
      if (e.target.muted) {
        e.target.muted = false;
      }
    }
  }, true);

  /**
   * Helper to safely extract string payload from request body across all data types.
   */
  async function extractBodyTextAsync(body) {
    if (!body) return '';
    try {
      if (typeof body === 'string') return body;
      if (body instanceof URLSearchParams) return body.toString();
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const parts = [];
        for (const [key, val] of body.entries()) {
          if (typeof val === 'string') parts.push(`${key}=${val}`);
          else if (val && typeof val.name === 'string') parts.push(`${key}=${val.name}`);
        }
        return parts.join('&');
      }
      if (body instanceof Blob) return await body.text();
      if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
    } catch (e) {}
    return '';
  }

  function extractBodyTextSync(body) {
    if (!body) return '';
    try {
      if (typeof body === 'string') return body;
      if (body instanceof URLSearchParams) return body.toString();
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const parts = [];
        for (const [key, val] of body.entries()) {
          if (typeof val === 'string') parts.push(`${key}=${val}`);
        }
        return parts.join('&');
      }
    } catch (e) {}
    return '';
  }

  /**
   * Evaluates if request is a Story seen request.
   */
  function isStorySeenRequest(url, method, bodyText) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();

    // REST endpoints
    if (
      lowerUrl.includes('/api/v1/stories/reel/seen') ||
      lowerUrl.includes('/api/v1/stories/seen') ||
      lowerUrl.includes('/stories/reel/seen') ||
      /\/api\/v1\/media\/[^/]+\/seen/i.test(lowerUrl)
    ) {
      return true;
    }

    // GraphQL endpoints
    if (lowerUrl.includes('/graphql/query') || lowerUrl.includes('/api/graphql')) {
      if (bodyText) {
        const lowerBody = bodyText.toLowerCase();
        if (
          (lowerBody.includes('polarisstories') && lowerBody.includes('seen')) ||
          lowerBody.includes('storiesseenmutation') ||
          lowerBody.includes('stories_reel_seen') ||
          (lowerBody.includes('reel_seen_timestamp') && lowerBody.includes('reel_id'))
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Evaluates if request is a Direct Message (DM) seen / read receipt request.
   * Strictly targets POST seen mutations and NEVER blocks GET or message queries.
   */
  /**
   * Evaluates if request is a Direct Message (DM) seen / read receipt request.
   * Strictly targets POST seen mutations and NEVER blocks GET or message queries.
   */
  function isDMSeenRequest(url, method, bodyText, friendlyName = '') {
    if (!url) return false;
    // Seen receipts are ALWAYS POST requests. GET requests fetch conversations/inbox!
    if (method !== 'POST') return false;

    const lowerUrl = url.toLowerCase();
    const lowerBody = (bodyText || '').toLowerCase();
    const lowerFn = (friendlyName || '').toLowerCase();
    const combined = lowerUrl + ' ' + lowerBody + ' ' + lowerFn;

    // Safe-guard 1: NEVER intercept message sending
    if (
      lowerBody.includes('client_context') ||
      lowerBody.includes('send_message') ||
      lowerBody.includes('createmessage') ||
      lowerBody.includes('mutation_token') ||
      (lowerBody.includes('action%22%3A%22send') || lowerBody.includes('action":"send')) ||
      lowerFn.includes('sendmessage') ||
      lowerFn.includes('createmessage')
    ) {
      return false;
    }

    // Safe-guard 2: NEVER intercept conversation queries or message loading
    if (
      lowerBody.includes('directthreadquery') ||
      lowerBody.includes('polarisdirectthreadquery') ||
      lowerBody.includes('polarisdirectinbox') ||
      lowerBody.includes('messagelistquery') ||
      lowerBody.includes('fetchthread') ||
      lowerBody.includes('%22cursor%22') ||
      lowerBody.includes('"cursor"') ||
      lowerFn.includes('directthreadquery') ||
      lowerFn.includes('polarisdirectthreadquery') ||
      lowerFn.includes('polarisdirectinbox') ||
      lowerFn.includes('messagelist')
    ) {
      return false;
    }

    // 1. Explicit REST endpoints for DM seen receipts
    if (
      (lowerUrl.includes('/api/v1/direct_v2/threads/') && (lowerUrl.includes('seen') || lowerUrl.includes('read'))) ||
      lowerUrl.includes('/direct_v2/threads/batched_seen') ||
      lowerUrl.includes('/direct_v2/threads/activity_status_seen') ||
      lowerUrl.includes('/direct_v2/visual_threads/item_seen') ||
      lowerUrl.includes('/seen_direct_thread') ||
      lowerUrl.includes('/direct_v2/threads/item_seen')
    ) {
      return true;
    }

    // 2. Direct telemetry pings specifically reporting thread seen
    if (
      (lowerUrl.includes('logging_client_events') || lowerUrl.includes('/ajax/bz')) &&
      (
        lowerBody.includes('direct_v2_seen') ||
        lowerBody.includes('mark_thread_seen') ||
        lowerBody.includes('thread_item_seen') ||
        lowerBody.includes('watermark')
      )
    ) {
      return true;
    }

    // 3. GraphQL mutations for DM seen receipts (blocks primary and validation mutations)
    if (lowerUrl.includes('/graphql/query') || lowerUrl.includes('/api/graphql')) {
      const dmKeywords = [
        'useigdmarkthreadasread',
        'igdmarkthreadasread',
        'markthreadasread',
        'markthreaditemseen',
        'readvalidation',
        'validation',
        'polarisdirectmarkthreadseen',
        'polarisdirectthreadseen',
        'polarisdirectseen',
        'directmutationmarkthreaditemseen',
        'directthreadseen',
        'polarisdirectmutationmarkthreaditemseen',
        'polarisdirectvisualitemseen',
        'polarisdirectmarkvisualmessageseen',
        'polarisdirectmarkactivityseen',
        'usedirectmutationmarkthreaditemseen',
        'direct_v2_seen',
        'direct_v2_threads_seen',
        'mark_thread_seen',
        'mark_thread_read'
      ];

      for (const keyword of dmKeywords) {
        if (combined.includes(keyword)) {
          return true;
        }
      }

      // Watermark confirmations
      if (
        (combined.includes('thread_id') || combined.includes('thread_fbid')) &&
        (combined.includes('watermark') || combined.includes('seen_watermark') || combined.includes('read_watermark'))
      ) {
        return true;
      }
    }

    return false;
  }

  function notifyBlocked(targetType, url) {
    try {
      window.postMessage(
        {
          type: 'IG_TOOLS_SEEN_BLOCKED',
          targetType, // 'story' or 'dm'
          url,
          timestamp: Date.now()
        },
        '*'
      );
    } catch (e) {}
  }

  function createSyntheticResponse(url) {
    const isGraphQL = url.includes('/graphql') || url.includes('/api/graphql');
    const mockData = isGraphQL
      ? {
          data: {
            useIGDMarkThreadAsReadMutation: { status: 'ok', client_mutation_id: '1' },
            useIGDMarkThreadAsReadValidationMutation: { status: 'ok', client_mutation_id: '1' },
            igd_mark_thread_as_read: { status: 'ok' },
            mark_thread_seen: { status: 'ok', client_mutation_id: '1' },
            useDirectMutationMarkThreadItemSeen: { status: 'ok' },
            polaris_direct_mark_thread_seen: { status: 'ok' },
            PolarisStoriesV3SeenMutation: { status: 'ok' },
            xgrade: { status: 'ok' }
          },
          status: 'ok'
        }
      : {
          status: 'ok',
          message: 'ok'
        };

    return new Response(JSON.stringify(mockData), {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json',
        'X-IG-Tools-Ghost': 'true'
      })
    });
  }

  // =========================================================================
  // 1. Intercept window.fetch
  // =========================================================================
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const input = args[0];
    const init = args[1] || {};

    let url = '';
    let method = 'GET';
    let bodyText = '';
    let friendlyName = '';

    try {
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input && typeof input.url === 'string') {
        url = input.url;
        method = input.method || 'GET';
      }

      if (init.method) {
        method = init.method.toUpperCase();
      } else {
        method = method.toUpperCase();
      }

      if (init && init.headers) {
        if (typeof init.headers.get === 'function') {
          friendlyName = init.headers.get('x-fb-friendly-name') || '';
        } else if (typeof init.headers === 'object') {
          friendlyName = init.headers['x-fb-friendly-name'] || init.headers['X-FB-Friendly-Name'] || '';
        }
      } else if (input instanceof Request && input.headers) {
        friendlyName = input.headers.get('x-fb-friendly-name') || '';
      }
      if (init && init.headers) {
        let csrf = '';
        if (typeof init.headers.get === 'function') {
          csrf = init.headers.get('x-csrftoken') || '';
        } else if (typeof init.headers === 'object') {
          csrf = init.headers['x-csrftoken'] || init.headers['X-CSRFToken'] || '';
        }
        if (csrf) document.documentElement.dataset.igToolsCsrfToken = csrf;
      }
      if (!friendlyName && url) {
        const fnMatch = url.match(/[?&]fb_api_req_friendly_name=([^&]+)/);
        if (fnMatch) friendlyName = decodeURIComponent(fnMatch[1]);
      }

      if (init.body) {
        bodyText = await extractBodyTextAsync(init.body);
      } else if (input instanceof Request) {
        try {
          bodyText = await input.clone().text();
        } catch (e) {}
      }
    } catch (e) {}

    const isGhostOn = Boolean(config.ghostMode);
    const blockStories = isGhostOn && Boolean(config.ghostStories);
    const blockDMs = isGhostOn && Boolean(config.ghostDMs);

    // Story Seen
    if (blockStories && isStorySeenRequest(url, method, bodyText, friendlyName)) {
      console.warn(`${LOG_PREFIX} 👻 Blocked Story "seen" fetch:`, url);
      notifyBlocked('story', url);
      return createSyntheticResponse(url);
    }

    // DM Seen
    if (blockDMs && isDMSeenRequest(url, method, bodyText, friendlyName)) {
      console.warn(`${LOG_PREFIX} 👻 Blocked DM "seen" fetch:`, url, friendlyName);
      notifyBlocked('dm', url);
      return createSyntheticResponse(url);
    }

    const response = await originalFetch.apply(this, args);

    // Cache media metadata and video CDN stream URLs for downloader (filter out audio-only streams)
    try {
      const lowerUrl = url.toLowerCase();
      if (
        (lowerUrl.includes('cdninstagram.com') || lowerUrl.includes('fbcdn.net')) &&
        (lowerUrl.includes('.mp4') || lowerUrl.includes('/o1/v/') || lowerUrl.includes('/v/t')) &&
        !lowerUrl.includes('audio') &&
        !lowerUrl.includes('mime_type=audio') &&
        !lowerUrl.includes('/t50.2886-16/')
      ) {
        const cleanUrl = url.replace(/([?&])bytestart=\d+(&byteend=\d+)?(&|$)/i, '$1').replace(/[?&]$/, '');
        window.__igToolsLastVideoUrl = cleanUrl;
      }

      if (
        (lowerUrl.includes('/graphql/query') || lowerUrl.includes('/api/v1/')) &&
        response.status === 200 &&
        response.headers.get('content-type')?.includes('application/json')
      ) {
        response.clone().json().then((json) => {
          extractAndCacheMedia(json);
        }).catch(() => {});
      }
    } catch (e) {}

    return response;
  };

  window.__igToolsMediaCache = window.__igToolsMediaCache || new Map();

  function extractAndCacheMedia(data) {
    if (!data || typeof data !== 'object') return;

    function walk(node, depth = 0) {
      if (!node || typeof node !== 'object' || depth > 12) return;

      if (node.shortcode || node.code || (node.id && (node.video_versions || node.image_versions2 || node.carousel_media))) {
        const itemCode = node.shortcode || node.code || (node.id ? String(node.id) : null);
        if (itemCode) {
          let likers = node.facepile_top_likers || node.top_likers || node.likers || [];
          if ((!likers || likers.length === 0) && node.edge_media_preview_like?.edges?.length > 0) {
            likers = node.edge_media_preview_like.edges.map((e) => e.node).filter(Boolean);
          }
          if ((!likers || likers.length === 0) && node.edge_liked_by?.edges?.length > 0) {
            likers = node.edge_liked_by.edges.map((e) => e.node).filter(Boolean);
          }
          const mediaPayload = {
            id: node.id ? String(node.id) : (node.pk ? String(node.pk) : undefined),
            shortcode: node.shortcode || node.code || String(itemCode),
            username: node.user?.username || node.owner?.username,
            taken_at: node.taken_at_timestamp || node.taken_at,
            media_type: node.media_type,
            video_versions: node.video_versions,
            image_versions2: node.image_versions2,
            carousel_media: node.carousel_media || (node.edge_sidecar_to_children?.edges?.map((e) => e.node)),
            friendsLiked: Array.isArray(likers) ? likers : []
          };

          // Cache in page global map for instant access across multiple identifiers
          window.__igToolsMediaCache.set(String(itemCode), mediaPayload);
          if (node.shortcode) window.__igToolsMediaCache.set(String(node.shortcode), mediaPayload);
          if (node.code) window.__igToolsMediaCache.set(String(node.code), mediaPayload);
          if (node.id) window.__igToolsMediaCache.set(String(node.id), mediaPayload);
          if (node.pk) window.__igToolsMediaCache.set(String(node.pk), mediaPayload);

          try {
            window.postMessage({
              type: 'IG_TOOLS_MEDIA_METADATA',
              code: String(itemCode),
              shortcode: node.shortcode || node.code || String(itemCode),
              data: mediaPayload
            }, '*');
          } catch (e) {}
        }
      }

      for (const key of Object.keys(node)) {
        if (typeof node[key] === 'object' && node[key] !== null) {
          walk(node[key], depth + 1);
        }
      }
    }

    try {
      walk(data);
    } catch (e) {}
  }

  // Deep React Fiber traversal on DOM elements (runs in MAIN world with full object access)
  function extractVideoFromElementFiber(el) {
    if (!el) return null;

    const reelContainer =
      el.closest?.('article') ||
      el.closest?.('div[role="dialog"]') ||
      el.closest?.('div[data-pressable-container="true"]')?.parentElement ||
      el.closest?.('div[data-pressable-container="true"]') ||
      el.parentElement?.parentElement?.parentElement?.parentElement ||
      el.parentElement;

    const actionButtons = reelContainer ? Array.from(reelContainer.querySelectorAll?.('div[role="button"], button') || []) : [];

    // Prioritize el and reelContainer so we inspect actual video component before generic buttons
    const candidates = [
      el,
      el.parentElement,
      el.parentElement?.parentElement,
      el.parentElement?.parentElement?.parentElement,
      el.closest?.('div[data-pressable-container="true"]'),
      reelContainer,
      ...actionButtons
    ].filter(Boolean);

    function inspectCandidate(cand) {
      if (!cand || typeof cand !== 'object') return null;

      const target = cand.media || cand.clip || cand.item || cand.post || cand.node || cand;
      if (!target || typeof target !== 'object') return null;

      const rawCode = target.code || target.shortcode || cand.code || cand.shortcode || cand.clip?.code;
      const rawId = target.pk || target.id || target.pk_id || target.media_id || target.mediaId || target.clipId || cand.pk || cand.id;

      const validCode = (typeof rawCode === 'string' && /^[A-Za-z0-9_-]{7,25}$/.test(rawCode)) ? rawCode : null;
      const validId = (rawId && /^\d{7,25}$/.test(String(rawId))) ? String(rawId) : null;

      let likers = target.facepile_top_likers || target.top_likers || target.likers ||
                   cand.facepile_top_likers || cand.top_likers || cand.likers || [];
      if ((!likers || likers.length === 0) && (target.edge_media_preview_like?.edges?.length > 0 || cand.edge_media_preview_like?.edges?.length > 0)) {
        const edges = target.edge_media_preview_like?.edges || cand.edge_media_preview_like?.edges || [];
        likers = edges.map((e) => e.node).filter(Boolean);
      }
      if ((!likers || likers.length === 0) && (target.edge_liked_by?.edges?.length > 0 || cand.edge_liked_by?.edges?.length > 0)) {
        const edges = target.edge_liked_by?.edges || cand.edge_liked_by?.edges || [];
        likers = edges.map((e) => e.node).filter(Boolean);
      }
      const uName = target.user?.username || target.owner?.username || cand.user?.username || cand.owner?.username;
      const taken = target.taken_at_timestamp || target.taken_at || cand.taken_at_timestamp || cand.taken_at;
      const versions = target.video_versions || cand.video_versions;
      const duration = target.video_duration || target.duration || cand.video_duration || cand.duration;

      let score = 0;
      if (Array.isArray(likers) && likers.length > 0) score += 80;
      if (Array.isArray(versions) && versions.length > 0) score += 50;
      if (validCode) score += 40;
      if (typeof duration === 'number' && duration > 0) score += 25;
      if (uName) score += 20;
      if (validId) score += 10;

      // Reject shallow DOM objects that only have an arbitrary numeric id
      if (score < 30) return null;

      return {
        score,
        shortcode: validCode,
        mediaId: validId,
        friendsLiked: Array.isArray(likers) ? likers : [],
        video_versions: Array.isArray(versions) ? versions : [],
        videoUrl: versions?.[0]?.url || target.videoUrl || target.video_url || cand.videoUrl || null,
        videoDuration: (typeof duration === 'number' && duration > 0) ? duration : null,
        username: uName,
        taken_at: taken
      };
    }

    let bestFound = null;
    let highestScore = 0;

    for (const target of candidates) {
      const keys = Object.keys(target);
      const fiberKey = keys.find((k) => k.startsWith('__reactFiber')) || keys.find((k) => k.startsWith('__reactProps'));
      if (!fiberKey) continue;

      let curr = target[fiberKey];
      if (fiberKey.startsWith('__reactProps')) {
        const altFiber = keys.find((k) => k.startsWith('__reactFiber'));
        if (altFiber) curr = target[altFiber];
      }

      let depth = 0;
      while (curr && depth < 80) {
        const props = curr.memoizedProps || curr.props;
        if (props) {
          const propCandidates = [
            props.media,
            props.clip,
            props.item,
            props.post,
            props.videoData,
            props.reel,
            props.node,
            props.clipItem,
            props.feedItem,
            props.targetItem,
            props.data?.node,
            props.data?.media,
            props.data?.clip,
            props.data?.item,
            props.data,
            props
          ];

          for (const cand of propCandidates) {
            const found = inspectCandidate(cand);
            if (found && found.score > highestScore) {
              highestScore = found.score;
              bestFound = found;
              if (highestScore >= 130) break;
            }
          }
          if (highestScore >= 130) break;
        }

        // Check hook state chain (Relay useFragment)
        let hook = curr.memoizedState;
        let hookDepth = 0;
        while (hook && hookDepth < 20) {
          const hVal = hook.memoizedState;
          if (hVal && typeof hVal === 'object') {
            const found = inspectCandidate(hVal);
            if (found && found.score > highestScore) {
              highestScore = found.score;
              bestFound = found;
              if (highestScore >= 130) break;
            }
            if (hVal.media || hVal.clip || hVal.node || hVal.item) {
              const subFound = inspectCandidate(hVal.media || hVal.clip || hVal.node || hVal.item);
              if (subFound && subFound.score > highestScore) {
                highestScore = subFound.score;
                bestFound = subFound;
                if (highestScore >= 130) break;
              }
            }
          }
          hook = hook.next;
          hookDepth++;
        }
        if (highestScore >= 130) break;

        curr = curr.return;
        depth++;
      }
      if (highestScore >= 130) break;
    }

    return bestFound;
  }

  let lastSentStateKey = null;

  function syncActiveReelMetadataToDom() {
    try {
      const videos = Array.from(document.querySelectorAll('video'));
      const visibleVideos = videos.filter((v) => {
        const r = v.getBoundingClientRect();
        return r.height > 80 && r.bottom > 80 && r.top < window.innerHeight - 80;
      });

      let activeVideo = visibleVideos.find((v) => !v.paused);
      if (!activeVideo && visibleVideos.length > 0) {
        const windowCenter = window.innerHeight / 2;
        let minDistance = Infinity;
        for (const v of visibleVideos) {
          const r = v.getBoundingClientRect();
          const dist = Math.abs((r.top + r.height / 2) - windowCenter);
          if (dist < minDistance) {
            minDistance = dist;
            activeVideo = v;
          }
        }
      }
      if (!activeVideo && videos.length > 0) activeVideo = videos[0];
      if (!activeVideo) return;

      const fiberData = extractVideoFromElementFiber(activeVideo);
      if (fiberData) {
        if (fiberData.shortcode) {
          document.documentElement.dataset.igToolsActiveShortcode = String(fiberData.shortcode);
          activeVideo.dataset.igShortcode = String(fiberData.shortcode);
        }
        if (fiberData.mediaId) {
          document.documentElement.dataset.igToolsActiveMediaId = String(fiberData.mediaId);
          activeVideo.dataset.igMediaId = String(fiberData.mediaId);
        }
        if (fiberData.videoDuration) {
          document.documentElement.dataset.igToolsActiveDuration = String(fiberData.videoDuration);
          activeVideo.dataset.igDuration = String(fiberData.videoDuration);
        }
        if (fiberData.username) {
          document.documentElement.dataset.igToolsActiveAuthor = String(fiberData.username);
          activeVideo.dataset.igAuthor = String(fiberData.username);
        }
        if (Array.isArray(fiberData.friendsLiked)) {
          const strFriends = JSON.stringify(fiberData.friendsLiked);
          document.documentElement.dataset.igToolsActiveFriends = strFriends;
          activeVideo.dataset.igFriends = strFriends;
        }

        const stateKey = `${fiberData.shortcode || fiberData.mediaId}_${fiberData.username || ''}_${(fiberData.friendsLiked || []).length}`;
        if (lastSentStateKey !== stateKey) {
          lastSentStateKey = stateKey;
          window.postMessage(
            {
              type: 'IG_TOOLS_ACTIVE_REEL_UPDATE',
              shortcode: fiberData.shortcode,
              mediaId: fiberData.mediaId,
              duration: fiberData.videoDuration,
              author: fiberData.username,
              friendsLiked: fiberData.friendsLiked || []
            },
            '*'
          );
        }
      }
    } catch (e) {}
  }

  window.addEventListener('scroll', syncActiveReelMetadataToDom, { passive: true });
  window.addEventListener('play', syncActiveReelMetadataToDom, true);
  setInterval(syncActiveReelMetadataToDom, 350);

  // On-demand video extraction responder for content script downloader
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'IG_TOOLS_REQUEST_REEL_VIDEO') {
      return;
    }
    const { requestId, shortcode, mediaId } = event.data;
    let found = null;

    // 1. Check in-memory cache
    if (shortcode && window.__igToolsMediaCache.has(String(shortcode))) {
      found = window.__igToolsMediaCache.get(String(shortcode));
    } else if (mediaId && window.__igToolsMediaCache.has(String(mediaId))) {
      found = window.__igToolsMediaCache.get(String(mediaId));
    }

    // 2. Inspect active video element's React Fiber
    if (!found || (!found.videoUrl && !found.video_versions)) {
      const videos = Array.from(document.querySelectorAll('video'));
      const activeVideo = videos.find((v) => !v.paused && v.readyState > 1) || videos[0];
      if (activeVideo) {
        const fiberData = extractVideoFromElementFiber(activeVideo);
        if (fiberData) {
          found = fiberData;
        }
      }
    }

    // 3. Fallback to last detected video URL from CDN stream
    if (!found || (!found.videoUrl && !found.video_versions)) {
      if (window.__igToolsLastVideoUrl) {
        found = { videoUrl: window.__igToolsLastVideoUrl };
      }
    }

    let finalUrl = null;
    if (found?.video_versions?.length > 0) {
      const sorted = [...found.video_versions].sort(
        (a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
      );
      finalUrl = sorted[0].url;
    }
    if (!finalUrl) {
      finalUrl = found?.videoUrl || found?.url || null;
    }
    const username = found?.username || found?.user?.username || found?.owner?.username || null;
    const taken_at = found?.taken_at || found?.taken_at_timestamp || null;

    window.postMessage({
      type: 'IG_TOOLS_RESPONSE_REEL_VIDEO',
      requestId,
      success: Boolean(finalUrl),
      videoUrl: finalUrl,
      username,
      taken_at
    }, '*');
  });

  // On-demand metadata request from content scripts (friends-liked, reel-slider, download)
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'IG_TOOLS_REQUEST_ACTIVE_REEL_METADATA') {
      return;
    }
    const videos = Array.from(document.querySelectorAll('video'));
    const activeVideo = videos.find((v) => !v.paused && v.readyState > 1) || videos[0];
    if (activeVideo) {
      const fiberData = extractVideoFromElementFiber(activeVideo);
      if (fiberData) {
        window.postMessage({
          type: 'IG_TOOLS_ACTIVE_REEL_UPDATE',
          shortcode: fiberData.shortcode,
          mediaId: fiberData.mediaId,
          friendsLiked: fiberData.friendsLiked || []
        }, '*');
      }
    }
  });

  // =========================================================================
  // 2. Intercept window.XMLHttpRequest
  // =========================================================================
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
    if (typeof header === 'string' && header.toLowerCase() === 'x-fb-friendly-name') {
      this._igToolsFriendlyName = value;
    }
    return originalSetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._igToolsMethod = (method || '').toUpperCase();
    this._igToolsUrl = typeof url === 'string' ? url : (url ? url.toString() : '');
    this._igToolsFriendlyName = '';

    try {
      const lowerUrl = this._igToolsUrl.toLowerCase();
      if (
        (lowerUrl.includes('cdninstagram.com') || lowerUrl.includes('fbcdn.net')) &&
        (lowerUrl.includes('.mp4') || lowerUrl.includes('/o1/v/') || lowerUrl.includes('/v/t')) &&
        !lowerUrl.includes('audio') &&
        !lowerUrl.includes('mime_type=audio') &&
        !lowerUrl.includes('/t50.2886-16/')
      ) {
        const cleanUrl = this._igToolsUrl.replace(/([?&])bytestart=\d+(&byteend=\d+)?(&|$)/i, '$1').replace(/[?&]$/, '');
        window.__igToolsLastVideoUrl = cleanUrl;
      }
    } catch (e) {}

    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const isGhostOn = Boolean(config.ghostMode);
    const blockStories = isGhostOn && Boolean(config.ghostStories);
    const blockDMs = isGhostOn && Boolean(config.ghostDMs);

    const url = this._igToolsUrl || '';
    const method = this._igToolsMethod || 'GET';
    const bodyText = extractBodyTextSync(body);
    const friendlyName = this._igToolsFriendlyName || (url.match(/[?&]fb_api_req_friendly_name=([^&]+)/)?.[1] ? decodeURIComponent(url.match(/[?&]fb_api_req_friendly_name=([^&]+)/)[1]) : '');

    let shouldBlock = false;
    let targetType = null;

    if (blockStories && isStorySeenRequest(url, method, bodyText, friendlyName)) {
      shouldBlock = true;
      targetType = 'story';
    } else if (blockDMs && isDMSeenRequest(url, method, bodyText, friendlyName)) {
      shouldBlock = true;
      targetType = 'dm';
    }

    if (shouldBlock) {
      console.warn(`${LOG_PREFIX} 👻 Blocked XHR "${targetType}" seen request:`, url);
      notifyBlocked(targetType, url);

      setTimeout(() => {
        try {
          const mockData = JSON.stringify({ status: 'ok', data: {} });
          Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
          Object.defineProperty(this, 'status', { value: 200, configurable: true });
          Object.defineProperty(this, 'statusText', { value: 'OK', configurable: true });
          Object.defineProperty(this, 'responseText', { value: mockData, configurable: true });
          Object.defineProperty(this, 'response', { value: mockData, configurable: true });

          this.dispatchEvent(new Event('readystatechange'));
          this.dispatchEvent(new Event('load'));
          this.dispatchEvent(new Event('loadend'));
        } catch (e) {}
      }, 0);

      return;
    }

    try {
      this.addEventListener('load', function () {
        try {
          const lowerUrl = (this._igToolsUrl || '').toLowerCase();
          if ((lowerUrl.includes('/graphql/query') || lowerUrl.includes('/api/v1/')) && this.responseText) {
            const json = JSON.parse(this.responseText);
            extractAndCacheMedia(json);
          }
        } catch (e) {}
      });
    } catch (e) {}

    return originalSend.apply(this, arguments);
  };

  // =========================================================================
  // 3. Intercept navigator.sendBeacon
  // =========================================================================
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const originalSendBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url, data) {
      const urlStr = typeof url === 'string' ? url : (url ? url.toString() : '');
      const bodyText = extractBodyTextSync(data);

      const isGhostOn = Boolean(config.ghostMode);
      const blockStories = isGhostOn && Boolean(config.ghostStories);
      const blockDMs = isGhostOn && Boolean(config.ghostDMs);

      if (blockStories && isStorySeenRequest(urlStr, 'POST', bodyText)) {
        console.warn(`${LOG_PREFIX} 👻 Blocked Story sendBeacon:`, urlStr);
        notifyBlocked('story', urlStr);
        return true;
      }

      if (blockDMs && isDMSeenRequest(urlStr, 'POST', bodyText)) {
        console.warn(`${LOG_PREFIX} 👻 Blocked DM sendBeacon:`, urlStr);
        notifyBlocked('dm', urlStr);
        return true;
      }

      return originalSendBeacon.apply(this, arguments);
    };
  }

  // =========================================================================
  // 4. Intercept window.WebSocket (MQTT Outgoing Read Receipts)
  // =========================================================================
  if (typeof window.WebSocket !== 'undefined') {
    const OriginalWebSocket = window.WebSocket;

    window.WebSocket = function (...args) {
      const socket = new OriginalWebSocket(...args);
      const originalSocketSend = socket.send;

      socket.send = function (data) {
        const isGhostOn = Boolean(config.ghostMode);
        const blockDMs = isGhostOn && Boolean(config.ghostDMs);

        if (blockDMs && data) {
          try {
            let strContent = '';
            if (typeof data === 'string') {
              strContent = data;
            } else if (data instanceof ArrayBuffer) {
              strContent = new TextDecoder('utf-8', { fatal: false }).decode(data);
            } else if (ArrayBuffer.isView(data)) {
              strContent = new TextDecoder('utf-8', { fatal: false }).decode(data.buffer);
            }

            if (strContent) {
              const lower = strContent.toLowerCase();
              if (
                lower.includes('/mark_thread_seen') ||
                lower.includes('mark_thread_seen') ||
                lower.includes('seen_watermark') ||
                lower.includes('read_watermark') ||
                (lower.includes('/t_ms') && lower.includes('watermark'))
              ) {
                console.warn(`${LOG_PREFIX} 👻 Suppressed WebSocket MQTT DM seen packet.`);
                notifyBlocked('dm', 'wss://edge-chat');
                return; // Drop packet
              }
            }
          } catch (e) {}
        }

        return originalSocketSend.apply(this, arguments);
      };

      return socket;
    };

    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
    window.WebSocket.prototype = OriginalWebSocket.prototype;
  }

  // =========================================================================
  // 5. Intercept MessagePort & SharedWorker (Blocks Worker DM read receipts)
  // =========================================================================

  function isDMSeenData(data) {
    if (!data) return false;
    try {
      let str = '';
      if (typeof data === 'string') {
        str = data;
      } else if (typeof data === 'object') {
        const actionLower = String(data.action || data.type || data.name || data.mutation || data.operationName || '').toLowerCase();
        if (
          actionLower.includes('mark_thread_seen') ||
          actionLower.includes('markthreadasread') ||
          actionLower.includes('mark_thread_read') ||
          actionLower.includes('readvalidation') ||
          actionLower.includes('read_validation') ||
          actionLower.includes('seen_watermark') ||
          actionLower.includes('read_watermark') ||
          actionLower.includes('item_seen') ||
          actionLower.includes('batched_seen')
        ) {
          if (
            actionLower.includes('query') ||
            actionLower.includes('fetch') ||
            actionLower.includes('inbox') ||
            actionLower.includes('ready')
          ) {
            return false;
          }
          return true;
        }
        str = JSON.stringify(data);
      }

      if (str) {
        const lower = str.toLowerCase();
        // Never block conversation queries or inbox loading
        if (
          lower.includes('directthreadquery') ||
          lower.includes('polarisdirectthreadquery') ||
          lower.includes('polarisdirectinbox') ||
          lower.includes('fetchthread') ||
          lower.includes('messagelistquery') ||
          lower.includes('ready')
        ) {
          return false;
        }

        const seenKeywords = [
          'markthreadasread',
          'mark_thread_seen',
          'markthreaditemseen',
          'mark_thread_read',
          'readvalidation',
          'read_validation',
          'useigdmarkthreadasreadvalidationmutation',
          'polarisdirectmarkthreadseen',
          'polarisdirectmarkthreadread',
          'polarisdirectmarkactivityseen',
          'directmutationmarkthreaditemseen',
          'seen_watermark',
          'read_watermark',
          'seen_direct_thread',
          'activity_status_seen',
          'batched_seen'
        ];

        for (const kw of seenKeywords) {
          if (lower.includes(kw)) return true;
        }

        if (
          (lower.includes('watermark') || lower.includes('action_type%22%3A%22seen') || lower.includes('action":"seen')) &&
          (lower.includes('thread_id') || lower.includes('thread_fbid'))
        ) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Intercept MessagePort.prototype.postMessage
  if (typeof MessagePort !== 'undefined') {
    const originalPortPostMessage = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (data, ...args) {
      const isGhostOn = Boolean(config.ghostMode);
      const blockDMs = isGhostOn && Boolean(config.ghostDMs);

      if (blockDMs && isDMSeenData(data)) {
        console.warn(`${LOG_PREFIX} 👻 Suppressed MessagePort DM seen data:`, data);
        notifyBlocked('dm', 'MessagePort');
        return;
      }
      return originalPortPostMessage.apply(this, [data, ...args]);
    };
  }

  // Helper to sandbox Worker & SharedWorker scripts with in-worker fetch & WebSocket patches
  function createPatchedWorkerBlobUrl(scriptURL, isModule) {
    let fullUrl = scriptURL;
    try {
      fullUrl = new URL(scriptURL, window.location.href).href;
    } catch (e) {}

    const workerPatchCode = `
// IG Tools Worker Sandbox Patch (injected into worker environment)
(function() {
  var _origFetch = self.fetch;
  if (_origFetch) {
    self.fetch = async function(input, init) {
      var url = '';
      var method = 'GET';
      var fn = '';
      var bodyText = '';
      try {
        if (typeof input === 'string') url = input;
        else if (input && input.url) { url = input.url; method = input.method || 'GET'; }
        if (init && init.method) method = init.method.toUpperCase();
        if (init && init.headers) {
          if (typeof init.headers.get === 'function') fn = init.headers.get('x-fb-friendly-name') || init.headers.get('X-FB-Friendly-Name') || '';
          else if (typeof init.headers === 'object') fn = init.headers['x-fb-friendly-name'] || init.headers['X-FB-Friendly-Name'] || '';
        } else if (input && input.headers) {
          if (typeof input.headers.get === 'function') fn = input.headers.get('x-fb-friendly-name') || input.headers.get('X-FB-Friendly-Name') || '';
        }
        if (init && init.body) {
          if (typeof init.body === 'string') bodyText = init.body;
        }
      } catch(e) {}

      var lowerFn = (fn || '').toLowerCase();
      var lowerUrl = (url || '').toLowerCase();
      var lowerBody = (bodyText || '').toLowerCase();

      // Protect conversation message loading
      if (
        lowerFn.includes('directthreadquery') ||
        lowerFn.includes('polarisdirectthreadquery') ||
        lowerFn.includes('polarisdirectinbox') ||
        lowerFn.includes('messagelist') ||
        lowerBody.includes('directthreadquery') ||
        lowerBody.includes('polarisdirectthreadquery') ||
        lowerBody.includes('fetchthread')
      ) {
        return _origFetch.apply(this, arguments);
      }

      // Block DM read validation mutations in worker
      if (
        lowerFn.includes('markthreadasread') ||
        lowerFn.includes('useigdmarkthreadasread') ||
        lowerFn.includes('igdmarkthreadasread') ||
        lowerFn.includes('readvalidation') ||
        lowerFn.includes('markthreaditemseen') ||
        lowerFn.includes('polarisdirectmarkthreadseen') ||
        lowerBody.includes('markthreadasread') ||
        lowerBody.includes('useigdmarkthreadasread') ||
        lowerBody.includes('readvalidation') ||
        (lowerUrl.includes('/direct_v2/threads/') && (lowerUrl.includes('seen') || lowerUrl.includes('read')))
      ) {
        console.warn('[IG Tools Worker] 👻 Blocked DM read validation mutation in worker:', fn || url);
        var mockData = JSON.stringify({
          data: {
            useIGDMarkThreadAsReadValidationMutation: { status: 'ok', client_mutation_id: '1' },
            useIGDMarkThreadAsReadMutation: { status: 'ok', client_mutation_id: '1' },
            igd_mark_thread_as_read: { status: 'ok' },
            mark_thread_seen: { status: 'ok' }
          },
          status: 'ok'
        });
        return new Response(mockData, {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json', 'X-IG-Tools-Worker-Ghost': 'true' })
        });
      }

      return _origFetch.apply(this, arguments);
    };
  }

  // Intercept WebSocket inside worker
  var _origWS = self.WebSocket;
  if (_origWS) {
    self.WebSocket = function(...args) {
      var ws = new _origWS(...args);
      var _origSend = ws.send;
      ws.send = function(data) {
        try {
          var str = typeof data === 'string' ? data : '';
          if (!str && data instanceof ArrayBuffer) {
            str = new TextDecoder().decode(data);
          }
          if (str) {
            var lower = str.toLowerCase();
            if (
              lower.includes('watermark') ||
              lower.includes('/mark_thread_seen') ||
              lower.includes('mark_thread_seen') ||
              lower.includes('read_watermark') ||
              lower.includes('seen_watermark')
            ) {
              console.warn('[IG Tools Worker] 👻 Suppressed worker WebSocket seen packet');
              return;
            }
          }
        } catch(e) {}
        return _origSend.apply(this, arguments);
      };
      return ws;
    };
  }
})();
\${isModule ? \`import \${JSON.stringify(fullUrl)};\` : \`importScripts(\${JSON.stringify(fullUrl)});\`}
`;
    const blob = new Blob([workerPatchCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  // Intercept window.SharedWorker
  if (typeof window.SharedWorker !== 'undefined') {
    const OriginalSharedWorker = window.SharedWorker;
    window.SharedWorker = function (scriptURL, options) {
      console.log(`${LOG_PREFIX} SharedWorker instantiated:`, scriptURL);
      try {
        const isModule = options && (options === 'module' || options.type === 'module');
        const blobUrl = createPatchedWorkerBlobUrl(scriptURL, isModule);
        return new OriginalSharedWorker(blobUrl, options);
      } catch (e) {
        console.warn(`${LOG_PREFIX} SharedWorker wrapping failed, falling back to original:`, e);
        return new OriginalSharedWorker(scriptURL, options);
      }
    };
    window.SharedWorker.prototype = OriginalSharedWorker.prototype;
  }

  // Intercept window.Worker (Dedicated Web Workers)
  if (typeof window.Worker !== 'undefined') {
    const OriginalWorker = window.Worker;
    window.Worker = function (scriptURL, options) {
      console.log(`${LOG_PREFIX} Dedicated Worker instantiated:`, scriptURL);
      try {
        const isModule = options && (options === 'module' || options.type === 'module');
        const blobUrl = createPatchedWorkerBlobUrl(scriptURL, isModule);
        const worker = new OriginalWorker(blobUrl, options);
        return worker;
      } catch (e) {
        console.warn(`${LOG_PREFIX} Worker wrapping failed, falling back to original:`, e);
        return new OriginalWorker(scriptURL, options);
      }
    };
    window.Worker.prototype = OriginalWorker.prototype;
  }

  // =========================================================================
  // 6. MAIN-World Event Isolation (Prevents Reel Click-to-Pause in React)
  // =========================================================================
  const buttonEventTypes = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'];
  buttonEventTypes.forEach((evtType) => {
    window.addEventListener(
      evtType,
      (e) => {
        const target = e.target;
        if (
          target &&
          (target.closest?.('.ig-tools-glass-icon-btn') ||
           target.closest?.('.ig-tools-reel-dl-btn') ||
           target.closest?.('.ig-tools-reel-right-btn') ||
           target.closest?.('.ig-tools-reel-native-action-wrapper') ||
           target.closest?.('.ig-tools-auto-friends-card') ||
           target.closest?.('.ig-tools-story-dl-btn'))
        ) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (evtType === 'click') {
            e.preventDefault();
          }

          // If video was playing, ensure it does not pause
          const video = document.querySelector('video');
          if (video && !video.paused) {
            const resume = () => { if (video.paused) video.play().catch(() => {}); };
            requestAnimationFrame(resume);
            setTimeout(resume, 25);
            setTimeout(resume, 80);
            setTimeout(resume, 200);
          }
        }
      },
      true // Capture phase in MAIN world!
    );
  });

  console.log(`${LOG_PREFIX} Interceptor ready.`);
})();
