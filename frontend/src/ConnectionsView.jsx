import { gql, useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';

const GET_CONNECTIONS = gql`
  query GetConnections($userId: String!, $status: String) {
    getConnections(userId: $userId, status: $status) {
      id
      requesterId
      recipientId
      status
      createdAt
    }
  }
`;

const SEND_CONNECTION_REQUEST = gql`
  mutation SendConnectionRequest($requesterId: String!, $recipientId: String!) {
    sendConnectionRequest(requesterId: $requesterId, recipientId: $recipientId) {
      id
      status
    }
  }
`;

const RESPOND_TO_CONNECTION = gql`
  mutation RespondToConnection($connectionId: ID!, $status: String!) {
    respondToConnection(connectionId: $connectionId, status: $status) {
      id
      status
    }
  }
`;

const GET_MESSAGE_THREADS = gql`
  query GetMessageThreads($userId: String!) {
    getMessageThreads(userId: $userId) {
      id
      otherUserId
      lastMessageContent
      lastMessageSender
      lastMessageAt
    }
  }
`;

function ConnectionsView({ userId }) {
  const [currentTab, setCurrentTab] = useState('connections'); // 'connections' or 'messages'
  const [showAddConnection, setShowAddConnection] = useState(false);
  const [newConnectionId, setNewConnectionId] = useState('');

  const { data: connectionsData, refetch: refetchConnections } = useQuery(GET_CONNECTIONS, {
    variables: { userId }
  });

  const { data: pendingData, refetch: refetchPending } = useQuery(GET_CONNECTIONS, {
    variables: { userId, status: 'pending' }
  });

  const { data: threadsData } = useQuery(GET_MESSAGE_THREADS, {
    variables: { userId }
  });

  const [sendConnectionRequest] = useMutation(SEND_CONNECTION_REQUEST, {
    onCompleted: () => {
      refetchConnections();
      refetchPending();
      setShowAddConnection(false);
      setNewConnectionId('');
      alert('Connection request sent!');
    }
  });

  const [respondToConnection] = useMutation(RESPOND_TO_CONNECTION, {
    onCompleted: () => {
      refetchConnections();
      refetchPending();
    }
  });

  const allConnections = connectionsData?.getConnections || [];
  const pendingConnections = pendingData?.getConnections || [];
  const threads = threadsData?.getMessageThreads || [];

  // Filter accepted connections
  const acceptedConnections = allConnections.filter(c => c.status === 'accepted');

  // Separate pending into requests I received vs requests I sent
  const receivedRequests = pendingConnections.filter(c => c.recipientId === userId);
  const sentRequests = pendingConnections.filter(c => c.requesterId === userId);

  const handleSendRequest = async () => {
    if (!newConnectionId.trim()) {
      alert('Please enter a user ID');
      return;
    }

    if (newConnectionId === userId) {
      alert("You can't connect with yourself!");
      return;
    }

    try {
      await sendConnectionRequest({
        variables: {
          requesterId: userId,
          recipientId: newConnectionId.trim()
        }
      });
    } catch (error) {
      alert(error.message || 'Failed to send connection request');
    }
  };

  const handleRespond = async (connectionId, status) => {
    await respondToConnection({
      variables: { connectionId, status }
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0D0D0D'
    }}>
      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #2D2D40',
        padding: '0.5rem 1rem'
      }}>
        <button
          onClick={() => setCurrentTab('connections')}
          style={{
            flex: 1,
            padding: '0.875rem',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: currentTab === 'connections' ? '2px solid #5D4B8C' : '2px solid transparent',
            color: currentTab === 'connections' ? '#5D4B8C' : '#666',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600'
          }}
        >
          Connections ({acceptedConnections.length})
        </button>
        <button
          onClick={() => setCurrentTab('messages')}
          style={{
            flex: 1,
            padding: '0.875rem',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: currentTab === 'messages' ? '2px solid #5D4B8C' : '2px solid transparent',
            color: currentTab === 'messages' ? '#5D4B8C' : '#666',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
            position: 'relative'
          }}
        >
          Messages
          {threads.length > 0 && (
            <span style={{
              position: 'absolute',
              top: '0.5rem',
              right: '1rem',
              backgroundColor: '#5D4B8C',
              color: '#fff',
              borderRadius: '10px',
              padding: '0.125rem 0.375rem',
              fontSize: '0.7rem',
              fontWeight: '600'
            }}>
              {threads.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem'
      }}>
        {currentTab === 'connections' ? (
          <>
            {/* Add Connection Button */}
            <button
              onClick={() => setShowAddConnection(true)}
              style={{
                width: '100%',
                padding: '1rem',
                marginBottom: '1.5rem',
                backgroundColor: '#5D4B8C',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>+</span>
              Add Connection
            </button>

            {/* Pending Requests Received */}
            {receivedRequests.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{
                  margin: '0 0 0.75rem 0',
                  fontSize: '0.9rem',
                  color: '#9D8BCC',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Pending Requests
                </h3>
                {receivedRequests.map(conn => (
                  <div
                    key={conn.id}
                    style={{
                      backgroundColor: '#1A1A1A',
                      padding: '1rem',
                      borderRadius: '12px',
                      marginBottom: '0.75rem',
                      border: '1px solid #2D2D40'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '0.75rem'
                    }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: '#5D4B8C',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem'
                      }}>
                        👤
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#D9D9E3', fontWeight: '500' }}>
                          {conn.requesterId}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>
                          {formatDate(conn.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleRespond(conn.id, 'accepted')}
                        style={{
                          flex: 1,
                          padding: '0.75rem',
                          backgroundColor: '#2D4A2D',
                          color: '#6BCF7F',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '500'
                        }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleRespond(conn.id, 'declined')}
                        style={{
                          flex: 1,
                          padding: '0.75rem',
                          backgroundColor: '#4A2D2D',
                          color: '#CF6B6B',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '500'
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Accepted Connections */}
            {acceptedConnections.length > 0 ? (
              <>
                <h3 style={{
                  margin: '0 0 0.75rem 0',
                  fontSize: '0.9rem',
                  color: '#9D8BCC',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Your Connections
                </h3>
                {acceptedConnections.map(conn => {
                  const otherUserId = conn.requesterId === userId ? conn.recipientId : conn.requesterId;
                  return (
                    <div
                      key={conn.id}
                      style={{
                        backgroundColor: '#1A1A1A',
                        padding: '1rem',
                        borderRadius: '12px',
                        marginBottom: '0.75rem',
                        border: '1px solid #2D2D40',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}
                    >
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: '#5D4B8C',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem'
                      }}>
                        👤
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#D9D9E3', fontWeight: '500' }}>
                          {otherUserId}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>
                          Connected {formatDate(conn.createdAt)}
                        </div>
                      </div>
                      <button
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#2D2D40',
                          color: '#D9D9E3',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                      >
                        Message
                      </button>
                    </div>
                  );
                })}
              </>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '3rem 1rem',
                color: '#666'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤝</div>
                <h3 style={{ color: '#888', marginBottom: '0.5rem' }}>No connections yet</h3>
                <p style={{ fontSize: '0.9rem' }}>
                  Add connections to share projects and collaborate
                </p>
              </div>
            )}

            {/* Sent Requests */}
            {sentRequests.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{
                  margin: '0 0 0.75rem 0',
                  fontSize: '0.9rem',
                  color: '#9D8BCC',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Sent Requests
                </h3>
                {sentRequests.map(conn => (
                  <div
                    key={conn.id}
                    style={{
                      backgroundColor: '#1A1A1A',
                      padding: '1rem',
                      borderRadius: '12px',
                      marginBottom: '0.75rem',
                      border: '1px solid #2D2D40',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: '#5D4B8C',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.2rem'
                    }}>
                      👤
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#D9D9E3', fontWeight: '500' }}>
                        {conn.recipientId}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>
                        Pending • {formatDate(conn.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Messages Tab */
          threads.length > 0 ? (
            threads.map(thread => (
              <div
                key={thread.id}
                style={{
                  backgroundColor: '#1A1A1A',
                  padding: '1rem',
                  borderRadius: '12px',
                  marginBottom: '0.75rem',
                  border: '1px solid #2D2D40',
                  cursor: 'pointer'
                }}
                onClick={() => alert(`Open chat with ${thread.otherUserId}`)}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem'
                }}>
                  <div style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    backgroundColor: '#5D4B8C',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    flexShrink: 0
                  }}>
                    👤
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.25rem'
                    }}>
                      <div style={{
                        color: '#D9D9E3',
                        fontWeight: '600',
                        fontSize: '1rem'
                      }}>
                        {thread.otherUserId}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#666'
                      }}>
                        {formatDate(thread.lastMessageAt)}
                      </div>
                    </div>
                    {thread.lastMessageContent && (
                      <div style={{
                        color: '#888',
                        fontSize: '0.9rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {thread.lastMessageSender === userId ? 'You: ' : ''}
                        {thread.lastMessageContent}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: '#666'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
              <h3 style={{ color: '#888', marginBottom: '0.5rem' }}>No messages yet</h3>
              <p style={{ fontSize: '0.9rem' }}>
                Start a conversation with your connections
              </p>
            </div>
          )
        )}
      </div>

      {/* Add Connection Modal */}
      {showAddConnection && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'flex-end',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: '#1A1A1A',
            width: '100%',
            borderRadius: '24px 24px 0 0',
            padding: '1.5rem'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '1.3rem',
                color: '#9D8BCC'
              }}>
                Add Connection
              </h2>
              <button
                onClick={() => setShowAddConnection(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#888',
                  fontSize: '1.5rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#9D8BCC',
                fontSize: '0.9rem'
              }}>
                User ID or Email
              </label>
              <input
                type="text"
                value={newConnectionId}
                onChange={(e) => setNewConnectionId(e.target.value)}
                placeholder="Enter user ID..."
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  backgroundColor: '#0D0D0D',
                  border: '2px solid #2D2D40',
                  borderRadius: '8px',
                  color: '#D9D9E3',
                  fontSize: '1rem',
                  marginBottom: '1rem'
                }}
              />

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => setShowAddConnection(false)}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    backgroundColor: '#2D2D40',
                    color: '#D9D9E3',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendRequest}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    backgroundColor: '#5D4B8C',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}
                >
                  Send Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConnectionsView;
