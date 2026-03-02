// RavenLoom - ChatGPT Content Script
// Extracts conversation data from ChatGPT pages

(function() {
  'use strict';

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractConversation') {
      const conversation = extractConversation();
      sendResponse(conversation);
    }
    return true; // Keep channel open for async response
  });

  function extractConversation() {
    try {
      const messages = [];

      // Get conversation title
      const title = getConversationTitle();

      // Method 1: Data attribute based extraction (most reliable)
      const messageContainers = document.querySelectorAll('[data-message-author-role]');

      if (messageContainers.length > 0) {
        messageContainers.forEach(container => {
          const role = container.getAttribute('data-message-author-role');
          const contentEl = findMessageContent(container);

          if (contentEl && contentEl.textContent.trim()) {
            messages.push({
              role: role === 'user' ? 'user' : 'assistant',
              content: contentEl.textContent.trim(),
              timestamp: extractTimestamp(container)
            });
          }
        });
      }

      // Method 2: Fallback to turn-based extraction
      if (messages.length === 0) {
        const turns = document.querySelectorAll('[data-testid^="conversation-turn"]');

        turns.forEach((turn, index) => {
          const contentEl = turn.querySelector('.markdown, .whitespace-pre-wrap, [class*="prose"]');
          if (contentEl && contentEl.textContent.trim()) {
            // Odd turns are user, even turns are assistant (typically)
            const isUser = turn.querySelector('[data-message-author-role="user"]') !== null;

            messages.push({
              role: isUser ? 'user' : 'assistant',
              content: contentEl.textContent.trim()
            });
          }
        });
      }

      // Method 3: Generic prose blocks
      if (messages.length === 0) {
        const proseBlocks = document.querySelectorAll('.prose');
        let isUser = true;

        proseBlocks.forEach(block => {
          const text = block.textContent.trim();
          if (text) {
            messages.push({
              role: isUser ? 'user' : 'assistant',
              content: text
            });
            isUser = !isUser;
          }
        });
      }

      // Deduplicate messages
      const uniqueMessages = deduplicateMessages(messages);

      return {
        platform: 'chatgpt',
        title,
        messages: uniqueMessages,
        messageCount: uniqueMessages.length,
        extractedAt: new Date().toISOString(),
        url: window.location.href
      };
    } catch (error) {
      console.error('RavenLoom: Error extracting conversation', error);
      return {
        platform: 'chatgpt',
        title: 'Error extracting conversation',
        messages: [],
        error: error.message
      };
    }
  }

  function getConversationTitle() {
    // Try multiple selectors for title
    const selectors = [
      'h1',
      '[data-testid="conversation-title"]',
      '.text-base.font-semibold',
      'nav a.bg-gray-800, nav a.bg-token-sidebar-surface-secondary'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        const title = el.textContent.trim();
        if (title !== 'ChatGPT' && title.length > 0) {
          return title;
        }
      }
    }

    // Fallback to document title
    return document.title.replace(' - ChatGPT', '').replace('ChatGPT', '').trim() || 'Untitled Conversation';
  }

  function findMessageContent(container) {
    // Try various content selectors
    const selectors = [
      '.markdown',
      '.whitespace-pre-wrap',
      '[class*="prose"]',
      '.text-base',
      'p'
    ];

    for (const selector of selectors) {
      const el = container.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el;
      }
    }

    return null;
  }

  function extractTimestamp(container) {
    // ChatGPT doesn't always show timestamps, but try to find them
    const timeEl = container.querySelector('time, [datetime]');
    if (timeEl) {
      return timeEl.getAttribute('datetime') || timeEl.textContent;
    }
    return null;
  }

  function deduplicateMessages(messages) {
    const seen = new Set();
    return messages.filter(msg => {
      const key = `${msg.role}:${msg.content.substring(0, 100)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // Notify that content script is ready
  console.log('RavenLoom: ChatGPT content script loaded');
})();
