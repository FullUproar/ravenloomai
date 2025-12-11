/**
 * Eisenhower Matrix View - Urgent/Important Quadrant
 * Categorizes tasks into: Do Now, Schedule, Delegate, Eliminate
 *
 * Can be removed by deleting this file and removing imports from TeamDashboard
 */

import { gql, useQuery, useMutation } from '@apollo/client';

const GET_EISENHOWER_MATRIX = gql`
  query GetEisenhowerMatrix($teamId: ID!) {
    getEisenhowerMatrix(teamId: $teamId) {
      doNow {
        id
        title
        dueAt
        priority
        project { name }
        assignedToUser { displayName }
      }
      schedule {
        id
        title
        dueAt
        priority
        project { name }
        assignedToUser { displayName }
      }
      delegate {
        id
        title
        dueAt
        priority
        project { name }
        assignedToUser { displayName }
      }
      eliminate {
        id
        title
        dueAt
        priority
        project { name }
        assignedToUser { displayName }
      }
    }
  }
`;

const UPDATE_TASK = gql`
  mutation UpdateTask($taskId: ID!, $input: UpdateTaskInput!) {
    updateTask(taskId: $taskId, input: $input) {
      id
      status
    }
  }
`;

function EisenhowerMatrix({ teamId, onClose, onTaskClick }) {
  const { data, loading, error, refetch } = useQuery(GET_EISENHOWER_MATRIX, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  });

  const [updateTask] = useMutation(UPDATE_TASK);

  const matrix = data?.getEisenhowerMatrix;

  const handleCompleteTask = async (taskId, e) => {
    e.stopPropagation();
    try {
      await updateTask({
        variables: {
          taskId,
          input: { status: 'done' }
        }
      });
      refetch();
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  const formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const isOverdue = (date) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const renderQuadrant = (title, icon, tasks, description, className) => (
    <div className={`quadrant ${className}`}>
      <div className="quadrant-header">
        <span className="quadrant-icon">{icon}</span>
        <span className="quadrant-title">{title}</span>
        <span className="quadrant-count">{tasks?.length || 0}</span>
      </div>
      <div className="quadrant-description">{description}</div>
      <div className="quadrant-tasks">
        {!tasks || tasks.length === 0 ? (
          <div className="quadrant-empty">
            <span className="quadrant-empty-icon">✓</span>
            <span>No tasks here</span>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="quadrant-task"
              onClick={() => onTaskClick?.(task.id)}
            >
              <div
                className="quadrant-task-checkbox"
                onClick={(e) => handleCompleteTask(task.id, e)}
                title="Mark as complete"
              />
              <div className="quadrant-task-content">
                <div className="quadrant-task-title">{task.title}</div>
                <div className="quadrant-task-meta">
                  {task.project && <span>{task.project.name}</span>}
                  {task.dueAt && (
                    <span className={`quadrant-task-due ${isOverdue(task.dueAt) ? 'overdue' : ''}`}>
                      {formatDate(task.dueAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (loading && !matrix) {
    return (
      <main className="eisenhower-area">
        <header className="eisenhower-header">
          <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
            <span></span><span></span><span></span>
          </button>
          <h3>Eisenhower Matrix</h3>
        </header>
        <div className="eisenhower-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p>Loading matrix...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="eisenhower-area">
        <header className="eisenhower-header">
          <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
            <span></span><span></span><span></span>
          </button>
          <h3>Eisenhower Matrix</h3>
        </header>
        <div className="eisenhower-content">
          <div className="error-screen">
            <p>Error loading matrix: {error.message}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="eisenhower-area">
      <header className="eisenhower-header">
        <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
          <span></span><span></span><span></span>
        </button>
        <h3>Eisenhower Matrix</h3>
        <div className="header-spacer"></div>
      </header>

      <div className="eisenhower-content">
        <div className="eisenhower-grid">
          {renderQuadrant(
            'Do Now',
            '🔥',
            matrix?.doNow,
            'Urgent & Important - Do these first',
            'do-now'
          )}
          {renderQuadrant(
            'Schedule',
            '📅',
            matrix?.schedule,
            'Important, Not Urgent - Plan time for these',
            'schedule'
          )}
          {renderQuadrant(
            'Delegate',
            '👥',
            matrix?.delegate,
            'Urgent, Not Important - Assign to others',
            'delegate'
          )}
          {renderQuadrant(
            'Eliminate',
            '🗑️',
            matrix?.eliminate,
            'Neither - Consider removing',
            'eliminate'
          )}
        </div>
      </div>
    </main>
  );
}

export default EisenhowerMatrix;
