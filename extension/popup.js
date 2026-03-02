// RavenLoom Browser Extension - Popup Script

class RavenLoomPopup {
  constructor() {
    this.serverUrl = '';
    this.apiKey = '';
    this.teams = [];
    this.currentTab = null;
    this.extractedConversation = null;

    this.init();
  }

  async init() {
    // Load saved settings
    await this.loadSettings();

    // Set up event listeners
    this.setupEventListeners();

    // Check current tab
    await this.detectCurrentPage();

    // Check connection and load teams
    await this.checkConnection();
  }

  async loadSettings() {
    const settings = await chrome.storage.sync.get(['serverUrl', 'apiKey']);
    this.serverUrl = settings.serverUrl || '';
    this.apiKey = settings.apiKey || '';

    // Populate settings form
    document.getElementById('server-url').value = this.serverUrl;
    document.getElementById('api-key').value = this.apiKey;
  }

  setupEventListeners() {
    // Settings navigation
    document.getElementById('open-settings').addEventListener('click', (e) => {
      e.preventDefault();
      this.showSettingsView();
    });

    document.getElementById('back-to-main').addEventListener('click', () => {
      this.showMainView();
    });

    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    // Import button
    document.getElementById('import-btn').addEventListener('click', () => {
      this.importConversation();
    });

    // View in app button
    document.getElementById('view-in-app').addEventListener('click', () => {
      if (this.serverUrl) {
        chrome.tabs.create({ url: this.serverUrl });
      }
    });

    // Team selection change
    document.getElementById('team-select').addEventListener('change', () => {
      this.updateImportButton();
    });
  }

  showSettingsView() {
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('settings-view').classList.remove('hidden');
  }

