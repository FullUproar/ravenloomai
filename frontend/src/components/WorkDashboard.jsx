/**
 * WorkDashboard - Unified view of goal→project→task hierarchy
 *
 * Shows:
 * - Goals with health indicators
 * - Priority queue (what to work on next)
 * - Blocked items
 * - Knowledge gaps
 * - AI insights
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import './WorkDashboard.css';

// GraphQL query for work dashboard
const GET_WORK_DASHBOARD = gql`
  query GetWorkDashboard($teamId: ID!) {
    getWorkDashboard(teamId: $teamId) {
      goals {
        goal {
          id
          title
          status
          priority
          priorityScore
          progress
          health {
            score
            status
            progress
            taskCount
            completedCount
            blockedCount
            overdueCount
            riskFactors
          }
        }
        projects {
          project {
            id
            name
            status
          }
          tasks {
            id
            title
            status
            priority
          }
          blockedCount
          progress
        }
        orphanTasks {
          id
          title
          status
          priority
        }
      }
      blockedItems {
        id
        title
        blockedReason
        project {
          name
        }
      }
      priorityQueue {
        rank
        taskId
        title
        priority
        effectivePriority
        effectivePriorityLabel
        status
        dueAt
        projectName
        goalNames
        isBlocked
        hasPriorityConflict
      }
      knowledgeGaps {
        taskId
        goalId
        requiredKnowledge
        knowledgeType
        suggestedQuestion
      }
      aiSummary
      suggestedActions {
        type
        title
        description
        entityType
        entityId
        priority
      }
    }
    getPriorityConflicts(teamId: $teamId) {
      hasConflicts
      conflictCount
      summary
      conflicts {
        taskId
        taskTitle
        taskPriority
        goalTitle
        goalPriority
        suggestion
      }
    }
  }
`;

// Health status colors and icons
const HEALTH_CONFIG = {
  on_track: { color: '#4caf50', icon: '🟢', label: 'On Track' },
  at_risk: { color: '#ff9800', icon: '🟡', label: 'At Risk' },
  blocked: { color: '#f44336', icon: '🔴', label: 'Blocked' },
  behind: { color: '#ff5722', icon: '🟠', label: 'Behind' }
};

// Priority colors
const PRIORITY_CONFIG = {
  critical: { color: '#f44336', icon: '🔴' },
  high: { color: '#ff9800', icon: '🟠' },
  medium: { color: '#ffc107', icon: '🟡' },
  low: { color: '#9e9e9e', icon: '⚪' }
};

/**
 * Main WorkDashboard component
 */
