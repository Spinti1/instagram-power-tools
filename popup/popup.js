/**
 * IG Tools - Popup Interface Controller
 * Manages user toggles and live statistics from chrome.storage.local.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const masterToggle = document.getElementById('toggle-ghost-master');
  const storiesToggle = document.getElementById('toggle-ghost-stories');
  const dmsToggle = document.getElementById('toggle-ghost-dms');
  const widgetToggle = document.getElementById('toggle-widget');
  const downloaderToggle = document.getElementById('toggle-downloader');
  const friendsToggle = document.getElementById('toggle-friends');
  const commentsToggle = document.getElementById('toggle-comments');
  const reelSliderToggle = document.getElementById('toggle-reel-slider');

  const badgeStatus = document.getElementById('badge-status');
  const cardMaster = document.getElementById('card-master');
  const statStories = document.getElementById('stat-stories');
  const statDMs = document.getElementById('stat-dms');
  const statDownloads = document.getElementById('stat-downloads');
  const statLastTime = document.getElementById('stat-last-time');
  const btnResetStats = document.getElementById('btn-reset-stats');

  /**
   * Updates visual indicators based on active state.
   */
  function renderState(ghostMode) {
    if (ghostMode) {
      badgeStatus.textContent = 'Active';
      badgeStatus.classList.remove('inactive');
      cardMaster.classList.add('highlight');
    } else {
      badgeStatus.textContent = 'Paused';
      badgeStatus.classList.add('inactive');
      cardMaster.classList.remove('highlight');
    }

    storiesToggle.disabled = !ghostMode;
    dmsToggle.disabled = !ghostMode;
  }

  function formatTimestamp(isoString) {
    if (!isoString) return 'No activity yet';
    try {
      const date = new Date(isoString);
      return `Last: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (e) {
      return 'Active';
    }
  }

  /**
   * Loads current preferences and stats from storage.
   */
  async function loadSettings() {
    const data = await chrome.storage.local.get(null);

    const ghostMode = data.ghostMode ?? true;
    const ghostStories = data.ghostStories ?? true;
    const ghostDMs = data.ghostDMs ?? true;
    const showWidget = data.showInPageWidget ?? true;
    const downloader = data.enableDownloader ?? true;
    const friends = data.enableFriendsLiked ?? true;
    const comments = data.enableBetterComments ?? true;
    const reelSlider = data.enableReelSlider ?? true;

    masterToggle.checked = ghostMode;
    storiesToggle.checked = ghostStories;
    dmsToggle.checked = ghostDMs;
    widgetToggle.checked = showWidget;
    downloaderToggle.checked = downloader;
    friendsToggle.checked = friends;
    commentsToggle.checked = comments;
    if (reelSliderToggle) reelSliderToggle.checked = reelSlider;

    renderState(ghostMode);

    const stats = data.stats || { storiesBlocked: 0, dmsBlocked: 0, mediaDownloaded: 0, lastBlockedTime: null };
    statStories.textContent = stats.storiesBlocked || 0;
    statDMs.textContent = stats.dmsBlocked || 0;
    statDownloads.textContent = stats.mediaDownloaded || 0;
    statLastTime.textContent = formatTimestamp(stats.lastBlockedTime);
  }

  // Master Ghost Mode toggle
  masterToggle.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    await chrome.storage.local.set({ ghostMode: isChecked });
    renderState(isChecked);
  });

  // Stories toggle
  storiesToggle.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ ghostStories: e.target.checked });
  });

  // DMs toggle
  dmsToggle.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ ghostDMs: e.target.checked });
  });

  // In-Page Widget toggle
  widgetToggle.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ showInPageWidget: e.target.checked });
  });

  // Downloader toggle
  downloaderToggle.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ enableDownloader: e.target.checked });
  });

  // Friends toggle
  friendsToggle.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ enableFriendsLiked: e.target.checked });
  });

  // Comments toggle
  commentsToggle.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ enableBetterComments: e.target.checked });
  });

  // Reel Slider toggle
  reelSliderToggle?.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ enableReelSlider: e.target.checked });
  });

  // Reset Stats button
  btnResetStats.addEventListener('click', async () => {
    await chrome.storage.local.set({
      stats: { storiesBlocked: 0, dmsBlocked: 0, mediaDownloaded: 0, lastBlockedTime: null }
    });
    statStories.textContent = '0';
    statDMs.textContent = '0';
    statDownloads.textContent = '0';
    statLastTime.textContent = 'Reset';
  });

  // Live storage updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.stats) {
      const newStats = changes.stats.newValue || { storiesBlocked: 0, dmsBlocked: 0, mediaDownloaded: 0 };
      statStories.textContent = newStats.storiesBlocked || 0;
      statDMs.textContent = newStats.dmsBlocked || 0;
      statDownloads.textContent = newStats.mediaDownloaded || 0;
      statLastTime.textContent = formatTimestamp(newStats.lastBlockedTime);
    }

    if (changes.ghostMode !== undefined) {
      masterToggle.checked = changes.ghostMode.newValue;
      renderState(changes.ghostMode.newValue);
    }
  });

  const btnOpenCC = document.getElementById('btn-open-control-center');
  if (btnOpenCC) {
    btnOpenCC.addEventListener('click', async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_CONTROL_CENTER' }, () => {
            void chrome.runtime.lastError;
          });
        }
      } catch (e) {}
      window.close();
    });
  }

  await loadSettings();
});
