/**
 * IG Tools - INSSIST-Style Assistant & Master Coordinator
 * Replicates the clean, integrated, dark-mode side panel architecture of INSSIST.
 * Coordinates the Assistant Drawer, edge/sidebar triggers, and all sub-modules.
 */

(() => {
  if (window.self !== window.top) return;

  const LOG_PREFIX = '[IG Tools] [Assistant]';

  let currentSettings = {
    ghostMode: true,
    ghostStories: true,
    ghostDMs: true,
    forceOffline: false,
    hideSeenBy: false,
    focusMode: false,
    showNativeReelButton: true,
    enableFriendsLiked: true,
    enableReelSlider: true,
    enableBetterComments: true
  };

  let activeTab = 'ghost'; // 'ghost' | 'media' | 'privacy' | 'account' | 'tools' | 'settings'
  let cachedStats = { stories: 0, dms: 0 };
  let unfollowerResults = null;

  // =========================================================================
  // 1. Settings Synchronization
  // =========================================================================

  function syncSettingsToPage(settings) {
    window.postMessage(
      {
        type: 'IG_TOOLS_SYNC_CONFIG',
        config: {
          ghostMode: settings.ghostMode,
          ghostStories: settings.ghostStories,
          ghostDMs: settings.ghostDMs
        }
      },
      '*'
    );
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get(null);
      if (stored) {
        currentSettings = { ...currentSettings, ...stored };
      }
    } catch (e) {
      console.warn(`${LOG_PREFIX} Storage read fallback:`, e);
    }
  }

  async function saveSetting(key, val) {
    currentSettings[key] = val;
    await chrome.storage.local.set({ [key]: val });
    syncSettingsToPage(currentSettings);
    applyGlobalUIPreferences();
  }

  function applyGlobalUIPreferences() {
    if (!document.body) return;

    // Focus Mode
    if (currentSettings.focusMode) {
      document.body.classList.add('ig-tools-focus-mode');
    } else {
      document.body.classList.remove('ig-tools-focus-mode');
    }

    // Update triggers
    updateTriggerStatus();

    // Trigger sub-modules
    if (window.IGTools) {
      window.IGTools.download?.scanAndInjectButtons();
      window.IGTools.friendsLiked?.scanAndInjectReelFriendsButton();
      window.IGTools.reelSlider?.scanAndAttachSliders();
      window.IGTools.comments?.scanAndEnhanceComments();
    }
  }

  // =========================================================================
  // 2. Initialization
  // =========================================================================

  async function init() {
    console.log(`${LOG_PREFIX} Initializing INSSIST-style Assistant...`);
    await loadSettings();

    // Immediately push config to MAIN world interceptor
    syncSettingsToPage(currentSettings);

    // Initialize sub-modules safely
    if (window.IGTools) {
      window.IGTools.showToast = showToast;
      try { window.IGTools.privacy?.init(); } catch (e) { console.warn(`${LOG_PREFIX} Privacy init error:`, e); }
      try { window.IGTools.account?.init(); } catch (e) { console.warn(`${LOG_PREFIX} Account init error:`, e); }
      try { window.IGTools.download?.init(); } catch (e) { console.warn(`${LOG_PREFIX} Download init error:`, e); }
      try { window.IGTools.friendsLiked?.init(); } catch (e) { console.warn(`${LOG_PREFIX} FriendsLiked init error:`, e); }
      try { window.IGTools.reelSlider?.init(); } catch (e) { console.warn(`${LOG_PREFIX} ReelSlider init error:`, e); }
      try { window.IGTools.comments?.init(); } catch (e) { console.warn(`${LOG_PREFIX} Comments init error:`, e); }
    }

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      let changed = false;
      for (const [key, change] of Object.entries(changes)) {
        if (currentSettings[key] !== change.newValue) {
          currentSettings[key] = change.newValue;
          changed = true;
        }
      }
      if (changed) {
        syncSettingsToPage(currentSettings);
        applyGlobalUIPreferences();
        renderDrawerContent();
      }
    });

    // Listen for blocked seen receipts from ghost.js (MAIN world)
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.type !== 'IG_TOOLS_SEEN_BLOCKED') {
        return;
      }
      const { targetType, url } = event.data;
      console.log(`${LOG_PREFIX} Blocked read receipt (${targetType}):`, url);

      if (targetType === 'story') {
        cachedStats.stories++;
      } else {
        cachedStats.dms++;
      }

      try {
        chrome.runtime.sendMessage({ action: 'INCREMENT_SEEN_BLOCKED', targetType }, () => {
          void chrome.runtime.lastError;
        });
      } catch (e) {}

      const label = targetType === 'story' ? 'Story view kept anonymous' : 'DM seen receipt blocked';
      showToast(`👻 ${label}`);

      const statStoryEl = document.getElementById('ig-stat-stories-num');
      const statDmEl = document.getElementById('ig-stat-dms-num');
      if (statStoryEl) statStoryEl.textContent = cachedStats.stories;
      if (statDmEl) statDmEl.textContent = cachedStats.dms;
    });

    // Load session stats from background
    try {
      chrome.runtime.sendMessage({ action: 'GET_STATS' }, (res) => {
        if (chrome.runtime.lastError) return;
        if (res) {
          cachedStats.stories = res.storiesBlocked || 0;
          cachedStats.dms = res.dmsBlocked || 0;
          const statStoryEl = document.getElementById('ig-stat-stories-num');
          const statDmEl = document.getElementById('ig-stat-dms-num');
          if (statStoryEl) statStoryEl.textContent = cachedStats.stories;
          if (statDmEl) statDmEl.textContent = cachedStats.dms;
        }
      });
    } catch (e) {}

    // Mount UI components once DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDOMReady);
    } else {
      onDOMReady();
    }

    // Listen for external commands from popup
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === 'TOGGLE_CONTROL_CENTER') {
        toggleDrawer();
      }
    });

    initPageObserver();
    initKeyboardShortcuts();
  }

  function onDOMReady() {
    createDrawerUI();
    createFloatingTrigger();
    injectSidebarItem();
    applyGlobalUIPreferences();
  }

  // =========================================================================
  // 3. INSSIST Assistant UI — Side Panel Drawer Architecture
  // =========================================================================

  function createDrawerUI() {
    if (document.getElementById('ig-tools-drawer')) return;
    if (!document.body) return;

    // 1. Semi-transparent dark backdrop overlay
    const backdrop = document.createElement('div');
    backdrop.id = 'ig-tools-drawer-backdrop';
    backdrop.className = 'ig-tools-drawer-backdrop';
    backdrop.addEventListener('click', closeDrawer);
    document.body.appendChild(backdrop);

    // 2. Full-height sliding side panel drawer
    const drawer = document.createElement('aside');
    drawer.id = 'ig-tools-drawer';
    drawer.className = 'ig-tools-drawer';

    drawer.innerHTML = `
      <!-- Drawer Header (INSSIST Style) -->
      <div class="ig-tools-drawer-header">
        <div class="ig-tools-header-brand">
          <div class="ig-tools-brand-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </div>
          <div class="ig-tools-brand-meta">
            <div class="ig-tools-brand-title">
              <span>Assistant</span>
              <span class="ig-tools-pro-tag">PRO</span>
            </div>
            <span class="ig-tools-brand-sub">IG Tools Suite • Desktop Engine</span>
          </div>
        </div>

        <div class="ig-tools-header-right">
          <div id="ig-tools-header-pill" class="ig-tools-header-pill ${currentSettings.ghostMode ? 'active' : ''}">
            <span class="ig-tools-pill-dot"></span>
            <span class="ig-tools-pill-label">Ghost ${currentSettings.ghostMode ? 'ON' : 'OFF'}</span>
          </div>
          <button id="ig-tools-drawer-close" class="ig-tools-close-btn" title="Close Assistant (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Segmented Category Tabs -->
      <nav class="ig-tools-drawer-nav">
        <button class="ig-tools-nav-tab ${activeTab === 'ghost' ? 'active' : ''}" data-tab="ghost">
          <span>👻</span> Ghost
        </button>
        <button class="ig-tools-nav-tab ${activeTab === 'media' ? 'active' : ''}" data-tab="media">
          <span>📥</span> Media
        </button>
        <button class="ig-tools-nav-tab ${activeTab === 'privacy' ? 'active' : ''}" data-tab="privacy">
          <span>🔒</span> Privacy
        </button>
        <button class="ig-tools-nav-tab ${activeTab === 'account' ? 'active' : ''}" data-tab="account">
          <span>👥</span> Account
        </button>
        <button class="ig-tools-nav-tab ${activeTab === 'tools' ? 'active' : ''}" data-tab="tools">
          <span>⚡</span> Tools
        </button>
        <button class="ig-tools-nav-tab ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings">
          <span>⚙️</span> Config
        </button>
      </nav>

      <!-- Scrollable Tab Content Container -->
      <div id="ig-tools-drawer-body" class="ig-tools-drawer-body">
        <!-- Rendered dynamically -->
      </div>
    `;

    // Close button event
    drawer.querySelector('#ig-tools-drawer-close').addEventListener('click', closeDrawer);

    // Tab navigation event delegation
    drawer.querySelectorAll('.ig-tools-nav-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        drawer.querySelectorAll('.ig-tools-nav-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        renderDrawerContent();
      });
    });

    document.body.appendChild(drawer);
    renderDrawerContent();
  }

  // =========================================================================
  // 4. Floating & Sidebar Assistant Triggers (INSSIST Pattern)
  // =========================================================================

  function createFloatingTrigger() {
    if (document.getElementById('ig-tools-assistant-trigger')) return;
    if (!document.body) return;

    const trigger = document.createElement('div');
    trigger.id = 'ig-tools-assistant-trigger';
    trigger.className = 'ig-tools-assistant-trigger';
    trigger.setAttribute('title', 'Open Assistant (Press M)');

    trigger.innerHTML = `
      <div class="ig-tools-trigger-capsule">
        <div class="ig-tools-trigger-icon-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
        <span class="ig-tools-trigger-text">Assistant</span>
        <span class="ig-tools-trigger-dot ${currentSettings.ghostMode ? 'active' : ''}"></span>
      </div>
    `;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDrawer();
    });

    document.body.appendChild(trigger);
  }

  /**
   * Injects an Assistant menu item directly into Instagram's left navigation sidebar,
   * perfectly mirroring INSSIST's native sidebar integration.
   */
  function injectSidebarItem() {
    const navBar = document.querySelector('nav, div[role="navigation"]');
    if (!navBar || document.getElementById('ig-tools-sidebar-item')) return;

    // Look for navigation link list (Home, Search, Explore, Reels, Messages, etc.)
    const existingLinks = navBar.querySelectorAll('a[role="link"], div[role="button"]');
    if (existingLinks.length < 3) return;

    const sidebarItem = document.createElement('div');
    sidebarItem.id = 'ig-tools-sidebar-item';
    sidebarItem.className = 'ig-tools-sidebar-item';
    sidebarItem.setAttribute('role', 'button');
    sidebarItem.setAttribute('tabindex', '0');

    sidebarItem.innerHTML = `
      <div class="ig-tools-sidebar-inner">
        <div class="ig-tools-sidebar-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
        <span class="ig-tools-sidebar-label">Assistant+</span>
      </div>
    `;

    sidebarItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    });

    // Append to navigation
    const targetParent = existingLinks[existingLinks.length - 1].closest('ul, div.x1iyjqo2') || navBar;
    targetParent.appendChild(sidebarItem);
  }

  function updateTriggerStatus() {
    const dot = document.querySelector('.ig-tools-trigger-dot');
    if (dot) {
      if (currentSettings.ghostMode) dot.classList.add('active');
      else dot.classList.remove('active');
    }

    const pill = document.getElementById('ig-tools-header-pill');
    if (pill) {
      if (currentSettings.ghostMode) {
        pill.classList.add('active');
        pill.querySelector('.ig-tools-pill-label').textContent = 'Ghost ON';
      } else {
        pill.classList.remove('active');
        pill.querySelector('.ig-tools-pill-label').textContent = 'Ghost OFF';
      }
    }
  }

  // Drawer open / close handlers
  function toggleDrawer() {
    const drawer = document.getElementById('ig-tools-drawer');
    if (!drawer) return;
    if (drawer.classList.contains('open')) closeDrawer();
    else openDrawer();
  }

  function openDrawer() {
    const drawer = document.getElementById('ig-tools-drawer');
    const backdrop = document.getElementById('ig-tools-drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.add('open');
      backdrop.classList.add('open');
      renderDrawerContent();
    }
  }

  function closeDrawer() {
    const drawer = document.getElementById('ig-tools-drawer');
    const backdrop = document.getElementById('ig-tools-drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
    }
  }

  // =========================================================================
  // 5. Drawer Content Rendering (Obsidian INSSIST Cards)
  // =========================================================================

  function renderDrawerContent() {
    const body = document.getElementById('ig-tools-drawer-body');
    if (!body) return;

    updateTriggerStatus();

    switch (activeTab) {
      case 'ghost':
        renderGhostTab(body);
        break;
      case 'media':
        renderMediaTab(body);
        break;
      case 'privacy':
        renderPrivacyTab(body);
        break;
      case 'account':
        renderAccountTab(body);
        break;
      case 'tools':
        renderToolsTab(body);
        break;
      case 'settings':
        renderSettingsTab(body);
        break;
      default:
        renderGhostTab(body);
        break;
    }
  }

  // --- TAB 1: GHOST MODE (INSSIST Hero Master Card) ---
  function renderGhostTab(container) {
    container.innerHTML = `
      <!-- Hero Master Toggle -->
      <div class="ig-tools-card ig-tools-hero-card ${currentSettings.ghostMode ? 'glow-active' : ''}">
        <div class="ig-tools-card-row">
          <div class="ig-tools-card-meta">
            <span class="ig-tools-hero-badge">PRIVACY ENGINE</span>
            <h4 class="ig-tools-card-title">Ghost Mode Master</h4>
            <p class="ig-tools-card-desc">Browse Stories and Direct Messages completely anonymously.</p>
          </div>
          <label class="ig-tools-switch">
            <input type="checkbox" id="ig-toggle-ghost-master" ${currentSettings.ghostMode ? 'checked' : ''} />
            <span class="ig-tools-switch-slider"></span>
          </label>
        </div>
      </div>

      <!-- Feature Toggles Group -->
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Interception Modules</span>

        <div class="ig-tools-row-item">
          <div class="ig-tools-item-info">
            <span class="ig-tools-item-title">Ghost Stories</span>
            <span class="ig-tools-item-desc">Never send seen receipts when viewing Stories or Highlights.</span>
          </div>
          <label class="ig-tools-switch mini">
            <input type="checkbox" id="ig-toggle-ghost-stories" ${currentSettings.ghostStories ? 'checked' : ''} ${!currentSettings.ghostMode ? 'disabled' : ''} />
            <span class="ig-tools-switch-slider"></span>
          </label>
        </div>
      </div>

      <!-- Live Blocked Stats -->
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Shield Activity (Session)</span>
        <div class="ig-tools-stats-grid" style="grid-template-columns: 1fr;">
          <div class="ig-tools-stat-box">
            <span class="ig-tools-stat-number" id="ig-stat-stories-num">${cachedStats.stories}</span>
            <span class="ig-tools-stat-caption">Stories Kept Secret</span>
          </div>
        </div>
        <div class="ig-tools-security-note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          <span>100% Client-Side Interception • Fast Native Chat</span>
        </div>
      </div>
    `;

    container.querySelector('#ig-toggle-ghost-master').addEventListener('change', async (e) => {
      await saveSetting('ghostMode', e.target.checked);
      showToast(e.target.checked ? '👻 Ghost Mode Activated' : '👀 Ghost Mode Deactivated');
      renderDrawerContent();
    });

    container.querySelector('#ig-toggle-ghost-stories')?.addEventListener('change', async (e) => {
      await saveSetting('ghostStories', e.target.checked);
    });
  }

  // --- TAB 2: MEDIA DOWNLOADER ---
  function renderMediaTab(container) {
    const isReel = location.pathname.startsWith('/reel') || location.pathname.startsWith('/reels');
    const isStory = location.pathname.startsWith('/stories');

    container.innerHTML = `
      <!-- Active Media Card -->
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Active Media Quick Actions</span>
        <div class="ig-tools-action-column">
          <button id="ig-btn-dl-active" class="ig-tools-primary-action-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download Active ${isReel ? 'Reel (1080p)' : isStory ? 'Story' : 'Media'}</span>
          </button>

          <button id="ig-btn-copy-link" class="ig-tools-secondary-action-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>Copy Direct 1080p Stream URL</span>
          </button>
        </div>
      </div>

      <!-- Playback Speed Control -->
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Reels Playback Speed</span>
        <span class="ig-tools-card-desc">Control video playback speed seamlessly on any Reel:</span>
        <div class="ig-tools-speed-selector">
          <button class="ig-tools-speed-pill" data-speed="0.5">0.5x</button>
          <button class="ig-tools-speed-pill" data-speed="1.0">1.0x</button>
          <button class="ig-tools-speed-pill" data-speed="1.25">1.25x</button>
          <button class="ig-tools-speed-pill" data-speed="1.5">1.5x</button>
          <button class="ig-tools-speed-pill" data-speed="2.0">2.0x</button>
        </div>
      </div>

      <!-- Story Highlights Card -->
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Story Highlights</span>
        <button id="ig-btn-dl-highlights" class="ig-tools-secondary-action-btn full-width">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <span>Download Active Highlight Stories</span>
        </button>
      </div>

      <!-- UI Integration Option -->
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Interface Placement & Controls</span>
        <div class="ig-tools-row-item">
          <div class="ig-tools-item-info">
            <span class="ig-tools-item-title">Reels Video Progress Slider</span>
            <span class="ig-tools-item-desc">Seek bar with scrubber, time display, play/pause and &plusmn;5s buttons.</span>
          </div>
          <label class="ig-tools-switch mini">
            <input type="checkbox" id="ig-toggle-reel-slider" ${currentSettings.enableReelSlider !== false ? 'checked' : ''} />
            <span class="ig-tools-switch-slider"></span>
          </label>
        </div>
        <div class="ig-tools-row-item">
          <div class="ig-tools-item-info">
            <span class="ig-tools-item-title">Native Action Button on Reels</span>
            <span class="ig-tools-item-desc">Places download button in right action column (near Like & Save).</span>
          </div>
          <label class="ig-tools-switch mini">
            <input type="checkbox" id="ig-toggle-native-btn" ${currentSettings.showNativeReelButton ? 'checked' : ''} />
            <span class="ig-tools-switch-slider"></span>
          </label>
        </div>
      </div>
    `;

    // Download active media
    container.querySelector('#ig-btn-dl-active').addEventListener('click', async () => {
      if (isReel) {
        await window.IGTools.download?.downloadCurrentReel();
      } else {
        const firstPost = document.querySelector('article');
        if (firstPost) {
          const dlBtn = firstPost.querySelector('.ig-tools-post-bar-btn') || firstPost.querySelector('.ig-tools-post-overlay-dl');
          if (dlBtn) dlBtn.click();
          else showToast('No downloadable post detected');
        } else {
          showToast('No active media detected on page');
        }
      }
    });

    container.querySelector('#ig-btn-copy-link').addEventListener('click', async () => {
      await window.IGTools.download?.copyDirectMediaUrl();
    });

    container.querySelector('#ig-btn-dl-highlights').addEventListener('click', async () => {
      await window.IGTools.download?.downloadHighlights();
    });

    // Speed selector
    const currentSpeed = window.IGTools.download?.getPlaybackSpeed() || 1;
    container.querySelectorAll('.ig-tools-speed-pill').forEach((btn) => {
      if (parseFloat(btn.dataset.speed) === currentSpeed) btn.classList.add('active');
      btn.addEventListener('click', () => {
        container.querySelectorAll('.ig-tools-speed-pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        window.IGTools.download?.setPlaybackSpeed(btn.dataset.speed);
      });
    });

    container.querySelector('#ig-toggle-reel-slider')?.addEventListener('change', async (e) => {
      await saveSetting('enableReelSlider', e.target.checked);
      window.IGTools.reelSlider?.scanAndAttachSliders();
    });

    container.querySelector('#ig-toggle-native-btn').addEventListener('change', async (e) => {
      await saveSetting('showNativeReelButton', e.target.checked);
      window.IGTools.download?.scanAndInjectButtons();
    });
  }

  // --- TAB 3: PRIVACY & SAFETY ---
  function renderPrivacyTab(container) {
    const privacy = window.IGTools.privacy?.getSettings() || {};
    const mutedUsers = privacy.mutedStoryUsers || [];

    let mutedHtml = mutedUsers.length === 0
      ? `<span class="ig-tools-empty-note">No muted accounts.</span>`
      : mutedUsers.map((u) => `
          <div class="ig-tools-muted-tag">
            <span>@${u}</span>
            <button class="ig-tools-remove-mute-btn" data-user="${u}">&times;</button>
          </div>
        `).join('');

    container.innerHTML = `
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Presence & Activity</span>

        <div class="ig-tools-row-item">
          <div class="ig-tools-item-info">
            <span class="ig-tools-item-title">Force Offline (Hide Activity)</span>
            <span class="ig-tools-item-desc">Suppresses presence pings & hides active green dot.</span>
          </div>
          <label class="ig-tools-switch mini">
            <input type="checkbox" id="ig-toggle-force-offline" ${privacy.forceOffline ? 'checked' : ''} />
            <span class="ig-tools-switch-slider"></span>
          </label>
        </div>

        <div class="ig-tools-row-item">
          <div class="ig-tools-item-info">
            <span class="ig-tools-item-title">Hide 'Seen By' on My Stories</span>
            <span class="ig-tools-item-desc">Removes viewer count & viewer overlay on your own stories.</span>
          </div>
          <label class="ig-tools-switch mini">
            <input type="checkbox" id="ig-toggle-hide-seen-by" ${privacy.hideSeenBy ? 'checked' : ''} />
            <span class="ig-tools-switch-slider"></span>
          </label>
        </div>
      </div>

      <!-- Permanent Story Muter -->
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Permanent Story Muter</span>
        <span class="ig-tools-card-desc">Automatically dims and skips stories from selected accounts:</span>
        <div class="ig-tools-input-bar">
          <input type="text" id="ig-input-mute-user" class="ig-tools-dark-input" placeholder="Enter username..." />
          <button id="ig-btn-add-mute" class="ig-tools-btn-inline">Mute</button>
        </div>
        <div class="ig-tools-muted-list-wrap">
          ${mutedHtml}
        </div>
      </div>
    `;

    container.querySelector('#ig-toggle-force-offline').addEventListener('change', async (e) => {
      await window.IGTools.privacy?.updateSetting('forceOffline', e.target.checked);
      showToast(e.target.checked ? '🔒 Force Offline Enabled' : '🔓 Activity Status Restored');
    });

    container.querySelector('#ig-toggle-hide-seen-by').addEventListener('change', async (e) => {
      await window.IGTools.privacy?.updateSetting('hideSeenBy', e.target.checked);
      showToast(e.target.checked ? '🔒 Viewer Count Hidden' : '🔓 Viewer Count Visible');
    });

    const addMuteBtn = container.querySelector('#ig-btn-add-mute');
    const muteInput = container.querySelector('#ig-input-mute-user');

    const handleMute = async () => {
      const u = muteInput.value.trim();
      if (!u) return;
      const ok = await window.IGTools.privacy?.addMutedUser(u);
      if (ok) {
        showToast(`🔇 Muted stories for @${u}`);
        renderDrawerContent();
      }
    };

    addMuteBtn.addEventListener('click', handleMute);
    muteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleMute(); });

    container.querySelectorAll('.ig-tools-remove-mute-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const u = btn.dataset.user;
        await window.IGTools.privacy?.removeMutedUser(u);
        showToast(`🔊 Unmuted @${u}`);
        renderDrawerContent();
      });
    });
  }

  // --- TAB 4: ACCOUNT TOOLS (Unfollowers & Growth) ---
  function renderAccountTab(container) {
    let unfollowersListHtml = '';

    if (unfollowerResults) {
      const { totalFollowing, totalFollowers, notFollowingBack, fans } = unfollowerResults;
      const rows = notFollowingBack.slice(0, 20).map((u) => `
        <div class="ig-tools-account-row">
          <img class="ig-tools-account-avatar" src="${u.profile_pic_url || ''}" alt="" />
          <div class="ig-tools-account-details">
            <a href="/${u.username}/" target="_blank" class="ig-tools-account-username">@${u.username}</a>
            <span class="ig-tools-account-fullname">${u.full_name || ''}</span>
          </div>
        </div>
      `).join('');

      unfollowersListHtml = `
        <div class="ig-tools-stats-grid quad">
          <div class="ig-tools-stat-box">
            <span class="ig-tools-stat-number">${totalFollowing}</span>
            <span class="ig-tools-stat-caption">Following</span>
          </div>
          <div class="ig-tools-stat-box">
            <span class="ig-tools-stat-number">${totalFollowers}</span>
            <span class="ig-tools-stat-caption">Followers</span>
          </div>
          <div class="ig-tools-stat-box accent-red">
            <span class="ig-tools-stat-number">${notFollowingBack.length}</span>
            <span class="ig-tools-stat-caption">Not Following Back</span>
          </div>
          <div class="ig-tools-stat-box accent-green">
            <span class="ig-tools-stat-number">${fans.length}</span>
            <span class="ig-tools-stat-caption">Fans (Not Followed)</span>
          </div>
        </div>

        <div class="ig-tools-unfollowers-box">
          <div class="ig-tools-box-header">
            <span>Not Following Back (${notFollowingBack.length})</span>
            <button id="ig-btn-export-unfollowers" class="ig-tools-pill-link">Export CSV</button>
          </div>
          <div class="ig-tools-box-scroll">
            ${rows || `<span class="ig-tools-empty-note">All users follow you back! 🎉</span>`}
          </div>
        </div>
      `;
    }

    // Profile notes check
    const pathParts = location.pathname.split('/').filter(Boolean);
    const viewedProfile = pathParts.length === 1 && !['reels', 'explore', 'direct', 'stories'].includes(pathParts[0]) ? pathParts[0] : null;
    let notesSection = '';

    if (viewedProfile) {
      const existingNote = window.IGTools.account?.getProfileNote(viewedProfile) || '';
      notesSection = `
        <div class="ig-tools-card">
          <span class="ig-tools-card-header-label">Private Profile Note (@${viewedProfile})</span>
          <div class="ig-tools-input-bar">
            <input type="text" id="ig-input-profile-note" class="ig-tools-dark-input" placeholder="Add private note for this user..." value="${existingNote}" />
            <button id="ig-btn-save-note" class="ig-tools-btn-inline">Save</button>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Unfollowers Tracker</span>
        <span class="ig-tools-card-desc">Safely scan and analyze people who do not follow you back:</span>
        <button id="ig-btn-scan-unfollowers" class="ig-tools-primary-action-btn full-width">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span>Scan Unfollowers</span>
        </button>
        <div id="ig-unfollowers-progress" class="ig-tools-progress-text"></div>
        ${unfollowersListHtml}
      </div>

      ${notesSection}

      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Audience CSV Export</span>
        <div class="ig-tools-btn-grid">
          <button id="ig-btn-export-followers" class="ig-tools-secondary-action-btn">Export Followers</button>
          <button id="ig-btn-export-following" class="ig-tools-secondary-action-btn">Export Following</button>
        </div>
      </div>
    `;

    // Unfollowers Scan
    const scanBtn = container.querySelector('#ig-btn-scan-unfollowers');
    const progLabel = container.querySelector('#ig-unfollowers-progress');

    scanBtn.addEventListener('click', async () => {
      scanBtn.disabled = true;
      scanBtn.innerHTML = `<span>Scanning...</span>`;
      progLabel.textContent = 'Querying friendships safely...';

      try {
        const results = await window.IGTools.account?.scanUnfollowers((p) => {
          progLabel.textContent = `Fetching ${p.step}... (${p.count} accounts)`;
        });
        unfollowerResults = results;
        progLabel.textContent = 'Scan completed!';
        renderDrawerContent();
      } catch (err) {
        progLabel.textContent = `Failed: ${err.message}`;
        scanBtn.disabled = false;
        scanBtn.innerHTML = `<span>Scan Unfollowers</span>`;
      }
    });

    container.querySelector('#ig-btn-export-unfollowers')?.addEventListener('click', () => {
      if (unfollowerResults?.notFollowingBack) {
        window.IGTools.account?.exportUsersToCSV(unfollowerResults.notFollowingBack, 'not_following_back.csv');
        showToast('📥 Downloaded not_following_back.csv');
      }
    });

    container.querySelector('#ig-btn-export-followers')?.addEventListener('click', () => {
      const followers = window.IGTools.account?.getCachedFollowers() || [];
      if (followers.length > 0) {
        window.IGTools.account?.exportUsersToCSV(followers, 'followers.csv');
        showToast('📥 Downloaded followers.csv');
      } else {
        showToast('Please run Scan Unfollowers first to load audience data');
      }
    });

    container.querySelector('#ig-btn-export-following')?.addEventListener('click', () => {
      const following = window.IGTools.account?.getCachedFollowing() || [];
      if (following.length > 0) {
        window.IGTools.account?.exportUsersToCSV(following, 'following.csv');
        showToast('📥 Downloaded following.csv');
      } else {
        showToast('Please run Scan Unfollowers first to load audience data');
      }
    });

    // Save note
    const saveNoteBtn = container.querySelector('#ig-btn-save-note');
    if (saveNoteBtn && viewedProfile) {
      saveNoteBtn.addEventListener('click', async () => {
        const val = container.querySelector('#ig-input-profile-note').value;
        await window.IGTools.account?.saveProfileNote(viewedProfile, val);
        showToast('📝 Note saved!');
      });
    }
  }

  // --- TAB 5: PRODUCTIVITY & SHORTCUTS ---
  function renderToolsTab(container) {
    const templates = [
      'Hey! Thanks for messaging 🙌',
      'Got your message, will get back to you shortly!',
      'Thanks for sharing this, checking it out now.',
      'Could you please send more details? Thanks!'
    ];

    const templateRows = templates.map((t) => `
      <div class="ig-tools-template-row">
        <span class="ig-tools-template-text">${t}</span>
        <button class="ig-tools-copy-btn" data-text="${t}">Copy</button>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Focus & Zen Mode</span>
        <div class="ig-tools-row-item">
          <div class="ig-tools-item-info">
            <span class="ig-tools-item-title">Focus Mode</span>
            <span class="ig-tools-item-desc">Hides Reels & Explore feed tabs to eliminate doomscrolling.</span>
          </div>
          <label class="ig-tools-switch mini">
            <input type="checkbox" id="ig-toggle-focus-mode" ${currentSettings.focusMode ? 'checked' : ''} />
            <span class="ig-tools-switch-slider"></span>
          </label>
        </div>
      </div>

      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Quick Reply DM Templates</span>
        <div class="ig-tools-templates-wrap">
          ${templateRows}
        </div>
      </div>

      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Keyboard Shortcuts</span>
        <div class="ig-tools-shortcuts-grid">
          <div class="ig-tools-shortcut-item">
            <kbd>M</kbd>
            <span>Toggle Assistant Side Panel</span>
          </div>
          <div class="ig-tools-shortcut-item">
            <kbd>D</kbd>
            <span>Download Active Reel or Post</span>
          </div>
          <div class="ig-tools-shortcut-item">
            <kbd>G</kbd>
            <span>Toggle Ghost Mode ON / OFF</span>
          </div>
          <div class="ig-tools-shortcut-item">
            <kbd>S</kbd>
            <span>Cycle Playback Speed (1x &rarr; 1.25x &rarr; 1.5x)</span>
          </div>
          <div class="ig-tools-shortcut-item">
            <kbd>Esc</kbd>
            <span>Close Side Panel</span>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#ig-toggle-focus-mode').addEventListener('change', async (e) => {
      await saveSetting('focusMode', e.target.checked);
      showToast(e.target.checked ? '🎯 Focus Mode Enabled' : '🎯 Focus Mode Disabled');
    });

    container.querySelectorAll('.ig-tools-copy-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(btn.dataset.text);
        showToast('📋 Template copied to clipboard!');
      });
    });
  }

  // --- TAB 6: CONFIG & SETTINGS ---
  function renderSettingsTab(container) {
    container.innerHTML = `
      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Feature Toggles</span>

        <div class="ig-tools-row-item">
          <div class="ig-tools-item-info">
            <span class="ig-tools-item-title">Friends Who Liked (Reels)</span>
            <span class="ig-tools-item-desc">Auto-display friends who liked outside the Reel player.</span>
          </div>
          <label class="ig-tools-switch mini">
            <input type="checkbox" id="ig-toggle-friends" ${currentSettings.enableFriendsLiked !== false ? 'checked' : ''} />
            <span class="ig-tools-switch-slider"></span>
          </label>
        </div>

        <div class="ig-tools-row-item">
          <div class="ig-tools-item-info">
            <span class="ig-tools-item-title">Comment Lightbox Zoom</span>
            <span class="ig-tools-item-desc">Click-to-zoom stickers and media attachments in comments.</span>
          </div>
          <label class="ig-tools-switch mini">
            <input type="checkbox" id="ig-toggle-comments" ${currentSettings.enableBetterComments !== false ? 'checked' : ''} />
            <span class="ig-tools-switch-slider"></span>
          </label>
        </div>
      </div>

      <div class="ig-tools-card">
        <span class="ig-tools-card-header-label">Session Data</span>
        <button id="ig-btn-reset-stats" class="ig-tools-danger-btn full-width">
          Reset Blocked Shields Counters
        </button>
      </div>

      <div class="ig-tools-footer-brand">
        <span class="ig-tools-footer-title">IG Tools Assistant • Manifest V3</span>
        <span class="ig-tools-footer-sub">Engineered for private, local Instagram management.</span>
      </div>
    `;

    container.querySelector('#ig-toggle-friends').addEventListener('change', async (e) => {
      await saveSetting('enableFriendsLiked', e.target.checked);
      if (!e.target.checked) {
        document.querySelectorAll('.ig-tools-auto-friends-card').forEach((el) => el.remove());
      } else {
        window.IGTools.friendsLiked?.scanAndInjectReelFriendsButton();
      }
    });

    container.querySelector('#ig-toggle-comments').addEventListener('change', async (e) => {
      await saveSetting('enableBetterComments', e.target.checked);
    });

    container.querySelector('#ig-btn-reset-stats').addEventListener('click', async () => {
      cachedStats = { stories: 0, dms: 0 };
      await chrome.storage.local.set({ storiesBlocked: 0, dmsBlocked: 0 });
      showToast('🔄 Counters reset');
      renderDrawerContent();
    });
  }

  // =========================================================================
  // 6. Global Keyboard Shortcuts & Toast System
  // =========================================================================

  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore if user is inside an input or textarea
      const target = e.target;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox')
      ) {
        return;
      }

      if (e.key === 'Escape') {
        const drawer = document.getElementById('ig-tools-drawer');
        if (drawer && drawer.classList.contains('open')) {
          e.preventDefault();
          closeDrawer();
        }
        return;
      }

      const key = e.key.toUpperCase();

      if (key === 'M') {
        e.preventDefault();
        toggleDrawer();
      } else if (key === 'G') {
        e.preventDefault();
        const next = !currentSettings.ghostMode;
        saveSetting('ghostMode', next);
        showToast(next ? '👻 Ghost Mode ON' : '👀 Ghost Mode OFF');
      } else if (key === 'D') {
        e.preventDefault();
        window.IGTools.download?.downloadCurrentReel();
      } else if (key === 'S') {
        e.preventDefault();
        const speeds = [1.0, 1.25, 1.5, 2.0, 0.5];
        const curr = window.IGTools.download?.getPlaybackSpeed() || 1.0;
        const next = speeds[(speeds.indexOf(curr) + 1) % speeds.length] || 1.0;
        window.IGTools.download?.setPlaybackSpeed(next);
      }
    });
  }

  let toastTimer = null;
  function showToast(text) {
    if (!document.body) return;
    let toast = document.getElementById('ig-tools-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ig-tools-toast';
      toast.className = 'ig-tools-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = text;
    toast.classList.add('ig-tools-toast-visible');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('ig-tools-toast-visible');
    }, 2400);
  }

  // =========================================================================
  // 7. Page Observers
  // =========================================================================

  function initPageObserver() {
    let lastUrl = location.href;
    let scanTimeout = null;

    function requestScan() {
      if (!scanTimeout) {
        scanTimeout = setTimeout(() => {
          if (!document.getElementById('ig-tools-assistant-trigger')) {
            createFloatingTrigger();
          }
          if (!document.getElementById('ig-tools-drawer')) {
            createDrawerUI();
          }
          injectSidebarItem();
          if (window.IGTools) {
            window.IGTools.download?.scanAndInjectButtons();
            window.IGTools.friendsLiked?.scanAndInjectReelFriendsButton();
            window.IGTools.reelSlider?.scanAndAttachSliders();
            window.IGTools.comments?.scanAndEnhanceComments();
          }
          scanTimeout = null;
        }, 300);
      }
    }

    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        requestScan();
      }
      requestScan();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Launch
  init();
})();
