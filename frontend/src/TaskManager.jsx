import { useState, useRef } from 'react';
import { gql, useMutation } from '@apollo/client';

const UPDATE_TASK = gql`
  mutation UpdateTask($taskId: ID!, $input: TaskInput!) {
    updateTask(taskId: $taskId, input: $input) {
      id
      title
      description
      status
      priority
      dueDate
      gtdType
      context
      energyLevel
      timeEstimate
      isRecurring
      recurrenceType
      recurrenceInterval
      recurrenceDays
      recurrenceEndType
      recurrenceEndDate
      recurrenceEndCount
      recurrencePaused
    }
  }
`;

const DELETE_TASK = gql`
  mutation DeleteTask($taskId: ID!) {
    deleteTask(taskId: $taskId)
  }
`;

const UPDATE_TASK_STATUS = gql`
  mutation UpdateTaskStatus($taskId: ID!, $status: String!) {
    updateTaskStatus(taskId: $taskId, status: $status) {
      id
      status
      completedAt
    }
  }
`;

const PAUSE_RECURRING_TASK = gql`
  mutation PauseRecurringTask($taskId: ID!) {
    pauseRecurringTask(taskId: $taskId) {
      id
      recurrencePaused
    }
  }
`;

const RESUME_RECURRING_TASK = gql`
  mutation ResumeRecurringTask($taskId: ID!) {
    resumeRecurringTask(taskId: $taskId) {
      id
      recurrencePaused
    }
  }
`;

const GENERATE_RECURRING_INSTANCES = gql`
  mutation GenerateRecurringTaskInstances($taskId: ID!) {
    generateRecurringTaskInstances(taskId: $taskId) {
      id
      title
      dueDate
    }
  }
`;

