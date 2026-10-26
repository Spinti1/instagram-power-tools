/**
 * IG Tools - Background Service Worker (Manifest V3)
 * Dynamic DeclarativeNetRequest firewall rules & download manager.
 */

const LOG_PREFIX = '[IG Tools]';

// Dynamic Rule IDs for declarativeNetRequest
const RULE_IDS = {
  STORY_REEL_SEEN: 1001,
  STORY_SEEN: 1002,
  MEDIA_SEEN: 1003,
  DM_DIRECT_V2_SEEN: 1004,
  DM_DIRECT_V2_READ: 1005,
  DM_DIRECT_V2_BATCHED: 1006,
  DM_ACTIVITY_SEEN: 1007,
  DM_DIRECT_SEEN: 1008,
  DM_REGEX_ALL: 1009,
  DM_WS_EDGE_CHAT_IG: 1010,
  DM_WS_EDGE_CHAT_FB: 1011,
  DM_WS_GATEWAY_IG: 1012,
  DM_WEB_WORKER_BUNDLE: 1013,
  DM_VALIDATION_MUTATION: 1014
};

const DEFAULT_SETTINGS = {
  ghostMode: true,
  ghostStories: true,
  ghostDMs: true,
  showInPageWidget: true,
  enableDownloader: true,
  enableFriendsLiked: true,
  enableBetterComments: true,
  stats: {
    storiesBlocked: 0,
    dmsBlocked: 0,
    mediaDownloaded: 0,
    lastBlockedTime: null
  }
};

/**
 * Creates DeclarativeNetRequest blocking rules.
 * Applies across ALL resource types (xmlhttprequest, ping, other, etc.).
 */
function createRules(blockStories, blockDMs) {
  const rules = [];

  if (blockStories) {
    rules.push({
      id: RULE_IDS.STORY_REEL_SEEN,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||instagram.com/api/v1/stories/reel/seen'
      }
    });

    rules.push({
      id: RULE_IDS.STORY_SEEN,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||instagram.com/api/v1/stories/seen'
      }
    });

    rules.push({
      id: RULE_IDS.MEDIA_SEEN,
      priority: 1,
      action: { type: 'block' },
      condition: {
        regexFilter: '^https?://([^.]+\\.)?instagram\\.com/api/v1/media/[^/]+/seen'
      }
    });
  }

  if (blockDMs) {
    rules.push({
      id: RULE_IDS.DM_DIRECT_V2_SEEN,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||instagram.com/api/v1/direct_v2/threads/*/items/*/seen/',
        requestMethods: ['post']
      }
    });

    rules.push({
      id: RULE_IDS.DM_DIRECT_V2_READ,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||instagram.com/api/v1/direct_v2/threads/*/seen/',
        requestMethods: ['post']
      }
    });

    rules.push({
      id: RULE_IDS.DM_DIRECT_V2_BATCHED,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||instagram.com/api/v1/direct_v2/threads/batched_seen*',
        requestMethods: ['post']
      }
    });

    rules.push({
      id: RULE_IDS.DM_ACTIVITY_SEEN,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||instagram.com/api/v1/direct_v2/threads/*/activity_status_seen*',
        requestMethods: ['post']
      }
    });

    rules.push({
      id: RULE_IDS.DM_DIRECT_SEEN,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||instagram.com/api/v1/direct_v2/threads/*/seen_direct_thread*',
        requestMethods: ['post']
      }
    });

    rules.push({
      id: RULE_IDS.DM_REGEX_ALL,
      priority: 1,
      action: { type: 'block' },
      condition: {
        regexFilter: '^https?://([^.]+\\.)?instagram\\.com/api/v1/direct(_v2)?/threads/.*/items/.*/seen',
        requestMethods: ['post']
      }
    });

    // Block real-time MQTT WebSockets (edge-chat & gateway) that transmit seen receipts
    rules.push({
      id: RULE_IDS.DM_WS_EDGE_CHAT_IG,
      priority: 2,
      action: { type: 'block' },
      condition: {
        regexFilter: '^wss?://([a-zA-Z0-9_-]+\\.)?edge-chat\\.instagram\\.com',
        resourceTypes: ['websocket'],
        initiatorDomains: ['instagram.com']
      }
    });

    rules.push({
      id: RULE_IDS.DM_WS_EDGE_CHAT_FB,
      priority: 2,
      action: { type: 'block' },
      condition: {
        regexFilter: '^wss?://([a-zA-Z0-9_-]+\\.)?edge-chat\\.facebook\\.com',
        resourceTypes: ['websocket'],
        initiatorDomains: ['instagram.com']
      }
    });

    rules.push({
      id: RULE_IDS.DM_WS_GATEWAY_IG,
      priority: 2,
      action: { type: 'block' },
      condition: {
        regexFilter: '^wss?://([a-zA-Z0-9_-]+\\.)?gateway\\.instagram\\.com',
        resourceTypes: ['websocket'],
        initiatorDomains: ['instagram.com']
      }
    });



    rules.push({
      id: RULE_IDS.DM_VALIDATION_MUTATION,
      priority: 2,
      action: { type: 'block' },
      condition: {
        urlFilter: 'useIGDMarkThreadAsRead'
      }
    });
  }

  return rules;
}

async function syncDNRRules() {
  try {
    const settings = await chrome.storage.local.get(['ghostMode', 'ghostStories', 'ghostDMs']);
    const isGhostActive = settings.ghostMode ?? DEFAULT_SETTINGS.ghostMode;
    const blockStories = isGhostActive && (settings.ghostStories ?? DEFAULT_SETTINGS.ghostStories);
    const blockDMs = isGhostActive && (settings.ghostDMs ?? DEFAULT_SETTINGS.ghostDMs);

    const ruleIdsToRemove = Object.values(RULE_IDS);
    const rulesToAdd = createRules(blockStories, blockDMs);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIdsToRemove,
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
      `${LOG_PREFIX} DNR rules synchronized. Active dynamic rules: ${rulesToAdd.length} (Ghost: ${isGhostActive}, Stories: ${blockStories}, DMs: ${blockDMs})`
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

  if (changes.ghostMode || changes.ghostStories || changes.ghostDMs) {
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
