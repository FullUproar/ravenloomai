// RavenLoom - Claude Content Script
// Extracts conversation data from Claude.ai pages

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

      // Method 1: Look for human/assistant message blocks
      const humanMessages = document.querySelectorAll('[class*="human-turn"], [data-is-human="true"], .human-message');
      const assistantMessages = document.querySelectorAll('[class*="assistant-turn"], [data-is-assistant="true"], .assistant-message');

      if (humanMessages.length > 0 || assistantMessages.length > 0) {
        // Get all message blocks and sort by DOM order
        const allBlocks = [];

        humanMessages.forEach(el => {
          allBlocks.push({ el, role: 'user', order: getElementOrder(el) });
        });

        assistantMessages.forEach(el => {
          allBlocks.push({ el, role: 'assistant', order: getElementOrder(el) });
        });

        // Sort by DOM position
        allBlocks.sort((a, b) => a.order - b.order);

        allBlocks.forEach(block => {
          const content = extractMessageContent(block.el);
          if (content) {
            messages.push({
              role: block.role,
              content
            });
          }
        });
      }

      // Method 2: Look for generic message containers
      if (messages.length === 0) {
        const messageContainers = document.querySelectorAll('[class*="Message"], [class*="message-content"]');

        messageContainers.forEach(container => {
          const role = detectMessageRole(container);
          const content = extractMessageContent(container);

          if (content) {
            messages.push({ role, content });
          }
        });
      }

      // Method 3: Content blocks with alternating pattern
      if (messages.length === 0) {
        const contentBlocks = document.querySelectorAll('[class*="prose"], [class*="markdown"], .ProseMirror');
        let isUser = true;

        contentBlocks.forEach(block => {
          // Skip input areas
          if (block.closest('[contenteditable="true"]') ||
              block.closest('textarea') ||
              block.closest('form')) {
            return;
          }

          const text = block.textContent.trim();
          if (text && text.length > 10) {
            // Try to detect role from parent
            const parent = block.closest('[class*="human"], [class*="Human"]');
            const role = parent ? 'user' : (isUser ? 'user' : 'assistant');

            messages.push({
              role,
              content: text
            });
            isUser = !isUser;
          }
        });
      }

      // Method 4: Article-based extraction
      if (messages.length === 0) {
        const articles = document.querySelectorAll('article, [role="article"]');

        articles.forEach(article => {
          const role = detectMessageRole(article);
          const content = article.textContent.trim();

          if (content && content.length > 10) {
            messages.push({ role, content });
          }
        });
      }

      // Deduplicate and clean
      const uniqueMessages = deduplicateMessages(messages);

      return {
        platform: 'claude',
        title,
        messages: uniqueMessages,
        messageCount: uniqueMessages.length,
        extractedAt: new Date().toISOString(),
        url: window.location.href
      };
    } catch (error) {
      console.error('RavenLoom: Error extracting conversation', error);
      return {
        platform: 'claude',
        title: 'Error extracting conversation',
        messages: [],
        error: error.message
      };
    }
  }

  function getConversationTitle() {
    // Try multiple selectors for Claude title
    const selectors = [
      '[class*="conversation-title"]',
      '[class*="ConversationTitle"]',
      'h1:not([class*="sr-only"])',
      '[data-testid="conversation-title"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        const title = el.textContent.trim();
        if (title !== 'Claude' && title.length > 0 && title.length < 200) {
          return title;
        }
      }
    }

    // Try to get from sidebar active item
    const activeItem = document.querySelector('[aria-current="page"], .active-conversation');
    if (activeItem) {
      const title = activeItem.textContent.trim();
      if (title.length > 0 && title.length < 200) {
        return title;
      }
    }

    return document.title.replace(' - Claude', '').replace('Claude', '').trim() || 'Untitled Conversation';
  }

  function extractMessageContent(element) {
    // Look for markdown/prose content first
    const contentSelectors = [
      '.markdown',
      '[class*="prose"]',
      '[class*="message-content"]',
      '[class*="MessageContent"]',
      'p'
    ];

    for (const selector of contentSelectors) {
      const el = element.querySelector(selector);
      if (el) {
        return cleanContent(el.textContent);
      }
    }

    // Fallback to element's own text
    return cleanContent(element.textContent);
  }

  function cleanContent(text) {
    if (!text) return null;

    // Remove excessive whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();

    // Remove common UI text that might be captured
    const uiText = [
      'Copy',
      'Edit',
      'Retry',
      'Good response',
      'Bad response',
      'Stop generating'
    ];

    for (const ui of uiText) {
      cleaned = cleaned.replace(new RegExp(`\\b${ui}\\b`, 'gi'), '');
    }

    cleaned = cleaned.trim();

    return cleaned.length > 5 ? cleaned : null;
  }

  function detectMessageRole(element) {
    const className = element.className || '';
    const dataAttrs = JSON.stringify(element.dataset || {});
    const combined = (className + dataAttrs).toLowerCase();

    if (combined.includes('human') || combined.includes('user')) {
      return 'user';
    }
    if (combined.includes('assistant') || combined.includes('claude') || combined.includes('ai')) {
      return 'assistant';
    }

    // Check for avatar or icon hints
    const avatar = element.querySelector('[class*="avatar"], [class*="Avatar"], img');
    if (avatar) {
      const src = avatar.src || '';
      const alt = avatar.alt || '';
      if (src.includes('user') || alt.toLowerCase().includes('user')) {
        return 'user';
      }
    }

    return 'assistant'; // Default to assistant if unclear
  }

  function getElementOrder(element) {
    // Get element's position in document for sorting
    const rect = element.getBoundingClientRect();
    return rect.top + window.scrollY;
  }

  function deduplicateMessages(messages) {
    const seen = new Set();
    return messages.filter(msg => {
      // Create a key from role and content prefix
      const key = `${msg.role}:${msg.content.substring(0, 100)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // Notify that content script is ready
  console.log('RavenLoom: Claude content script loaded');
})();
