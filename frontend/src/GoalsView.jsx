import { gql, useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';

const GET_GOALS = gql`
  query GetGoals($projectId: ID!) {
    getGoals(projectId: $projectId) {
      id
      title
      description
      type
      targetValue
      currentValue
      unit
      deadline
      status
      createdAt
    }
  }
`;

const CREATE_GOAL = gql`
  mutation CreateGoal($projectId: ID!, $input: GoalInput!) {
    createGoal(projectId: $projectId, input: $input) {
      id
      title
      description
      type
      targetValue
      currentValue
      unit
      deadline
      status
    }
  }
`;

const UPDATE_GOAL_PROGRESS = gql`
  mutation UpdateGoalProgress($goalId: ID!, $currentValue: Float!) {
    updateGoalProgress(goalId: $goalId, currentValue: $currentValue) {
      id
      currentValue
    }
  }
`;

function GoalsView({ projectId }) {
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    type: 'numeric',
    targetValue: 0,
    unit: ''
  });

  const { loading, data, refetch } = useQuery(GET_GOALS, {
    variables: { projectId: parseInt(projectId) }
  });

  const [createGoal] = useMutation(CREATE_GOAL, {
    onCompleted: () => {
      refetch();
      setShowCreateGoal(false);
      setNewGoal({ title: '', description: '', type: 'numeric', targetValue: 0, unit: '' });
    }
  });

  const [updateGoalProgress] = useMutation(UPDATE_GOAL_PROGRESS, {
    onCompleted: () => refetch()
  });

  if (loading) {
    return <div style={{ padding: '2rem', color: '#888' }}>Loading goals...</div>;
  }

  const goals = data?.getGoals || [];

  const handleCreateGoal = async () => {
    if (!newGoal.title.trim()) {
      alert('Please enter a goal title');
      return;
    }

    await createGoal({
      variables: {
        projectId: parseInt(projectId),
        input: {
          title: newGoal.title,
          description: newGoal.description,
          type: newGoal.type,
          targetValue: parseFloat(newGoal.targetValue),
          unit: newGoal.unit
        }
      }
    });
  };

  const handleUpdateProgress = async (goalId, newValue) => {
    await updateGoalProgress({
      variables: {
        goalId,
        currentValue: parseFloat(newValue)
      }
    });
  };

  const getProgressPercentage = (goal) => {
    if (!goal.targetValue) return 0;
    return Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
  };

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '1.5rem'
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
          Goals
        </h2>
        <button
          onClick={() => setShowCreateGoal(true)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#5D4B8C',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '500'
          }}
        >
          + New Goal
        </button>
      </div>

      {/* Goals List */}
      {goals.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: '#666'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
          <h3 style={{ color: '#888', marginBottom: '0.5rem' }}>No goals yet</h3>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Create your first goal to track your progress
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {goals.map(goal => (
            <div
              key={goal.id}
              style={{
                backgroundColor: '#1A1A1A',
                borderRadius: '12px',
                padding: '1.5rem',
                border: '1px solid #2D2D40'
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '1rem'
              }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{
                    margin: '0 0 0.5rem 0',
                    color: '#D9D9E3',
                    fontSize: '1.1rem'
                  }}>
                    {goal.title}
                  </h3>
                  {goal.description && (
                    <p style={{
                      margin: 0,
                      color: '#888',
                      fontSize: '0.9rem',
                      lineHeight: '1.4'
                    }}>
                      {goal.description}
                    </p>
                  )}
                </div>
                <span style={{
                  backgroundColor: goal.status === 'completed' ? '#2D4A2D' : '#2D2D40',
                  color: goal.status === 'completed' ? '#6BCF7F' : '#9D8BCC',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                  marginLeft: '1rem'
                }}>
                  {goal.status}
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem',
                  fontSize: '0.85rem',
                  color: '#888'
                }}>
                  <span>{goal.currentValue || 0} / {goal.targetValue} {goal.unit}</span>
                  <span>{getProgressPercentage(goal)}%</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#2D2D40',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${getProgressPercentage(goal)}%`,
                    height: '100%',
                    backgroundColor: '#5D4B8C',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              {/* Update Progress */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number"
                  placeholder="Update progress"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && e.target.value) {
                      handleUpdateProgress(goal.id, e.target.value);
                      e.target.value = '';
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    backgroundColor: '#0D0D0D',
                    border: '1px solid #2D2D40',
                    borderRadius: '6px',
                    color: '#D9D9E3',
                    fontSize: '0.9rem'
                  }}
                />
                <span style={{ fontSize: '0.85rem', color: '#666' }}>
                  Press Enter to update
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Goal Modal */}
      {showCreateGoal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'flex-end',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#1A1A1A',
            width: '100%',
            borderRadius: '24px 24px 0 0',
            padding: '1.5rem',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '1.3rem',
                color: '#9D8BCC'
              }}>
                Create Goal
              </h2>
              <button
                onClick={() => setShowCreateGoal(false)}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#9D8BCC',
                  fontSize: '0.9rem'
                }}>
                  Goal Title *
                </label>
                <input
                  type="text"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                  placeholder="e.g., Lose 10 pounds"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0D0D0D',
                    border: '2px solid #2D2D40',
                    borderRadius: '8px',
                    color: '#D9D9E3',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#9D8BCC',
                  fontSize: '0.9rem'
                }}>
                  Description
                </label>
                <textarea
                  value={newGoal.description}
                  onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                  placeholder="Optional description"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0D0D0D',
                    border: '2px solid #2D2D40',
                    borderRadius: '8px',
                    color: '#D9D9E3',
                    fontSize: '1rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#9D8BCC',
                  fontSize: '0.9rem'
                }}>
                  Target Value *
                </label>
                <input
                  type="number"
                  value={newGoal.targetValue}
                  onChange={(e) => setNewGoal({ ...newGoal, targetValue: e.target.value })}
                  placeholder="100"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0D0D0D',
                    border: '2px solid #2D2D40',
                    borderRadius: '8px',
                    color: '#D9D9E3',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#9D8BCC',
                  fontSize: '0.9rem'
                }}>
                  Unit
                </label>
                <input
                  type="text"
                  value={newGoal.unit}
                  onChange={(e) => setNewGoal({ ...newGoal, unit: e.target.value })}
                  placeholder="e.g., lbs, pages, hours"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0D0D0D',
                    border: '2px solid #2D2D40',
                    borderRadius: '8px',
                    color: '#D9D9E3',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div style={{
                display: 'flex',
                gap: '0.75rem',
                marginTop: '1rem'
              }}>
                <button
                  onClick={() => setShowCreateGoal(false)}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    backgroundColor: '#2D2D40',
                    color: '#D9D9E3',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGoal}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    backgroundColor: '#5D4B8C',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}
                >
                  Create Goal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoalsView;
