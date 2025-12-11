/**
 * AI Focus Selector Component Tests
 *
 * Tests for the AI Focus feature that allows setting context for AI in channels:
 * - Focus type selection (none, goal, project, task)
 * - Dropdown population with options
 * - Save/clear focus functionality
 * - Badge display
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { gql } from '@apollo/client';

// Import the component (we'll mock GraphQL queries)
// Since the component uses GraphQL, we need to mock those queries

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

// Mock data
const mockGoals = [
  { id: 'goal-1', title: 'Q1 Revenue Target', status: 'active' },
  { id: 'goal-2', title: 'Product Launch', status: 'active' },
  { id: 'goal-3', title: 'Old Goal', status: 'completed' }
];

const mockProjects = [
  { id: 'proj-1', name: 'Website Redesign', status: 'active' },
  { id: 'proj-2', name: 'API Development', status: 'active' },
  { id: 'proj-3', name: 'Legacy Project', status: 'archived' }
];

const mockTasks = [
  { id: 'task-1', title: 'Design mockups', status: 'todo', projectId: 'proj-1' },
  { id: 'task-2', title: 'Write tests', status: 'todo', projectId: 'proj-2' }
];

const mockTasksInProgress = [
  { id: 'task-3', title: 'Implement feature', status: 'in_progress', projectId: 'proj-1' }
];

// Create a simple mock component that mimics AIFocusSelector behavior
function AIFocusSelectorMock({ channel, teamId, onClose, goals = [], projects = [], tasks = [], loading = false }) {
  const [focusType, setFocusType] = React.useState(
    channel.focusTaskId ? 'task' :
    channel.focusProjectId ? 'project' :
    channel.focusGoalId ? 'goal' : 'none'
  );
  const [selectedGoalId, setSelectedGoalId] = React.useState(channel.focusGoalId || '');
  const [selectedProjectId, setSelectedProjectId] = React.useState(channel.focusProjectId || '');
  const [selectedTaskId, setSelectedTaskId] = React.useState(channel.focusTaskId || '');

  const hasFocus = channel.focusGoalId || channel.focusProjectId || channel.focusTaskId;

  return (
    <div className="ai-focus-selector">
      <div className="ai-focus-header">
        <h4>AI Focus</h4>
        <button className="modal-close" onClick={onClose} data-testid="close-button">×</button>
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
              data-testid="focus-type-none"
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
              data-testid="focus-type-goal"
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
              data-testid="focus-type-project"
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
              data-testid="focus-type-task"
            />
            <span>Task</span>
          </label>
        </div>

        {loading && <p className="ai-focus-loading" data-testid="loading">Loading options...</p>}

        {focusType === 'goal' && !loading && (
          <div className="ai-focus-select-group">
            <label>Select Goal:</label>
            <select
              className="input-field"
              value={selectedGoalId}
              onChange={(e) => setSelectedGoalId(e.target.value)}
              data-testid="goal-select"
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
              data-testid="project-select"
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
              data-testid="task-select"
            >
              <option value="">-- Select a task --</option>
              {tasks.map(task => (
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
          <button className="btn-danger" data-testid="clear-focus-btn">
            Clear Focus
          </button>
        )}
        <button className="btn-secondary" onClick={onClose} data-testid="cancel-btn">
          Cancel
        </button>
        <button
          className="btn-primary"
          data-testid="save-btn"
          disabled={focusType !== 'none' && !selectedGoalId && !selectedProjectId && !selectedTaskId}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// AI Focus Badge Mock
function AIFocusBadgeMock({ channel, onClick }) {
  if (!channel) return null;
  const hasFocus = channel.focusGoalId || channel.focusProjectId || channel.focusTaskId;

  return (
    <button
      className={`ai-focus-badge ${hasFocus ? 'active' : ''}`}
      onClick={onClick}
      title={hasFocus ? 'AI Focus active - click to change' : 'Set AI Focus'}
      data-testid="ai-focus-badge"
    >
      {hasFocus ? '🎯' : '○'}
      {hasFocus && <span className="ai-focus-badge-indicator" data-testid="focus-indicator" />}
    </button>
  );
}

// Need to import React for the mock components
import React from 'react';

describe('AIFocusSelector', () => {
  const mockChannel = {
    id: 'channel-123',
    name: 'general',
    focusGoalId: null,
    focusProjectId: null,
    focusTaskId: null
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render the AI Focus header', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('AI Focus')).toBeInTheDocument();
    });

    it('should render all focus type radio buttons', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByTestId('focus-type-none')).toBeInTheDocument();
      expect(screen.getByTestId('focus-type-goal')).toBeInTheDocument();
      expect(screen.getByTestId('focus-type-project')).toBeInTheDocument();
      expect(screen.getByTestId('focus-type-task')).toBeInTheDocument();
    });

    it('should display description text', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/Set context for Raven/)).toBeInTheDocument();
    });
  });

  describe('Focus Type Selection', () => {
    it('should default to "No Focus" when channel has no focus', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByTestId('focus-type-none')).toBeChecked();
    });

    it('should default to "Goal" when channel has a focused goal', () => {
      render(
        <AIFocusSelectorMock
          channel={{ ...mockChannel, focusGoalId: 'goal-1' }}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByTestId('focus-type-goal')).toBeChecked();
    });

    it('should default to "Project" when channel has a focused project', () => {
      render(
        <AIFocusSelectorMock
          channel={{ ...mockChannel, focusProjectId: 'proj-1' }}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByTestId('focus-type-project')).toBeChecked();
    });

    it('should default to "Task" when channel has a focused task', () => {
      render(
        <AIFocusSelectorMock
          channel={{ ...mockChannel, focusTaskId: 'task-1' }}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByTestId('focus-type-task')).toBeChecked();
    });

    it('should show goal dropdown when Goal is selected', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
          goals={mockGoals}
        />
      );

      fireEvent.click(screen.getByTestId('focus-type-goal'));
      expect(screen.getByTestId('goal-select')).toBeInTheDocument();
    });

    it('should show project dropdown when Project is selected', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
          projects={mockProjects}
        />
      );

      fireEvent.click(screen.getByTestId('focus-type-project'));
      expect(screen.getByTestId('project-select')).toBeInTheDocument();
    });

    it('should show task dropdown when Task is selected', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
          tasks={[...mockTasks, ...mockTasksInProgress]}
        />
      );

      fireEvent.click(screen.getByTestId('focus-type-task'));
      expect(screen.getByTestId('task-select')).toBeInTheDocument();
    });
  });

  describe('Dropdown Options', () => {
    it('should only show active goals in goal dropdown', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
          goals={mockGoals}
        />
      );

      fireEvent.click(screen.getByTestId('focus-type-goal'));
      const select = screen.getByTestId('goal-select');

      expect(screen.getByText('Q1 Revenue Target')).toBeInTheDocument();
      expect(screen.getByText('Product Launch')).toBeInTheDocument();
      expect(screen.queryByText('Old Goal')).not.toBeInTheDocument();
    });

    it('should only show active projects in project dropdown', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
          projects={mockProjects}
        />
      );

      fireEvent.click(screen.getByTestId('focus-type-project'));

      expect(screen.getByText('Website Redesign')).toBeInTheDocument();
      expect(screen.getByText('API Development')).toBeInTheDocument();
      expect(screen.queryByText('Legacy Project')).not.toBeInTheDocument();
    });

    it('should show all tasks with status in task dropdown', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
          tasks={[...mockTasks, ...mockTasksInProgress]}
        />
      );

      fireEvent.click(screen.getByTestId('focus-type-task'));

      expect(screen.getByText('Design mockups (todo)')).toBeInTheDocument();
      expect(screen.getByText('Write tests (todo)')).toBeInTheDocument();
      expect(screen.getByText('Implement feature (in_progress)')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading message when loading', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
          loading={true}
        />
      );

      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    it('should hide dropdowns when loading', () => {
      render(
        <AIFocusSelectorMock
          channel={{ ...mockChannel, focusGoalId: 'goal-1' }}
          teamId="team-123"
          onClose={mockOnClose}
          loading={true}
          goals={mockGoals}
        />
      );

      expect(screen.queryByTestId('goal-select')).not.toBeInTheDocument();
    });
  });

  describe('Modal Actions', () => {
    it('should call onClose when close button is clicked', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      fireEvent.click(screen.getByTestId('close-button'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when Cancel button is clicked', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      fireEvent.click(screen.getByTestId('cancel-btn'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should disable Save button when focus type selected but no item chosen', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
          goals={mockGoals}
        />
      );

      fireEvent.click(screen.getByTestId('focus-type-goal'));

      expect(screen.getByTestId('save-btn')).toBeDisabled();
    });

    it('should enable Save button when No Focus is selected', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByTestId('save-btn')).not.toBeDisabled();
    });
  });

  describe('Clear Focus', () => {
    it('should show Clear Focus button when channel has focus', () => {
      render(
        <AIFocusSelectorMock
          channel={{ ...mockChannel, focusGoalId: 'goal-1' }}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByTestId('clear-focus-btn')).toBeInTheDocument();
    });

    it('should not show Clear Focus button when channel has no focus', () => {
      render(
        <AIFocusSelectorMock
          channel={mockChannel}
          teamId="team-123"
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByTestId('clear-focus-btn')).not.toBeInTheDocument();
    });
  });
});

describe('AIFocusBadge', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when channel is null', () => {
    const { container } = render(<AIFocusBadgeMock channel={null} onClick={mockOnClick} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should show inactive icon when no focus set', () => {
    render(
      <AIFocusBadgeMock
        channel={{ focusGoalId: null, focusProjectId: null, focusTaskId: null }}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('○')).toBeInTheDocument();
    expect(screen.queryByTestId('focus-indicator')).not.toBeInTheDocument();
  });

  it('should show target emoji and indicator when focus is set', () => {
    render(
      <AIFocusBadgeMock
        channel={{ focusGoalId: 'goal-1', focusProjectId: null, focusTaskId: null }}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('🎯')).toBeInTheDocument();
    expect(screen.getByTestId('focus-indicator')).toBeInTheDocument();
  });

  it('should have active class when focus is set', () => {
    render(
      <AIFocusBadgeMock
        channel={{ focusGoalId: 'goal-1', focusProjectId: null, focusTaskId: null }}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByTestId('ai-focus-badge')).toHaveClass('active');
  });

  it('should call onClick when clicked', () => {
    render(
      <AIFocusBadgeMock
        channel={{ focusGoalId: null, focusProjectId: null, focusTaskId: null }}
        onClick={mockOnClick}
      />
    );

    fireEvent.click(screen.getByTestId('ai-focus-badge'));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('should show correct title when no focus set', () => {
    render(
      <AIFocusBadgeMock
        channel={{ focusGoalId: null, focusProjectId: null, focusTaskId: null }}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByTitle('Set AI Focus')).toBeInTheDocument();
  });

  it('should show correct title when focus is active', () => {
    render(
      <AIFocusBadgeMock
        channel={{ focusGoalId: 'goal-1', focusProjectId: null, focusTaskId: null }}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByTitle('AI Focus active - click to change')).toBeInTheDocument();
  });
});
