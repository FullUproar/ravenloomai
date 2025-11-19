/**
 * SessionBoundary - Visual marker for session start/end in chat timeline
 *
 * Provides episodic context by clearly marking when sessions begin/end
 */
export function SessionBoundary({ session, type = 'start' }) {
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString();
  };

  if (type === 'start') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        margin: '1.5rem 0',
        padding: '0.75rem 1rem',
        backgroundColor: '#1A1A1A',
        border: '2px solid #5D4B8C',
        borderRadius: '12px'
      }}>
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: '#4CAF50',
          boxShadow: '0 0 10px rgba(76, 175, 80, 0.6)',
          flexShrink: 0
        }} />
        <div style={{ flex: 1 }}>
          <div style={{
            fontWeight: '600',
            color: '#9D8BCC',
            fontSize: '0.95rem',
            marginBottom: '0.25rem'
          }}>
            🚀 Session Started
          </div>
          <div style={{
            fontSize: '0.85rem',
            color: '#888'
          }}>
            {session.title || 'Work Session'} • {formatDate(session.startedAt)} at {formatTime(session.startedAt)}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'end') {
    const duration = session.durationMinutes;
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        margin: '1.5rem 0',
        padding: '0.75rem 1rem',
        backgroundColor: '#1A1A1A',
        border: '2px solid #2D2D40',
        borderRadius: '12px'
      }}>
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: '#666',
          flexShrink: 0
        }} />
        <div style={{ flex: 1 }}>
          <div style={{
            fontWeight: '600',
            color: '#888',
            fontSize: '0.95rem',
            marginBottom: '0.25rem'
          }}>
            ✅ Session Ended
          </div>
          <div style={{
            fontSize: '0.85rem',
            color: '#666',
            marginBottom: session.summary ? '0.5rem' : 0
          }}>
            Duration: {durationText} • {formatTime(session.endedAt)}
          </div>
          {session.summary && (
            <div style={{
              fontSize: '0.9rem',
              color: '#9D8BCC',
              fontStyle: 'italic',
              lineHeight: '1.4',
              marginTop: '0.5rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid #2D2D40'
            }}>
              {session.summary}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
