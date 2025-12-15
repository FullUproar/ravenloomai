/**
 * GoalTree - Hierarchical tree view for goals
 *
 * Features:
 * - Single top-level goal (team purpose)
 * - Nested sub-goals with expand/collapse
 * - Progress indicators
 * - Add child goal on hover
 * - Click to view details
 */

import { useState, useMemo } from 'react';
import './GoalTree.css';

function GoalTreeNode({ goal, goals, level = 0, onSelect, onAddChild, selectedGoalId }) {
  const [expanded, setExpanded] = useState(level < 2); // Auto-expand first 2 levels

  // Find children of this goal
  const children = useMemo(() =>
    goals.filter(g => g.parentGoalId === goal.id),
    [goals, goal.id]
  );

  const hasChildren = children.length > 0;
  const isSelected = selectedGoalId === goal.id;

  // Status colors
  const statusColors = {
    active: 'var(--primary)',
    achieved: 'var(--success)',
    abandoned: 'var(--text-muted)',
    paused: 'var(--warning)'
  };

  // Priority indicators
  const priorityIcons = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  };

  return (
    <div className={`goal-tree-node level-${Math.min(level, 4)}`}>
      <div
        className={`goal-tree-item ${isSelected ? 'selected' : ''} ${goal.status}`}
        onClick={() => onSelect?.(goal)}
      >
        {/* Expand/collapse toggle */}
        <button
          className="goal-tree-toggle"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {expanded ? '▼' : '▶'}
        </button>

        {/* Goal content */}
        <div className="goal-tree-content">
          <div className="goal-tree-header">
            <span className="goal-tree-priority">{priorityIcons[goal.priority] || '🟡'}</span>
            <span className="goal-tree-title">{goal.title}</span>
            {goal.status === 'achieved' && <span className="goal-tree-badge achieved">✓</span>}
          </div>

          {/* Progress bar */}
          <div className="goal-tree-progress">
            <div
              className="goal-tree-progress-fill"
              style={{
                width: `${goal.progress || 0}%`,
                backgroundColor: statusColors[goal.status] || statusColors.active
              }}
            />
          </div>

          {/* Meta info */}
          <div className="goal-tree-meta">
            <span className="goal-tree-stat">{goal.progress || 0}%</span>
            {goal.taskCount > 0 && (
              <span className="goal-tree-stat">
                {goal.completedTaskCount || 0}/{goal.taskCount} tasks
              </span>
            )}
            {goal.targetDate && (
              <span className="goal-tree-stat">
                Due: {new Date(goal.targetDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Add child button (on hover) */}
        <button
          className="goal-tree-add-child"
          onClick={(e) => { e.stopPropagation(); onAddChild?.(goal.id); }}
          title="Add sub-goal"
        >
          +
        </button>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="goal-tree-children">
          {children.map(child => (
            <GoalTreeNode
              key={child.id}
              goal={child}
              goals={goals}
              level={level + 1}
              onSelect={onSelect}
              onAddChild={onAddChild}
              selectedGoalId={selectedGoalId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GoalTree({ goals = [], onSelect, onAddChild, onAddRoot, selectedGoalId }) {
  // Build hierarchy - find root goals (no parent)
  const rootGoals = useMemo(() =>
    goals.filter(g => !g.parentGoalId),
    [goals]
  );

  // Check if we have a single top-level goal (team purpose)
  const hasTopLevelGoal = rootGoals.length === 1;
  const topLevelGoal = hasTopLevelGoal ? rootGoals[0] : null;

  // Warn if more than 4 levels deep
  const maxDepth = useMemo(() => {
    const getDepth = (goalId, depth = 0) => {
      const children = goals.filter(g => g.parentGoalId === goalId);
      if (children.length === 0) return depth;
      return Math.max(...children.map(c => getDepth(c.id, depth + 1)));
    };
    return rootGoals.length > 0
      ? Math.max(...rootGoals.map(r => getDepth(r.id, 0)))
      : 0;
  }, [goals, rootGoals]);

  if (goals.length === 0) {
    return (
      <div className="goal-tree-empty">
        <div className="empty-icon">🎯</div>
        <h3>No goals yet</h3>
        <p>Create your team's top-level goal to get started</p>
        <button className="btn-primary" onClick={() => onAddRoot?.()}>
          + Create Team Goal
        </button>
      </div>
    );
  }

  return (
    <div className="goal-tree">
      {/* Header with add button */}
      <div className="goal-tree-header-bar">
        <h3>Goal Hierarchy</h3>
        {!hasTopLevelGoal && rootGoals.length > 1 && (
          <span className="goal-tree-warning">
            ⚠️ Multiple root goals - consider consolidating under one team purpose
          </span>
        )}
        {maxDepth > 4 && (
          <span className="goal-tree-warning">
            ⚠️ Goals nested {maxDepth} levels deep - consider simplifying
          </span>
        )}
        <button
          className="btn-secondary btn-sm"
          onClick={() => onAddRoot?.()}
        >
          + New Goal
        </button>
      </div>

      {/* Tree content */}
      <div className="goal-tree-content-area">
        {rootGoals.map(goal => (
          <GoalTreeNode
            key={goal.id}
            goal={goal}
            goals={goals}
            level={0}
            onSelect={onSelect}
            onAddChild={onAddChild}
            selectedGoalId={selectedGoalId}
          />
        ))}
      </div>
    </div>
  );
}
