/**
 * IG Tools - Privacy Tools Module
 * Provides advanced local privacy controls:
 * - Force Offline (hide activity status & suppress presence heartbeats)
 * - Permanent Story Muter (filter/skip stories from selected accounts)
 * - Hide "Seen by" viewer metrics on your own Stories
 */

window.IGTools = window.IGTools || {};

window.IGTools.privacy = (() => {
  const LOG_PREFIX = '[IG Tools] [Privacy]';

  if (window.self !== window.top) {
    return {
      init: () => {},
      getSettings: () => ({}),
      updateSetting: () => {},
      addMutedUser: () => {},
      removeMutedUser: () => {},
      isUserMuted: () => false,
      applyPrivacyFilters: () => {}
    };
  }

  let privacySettings = {
    forceOffline: false,
    hideSeenBy: false,
    mutedStoryUsers: []
  };

  async function init() {
    console.log(`${LOG_PREFIX} Initializing Privacy module...`);
    try {
      const stored = await chrome.storage.local.get(['forceOffline', 'hideSeenBy', 'mutedStoryUsers']);
      if (stored) {
        if (typeof stored.forceOffline === 'boolean') privacySettings.forceOffline = stored.forceOffline;
        if (typeof stored.hideSeenBy === 'boolean') privacySettings.hideSeenBy = stored.hideSeenBy;
        if (Array.isArray(stored.mutedStoryUsers)) privacySettings.mutedStoryUsers = stored.mutedStoryUsers;
      }
    } catch (e) {}

    applyPrivacyFilters();
    setInterval(applyPrivacyFilters, 1500);
  }

  function getSettings() {
    return { ...privacySettings };
  }

  async function updateSetting(key, val) {
    privacySettings[key] = val;
    await chrome.storage.local.set({ [key]: val });
    applyPrivacyFilters();

    // Broadcast update to ghost.js (MAIN world) for network suppression
    window.postMessage(
      {
        type: 'IG_TOOLS_PRIVACY_SYNC',
        privacy: privacySettings
      },
      '*'
    );
  }

  async function addMutedUser(rawUsername) {
    const clean = (rawUsername || '').trim().replace(/^@/, '').toLowerCase();
    if (!clean) return false;
    if (!privacySettings.mutedStoryUsers.includes(clean)) {
      privacySettings.mutedStoryUsers.push(clean);
      await chrome.storage.local.set({ mutedStoryUsers: privacySettings.mutedStoryUsers });
      applyPrivacyFilters();
      return true;
    }
    return false;
  }

  async function removeMutedUser(rawUsername) {
    const clean = (rawUsername || '').trim().replace(/^@/, '').toLowerCase();
    privacySettings.mutedStoryUsers = privacySettings.mutedStoryUsers.filter((u) => u !== clean);
    await chrome.storage.local.set({ mutedStoryUsers: privacySettings.mutedStoryUsers });
    applyPrivacyFilters();
  }

  function isUserMuted(username) {
    if (!username) return false;
    const clean = username.trim().replace(/^@/, '').toLowerCase();
    return privacySettings.mutedStoryUsers.includes(clean);
  }

  /**
   * Applies client-side DOM filters:
   * 1. Hides/dims story tray bubbles of muted users.
   * 2. Auto-skips muted story if playing.
   * 3. Hides viewer list overlay on user's own stories if hideSeenBy is enabled.
   */
  function applyPrivacyFilters() {
    // 1. Filter Story Tray
    if (privacySettings.mutedStoryUsers.length > 0) {
      const storyRings = document.querySelectorAll('button[role="menuitem"], a[role="link"][href^="/stories/"]');
      storyRings.forEach((el) => {
        const text = el.textContent || '';
        const href = el.getAttribute('href') || '';
        for (const muted of privacySettings.mutedStoryUsers) {
          if (text.toLowerCase().includes(muted) || href.toLowerCase().includes(`/stories/${muted}/`)) {
            el.closest('li, div.x1iyjqo2')?.classList.add('ig-tools-muted-story-item');
          }
        }
      });

      // If active story belongs to a muted user, auto-skip forward
      if (location.pathname.startsWith('/stories/')) {
        const pathUser = location.pathname.split('/')[2];
        if (pathUser && isUserMuted(pathUser)) {
          const nextBtn = document.querySelector('button[aria-label="Next"], svg[aria-label="Next"]')?.closest('button');
          if (nextBtn) {
            console.log(`${LOG_PREFIX} Auto-skipping muted story:`, pathUser);
            nextBtn.click();
          }
        }
      }
    }

    // 2. Hide "Seen by" on own stories
    if (privacySettings.hideSeenBy && location.pathname.startsWith('/stories/')) {
      const viewerBtn = document.querySelector('div[role="button"][aria-label*="Seen by"], div[role="button"][aria-label*="viewers"]');
      if (viewerBtn) {
        viewerBtn.style.display = 'none';
      }
      const viewerSheet = document.querySelector('div[role="dialog"] div[aria-label*="Seen by"]');
      if (viewerSheet) {
        viewerSheet.style.display = 'none';
      }
    }
  }

  return {
    init,
    getSettings,
    updateSetting,
    addMutedUser,
    removeMutedUser,
    isUserMuted,
    applyPrivacyFilters
  };
})();
