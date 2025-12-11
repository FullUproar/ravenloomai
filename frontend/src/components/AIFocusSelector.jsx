/**
 * AI Focus Selector - Set context for AI in a channel
 * Allows selecting a goal, project, or task to keep in AI context
 */

import { gql, useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';

const GET_FOCUS_OPTIONS = gql`
  query GetFocusOptions($teamId: ID!) {
    getGoals(teamId: $teamId) {
      id
      title
      status
    }
    getProjects(teamId: $teamId) {
      id
      name
      status
    }
    getTasks(teamId: $teamId, status: "todo") {
      id
      title
      status
      projectId
    }
    getTasksInProgress: getTasks(teamId: $teamId, status: "in_progress") {
      id
      title
      status
      projectId
    }
  }
`;

const SET_CHANNEL_FOCUS = gql`
  mutation SetChannelAIFocus($channelId: ID!, $goalId: ID, $projectId: ID, $taskId: ID) {
    setChannelAIFocus(channelId: $channelId, goalId: $goalId, projectId: $projectId, taskId: $taskId) {
      id
      focusGoalId
      focusProjectId
      focusTaskId
    }
  }
`;

const CLEAR_CHANNEL_FOCUS = gql`
  mutation ClearChannelAIFocus($channelId: ID!) {
    clearChannelAIFocus(channelId: $channelId) {
      id
      focusGoalId
      focusProjectId
      focusTaskId
    }
  }
`;

function AIFocusSelector({ channel, teamId, onClose }) {
  const [focusType, setFocusType] = useState(
    channel.focusTaskId ? 'task' :
    channel.focusProjectId ? 'project' :
    channel.focusGoalId ? 'goal' : 'none'
  );
  const [selectedGoalId, setSelectedGoalId] = useState(channel.focusGoalId || '');
  const [selectedProjectId, setSelectedProjectId] = useState(channel.focusProjectId || '');
  const [selectedTaskId, setSelectedTaskId] = useState(channel.focusTaskId || '');

  const { data, loading } = useQuery(GET_FOCUS_OPTIONS, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  });

  const [setFocus, { loading: settingFocus }] = useMutation(SET_CHANNEL_FOCUS);
  const [clearFocus, { loading: clearingFocus }] = useMutation(CLEAR_CHANNEL_FOCUS);

  const goals = data?.getGoals || [];
  const projects = data?.getProjects || [];
  const allTasks = [...(data?.getTasks || []), ...(data?.getTasksInProgress || [])];

  const handleSave = async () => {
    try {
      if (focusType === 'none') {
        await clearFocus({ variables: { channelId: channel.id } });
      } else {
        await setFocus({
          variables: {
            channelId: channel.id,
            goalId: focusType === 'goal' ? selectedGoalId : null,
            projectId: focusType === 'project' ? selectedProjectId : null,
            taskId: focusType === 'task' ? selectedTaskId : null
          }
        });
      }
      onClose();
    } catch (err) {
      console.error('Error setting AI focus:', err);
    }
  };

  const hasFocus = channel.focusGoalId || channel.focusProjectId || channel.focusTaskId;

  return (
    <div className="ai-focus-selector">
      <div className="ai-focus-header">
        <h4>AI Focus</h4>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>

      <div className="ai-focus-body">
        <p className="ai-focus-description">
          Set context for Raven in this channel. The AI will keep the selected item in mind when responding.
        </p>

        <div className="ai-focus-type-selector">
          <label>
            <input
              type="radio"
              name="focusType"
              value="none"
              checked={focusType === 'none'}
              onChange={() => setFocusType('none')}
            />
            <span>No Focus</span>
          </label>
          <label>
            <input
              type="radio"
              name="focusType"
              value="goal"
              checked={focusType === 'goal'}
              onChange={() => setFocusType('goal')}
            />
            <span>Goal</span>
          </label>
          <label>
            <input
              type="radio"
              name="focusType"
              value="project"
              checked={focusType === 'project'}
              onChange={() => setFocusType('project')}
            />
            <span>Project</span>
          </label>
          <label>
            <input
              type="radio"
              name="focusType"
              value="task"
              checked={focusType === 'task'}
              onChange={() => setFocusType('task')}
            />
            <span>Task</span>
          </label>
        </div>

        {loading && <p className="ai-focus-loading">Loading options...</p>}

        {focusType === 'goal' && !loading && (
          <div className="ai-focus-select-group">
            <label>Select Goal:</label>
            <select
              className="input-field"
              value={selectedGoalId}
              onChange={(e) => setSelectedGoalId(e.target.value)}
            >
              <option value="">-- Select a goal --</option>
              {goals.filter(g => g.status === 'active').map(goal => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {focusType === 'project' && !loading && (
          <div className="ai-focus-select-group">
            <label>Select Project:</label>
            <select
              className="input-field"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="">-- Select a project --</option>
              {projects.filter(p => p.status === 'active').map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {focusType === 'task' && !loading && (
          <div className="ai-focus-select-group">
            <label>Select Task:</label>
            <select
              className="input-field"
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
            >
              <option value="">-- Select a task --</option>
              {allTasks.map(task => (
                <option key={task.id} value={task.id}>
                  {task.title} ({task.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="ai-focus-footer">
        {hasFocus && (
          <button
            className="btn-danger"
            onClick={async () => {
              await clearFocus({ variables: { channelId: channel.id } });
              onClose();
            }}
            disabled={clearingFocus}
          >
            Clear Focus
          </button>
        )}
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={settingFocus || (focusType !== 'none' && !selectedGoalId && !selectedProjectId && !selectedTaskId)}
        >
          {settingFocus ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// Small indicator badge to show current focus
export function AIFocusBadge({ channel, onClick }) {
  if (!channel) return null;

  const hasFocus = channel.focusGoalId || channel.focusProjectId || channel.focusTaskId;

  return (
    <button
      className={`ai-focus-badge ${hasFocus ? 'active' : ''}`}
      onClick={onClick}
      title={hasFocus ? 'AI Focus active - click to change' : 'Set AI Focus'}
    >
      {hasFocus ? '🎯' : '○'}
      {hasFocus && <span className="ai-focus-badge-indicator" />}
    </button>
  );
}

export default AIFocusSelector;