export function TaskManager({ tasks = [], onCreateTask, refetchTasks }) {
  // VERSION CHECK - Look for this in logs to confirm new code is loaded
  console.log('🔧 TaskManager v2.0 loaded - Recurring tasks support enabled');

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created');
  const [selectedContext, setSelectedContext] = useState('all');
  const [viewMode, setViewMode] = useState('tasks'); // 'tasks', 'recurring', 'all'
  const [recurringFilter, setRecurringFilter] = useState('all'); // 'all', 'active', 'paused'
  const [editingTask, setEditingTask] = useState(null);
  const [swipedTaskId, setSwipedTaskId] = useState(null);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);

  const [updateTask] = useMutation(UPDATE_TASK, {
    onCompleted: (data) => {
      console.log('✅ Task updated successfully:', data);
      setEditingTask(null);
      refetchTasks();
    },
    onError: (error) => {
      console.error('❌ Error updating task:', error);
      alert(`Error saving task: ${error.message}`);
    }
  });

  const [deleteTask] = useMutation(DELETE_TASK, {
    onCompleted: () => {
      setSwipedTaskId(null);
      refetchTasks();
    }
  });

  const [updateTaskStatus] = useMutation(UPDATE_TASK_STATUS, {
    onCompleted: refetchTasks
  });

  const [pauseRecurringTask] = useMutation(PAUSE_RECURRING_TASK, {
    onCompleted: refetchTasks
  });

  const [resumeRecurringTask] = useMutation(RESUME_RECURRING_TASK, {
    onCompleted: refetchTasks
  });

  const [generateRecurringInstances] = useMutation(GENERATE_RECURRING_INSTANCES, {
    onCompleted: (data) => {
      alert(`Generated ${data.generateRecurringTaskInstances.length} task instances!`);
      refetchTasks();
    }
  });

  // Filter, search, and sort tasks
  const processedTasks = tasks
    .filter(t => {
      // Filter by view mode
      if (viewMode === 'tasks') {
        // Show only regular tasks and recurring instances (not templates)
        return !t.isRecurring || t.parentTaskId;
      } else if (viewMode === 'recurring') {
        // Show only recurring templates
        return t.isRecurring && !t.parentTaskId;
      }
      // 'all' mode shows everything
      return true;
    })
    .filter(t => {
      // Apply recurring status filter only when viewing recurring templates
      if (viewMode === 'recurring') {
        if (recurringFilter === 'active') {
          return !t.recurrencePaused;
        } else if (recurringFilter === 'paused') {
          return t.recurrencePaused;
        }
      }
      return true;
    })
    .filter(t => selectedContext === 'all' || t.context === selectedContext)
    .filter(t =>
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      if (sortBy === 'priority') {
        return (b.priority || 0) - (a.priority || 0);
      }
      // Default: created (newest first)
      return b.id - a.id;
    });

  const contexts = ['all', '@home', '@office', '@computer', '@errands', '@phone', '@anywhere'];

  const handleSwipeStart = (e, taskId) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleSwipeMove = (e, taskId) => {
    const diff = touchStartX.current - e.touches[0].clientX;

    // Only show delete if swiped left more than 50px
    if (diff > 50) {
      setSwipedTaskId(taskId);
    } else {
      setSwipedTaskId(null);
    }
  };

  const handleSwipeEnd = () => {
    // Don't clear swipedTaskId here - let it stay revealed until tap elsewhere
  };

  const handleDeleteTask = (taskId) => {
    if (confirm('Delete this task?')) {
      deleteTask({ variables: { taskId } });
      setSwipedTaskId(null);
    }
  };

  const handleToggleComplete = (task) => {
    const newStatus = task.status === 'completed' ? 'not_started' : 'completed';
    updateTaskStatus({ variables: { taskId: task.id, status: newStatus } });
  };

  const handleSaveTask = () => {
    console.log('🔧 [TaskManager v2.0] handleSaveTask called');

    if (!editingTask) return;

    const { id, __typename, ...taskData } = editingTask;

    console.log('📋 [TaskManager v2.0] editingTask data:', {
      isRecurring: taskData.isRecurring,
      recurrenceType: taskData.recurrenceType,
      recurrenceInterval: taskData.recurrenceInterval,
      recurrenceDays: taskData.recurrenceDays
    });

    // Build the input object, including recurring fields if present
    const input = {
      title: taskData.title,
      description: taskData.description,
      dueDate: taskData.dueDate,
      priority: taskData.priority,
      context: taskData.context,
      gtdType: taskData.gtdType || 'next_action',
      energyLevel: taskData.energyLevel || 'medium',
      type: 'manual'
    };

    // Add recurring fields if this is a recurring task
    if (taskData.isRecurring) {
      console.log('✅ [TaskManager v2.0] Task IS recurring, adding fields to input');
      input.isRecurring = true;
      input.recurrenceType = taskData.recurrenceType;
      input.recurrenceInterval = taskData.recurrenceInterval || 1;
      input.recurrenceDays = taskData.recurrenceDays || [];
      input.recurrenceEndType = taskData.recurrenceEndType || 'never';
      input.recurrenceEndDate = taskData.recurrenceEndDate || null;
      input.recurrenceEndCount = taskData.recurrenceEndCount || null;
    } else {
      console.log('❌ [TaskManager v2.0] Task is NOT recurring');
      // If unchecking recurring, explicitly set to false
      input.isRecurring = false;
      input.recurrenceType = null;
    }

    console.log('💾 [TaskManager v2.0] Saving task with input:', JSON.stringify({ taskId: id, input }, null, 2));

    updateTask({
      variables: {
        taskId: id,
        input
      }
    });
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0D0D0D'
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #2D2D40'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.3rem',
            color: '#D9D9E3',
            fontWeight: '600'
          }}>
            Tasks
          </h2>
          <button
            onClick={onCreateTask}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#5D4B8C',
              color: '#fff',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '300'
            }}
          >
            +
          </button>
        </div>

        {/* Search Bar */}
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: '#1A1A1A',
            border: '1px solid #2D2D40',
            borderRadius: '12px',
            color: '#D9D9E3',
            fontSize: '0.95rem',
            marginBottom: '0.75rem'
          }}
        />

        {/* View Mode Toggle */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '0.75rem',
          padding: '0.25rem',
          backgroundColor: '#1A1A1A',
          borderRadius: '12px'
        }}>
          {[
            { key: 'tasks', label: '📋 Tasks', icon: '📋' },
            { key: 'recurring', label: '🔄 Recurring', icon: '🔄' },
            { key: 'all', label: '🗂️ All', icon: '🗂️' }
          ].map(mode => (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key)}
              style={{
                flex: 1,
                padding: '0.625rem',
                fontSize: '0.9rem',
                backgroundColor: viewMode === mode.key ? '#5D4B8C' : 'transparent',
                color: viewMode === mode.key ? '#fff' : '#888',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Recurring Status Filter (only show when viewing recurring) */}
        {viewMode === 'recurring' && (
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '0.75rem',
            padding: '0.25rem',
            backgroundColor: '#1A1A1A',
            borderRadius: '12px'
          }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'active', label: '▶️ Active' },
              { key: 'paused', label: '⏸️ Paused' }
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => setRecurringFilter(filter.key)}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  fontSize: '0.85rem',
                  backgroundColor: recurringFilter === filter.key ? '#5D4B8C' : 'transparent',
                  color: recurringFilter === filter.key ? '#fff' : '#888',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}

        {/* Sort Options */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '0.75rem'
        }}>
          {['created', 'dueDate', 'priority'].map(sort => (
            <button
              key={sort}
              onClick={() => setSortBy(sort)}
              style={{
                padding: '0.5rem 0.875rem',
                fontSize: '0.85rem',
                backgroundColor: sortBy === sort ? '#5D4B8C' : '#1A1A1A',
                color: sortBy === sort ? '#fff' : '#888',
                border: '1px solid #2D2D40',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              {sort === 'created' && '📅 Recent'}
              {sort === 'dueDate' && '⏰ Due Date'}
              {sort === 'priority' && '⭐ Priority'}
            </button>
          ))}
        </div>

        {/* Context Filter */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          {contexts.map(ctx => (
            <button
              key={ctx}
              onClick={() => setSelectedContext(ctx)}
              style={{
                padding: '0.5rem 0.875rem',
                fontSize: '0.85rem',
                backgroundColor: selectedContext === ctx ? '#5D4B8C' : 'transparent',
                color: selectedContext === ctx ? '#fff' : '#888',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              {ctx}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem'
      }}>
        {processedTasks.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: '#666'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📝</div>
            <p style={{ fontSize: '0.95rem' }}>
              {searchQuery ? 'No tasks match your search' : 'No tasks yet'}
            </p>
          </div>
        )}

        {processedTasks.map(task => (
          <div
            key={task.id}
            onTouchStart={(e) => handleSwipeStart(e, task.id)}
            onTouchMove={(e) => handleSwipeMove(e, task.id)}
            onTouchEnd={handleSwipeEnd}
            onClick={(e) => {
              // Close swipe menu if clicking outside delete button
              if (swipedTaskId === task.id && !e.target.closest('.delete-button')) {
                setSwipedTaskId(null);
              }
            }}
            style={{
              position: 'relative',
              marginBottom: '0.75rem'
            }}
          >
            {/* Swipe Delete Background */}
            {swipedTaskId === task.id && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: '100px',
                backgroundColor: '#D32F2F',
                borderRadius: '0 12px 12px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 0
              }}>
                <button
                  className="delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTask(task.id);
                  }}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#fff',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <div>🗑️</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: '600' }}>Delete</div>
                </button>
              </div>
            )}

            {/* Task Card */}
            <div
              style={{
                padding: '1rem',
                backgroundColor: '#1A1A1A',
                borderRadius: '12px',
                border: '1px solid #2D2D40',
                position: 'relative',
                zIndex: 1,
                transform: swipedTaskId === task.id ? 'translateX(-100px)' : 'translateX(0)',
                transition: 'transform 0.2s ease-out'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                {/* Checkbox - hide for recurring templates */}
                {(!task.isRecurring || task.parentTaskId) && (
                  <input
                    type="checkbox"
                    checked={task.status === 'completed'}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleToggleComplete(task);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginTop: '0.25rem',
                      width: '22px',
                      height: '22px',
                      cursor: 'pointer',
                      accentColor: '#5D4B8C',
                      flexShrink: 0
                    }}
                  />
                )}

                {/* Task Content - Tap to Edit */}
                <div
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTask(task);
                  }}
                >
                  <div style={{
                    color: task.status === 'completed' ? '#666' : '#D9D9E3',
                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                    marginBottom: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}>
                    {task.title}
                  </div>

                  {task.description && (
                    <div style={{
                      color: '#888',
                      fontSize: '0.875rem',
                      marginBottom: '0.5rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {task.description}
                    </div>
                  )}

                  {/* Recurring Template Info */}
                  {task.isRecurring && !task.parentTaskId && (
                    <>
                      <div style={{
                        marginBottom: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: '#0D0D0D',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        color: '#888'
                      }}>
                        <div>📊 {task.recurrenceInstancesGenerated || 0} instances generated</div>
                        {task.recurrencePaused && (
                          <div style={{ color: '#FFA726', fontWeight: '600' }}>⏸️ Paused</div>
                        )}
                        {task.recurrenceEndType === 'after_count' && task.recurrenceEndCount && (
                          <div>🎯 {task.recurrenceEndCount} total planned</div>
                        )}
                        {task.recurrenceEndType === 'after_date' && task.recurrenceEndDate && (
                          <div>📅 Ends {new Date(task.recurrenceEndDate).toLocaleDateString()}</div>
                        )}
                      </div>

                      {/* Quick Actions */}
                      <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        marginBottom: '0.5rem'
                      }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (task.recurrencePaused) {
                              resumeRecurringTask({ variables: { taskId: task.id } });
                            } else {
                              pauseRecurringTask({ variables: { taskId: task.id } });
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            fontSize: '0.75rem',
                            backgroundColor: task.recurrencePaused ? '#4CAF50' : '#FFA726',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          {task.recurrencePaused ? '▶️ Resume' : '⏸️ Pause'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Generate next 10 task instances now?')) {
                              generateRecurringInstances({ variables: { taskId: task.id } });
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            fontSize: '0.75rem',
                            backgroundColor: '#5D4B8C',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          ⚡ Generate
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewMode('tasks');
                            setSelectedContext(task.context || 'all');
                            setSearchQuery(task.title);
                          }}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            fontSize: '0.75rem',
                            backgroundColor: '#2196F3',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          👁️ Instances
                        </button>
                      </div>
                    </>
                  )}

                  {/* Task Metadata */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    fontSize: '0.8rem',
                    color: '#666'
                  }}>
                    {task.isRecurring && (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#5D4B8C',
                        borderRadius: '6px',
                        color: '#fff',
                        fontWeight: '600'
                      }}>
                        🔄 {task.recurrenceType === 'daily' ? 'Daily' :
                             task.recurrenceType === 'weekly' ? 'Weekly' :
                             task.recurrenceType === 'monthly' ? 'Monthly' : 'Yearly'}
                      </span>
                    )}
                    {task.context && (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#2D2D40',
                        borderRadius: '6px'
                      }}>
                        {task.context}
                      </span>
                    )}
                    {task.dueDate && (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: new Date(task.dueDate) < new Date() ? '#D32F2F' : '#2D2D40',
                        borderRadius: '6px',
                        color: new Date(task.dueDate) < new Date() ? '#fff' : '#666'
                      }}>
                        ⏰ {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    {task.priority && task.priority > 1 && (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#2D2D40',
                        borderRadius: '6px'
                      }}>
                        ⭐ P{task.priority}
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit Icon */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTask(task);
                  }}
                  style={{
                    color: '#666',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    flexShrink: 0
                  }}
                >
                  ✏️
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Task Modal */}
      {editingTask && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid #2D2D40',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, color: '#D9D9E3' }}>Edit Task</h3>
            <button
              onClick={() => setEditingTask(null)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#888',
                fontSize: '1.5rem',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem'
          }}>
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>Title</div>
              <input
                type="text"
                value={editingTask.title}
                onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#1A1A1A',
                  border: '1px solid #2D2D40',
                  borderRadius: '8px',
                  color: '#D9D9E3',
                  fontSize: '1rem'
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>Description</div>
              <textarea
                value={editingTask.description || ''}
                onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#1A1A1A',
                  border: '1px solid #2D2D40',
                  borderRadius: '8px',
                  color: '#D9D9E3',
                  fontSize: '1rem',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>Due Date</div>
              <input
                type="datetime-local"
                value={editingTask.dueDate ? new Date(editingTask.dueDate).toISOString().slice(0, 16) : ''}
                onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#1A1A1A',
                  border: '1px solid #2D2D40',
                  borderRadius: '8px',
                  color: '#D9D9E3',
                  fontSize: '1rem'
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>Context</div>
              <select
                value={editingTask.context || '@anywhere'}
                onChange={(e) => setEditingTask({ ...editingTask, context: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#1A1A1A',
                  border: '1px solid #2D2D40',
                  borderRadius: '8px',
                  color: '#D9D9E3',
                  fontSize: '1rem'
                }}
              >
                <option value="@home">@home</option>
                <option value="@office">@office</option>
                <option value="@computer">@computer</option>
                <option value="@errands">@errands</option>
                <option value="@phone">@phone</option>
                <option value="@anywhere">@anywhere</option>
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>Priority</div>
              <select
                value={editingTask.priority || 2}
                onChange={(e) => setEditingTask({ ...editingTask, priority: parseInt(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#1A1A1A',
                  border: '1px solid #2D2D40',
                  borderRadius: '8px',
                  color: '#D9D9E3',
                  fontSize: '1rem'
                }}
              >
                <option value="1">Low</option>
                <option value="2">Medium</option>
                <option value="3">High</option>
                <option value="4">Urgent</option>
              </select>
            </label>

            {/* Recurring Task Section */}
            <div style={{
              padding: '1rem',
              backgroundColor: '#0D0D0D',
              borderRadius: '12px',
              marginBottom: '1rem',
              border: '1px solid #2D2D40'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editingTask.isRecurring || false}
                  onChange={(e) => setEditingTask({
                    ...editingTask,
                    isRecurring: e.target.checked,
                    recurrenceType: e.target.checked ? 'daily' : null,
                    recurrenceInterval: e.target.checked ? 1 : null,
                    recurrenceEndType: e.target.checked ? 'never' : null
                  })}
                  style={{
                    marginRight: '0.75rem',
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer',
                    accentColor: '#5D4B8C'
                  }}
                />
                <span style={{ color: '#D9D9E3', fontSize: '1rem', fontWeight: '500' }}>
                  🔄 Make this a recurring task
                </span>
              </label>

              {editingTask.isRecurring && (
                <>
                  <label style={{ display: 'block', marginBottom: '1rem' }}>
                    <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>Repeat</div>
                    <select
                      value={editingTask.recurrenceType || 'daily'}
                      onChange={(e) => setEditingTask({ ...editingTask, recurrenceType: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        backgroundColor: '#1A1A1A',
                        border: '1px solid #2D2D40',
                        borderRadius: '8px',
                        color: '#D9D9E3',
                        fontSize: '1rem'
                      }}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </label>

                  <label style={{ display: 'block', marginBottom: '1rem' }}>
                    <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>
                      Every {editingTask.recurrenceType === 'daily' ? 'X days' : editingTask.recurrenceType === 'weekly' ? 'X weeks' : editingTask.recurrenceType === 'monthly' ? 'X months' : 'X years'}
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={editingTask.recurrenceInterval || 1}
                      onChange={(e) => setEditingTask({ ...editingTask, recurrenceInterval: parseInt(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        backgroundColor: '#1A1A1A',
                        border: '1px solid #2D2D40',
                        borderRadius: '8px',
                        color: '#D9D9E3',
                        fontSize: '1rem'
                      }}
                    />
                  </label>

                  {editingTask.recurrenceType === 'weekly' && (
                    <label style={{ display: 'block', marginBottom: '1rem' }}>
                      <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>Days of Week</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                          const dayNum = index + 1;
                          const isSelected = (editingTask.recurrenceDays || []).includes(dayNum);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                const days = editingTask.recurrenceDays || [];
                                const newDays = isSelected
                                  ? days.filter(d => d !== dayNum)
                                  : [...days, dayNum].sort();
                                setEditingTask({ ...editingTask, recurrenceDays: newDays });
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: isSelected ? '#5D4B8C' : '#1A1A1A',
                                color: isSelected ? '#fff' : '#666',
                                border: '1px solid ' + (isSelected ? '#5D4B8C' : '#2D2D40'),
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.875rem'
                              }}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </label>
                  )}

                  <label style={{ display: 'block', marginBottom: '1rem' }}>
                    <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>Ends</div>
                    <select
                      value={editingTask.recurrenceEndType || 'never'}
                      onChange={(e) => setEditingTask({ ...editingTask, recurrenceEndType: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        backgroundColor: '#1A1A1A',
                        border: '1px solid #2D2D40',
                        borderRadius: '8px',
                        color: '#D9D9E3',
                        fontSize: '1rem'
                      }}
                    >
                      <option value="never">Never</option>
                      <option value="after_date">On a specific date</option>
                      <option value="after_count">After X occurrences</option>
                    </select>
                  </label>

                  {editingTask.recurrenceEndType === 'after_date' && (
                    <label style={{ display: 'block', marginBottom: '1rem' }}>
                      <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>End Date</div>
                      <input
                        type="date"
                        value={editingTask.recurrenceEndDate ? new Date(editingTask.recurrenceEndDate).toISOString().slice(0, 10) : ''}
                        onChange={(e) => setEditingTask({ ...editingTask, recurrenceEndDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          backgroundColor: '#1A1A1A',
                          border: '1px solid #2D2D40',
                          borderRadius: '8px',
                          color: '#D9D9E3',
                          fontSize: '1rem'
                        }}
                      />
                    </label>
                  )}

                  {editingTask.recurrenceEndType === 'after_count' && (
                    <label style={{ display: 'block', marginBottom: '1rem' }}>
                      <div style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.875rem' }}>Number of Occurrences</div>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={editingTask.recurrenceEndCount || 10}
                        onChange={(e) => setEditingTask({ ...editingTask, recurrenceEndCount: parseInt(e.target.value) })}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          backgroundColor: '#1A1A1A',
                          border: '1px solid #2D2D40',
                          borderRadius: '8px',
                          color: '#D9D9E3',
                          fontSize: '1rem'
                        }}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{
            padding: '1rem',
            borderTop: '1px solid #2D2D40',
            display: 'flex',
            gap: '0.75rem'
          }}>
            <button
              onClick={() => setEditingTask(null)}
              style={{
                flex: 1,
                padding: '0.875rem',
                backgroundColor: '#1A1A1A',
                color: '#888',
                border: '1px solid #2D2D40',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveTask}
              style={{
                flex: 1,
                padding: '0.875rem',
                backgroundColor: '#5D4B8C',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500'
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