  showMainView() {
    document.getElementById('settings-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
  }

  async saveSettings() {
    this.serverUrl = document.getElementById('server-url').value.trim();
    this.apiKey = document.getElementById('api-key').value.trim();

    // Remove trailing slash
    if (this.serverUrl.endsWith('/')) {
      this.serverUrl = this.serverUrl.slice(0, -1);
    }

    await chrome.storage.sync.set({
      serverUrl: this.serverUrl,
      apiKey: this.apiKey
    });

    this.showMainView();
    await this.checkConnection();
  }

  async detectCurrentPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;

      const pageInfo = document.getElementById('page-info');
      const url = tab.url || '';

      if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) {
        pageInfo.className = 'status connected';
        pageInfo.textContent = 'ChatGPT conversation detected';
        await this.extractFromPage('chatgpt');
      } else if (url.includes('claude.ai')) {
        pageInfo.className = 'status connected';
        pageInfo.textContent = 'Claude conversation detected';
        await this.extractFromPage('claude');
      } else {
        pageInfo.className = 'status disconnected';
        pageInfo.textContent = 'Navigate to ChatGPT or Claude to import';
      }
    } catch (error) {
      console.error('Error detecting page:', error);
      const pageInfo = document.getElementById('page-info');
      pageInfo.className = 'status disconnected';
      pageInfo.textContent = 'Unable to detect page';
    }
  }

  async extractFromPage(platform) {
    try {
      // Inject content script and get conversation
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        func: platform === 'chatgpt' ? extractChatGPTConversation : extractClaudeConversation
      });

      if (result && result.result) {
        this.extractedConversation = result.result;
        this.showPreview();
      }
    } catch (error) {
      console.error('Error extracting conversation:', error);
      this.showError('Unable to extract conversation. Try refreshing the page.');
    }
  }

  showPreview() {
    if (!this.extractedConversation || !this.extractedConversation.messages) {
      return;
    }

    const previewSection = document.getElementById('preview-section');
    const previewTitle = document.getElementById('preview-title');
    const previewMessages = document.getElementById('preview-messages');

    previewTitle.textContent = this.extractedConversation.title || 'Untitled Conversation';

    // Show first few messages
    const messages = this.extractedConversation.messages.slice(0, 5);
    previewMessages.innerHTML = messages.map(msg => {
      const role = msg.role === 'user' ? 'You' : 'AI';
      const preview = msg.content.substring(0, 80) + (msg.content.length > 80 ? '...' : '');
      return `<div class="preview-item"><strong>${role}:</strong> ${this.escapeHtml(preview)}</div>`;
    }).join('');

    if (this.extractedConversation.messages.length > 5) {
      previewMessages.innerHTML += `<div class="preview-item" style="color: #6366f1; font-style: italic;">+ ${this.extractedConversation.messages.length - 5} more messages</div>`;
    }

    previewSection.classList.remove('hidden');
    this.updateImportButton();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async checkConnection() {
    const statusEl = document.getElementById('connection-status');

    if (!this.serverUrl) {
      statusEl.className = 'status disconnected';
      statusEl.textContent = 'Configure server URL in settings';
      return;
    }

    statusEl.className = 'status detecting';
    statusEl.textContent = 'Connecting to RavenLoom...';

    try {
      const response = await this.apiRequest('/graphql', {
        method: 'POST',
        body: JSON.stringify({
          query: `query { getTeams { id name } }`
        })
      });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'GraphQL error');
      }

      this.teams = response.data?.getTeams || [];

      statusEl.className = 'status connected';
      statusEl.textContent = `Connected (${this.teams.length} team${this.teams.length !== 1 ? 's' : ''})`;

      this.populateTeamSelect();
    } catch (error) {
      console.error('Connection error:', error);
      statusEl.className = 'status disconnected';
      statusEl.textContent = 'Unable to connect. Check settings.';
    }
  }

  populateTeamSelect() {
    const teamSection = document.getElementById('team-section');
    const teamSelect = document.getElementById('team-select');

    if (this.teams.length === 0) {
      teamSection.classList.add('hidden');
      return;
    }

    teamSelect.innerHTML = this.teams.map(team =>
      `<option value="${team.id}">${this.escapeHtml(team.name)}</option>`
    ).join('');

    teamSection.classList.remove('hidden');
    this.updateImportButton();
  }

  updateImportButton() {
    const importBtn = document.getElementById('import-btn');
    const teamId = document.getElementById('team-select').value;

    const canImport = this.extractedConversation &&
                      this.extractedConversation.messages &&
                      this.extractedConversation.messages.length > 0 &&
                      teamId;

    importBtn.disabled = !canImport;
    importBtn.classList.toggle('hidden', !this.extractedConversation);
  }

  async importConversation() {
    const importBtn = document.getElementById('import-btn');
    const teamId = document.getElementById('team-select').value;

    if (!this.extractedConversation || !teamId) {
      return;
    }

    importBtn.disabled = true;
    importBtn.textContent = 'Importing...';

    try {
      const format = this.extractedConversation.platform === 'chatgpt'
        ? 'chatgpt_json'
        : 'claude_markdown';

      const response = await this.apiRequest('/graphql', {
        method: 'POST',
        body: JSON.stringify({
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
              content: JSON.stringify(this.extractedConversation),
              title: this.extractedConversation.title,
              sourceUrl: this.currentTab?.url
            }
          }
        })
      });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Import failed');
      }

      const result = response.data?.importConversation;

      if (result?.success) {
        this.showSuccess(result);
      } else {
        throw new Error(result?.message || 'Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      this.showError(`Import failed: ${error.message}`);
      importBtn.disabled = false;
      importBtn.textContent = 'Import Conversation';
    }
  }

  showSuccess(result) {
    document.getElementById('detection-section').classList.add('hidden');
    document.getElementById('team-section').classList.add('hidden');
    document.getElementById('preview-section').classList.add('hidden');
    document.getElementById('import-btn').classList.add('hidden');

    const successSection = document.getElementById('success-section');
    const successMessage = document.getElementById('success-message');

    successMessage.textContent = `Created ${result.nodesCreated} nodes and ${result.factsCreated} facts`;
    successSection.classList.remove('hidden');
  }

  showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');

    setTimeout(() => {
      errorEl.classList.add('hidden');
    }, 5000);
  }

  async apiRequest(endpoint, options = {}) {
    const url = this.serverUrl + endpoint;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }
}

