import { useMemo } from 'react';

/**
 * ProjectOverview - The main landing view for a project
 *
 * Shows at-a-glance status instead of requiring users to scroll through chat.
 * This is the "dashboard" concept from the UX paper - episodic, not conversational.
 */
export function ProjectOverview({ project, tasks, onStartSession, onQuickAdd, onNavigate }) {
  // Calculate project health and insights
  const insights = useMemo(() => {
    if (!tasks || tasks.length === 0) {
      return {
        health: 'new',
        healthColor: '#888',
        nextActions: [],
        blockers: [],
        recentProgress: {
          completedThisWeek: 0,
          totalTasks: 0
        }
      };
    }

    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Filter tasks by status
    const notStarted = tasks.filter(t => t.status === 'not_started');
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    const blocked = tasks.filter(t => t.status === 'blocked');
    const completed = tasks.filter(t => t.status === 'completed');
    const overdue = tasks.filter(t =>
      t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed'
    );

    // Calculate health
    let health = 'on_track';
    let healthColor = '#4CAF50'; // Green

    if (overdue.length > 2 || blocked.length > 1) {
      health = 'at_risk';
      healthColor = '#FFA726'; // Orange
    }
    if (overdue.length > 5 || blocked.length > 3) {
      health = 'off_track';
      healthColor = '#D32F2F'; // Red
    }
    if (tasks.length > 0 && completed.length === tasks.length) {
      health = 'completed';
      healthColor = '#5D4B8C'; // Purple
    }

    // Get next actions (not started or in progress, sorted by due date and priority)
    const nextActions = [...inProgress, ...notStarted]
      .sort((a, b) => {
        // Due today first
        const aDue = a.dueDate ? new Date(a.dueDate) : null;
        const bDue = b.dueDate ? new Date(b.dueDate) : null;

        if (aDue && bDue) {
          return aDue - bDue;
        }
        if (aDue) return -1;
        if (bDue) return 1;

        // Then by priority
        return (b.priority || 0) - (a.priority || 0);
      })
      .slice(0, 3);

    // Blocked tasks (oldest first)
    const blockerList = blocked
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(0, 2);

    // Recent progress
    const completedThisWeek = tasks.filter(t =>
      t.completedAt && new Date(t.completedAt) > weekAgo
    ).length;

    return {
      health,
      healthColor,
      healthLabel: health === 'on_track' ? 'On Track' :
                   health === 'at_risk' ? 'At Risk' :
                   health === 'off_track' ? 'Off Track' :
                   health === 'completed' ? 'Complete' : 'New Project',
      nextActions,
      blockers: blockerList,
      recentProgress: {
        completedThisWeek,
        totalTasks: tasks.length,
        inProgress: inProgress.length,
        notStarted: notStarted.length,
        overdue: overdue.length
      }
    };
  }, [tasks]);

  const formatDueDate = (dueDate) => {
    if (!dueDate) return null;

    const due = new Date(dueDate);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Reset time parts for comparison
    due.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);

    if (due.getTime() === now.getTime()) return 'today';
    if (due.getTime() === tomorrow.getTime()) return 'tomorrow';
    if (due < now) return 'overdue';

    const daysUntil = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 7) return `in ${daysUntil} days`;

    return due.toLocaleDateString();
  };

  return (
    <div style={{
      padding: '1.5rem',
      backgroundColor: '#0D0D0D',
      minHeight: '100%',
      color: '#D9D9E3'
    }}>
      {/* Project Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: '600',
          margin: '0 0 0.5rem 0',
          color: '#D9D9E3'
        }}>
          {project?.title || 'My Project'}
        </h1>
        {project?.description && (
          <p style={{
            fontSize: '0.9rem',
            color: '#888',
            margin: 0
          }}>
            {project.description}
          </p>
        )}
      </div>

      {/* Health Status */}
      <div style={{
        padding: '1rem',
        backgroundColor: '#1A1A1A',
        borderRadius: '12px',
        border: `2px solid ${insights.healthColor}`,
        marginBottom: '1.5rem'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: insights.healthColor
          }} />
          <span style={{
            fontSize: '1.1rem',
            fontWeight: '600',
            color: insights.healthColor
          }}>
            {insights.healthLabel}
          </span>
        </div>

        {insights.recentProgress.totalTasks > 0 && (
          <div style={{
            marginTop: '0.75rem',
            fontSize: '0.85rem',
            color: '#888',
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            <span>{insights.recentProgress.completedThisWeek} completed this week</span>
            {insights.recentProgress.inProgress > 0 && (
              <span>• {insights.recentProgress.inProgress} in progress</span>
            )}
            {insights.recentProgress.overdue > 0 && (
              <span style={{ color: '#D32F2F' }}>• {insights.recentProgress.overdue} overdue</span>
            )}
          </div>
        )}
      </div>

      {/* Next Actions */}
      {insights.nextActions.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '0.95rem',
            fontWeight: '600',
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            margin: '0 0 0.75rem 0'
          }}>
            Up Next
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {insights.nextActions.map(task => (
              <div
                key={task.id}
                onClick={() => onNavigate('tasks')}
                style={{
                  padding: '1rem',
                  backgroundColor: '#1A1A1A',
                  borderRadius: '12px',
                  border: '1px solid #2D2D40',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5D4B8C'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#2D2D40'}
              >
                <div style={{
                  fontWeight: '500',
                  marginBottom: '0.25rem',
                  color: '#D9D9E3'
                }}>
                  {task.title}
                </div>
                <div style={{
                  fontSize: '0.85rem',
                  color: '#888',
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'center',
                  flexWrap: 'wrap'
                }}>
                  {task.status === 'in_progress' && (
                    <span style={{ color: '#5D4B8C' }}>▶ In Progress</span>
                  )}
                  {task.dueDate && (
                    <span style={{
                      color: formatDueDate(task.dueDate) === 'overdue' ? '#D32F2F' :
                             formatDueDate(task.dueDate)?.includes('today') ? '#FFA726' : '#888'
                    }}>
                      ⏰ {formatDueDate(task.dueDate)}
                    </span>
                  )}
                  {task.context && (
                    <span>{task.context}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blockers */}
      {insights.blockers.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '0.95rem',
            fontWeight: '600',
            color: '#D32F2F',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            margin: '0 0 0.75rem 0'
          }}>
            ⚠️ Needs Attention
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {insights.blockers.map(task => (
              <div
                key={task.id}
                onClick={() => onNavigate('tasks')}
                style={{
                  padding: '1rem',
                  backgroundColor: '#1A1A1A',
                  borderRadius: '12px',
                  border: '2px solid #D32F2F',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  fontWeight: '500',
                  marginBottom: '0.25rem',
                  color: '#D9D9E3'
                }}>
                  {task.title}
                </div>
                <div style={{
                  fontSize: '0.85rem',
                  color: '#D32F2F'
                }}>
                  🚫 Blocked • {Math.ceil((new Date() - new Date(task.createdAt)) / (1000 * 60 * 60 * 24))} days
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {insights.nextActions.length === 0 && insights.blockers.length === 0 && (
        <div style={{
          padding: '3rem 1rem',
          textAlign: 'center',
          color: '#666'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Ready to get started?</p>
          <p style={{ fontSize: '0.9rem' }}>Start a work session or add your first task</p>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{
        position: 'fixed',
        bottom: '5rem',
        left: '1rem',
        right: '1rem',
        display: 'flex',
        gap: '0.75rem'
      }}>
        <button
          onClick={onStartSession}
          style={{
            flex: 2,
            padding: '1rem',
            backgroundColor: '#5D4B8C',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(93, 75, 140, 0.3)'
          }}
        >
          🚀 Start Working
        </button>
        <button
          onClick={onQuickAdd}
          style={{
            flex: 1,
            padding: '1rem',
            backgroundColor: '#1A1A1A',
            color: '#D9D9E3',
            border: '2px solid #5D4B8C',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          + Task
        </button>
      </div>
    </div>
  );
}
