import { useMemo } from 'react';

/**
 * SessionsList - Shows past work sessions with summaries
 *
 * Displays bounded work periods to give episodic context
 */
export function SessionsList({ sessions, activeSessionId, onSelectSession }) {
  const sortedSessions = useMemo(() => {
    if (!sessions) return [];
    return [...sessions].sort((a, b) =>
      new Date(b.startedAt) - new Date(a.startedAt)
    );
  }, [sessions]);

  const formatDuration = (minutes) => {
    if (!minutes) return 'In progress';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  if (!sessions || sessions.length === 0) {
    return (
      <div style={{
        padding: '2rem 1rem',
        textAlign: 'center',
        color: '#666'
      }}>
        <p style={{ fontSize: '0.9rem' }}>No work sessions yet</p>
        <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
          Start your first session to begin tracking your work
        </p>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '1rem'
    }}>
      <h2 style={{
        fontSize: '0.95rem',
        fontWeight: '600',
        color: '#888',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        margin: '0 0 1rem 0'
      }}>
        Work Sessions
      </h2>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}>
        {sortedSessions.map(session => (
          <div
            key={session.id}
            onClick={() => onSelectSession && onSelectSession(session)}
            style={{
              padding: '1rem',
              backgroundColor: session.id === activeSessionId ? '#2D2D40' : '#1A1A1A',
              borderRadius: '12px',
              border: `2px solid ${session.id === activeSessionId ? '#5D4B8C' : '#2D2D40'}`,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (session.id !== activeSessionId) {
                e.currentTarget.style.borderColor = '#5D4B8C';
              }
            }}
            onMouseLeave={(e) => {
              if (session.id !== activeSessionId) {
                e.currentTarget.style.borderColor = '#2D2D40';
              }
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '0.5rem'
            }}>
              <div style={{
                flex: 1
              }}>
                <div style={{
                  fontWeight: '500',
                  color: '#D9D9E3',
                  marginBottom: '0.25rem'
                }}>
                  {session.title || 'Work Session'}
                </div>
                <div style={{
                  fontSize: '0.85rem',
                  color: '#888'
                }}>
                  {formatDate(session.startedAt)} • {formatDuration(session.durationMinutes)}
                </div>
              </div>

              {/* Status indicator */}
              {session.status === 'active' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.8rem',
                  color: '#4CAF50'
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#4CAF50',
                    boxShadow: '0 0 8px rgba(76, 175, 80, 0.6)'
                  }} />
                  Active
                </div>
              )}
            </div>

            {/* Summary */}
            {session.summary && (
              <div style={{
                fontSize: '0.9rem',
                color: '#9D8BCC',
                lineHeight: '1.4',
                marginTop: '0.5rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid #2D2D40'
              }}>
                {session.summary}
              </div>
            )}

            {/* Notes */}
            {session.notes && !session.summary && (
              <div style={{
                fontSize: '0.85rem',
                color: '#888',
                lineHeight: '1.4',
                marginTop: '0.5rem',
                fontStyle: 'italic'
              }}>
                {session.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
