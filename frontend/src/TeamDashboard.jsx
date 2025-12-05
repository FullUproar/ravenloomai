import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

// ============================================================================
// GraphQL Operations
// ============================================================================

const GET_TEAM = gql`
  query GetTeam($teamId: ID!) {
    getTeam(teamId: $teamId) {
      id
      name
      slug
      channels {
        id
        name
        description
        isDefault
      }
      members {
        id
        userId
        role
        user {
          id
          email
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
      mentionsAi
      aiCommand
      createdAt
      user {
        id
        email
        displayName
      }
    }
  }
`;

const SEND_MESSAGE = gql`
  mutation SendMessage($channelId: ID!, $input: SendMessageInput!) {
    sendMessage(channelId: $channelId, input: $input) {
      message {
        id
        content
        isAi
        createdAt
      }
      factsCreated {
        id
        content
        category
      }
      alertsCreated {
        id
        message
        triggerAt
      }
      tasksCreated {
        id
        title
      }
    }
  }
`;

const CREATE_CHANNEL = gql`
  mutation CreateChannel($teamId: ID!, $input: CreateChannelInput!) {
    createChannel(teamId: $teamId, input: $input) {
      id
      name
      description
    }
  }
`;

// ============================================================================
// TeamDashboard Component
// ============================================================================

function TeamDashboard({ teamId, channelId, user, onSignOut }) {
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // UI state
  const [messageInput, setMessageInput] = useState('');
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Fetch team data
  const { data: teamData, loading: teamLoading, refetch: refetchTeam } = useQuery(GET_TEAM, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  });

  const team = teamData?.getTeam;
  const channels = team?.channels || [];

  // Determine active channel
  const activeChannelId = channelId || channels.find(c => c.isDefault)?.id || channels[0]?.id;
  const activeChannel = channels.find(c => c.id === activeChannelId);

  // Fetch messages for active channel
  const { data: messagesData, loading: messagesLoading, refetch: refetchMessages } = useQuery(GET_MESSAGES, {
    variables: { channelId: activeChannelId, limit: 50 },
    skip: !activeChannelId,
    fetchPolicy: 'cache-and-network',
    pollInterval: 3000 // Poll every 3 seconds for new messages
  });

  const messages = messagesData?.getMessages || [];

  // Mutations
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [createChannel] = useMutation(CREATE_CHANNEL);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on channel change
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChannelId]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || isSending) return;

    const content = messageInput.trim();
    setMessageInput('');
    setIsSending(true);

    try {
      await sendMessage({
        variables: {
          channelId: activeChannelId,
          input: { content }
        }
      });
      await refetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      setMessageInput(content); // Restore message on error
      alert('Failed to send message: ' + error.message);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    try {
      const { data } = await createChannel({
        variables: {
          teamId,
          input: { name: newChannelName.trim() }
        }
      });

      setShowCreateChannel(false);
      setNewChannelName('');
      await refetchTeam();
      navigate(`/team/${teamId}/channel/${data.createChannel.id}`);
    } catch (error) {
      console.error('Error creating channel:', error);
      alert('Failed to create channel: ' + error.message);
    }
  };

  const handleSelectChannel = (id) => {
    navigate(`/team/${teamId}/channel/${id}`);
  };

  const handleBackToTeams = () => {
    navigate('/');
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (teamLoading && !team) {
    return (
      <div className="app-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading team...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="app-container">
        <div className="error-screen">
          <p>Team not found</p>
          <button onClick={handleBackToTeams} className="btn-primary">
            Back to Teams
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="team-dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Team Header */}
        <div className="sidebar-header">
          <button onClick={handleBackToTeams} className="back-btn">←</button>
          <h2 className="team-name">{team.name}</h2>
        </div>

        {/* Channels */}
        <div className="channels-section">
          <div className="section-header">
            <span>Channels</span>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="add-btn"
              title="Create channel"
            >
              +
            </button>
          </div>

          <div className="channel-list">
            {channels.map((channel) => (
              <button
                key={channel.id}
                className={`channel-item ${channel.id === activeChannelId ? 'active' : ''}`}
                onClick={() => handleSelectChannel(channel.id)}
              >
                # {channel.name}
              </button>
            ))}
          </div>

          {/* Create Channel Modal */}
          {showCreateChannel && (
            <div className="modal-overlay" onClick={() => setShowCreateChannel(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>Create Channel</h3>
                <form onSubmit={handleCreateChannel}>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="channel-name"
                    autoFocus
                    className="input-field"
                  />
                  <div className="form-actions">
                    <button type="submit" className="btn-primary">Create</button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateChannel(false);
                        setNewChannelName('');
                      }}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{user.displayName || user.email}</span>
          </div>
          <button onClick={onSignOut} className="sign-out-btn">
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-area">
        {/* Channel Header */}
        <header className="chat-header">
          <h3># {activeChannel?.name || 'Select a channel'}</h3>
          {activeChannel?.description && (
            <p className="channel-description">{activeChannel.description}</p>
          )}
        </header>

        {/* Messages */}
        <div className="messages-container">
          {messagesLoading && messages.length === 0 ? (
            <div className="messages-loading">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="messages-empty">
              <p>No messages yet.</p>
              <p className="hint">
                Try: <code>@raven remember [something]</code> to save a fact
              </p>
              <p className="hint">
                Or: <code>@raven [question]</code> to ask something
              </p>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.isAi ? 'ai-message' : 'user-message'}`}
                >
                  <div className="message-header">
                    <span className="message-author">
                      {message.isAi ? '🪶 Raven' : (message.user?.displayName || message.user?.email || 'User')}
                    </span>
                    <span className="message-time">
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="message-content">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <form onSubmit={handleSendMessage} className="message-form">
          <input
            ref={inputRef}
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={`Message #${activeChannel?.name || 'channel'}... (use @raven to talk to AI)`}
            disabled={isSending || !activeChannelId}
            className="message-input"
          />
          <button
            type="submit"
            disabled={isSending || !messageInput.trim() || !activeChannelId}
            className="send-btn"
          >
            {isSending ? '...' : 'Send'}
          </button>
        </form>
      </main>
    </div>
  );
}

export default TeamDashboard;
