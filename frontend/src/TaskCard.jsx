/**
 * TaskCard Component
 *
 * Displays a task with status, priority, due date, and context.
 * Supports interactions for status changes, editing, and deletion.
 */

import React from 'react';
import './TaskCard.css';

const TaskCard = ({
  task,
  onStatusChange,
  onEdit,
  onDelete,
  isLoading = false,
  hasError = false,
  errorMessage = '',
}) => {
  // Status badge colors
  const statusColors = {
    not_started: '#6B7280', // Gray
    in_progress: '#3B82F6', // Blue
    blocked: '#EF4444', // Red
    done: '#10B981', // Green
    cancelled: '#9CA3AF', // Light gray
  };

  // Priority badge colors
  const priorityColors = {
    1: '#10B981', // Low - Green
    2: '#F59E0B', // Medium - Orange
    3: '#EF4444', // High - Red
  };

  const priorityLabels = {
    1: 'Low',
    2: 'Medium',
    3: 'High',
  };

  // Context icon mapping
  const contextIcons = {
    '@phone': '📞',
    '@home': '🏠',
    '@office': '🏢',
    '@computer': '💻',
    '@errands': '🛒',
    '@anywhere': '🌍',
  };

  // Check if overdue
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Handle status change
  const handleStatusChange = (e) => {
    if (onStatusChange) {
      onStatusChange(task.id, e.target.value);
    }
  };

  if (isLoading) {
    return (
      <div className="task-card loading" data-testid="task-card-loading">
        <div className="loading-spinner"></div>
        <p>Loading task...</p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="task-card error" data-testid="task-card-error">
        <p className="error-message">❌ {errorMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={`task-card ${task.status} ${isOverdue ? 'overdue' : ''}`}
      data-testid="task-card"
      data-task-id={task.id}
    >
      {/* Header */}
      <div className="task-card-header">
        <div className="task-badges">
          {/* Priority badge */}
          <span
            className="priority-badge"
            style={{ backgroundColor: priorityColors[task.priority] }}
            data-testid="priority-badge"
          >
            {priorityLabels[task.priority]}
          </span>

          {/* Status badge */}
          <span
            className="status-badge"
            style={{ backgroundColor: statusColors[task.status] }}
            data-testid="status-badge"
          >
            {task.status.replace('_', ' ')}
          </span>

          {/* Context badge */}
          {task.context && (
            <span className="context-badge" data-testid="context-badge">
              {contextIcons[task.context]} {task.context}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="task-actions">
          {onEdit && (
            <button
              className="action-button edit"
              onClick={() => onEdit(task.id)}
              data-testid="edit-button"
              aria-label="Edit task"
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button
              className="action-button delete"
              onClick={() => onDelete(task.id)}
              data-testid="delete-button"
              aria-label="Delete task"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="task-title" data-testid="task-title">
        {task.title}
      </h3>

      {/* Description */}
      {task.description && (
        <p className="task-description" data-testid="task-description">
          {task.description}
        </p>
      )}

      {/* Footer */}
      <div className="task-card-footer">
        {/* Due date */}
        {task.dueDate && (
          <div className={`due-date ${isOverdue ? 'overdue' : ''}`} data-testid="due-date">
            📅 {formatDate(task.dueDate)}
            {isOverdue && <span className="overdue-label"> (Overdue)</span>}
          </div>
        )}

        {/* Completed date */}
        {task.status === 'done' && task.completedAt && (
          <div className="completed-date" data-testid="completed-at">
            ✅ Completed {formatDate(task.completedAt)}
          </div>
        )}

        {/* Blocker reason */}
        {task.status === 'blocked' && task.blockerReason && (
          <div className="blocker-reason" data-testid="blocker-reason">
            🚫 Blocked: {task.blockerReason}
          </div>
        )}

        {/* Status dropdown */}
        {onStatusChange && (
          <div className="status-control">
            <label htmlFor={`status-${task.id}`}>Status:</label>
            <select
              id={`status-${task.id}`}
              value={task.status}
              onChange={handleStatusChange}
              data-testid="status-dropdown"
              className="status-dropdown"
            >
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