// Content script functions to be injected
function extractChatGPTConversation() {
  try {
    const messages = [];

    // Get title from the page
    const titleEl = document.querySelector('h1') ||
                    document.querySelector('[data-testid="conversation-title"]');
    const title = titleEl?.textContent?.trim() || document.title.replace(' - ChatGPT', '').trim();

    // Find message containers - ChatGPT DOM structure
    const messageContainers = document.querySelectorAll('[data-message-author-role]');

    messageContainers.forEach(container => {
      const role = container.getAttribute('data-message-author-role');
      const contentEl = container.querySelector('.markdown') || container.querySelector('.whitespace-pre-wrap');

      if (contentEl) {
        messages.push({
          role: role === 'user' ? 'user' : 'assistant',
          content: contentEl.textContent?.trim() || ''
        });
      }
    });

    // Fallback: Try alternative selector patterns
    if (messages.length === 0) {
      const turns = document.querySelectorAll('[class*="ConversationItem"]');
      turns.forEach(turn => {
        const isUser = turn.querySelector('[data-message-author-role="user"]') ||
                       turn.classList.contains('user');
        const textEl = turn.querySelector('.text-base') ||
                       turn.querySelector('[class*="prose"]');

        if (textEl) {
          messages.push({
            role: isUser ? 'user' : 'assistant',
            content: textEl.textContent?.trim() || ''
          });
        }
      });
    }

    return {
      platform: 'chatgpt',
      title,
      messages,
      extractedAt: new Date().toISOString(),
      url: window.location.href
    };
  } catch (error) {
    console.error('Error extracting ChatGPT conversation:', error);
    return null;
  }
}

function extractClaudeConversation() {
  try {
    const messages = [];

    // Get title from page
    const titleEl = document.querySelector('h1') ||
                    document.querySelector('[class*="conversation-title"]');
    const title = titleEl?.textContent?.trim() || document.title.replace(' - Claude', '').trim();

    // Find message containers - Claude DOM structure
    const messageContainers = document.querySelectorAll('[class*="Message"]');

    messageContainers.forEach(container => {
      const isHuman = container.classList.contains('human') ||
                      container.querySelector('[class*="human"]') ||
                      container.getAttribute('data-is-human') === 'true';

      const contentEl = container.querySelector('[class*="contents"]') ||
                        container.querySelector('[class*="markdown"]') ||
                        container.querySelector('p');

      if (contentEl) {
        messages.push({
          role: isHuman ? 'user' : 'assistant',
          content: contentEl.textContent?.trim() || ''
        });
      }
    });

    // Fallback: Try looking for human/assistant patterns
    if (messages.length === 0) {
      const allText = document.querySelectorAll('[class*="prose"], [class*="markdown"]');
      let currentRole = 'user';

      allText.forEach(el => {
        const parent = el.closest('[class*="Message"], [class*="message"]');
        if (parent) {
          const isHuman = parent.className.includes('Human') ||
                          parent.className.includes('human') ||
                          parent.getAttribute('data-role') === 'human';
          currentRole = isHuman ? 'user' : 'assistant';
        }

        messages.push({
          role: currentRole,
          content: el.textContent?.trim() || ''
        });

        // Alternate role for next message
        currentRole = currentRole === 'user' ? 'assistant' : 'user';
      });
    }

    return {
      platform: 'claude',
      title,
      messages,
      extractedAt: new Date().toISOString(),
      url: window.location.href
    };
  } catch (error) {
    console.error('Error extracting Claude conversation:', error);
    return null;
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new RavenLoomPopup();
});