export default function WorkDashboard({ teamId }) {
  const [expandedGoals, setExpandedGoals] = useState(new Set());
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'queue', 'blocked', 'conflicts'

  const { data, loading, error, refetch } = useQuery(GET_WORK_DASHBOARD, {
    variables: { teamId },
    skip: !teamId,
    pollInterval: 60000 // Refresh every minute
  });

  if (loading) {
    return (
      <div className="work-dashboard loading">
        <div className="loading-skeleton">
          <div className="skeleton-header" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="work-dashboard error">
        <p>Error loading dashboard: {error.message}</p>
        <button onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  const dashboard = data?.getWorkDashboard;
  const conflicts = data?.getPriorityConflicts;

  if (!dashboard) {
    return (
      <div className="work-dashboard empty">
        <p>No work data available.</p>
      </div>
    );
  }

  const toggleGoal = (goalId) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(goalId)) {
        next.delete(goalId);
      } else {
        next.add(goalId);
      }
      return next;
    });
  };

  return (
    <div className="work-dashboard">
      {/* AI Summary */}
      {dashboard.aiSummary && (
        <div className="ai-summary">
          <span className="ai-icon">🐦</span>
          <span className="ai-text">{dashboard.aiSummary}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="dashboard-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          Priority Queue ({dashboard.priorityQueue?.length || 0})
        </button>
        <button
          className={`tab ${activeTab === 'blocked' ? 'active' : ''}`}
          onClick={() => setActiveTab('blocked')}
        >
          Blocked ({dashboard.blockedItems?.length || 0})
        </button>
        {conflicts?.hasConflicts && (
          <button
            className={`tab ${activeTab === 'conflicts' ? 'active' : ''} conflicts`}
            onClick={() => setActiveTab('conflicts')}
          >
            ⚡ Conflicts ({conflicts.conflictCount})
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="dashboard-content">
        {activeTab === 'overview' && (
          <GoalsOverview
            goals={dashboard.goals}
            expandedGoals={expandedGoals}
            onToggleGoal={toggleGoal}
          />
        )}

        {activeTab === 'queue' && (
          <PriorityQueue queue={dashboard.priorityQueue} />
        )}

        {activeTab === 'blocked' && (
          <BlockedItems items={dashboard.blockedItems} />
        )}

        {activeTab === 'conflicts' && conflicts && (
          <PriorityConflicts conflicts={conflicts} />
        )}
      </div>

      {/* Suggested Actions */}
      {dashboard.suggestedActions?.length > 0 && (
        <div className="suggested-actions">
          <h4>💡 Suggested Actions</h4>
          {dashboard.suggestedActions.slice(0, 3).map((action, i) => (
            <div key={i} className={`action-item priority-${action.priority}`}>
              <span className="action-type">{action.type}</span>
              <span className="action-title">{action.title}</span>
              <span className="action-desc">{action.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Goals Overview with health indicators
 */
function GoalsOverview({ goals, expandedGoals, onToggleGoal }) {
  if (!goals?.length) {
    return (
      <div className="empty-state">
        <p>No goals yet. Create one to get started!</p>
      </div>
    );
  }

  return (
    <div className="goals-overview">
      {goals.map(({ goal, projects, orphanTasks }) => {
        const isExpanded = expandedGoals.has(goal.id);
        const health = goal.health || {};
        const healthConfig = HEALTH_CONFIG[health.status] || HEALTH_CONFIG.on_track;
        const priorityConfig = PRIORITY_CONFIG[goal.priority] || PRIORITY_CONFIG.medium;

        return (
          <div key={goal.id} className={`goal-card status-${health.status || 'unknown'}`}>
            <div className="goal-header" onClick={() => onToggleGoal(goal.id)}>
              <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
              <span className="health-icon">{healthConfig.icon}</span>
              <span className="goal-title">{goal.title}</span>
              <span className={`priority-badge priority-${goal.priority}`}>
                {goal.priority}
              </span>
              <div className="goal-metrics">
                <span className="progress-bar">
                  <span
                    className="progress-fill"
                    style={{ width: `${health.progress || 0}%` }}
                  />
                </span>
                <span className="progress-text">
                  {health.completedCount || 0}/{health.taskCount || 0}
                </span>
              </div>
            </div>

            {isExpanded && (
              <div className="goal-details">
                {/* Health Score */}
                <div className="health-summary">
                  <span>Health: <strong>{health.score || 0}/100</strong></span>
                  <span className="health-status">{healthConfig.label}</span>
                  {health.blockedCount > 0 && (
                    <span className="warning">🚫 {health.blockedCount} blocked</span>
                  )}
                  {health.overdueCount > 0 && (
                    <span className="warning">⏰ {health.overdueCount} overdue</span>
                  )}
                </div>

                {/* Risk Factors */}
                {health.riskFactors?.length > 0 && (
                  <div className="risk-factors">
                    {health.riskFactors.map((risk, i) => (
                      <div key={i} className="risk-item">⚠️ {risk}</div>
                    ))}
                  </div>
                )}

                {/* Projects */}
                {projects?.length > 0 && (
                  <div className="projects-list">
                    <h5>Projects</h5>
                    {projects.map(({ project, tasks, blockedCount, progress }) => (
                      <div key={project.id} className="project-item">
                        <span className="project-name">📁 {project.name}</span>
                        <span className="project-progress">{progress}%</span>
                        <span className="task-count">
                          {tasks?.length || 0} tasks
                          {blockedCount > 0 && <span className="blocked-badge">🚫 {blockedCount}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Orphan Tasks (direct to goal, not in project) */}
                {orphanTasks?.length > 0 && (
                  <div className="orphan-tasks">
                    <h5>Direct Tasks</h5>
                    {orphanTasks.map(task => (
                      <div key={task.id} className="task-item">
                        <span className={`status-dot status-${task.status}`} />
                        <span className="task-title">{task.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Priority Queue - What to work on next
 */
function PriorityQueue({ queue }) {
  if (!queue?.length) {
    return (
      <div className="empty-state">
        <p>No tasks in the queue. Nice work!</p>
      </div>
    );
  }

  return (
    <div className="priority-queue">
      <p className="queue-intro">Tasks sorted by effective priority (goal importance × task priority)</p>
      {queue.map((item, index) => {
        const priorityConfig = PRIORITY_CONFIG[item.effectivePriorityLabel] || PRIORITY_CONFIG.medium;
        const scorePercent = Math.round((item.effectivePriority || 0.5) * 100);

        return (
          <div
            key={item.taskId}
            className={`queue-item ${item.isBlocked ? 'blocked' : ''} ${item.hasPriorityConflict ? 'conflict' : ''}`}
          >
            <span className="rank">#{item.rank}</span>
            <span className="priority-icon">{priorityConfig.icon}</span>
            <span className="score-badge">{scorePercent}</span>
            <div className="item-content">
              <span className="item-title">{item.title}</span>
              {item.goalNames && (
                <span className="item-goals">→ {item.goalNames}</span>
              )}
              {item.projectName && (
                <span className="item-project">📁 {item.projectName}</span>
              )}
            </div>
            <div className="item-badges">
              {item.isBlocked && <span className="badge blocked">🚫 Blocked</span>}
              {item.hasPriorityConflict && <span className="badge conflict">⚡ Conflict</span>}
              {item.dueAt && (
                <span className="badge due">
                  📅 {new Date(item.dueAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Blocked Items
 */
function BlockedItems({ items }) {
  if (!items?.length) {
    return (
      <div className="empty-state success">
        <p>✅ No blocked tasks. Everything is flowing!</p>
      </div>
    );
  }

  return (
    <div className="blocked-items">
      {items.map(item => (
        <div key={item.id} className="blocked-item">
          <span className="blocked-icon">🚫</span>
          <div className="blocked-content">
            <span className="blocked-title">{item.title}</span>
            {item.blockedReason && (
              <span className="blocked-reason">{item.blockedReason}</span>
            )}
            {item.project?.name && (
              <span className="blocked-project">📁 {item.project.name}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Priority Conflicts
 */
function PriorityConflicts({ conflicts }) {
  if (!conflicts?.hasConflicts) {
    return (
      <div className="empty-state success">
        <p>✅ No priority conflicts. Task priorities align with goals!</p>
      </div>
    );
  }

  return (
    <div className="priority-conflicts">
      <p className="conflicts-summary">{conflicts.summary}</p>
      {conflicts.conflicts?.map((conflict, i) => (
        <div key={i} className="conflict-item">
          <div className="conflict-task">
            <span className="task-name">{conflict.taskTitle}</span>
            <span className={`priority-badge priority-${conflict.taskPriority}`}>
              {conflict.taskPriority}
            </span>
          </div>
          <div className="conflict-goal">
            <span>→ Goal "{conflict.goalTitle}" is</span>
            <span className={`priority-badge priority-${conflict.goalPriority}`}>
              {conflict.goalPriority}
            </span>
          </div>
          <div className="conflict-suggestion">
            💡 {conflict.suggestion}
          </div>
        </div>
      ))}
    </div>
  );
}

// Export subcomponents for reuse
export { GoalsOverview, PriorityQueue, BlockedItems, PriorityConflicts };
