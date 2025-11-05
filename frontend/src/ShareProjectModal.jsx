import { gql, useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';

const GET_CONNECTIONS = gql`
  query GetConnections($userId: String!) {
    getConnections(userId: $userId, status: "accepted") {
      id
      requesterId
      recipientId
      status
    }
  }
`;

const SHARE_PROJECT = gql`
  mutation ShareProject($projectId: ID!, $ownerId: String!, $sharedWithId: String!, $permissionLevel: String) {
    shareProject(projectId: $projectId, ownerId: $ownerId, sharedWithId: $sharedWithId, permissionLevel: $permissionLevel) {
      id
      sharedWithId
      permissionLevel
    }
  }
`;

function ShareProjectModal({ projectId, userId, onClose }) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [permissionLevel, setPermissionLevel] = useState('view');
  const [shareLink, setShareLink] = useState('');

  const { data: connectionsData } = useQuery(GET_CONNECTIONS, {
    variables: { userId }
  });

  const [shareProject] = useMutation(SHARE_PROJECT, {
    onCompleted: () => {
      alert('Project shared successfully!');
      onClose();
    }
  });

  const connections = connectionsData?.getConnections || [];

  // Get the other user in each connection
  const connectedUsers = connections.map(conn => ({
    userId: conn.requesterId === userId ? conn.recipientId : conn.requesterId,
    connectionId: conn.id
  }));

  const handleShare = async () => {
    if (!selectedUserId) {
      alert('Please select a user to share with');
      return;
    }

    await shareProject({
      variables: {
        projectId,
        ownerId: userId,
        sharedWithId: selectedUserId,
        permissionLevel
      }
    });
  };

  const generateShareLink = () => {
    const link = `${window.location.origin}/project/${projectId}`;
    setShareLink(link);
    navigator.clipboard.writeText(link);
    alert('Share link copied to clipboard!');
  };

  return (
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
        padding: '1.5rem',
        maxHeight: '85vh',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.5rem',
            color: '#9D8BCC'
          }}>
            Share Project
          </h2>
          <button
            onClick={onClose}
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

        {/* Share Link */}
        <div style={{
          backgroundColor: '#0D0D0D',
          padding: '1.25rem',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          border: '1px solid #2D2D40'
        }}>
          <h3 style={{
            margin: '0 0 0.75rem 0',
            fontSize: '1rem',
            color: '#D9D9E3'
          }}>
            Share Link
          </h3>
          <p style={{
            margin: '0 0 1rem 0',
            fontSize: '0.85rem',
            color: '#888',
            lineHeight: '1.4'
          }}>
            Anyone with this link can view your project
          </p>
          <button
            onClick={generateShareLink}
            style={{
              width: '100%',
              padding: '0.875rem',
              backgroundColor: '#2D2D40',
              color: '#D9D9E3',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>🔗</span>
            Copy Share Link
          </button>
          {shareLink && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              backgroundColor: '#0A0A0A',
              borderRadius: '6px',
              fontSize: '0.8rem',
              color: '#666',
              wordBreak: 'break-all'
            }}>
              {shareLink}
            </div>
          )}
        </div>

        {/* Share with Connections */}
        <div style={{
          backgroundColor: '#0D0D0D',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid #2D2D40'
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1rem',
            color: '#D9D9E3'
          }}>
            Share with Connections
          </h3>

          {connectedUsers.length === 0 ? (
            <p style={{
              color: '#666',
              fontSize: '0.9rem',
              textAlign: 'center',
              padding: '1rem'
            }}>
              No connections yet. Connect with others to share projects!
            </p>
          ) : (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#9D8BCC',
                  fontSize: '0.9rem'
                }}>
                  Select User
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    backgroundColor: '#0A0A0A',
                    border: '2px solid #2D2D40',
                    borderRadius: '8px',
                    color: '#D9D9E3',
                    fontSize: '1rem'
                  }}
                >
                  <option value="">Choose a user...</option>
                  {connectedUsers.map(user => (
                    <option key={user.userId} value={user.userId}>
                      {user.userId}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#9D8BCC',
                  fontSize: '0.9rem'
                }}>
                  Permission Level
                </label>
                <div style={{
                  display: 'flex',
                  gap: '0.5rem'
                }}>
                  <button
                    onClick={() => setPermissionLevel('view')}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: permissionLevel === 'view' ? '#5D4B8C' : '#2D2D40',
                      color: permissionLevel === 'view' ? '#fff' : '#888',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: '500'
                    }}
                  >
                    👁️ View Only
                  </button>
                  <button
                    onClick={() => setPermissionLevel('comment')}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: permissionLevel === 'comment' ? '#5D4B8C' : '#2D2D40',
                      color: permissionLevel === 'comment' ? '#fff' : '#888',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: '500'
                    }}
                  >
                    💬 Comment
                  </button>
                  <button
                    onClick={() => setPermissionLevel('edit')}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: permissionLevel === 'edit' ? '#5D4B8C' : '#2D2D40',
                      color: permissionLevel === 'edit' ? '#fff' : '#888',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: '500'
                    }}
                  >
                    ✏️ Edit
                  </button>
                </div>
              </div>

              <button
                onClick={handleShare}
                disabled={!selectedUserId}
                style={{
                  width: '100%',
                  padding: '1rem',
                  backgroundColor: selectedUserId ? '#5D4B8C' : '#333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: selectedUserId ? 'pointer' : 'not-allowed',
                  fontSize: '1rem',
                  fontWeight: '600'
                }}
              >
                Share Project
              </button>
            </>
          )}
        </div>

        {/* Info */}
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#0D0D0D',
          borderRadius: '8px',
          border: '1px solid #2D2D40'
        }}>
          <p style={{
            margin: 0,
            fontSize: '0.85rem',
            color: '#666',
            lineHeight: '1.5'
          }}>
            <strong style={{ color: '#9D8BCC' }}>View Only:</strong> Can see project and chat history<br />
            <strong style={{ color: '#9D8BCC' }}>Comment:</strong> Can also send messages<br />
            <strong style={{ color: '#9D8BCC' }}>Edit:</strong> Can modify tasks and goals
          </p>
        </div>
      </div>
    </div>
  );
}

export default ShareProjectModal;
