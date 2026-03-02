// RavenLoom - Background Service Worker
// Handles API communication and cross-script coordination

// Cache for auth state and settings
let cachedSettings = null;

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('RavenLoom extension installed');

    // Set default settings
    chrome.storage.sync.set({
      serverUrl: '',
      apiKey: ''
    });
  } else if (details.reason === 'update') {
    console.log('RavenLoom extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender)
    .then(sendResponse)
    .catch(error => {
      console.error('Background message handler error:', error);
      sendResponse({ error: error.message });
    });

  return true; // Keep channel open for async response
});

async function handleMessage(request, sender) {
  switch (request.action) {
    case 'getSettings':
      return getSettings();

    case 'saveSettings':
      return saveSettings(request.settings);

    case 'checkConnection':
      return checkConnection(request.serverUrl, request.apiKey);

    case 'getTeams':
      return getTeams();

    case 'importConversation':
      return importConversation(request.teamId, request.conversation);

    case 'ping':
      return { status: 'ok', timestamp: Date.now() };

    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}

async function getSettings() {
  if (cachedSettings) {
    return cachedSettings;
  }

  const settings = await chrome.storage.sync.get(['serverUrl', 'apiKey']);
  cachedSettings = settings;
  return settings;
}

async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
  cachedSettings = { ...cachedSettings, ...settings };
  return { success: true };
}

async function checkConnection(serverUrl, apiKey) {
  try {
    const response = await apiRequest(serverUrl, apiKey, {
      query: `query { __typename }`
    });

    return {
      connected: true,
      error: null
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

async function getTeams() {
  const settings = await getSettings();

  if (!settings.serverUrl) {
    throw new Error('Server URL not configured');
  }

  const response = await apiRequest(settings.serverUrl, settings.apiKey, {
    query: `
      query GetTeams {
        getTeams {
          id
          name
          description
        }
      }
    `
  });

  if (response.errors) {
    throw new Error(response.errors[0]?.message || 'Failed to fetch teams');
  }

  return response.data?.getTeams || [];
}

async function importConversation(teamId, conversation) {
  const settings = await getSettings();

  if (!settings.serverUrl) {
    throw new Error('Server URL not configured');
  }

  const format = conversation.platform === 'chatgpt' ? 'chatgpt_json' : 'claude_markdown';

  const response = await apiRequest(settings.serverUrl, settings.apiKey, {
    query: `
      mutation ImportConversation($teamId: ID!, $input: ConversationImportInput!) {
        importConversation(teamId: $teamId, input: $input) {
          success
          nodesCreated
          factsCreated
          rootNodeId
          message
        }
      }
    `,
    variables: {
      teamId,
      input: {
        format,
        content: JSON.stringify(conversation),
        title: conversation.title,
        sourceUrl: conversation.url
      }
    }
  });

  if (response.errors) {
    throw new Error(response.errors[0]?.message || 'Import failed');
  }

  const result = response.data?.importConversation;

  if (!result?.success) {
    throw new Error(result?.message || 'Import failed');
  }

  return result;
}

async function apiRequest(serverUrl, apiKey, body) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${serverUrl}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// Badge management for status indication
function setBadgeStatus(status) {
  const colors = {
    connected: '#22c55e',
    error: '#ef4444',
    loading: '#6366f1'
  };

  chrome.action.setBadgeBackgroundColor({ color: colors[status] || colors.loading });
  chrome.action.setBadgeText({ text: status === 'connected' ? '' : '!' });
}

// Periodic connection check (optional)
async function periodicConnectionCheck() {
  try {
    const settings = await getSettings();
    if (settings.serverUrl) {
      const result = await checkConnection(settings.serverUrl, settings.apiKey);
      setBadgeStatus(result.connected ? 'connected' : 'error');
    }
  } catch (error) {
    setBadgeStatus('error');
  }
}

// Run connection check every 5 minutes
chrome.alarms.create('connectionCheck', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'connectionCheck') {
    periodicConnectionCheck();
  }
});

console.log('RavenLoom background service worker started');
