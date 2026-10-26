/**
 * IG Tools - Account Tools Module
 * Provides client-side analytics and productivity features:
 * - Unfollowers Tracker (who doesn't follow you back)
 * - Bot / spam follower indicator
 * - CSV export for Followers and Following lists
 * - Personal private notes/tags on profiles (saved locally)
 */

window.IGTools = window.IGTools || {};

window.IGTools.account = (() => {
  const LOG_PREFIX = '[IG Tools] [Account]';

  if (window.self !== window.top) {
    return {
      init: () => {},
      scanUnfollowers: () => {},
      exportUsersToCSV: () => {},
      isSuspectedBot: () => false,
      saveProfileNote: () => {},
      getProfileNote: () => null,
      getAllNotes: () => ({}),
      getCachedFollowers: () => [],
      getCachedFollowing: () => []
    };
  }

  let currentUserId = null;
  let currentUsername = null;
  let isScanning = false;
  let scanProgressCallback = null;

  let cachedFollowers = [];
  let cachedFollowing = [];
  let profileNotes = {}; // username -> noteText

  function getCsrfToken() {
    return (
      document.documentElement.dataset.igToolsCsrfToken ||
      document.cookie.match(/csrftoken=([^;]+)/)?.[1] ||
      ''
    );
  }

  function detectCurrentUser() {
    const match = document.cookie.match(/ds_user_id=([0-9]+)/);
    if (match) currentUserId = match[1];

    const userMatch = document.querySelector('a[href^="/"][role="link"] img[alt*="profile picture"]')?.closest('a')?.getAttribute('href')?.replace(/\//g, '');
    if (userMatch) currentUsername = userMatch;
  }

  async function init() {
    console.log(`${LOG_PREFIX} Initializing Account module...`);
    detectCurrentUser();

    try {
      const stored = await chrome.storage.local.get(['igToolsProfileNotes']);
      if (stored && stored.igToolsProfileNotes) {
        profileNotes = stored.igToolsProfileNotes;
      }
    } catch (e) {}

    injectProfileNoteBadge();
    setInterval(injectProfileNoteBadge, 2000);
  }

  /**
   * Fetches paginated users list from Instagram API with safe pacing.
   */
  async function fetchUserList(endpointType, onProgress) {
    detectCurrentUser();
    if (!currentUserId) {
      throw new Error('Please make sure you are logged into Instagram.');
    }

    const csrfToken = getCsrfToken();
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477'
    };
    if (csrfToken) headers['X-CSRFToken'] = csrfToken;

    let users = [];
    let maxId = '';
    let page = 0;
    const maxPages = 20; // safety ceiling to prevent excessive requests

    while (page < maxPages) {
      let url = `https://www.instagram.com/api/v1/friendships/${currentUserId}/${endpointType}/?count=100`;
      if (maxId) url += `&max_id=${encodeURIComponent(maxId)}`;

      const resp = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers
      });

      if (!resp.ok) {
        throw new Error(`Failed to fetch ${endpointType} (HTTP ${resp.status})`);
      }

      const data = await resp.json();
      const pageUsers = data.users || [];
      users.push(...pageUsers);

      if (typeof onProgress === 'function') {
        onProgress(users.length);
      }

      if (!data.next_max_id) break;
      maxId = data.next_max_id;
      page++;

      // Pacing delay to avoid Instagram rate limits
      await new Promise((r) => setTimeout(r, 650));
    }

    return users;
  }

  /**
   * Scans for users you follow who do NOT follow you back.
   */
  async function scanUnfollowers(onProgress) {
    if (isScanning) return null;
    isScanning = true;

    try {
      if (onProgress) onProgress({ step: 'following', count: 0 });
      const following = await fetchUserList('following', (c) => onProgress?.({ step: 'following', count: c }));
      cachedFollowing = following;

      if (onProgress) onProgress({ step: 'followers', count: 0 });
      const followers = await fetchUserList('followers', (c) => onProgress?.({ step: 'followers', count: c }));
      cachedFollowers = followers;

      const followerIds = new Set(followers.map((u) => String(u.pk || u.id)));
      const followingIds = new Set(following.map((u) => String(u.pk || u.id)));

      // People you follow who do not follow you back
      const notFollowingBack = following.filter((u) => !followerIds.has(String(u.pk || u.id)));

      // People who follow you that you don't follow back
      const fans = followers.filter((u) => !followingIds.has(String(u.pk || u.id)));

      return {
        totalFollowing: following.length,
        totalFollowers: followers.length,
        notFollowingBack,
        fans
      };
    } finally {
      isScanning = false;
    }
  }

  /**
   * Heuristic to identify suspicious bot/spam accounts.
   */
  function isSuspectedBot(user) {
    if (!user) return false;
    const username = (user.username || '').toLowerCase();
    const hasDefaultPic = Boolean(user.has_anonymous_profile_picture);
    const hasManyDigits = (username.match(/\d/g) || []).length >= 4;
    return hasDefaultPic || hasManyDigits;
  }

  /**
   * Exports list of user objects to CSV and triggers direct download.
   */
  function exportUsersToCSV(userList, filename = 'instagram_users.csv') {
    if (!userList || userList.length === 0) return false;

    const headers = ['Username', 'Full Name', 'Profile URL', 'Is Private', 'Is Verified'];
    const rows = userList.map((u) => [
      `"${(u.username || '').replace(/"/g, '""')}"`,
      `"${(u.full_name || '').replace(/"/g, '""')}"`,
      `"https://www.instagram.com/${u.username}/"`,
      u.is_private ? 'Yes' : 'No',
      u.is_verified ? 'Yes' : 'No'
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);

    return true;
  }

  // =========================================================================
  // Profile Notes Feature
  // =========================================================================

  async function saveProfileNote(username, noteText) {
    const clean = (username || '').trim().replace(/^@/, '').toLowerCase();
    if (!clean) return;

    if (noteText && noteText.trim()) {
      profileNotes[clean] = noteText.trim();
    } else {
      delete profileNotes[clean];
    }

    await chrome.storage.local.set({ igToolsProfileNotes: profileNotes });
    injectProfileNoteBadge();
  }

  function getProfileNote(username) {
    const clean = (username || '').trim().replace(/^@/, '').toLowerCase();
    return profileNotes[clean] || null;
  }

  function getAllNotes() {
    return { ...profileNotes };
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

  /**
   * Injects private note badge directly onto the viewed Instagram profile header.
   */
  function injectProfileNoteBadge() {
    // Check if on a user profile page (e.g. /username/)
    const pathParts = location.pathname.split('/').filter(Boolean);
    if (pathParts.length !== 1) return;
    const username = pathParts[0].toLowerCase();
    if (['reels', 'explore', 'direct', 'stories', 'p', 'reel'].includes(username)) return;

    const note = profileNotes[username];
    const headerSection = document.querySelector('header section');
    if (!headerSection) return;

    let badge = document.getElementById('ig-tools-profile-note-badge');
    if (!note) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'ig-tools-profile-note-badge';
      badge.className = 'ig-tools-note-pill';
      headerSection.appendChild(badge);
    }

    const safeNote = escapeHtml(note);
    badge.innerHTML = `
      <span class="ig-tools-note-icon">📝</span>
      <span class="ig-tools-note-text" title="${safeNote}">Note: ${safeNote}</span>
    `;
  }

  return {
    init,
    scanUnfollowers,
    exportUsersToCSV,
    isSuspectedBot,
    saveProfileNote,
    getProfileNote,
    getAllNotes,
    getCachedFollowers: () => cachedFollowers,
    getCachedFollowing: () => cachedFollowing
  };
})();
