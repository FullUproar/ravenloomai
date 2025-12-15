/**
 * RavenCopilot - Persistent AI assistant side panel
 *
 * Features:
 * - Always-visible chat interface (right side)
 * - Can navigate to screens via commands
 * - Can fill in forms and trigger actions
 * - Contextual awareness of current view
 * - Collapsible for more screen space
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { gql, useMutation, useQuery } from '@apollo/client';
import ReactMarkdown from 'react-markdown';
import './RavenCopilot.css';

const SEND_MESSAGE = gql`
  mutation SendMessage($channelId: ID!, $input: SendMessageInput!) {
    sendMessage(channelId: $channelId, input: $input) {
      message {
        id
        content
        isAi
        createdAt
        user {
          id
          displayName
        }
      }
    }
  }
`;

const GET_MESSAGES = gql`
  query GetMessages($channelId: ID!, $limit: Int) {
    getMessages(channelId: $channelId, limit: $limit) {
      id
      content
      isAi
      createdAt
      user {
        id
        displayName
      }
    }
  }
`;

// Navigation action patterns that Raven can recognize
const NAVIGATION_PATTERNS = {
  tasks: /(?:go to|show|open|navigate to)\s*(?:the\s*)?tasks?/i,
  goals: /(?:go to|show|open|navigate to)\s*(?:the\s*)?goals?/i,
  projects: /(?:go to|show|open|navigate to)\s*(?:the\s*)?projects?/i,
  calendar: /(?:go to|show|open|navigate to)\s*(?:the\s*)?calendar/i,
  knowledge: /(?:go to|show|open|navigate to)\s*(?:the\s*)?knowledge/i,
  team: /(?:go to|show|open|navigate to)\s*(?:the\s*)?team/i,
  insights: /(?:go to|show|open|navigate to)\s*(?:the\s*)?insights?/i,
  raven: /(?:go to|show|open|navigate to)\s*(?:the\s*)?(?:raven|digest|home)/i,
};

export default function RavenCopilot({
  teamId,
  ravenChannelId,
  currentView,
  onNavigate,
  onAction,
  collapsed,
  onToggleCollapse,
  user
}) {
  const [input, setInput] = useState('');
  const [localMessages, setLocalMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch recent messages
  const { data: messagesData, refetch } = useQuery(GET_MESSAGES, {
    variables: { channelId: ravenChannelId, limit: 20 },
    skip: !ravenChannelId,
    pollInterval: 5000
  });

  const [sendMessage] = useMutation(SEND_MESSAGE);

  // Combine server messages with local optimistic ones
  const messages = messagesData?.getMessages || [];
  const allMessages = [...messages, ...localMessages]
    .filter((msg, idx, arr) => arr.findIndex(m => m.id === msg.id) === idx) // dedupe
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length]);

  // Check for navigation commands in AI responses
  const handleAIResponse = useCallback((response) => {
    const content = response.content?.toLowerCase() || '';
    const metadata = response.metadata || {};

    // Check if AI wants to navigate somewhere
    if (metadata.navigation) {
      onNavigate?.(metadata.navigation);
      return;
    }

    // Check for action commands
    if (metadata.action) {
      onAction?.(metadata.action, metadata.actionParams);
      return;
    }
  }, [onNavigate, onAction]);

  // Parse user input for navigation intent
  const parseNavigationIntent = (text) => {
    for (const [view, pattern] of Object.entries(NAVIGATION_PATTERNS)) {
      if (pattern.test(text)) {
        return view;
      }
    }
    return null;
  };

  const handleSend = async () => {
    if (!input.trim() || isSending || !ravenChannelId) return;

    const userMessage = input.trim();
    setInput('');
    setIsSending(true);

    // Check for navigation intent
    const navIntent = parseNavigationIntent(userMessage);
    if (navIntent) {
      // Navigate immediately and tell Raven
      onNavigate?.(navIntent);
    }

    // Add optimistic message
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg = {
      id: optimisticId,
      content: userMessage,
      user: user,
      isAi: false,
      createdAt: new Date().toISOString()
    };
    setLocalMessages(prev => [...prev, optimisticMsg]);

    try {
      const { data } = await sendMessage({
        variables: {
          channelId: ravenChannelId,
          input: { content: `@raven ${userMessage}` }
        }
      });

      // Remove optimistic message and refetch
      setLocalMessages(prev => prev.filter(m => m.id !== optimisticId));
      await refetch();

      // Check AI response for actions
      if (data?.sendMessage?.message?.isAi) {
        handleAIResponse(data.sendMessage.message);
      }
    } catch (error) {
      console.error('Send failed:', error);
      setLocalMessages(prev => prev.filter(m => m.id !== optimisticId));
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Context hint based on current view
  const getContextHint = () => {
    const hints = {
      tasks: 'Ask about tasks, create new ones, or get help prioritizing',
      goals: 'Ask about goal progress or add new sub-goals',
      projects: 'Get project status or help planning',
      calendar: 'Ask about schedule, add events, or find free time',
      knowledge: 'Search team knowledge or start research',
      insights: 'Get productivity insights or suggestions',
      digest: 'Your command center - ask anything!'
    };
    return hints[currentView] || 'How can I help?';
  };

  if (collapsed) {
    return (
      <div className="raven-copilot collapsed" onClick={onToggleCollapse}>
        <div className="copilot-collapsed-icon">🪶</div>
        <span className="copilot-collapsed-label">Raven</span>
      </div>
    );
  }

  return (
    <div className="raven-copilot">
      {/* Header */}
      <div className="copilot-header">
        <div className="copilot-title">
          <span className="copilot-icon">🪶</span>
          <span>Raven Co-Pilot</span>
        </div>
        <button className="copilot-collapse-btn" onClick={onToggleCollapse}>
          ▶
        </button>
      </div>

      {/* Context indicator */}
      <div className="copilot-context">
        <span className="context-dot"></span>
        <span className="context-text">{getContextHint()}</span>
      </div>

      {/* Quick actions */}
      <div className="copilot-quick-actions">
        <button onClick={() => onNavigate?.('tasks')}>📋 Tasks</button>
        <button onClick={() => onNavigate?.('goals')}>🎯 Goals</button>
        <button onClick={() => onNavigate?.('calendar')}>📅 Calendar</button>
      </div>

      {/* Messages */}
      <div className="copilot-messages">
        {allMessages.length === 0 ? (
          <div className="copilot-empty">
            <p>Hi! I'm Raven, your AI assistant.</p>
            <p>Try saying:</p>
            <ul>
              <li>"Go to tasks"</li>
              <li>"What's on my calendar?"</li>
              <li>"Create a task for..."</li>
              <li>"What should I focus on?"</li>
            </ul>
          </div>
        ) : (
          allMessages.slice(-15).map((msg) => (
            <div
              key={msg.id}
              className={`copilot-message ${msg.isAi ? 'ai' : 'user'}`}
            >
              {msg.isAi ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                <span>{msg.content?.replace(/^@raven\s*/i, '')}</span>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="copilot-input-area">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Raven anything..."
          disabled={isSending}
        />
        <button
          className="copilot-send-btn"
          onClick={handleSend}
          disabled={isSending || !input.trim()}
        >
          {isSending ? '...' : '→'}
        </button>
      </div>
    </div>
  );
}
