/**
 * IG Tools - Background Service Worker (Manifest V3)
 * Dynamic DeclarativeNetRequest firewall rules & download manager.
 */

const LOG_PREFIX = '[IG Tools]';

// Dynamic Rule IDs for declarativeNetRequest (Stories Only - DMs preserved for zero lag)
const RULE_IDS = {
  STORY_REEL_SEEN: 1001,
  STORY_SEEN: 1002,
  MEDIA_SEEN: 1003,
  STORY_MUTATION: 1004
};

// All legacy rule IDs to purge from dynamic rules
const ALL_PURGE_RULE_IDS = [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015];

const DEFAULT_SETTINGS = {
  ghostMode: true,
  ghostStories: true,
  showInPageWidget: true,
  enableDownloader: true,
  enableFriendsLiked: true,
  enableBetterComments: true,
  enableReelSlider: true,
  stats: {
    storiesBlocked: 0,
    mediaDownloaded: 0,
    lastBlockedTime: null
  }
};

/**
 * Creates DeclarativeNetRequest blocking rules strictly for Stories.
 * Zero WebSocket or DM rules to guarantee instant Direct chat and zero lag.
 */
function createRules(blockStories) {
  const rules = [];

  if (blockStories) {
    rules.push({
      id: RULE_IDS.STORY_REEL_SEEN,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||instagram.com/api/v1/stories/reel/seen',
        requestMethods: ['post']
      }
    });

    rules.push({
      id: RULE_IDS.STORY_SEEN,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||instagram.com/api/v1/stories/seen',
        requestMethods: ['post']
      }
    });

    rules.push({
      id: RULE_IDS.MEDIA_SEEN,
      priority: 1,
      action: { type: 'block' },
      condition: {
        regexFilter: '^https?://([^.]+\\.)?instagram\\.com/api/v1/media/[^/]+/seen',
        requestMethods: ['post']
      }
    });

    rules.push({
      id: RULE_IDS.STORY_MUTATION,
      priority: 2,
      action: { type: 'block' },
      condition: {
        urlFilter: 'PolarisStoriesV3SeenMutation'
      }
    });
  }

  return rules;
}

async function syncDNRRules() {
  try {
    const settings = await chrome.storage.local.get(['ghostMode', 'ghostStories']);
    const isGhostActive = settings.ghostMode ?? DEFAULT_SETTINGS.ghostMode;
    const blockStories = isGhostActive && (settings.ghostStories ?? DEFAULT_SETTINGS.ghostStories);

    const rulesToAdd = createRules(blockStories);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ALL_PURGE_RULE_IDS,
      addRules: rulesToAdd
    });

    const enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
    const isRuleset1Enabled = enabledRulesets.includes('ruleset_1');

    if (isGhostActive && !isRuleset1Enabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['ruleset_1'] });
    } else if (!isGhostActive && isRuleset1Enabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['ruleset_1'] });
    }

    console.log(
      `${LOG_PREFIX} Story DNR rules synchronized. Active rules: ${rulesToAdd.length} (Stories: ${blockStories})`
    );
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to sync DNR rules:`, error);
  }
}

// Ensure rules are synced whenever the worker starts
syncDNRRules();

// Extension Lifecycle
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`${LOG_PREFIX} Extension installed/updated (${details.reason}). Initializing.`);

  const existing = await chrome.storage.local.get(null);
  const toSet = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[key] === undefined) {
      toSet[key] = value;
    }
  }

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }

  await syncDNRRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncDNRRules();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.ghostMode || changes.ghostStories) {
    syncDNRRules();
  }
});

// Runtime Messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  switch (message.action) {
    case 'INCREMENT_SEEN_BLOCKED': {
      const type = message.targetType; // 'story' or 'dm'
      chrome.storage.local.get(['stats']).then(({ stats }) => {
        const currentStats = stats || { storiesBlocked: 0, dmsBlocked: 0, mediaDownloaded: 0, lastBlockedTime: null };
        if (type === 'story') {
          currentStats.storiesBlocked = (currentStats.storiesBlocked || 0) + 1;
        } else if (type === 'dm') {
          currentStats.dmsBlocked = (currentStats.dmsBlocked || 0) + 1;
        }
        currentStats.lastBlockedTime = new Date().toISOString();
        chrome.storage.local.set({ stats: currentStats });
      });
      sendResponse({ success: true });
      break;
    }

    case 'DOWNLOAD_MEDIA': {
      const { url, filename } = message;
      if (!url) {
        sendResponse({ success: false, error: 'Missing download URL' });
        return false;
      }

      console.log(`${LOG_PREFIX} Chrome Downloads dispatch:`, filename || url);

      chrome.downloads.download(
        {
          url: url,
          filename: filename || 'instagram_media.mp4',
          saveAs: false,
          conflictAction: 'uniquify'
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            console.warn(`${LOG_PREFIX} chrome.downloads failed:`, chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            console.log(`${LOG_PREFIX} Download initiated, ID:`, downloadId);

            chrome.storage.local.get(['stats']).then(({ stats }) => {
              const currentStats = stats || { storiesBlocked: 0, dmsBlocked: 0, mediaDownloaded: 0 };
              currentStats.mediaDownloaded = (currentStats.mediaDownloaded || 0) + 1;
              chrome.storage.local.set({ stats: currentStats });
            });

            sendResponse({ success: true, downloadId });
          }
        }
      );
      return true;
    }

    case 'RESET_STATS': {
      chrome.storage.local.set({
        stats: { storiesBlocked: 0, dmsBlocked: 0, mediaDownloaded: 0, lastBlockedTime: null }
      }).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    case 'GET_STATS': {
      chrome.storage.local.get(['stats']).then(({ stats }) => {
        sendResponse(stats || { storiesBlocked: 0, dmsBlocked: 0, mediaDownloaded: 0 });
      });
      return true;
    }

    case 'GET_SETTINGS': {
      chrome.storage.local.get(null).then((data) => {
        sendResponse({ data });
      });
      return true;
    }

    default:
      break;
  }
  return false;
});
