import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

const GET_PROJECT = gql`
  query GetProject($userId: String!, $projectId: ID!) {
    getProject(userId: $userId, projectId: $projectId) {
      id
      title
      description
      domain
      status
      goals {
        id
        title
        description
        targetValue
        currentValue
        unit
        status
        targetDate
        priority
      }
      tasks {
        id
        title
        description
        type
        status
        priority
        assignedTo
        requiresApproval
        dueDate
        completedAt
        goalId
      }
      metrics {
        id
        name
        value
        unit
        recordedAt
        source
      }
    }
    getUpcomingReminders(userId: $userId, limit: 10) {
      id
      title
      description
      type
      dueAt
      status
      isRecurring
      recurrencePattern
      priority
      taskId
      goalId
      metricName
    }
  }
`;

const EXECUTE_TASK = gql`
  mutation ExecuteTask($taskId: ID!) {
    executeTask(taskId: $taskId) {
      id
      status
      result
      completedAt
    }
  }
`;

const UPDATE_TASK_STATUS = gql`
  mutation UpdateTaskStatus($taskId: ID!, $status: String!, $result: JSON) {
    updateTaskStatus(taskId: $taskId, status: $status, result: $result) {
      id
      status
      result
      completedAt
    }
  }
`;

const CREATE_GOAL = gql`
  mutation CreateGoal($projectId: ID!, $input: GoalInput!) {
    createGoal(projectId: $projectId, input: $input) {
      id
      title
      description
      targetValue
      currentValue
      unit
      priority
      targetDate
    }
  }
`;

const CREATE_TASK = gql`
  mutation CreateTask($projectId: ID!, $input: TaskInput!) {
    createTask(projectId: $projectId, input: $input) {
      id
      title
      description
      type
      status
      priority
      assignedTo
      requiresApproval
    }
  }
`;

const RECORD_METRIC = gql`
  mutation RecordMetric($projectId: ID!, $input: MetricInput!) {
    recordMetric(projectId: $projectId, input: $input) {
      id
      name
      value
      unit
      recordedAt
      source
    }
  }
`;

const CHAT = gql`
  mutation Chat($userId: String!, $projectId: ID!, $message: String!) {
    chat(userId: $userId, projectId: $projectId, message: $message) {
      reply
      suggestedTasks {
        title
        description
        type
      }
      suggestedMetrics {
        name
        value
        unit
      }
    }
  }
`;

const COMPLETE_REMINDER = gql`
  mutation CompleteReminder($reminderId: ID!) {
    completeReminder(reminderId: $reminderId) {
      id
      status
      completedAt
    }
  }
`;

const SNOOZE_REMINDER = gql`
  mutation SnoozeReminder($reminderId: ID!, $snoozeUntil: DateTime!) {
    snoozeReminder(reminderId: $reminderId, snoozeUntil: $snoozeUntil) {
      id
      status
      snoozedUntil
    }
  }
`;

const GET_CHAT_MESSAGES = gql`
  query GetChatMessages($userId: String!, $projectId: ID!) {
    getChatMessages(userId: $userId, projectId: $projectId) {
      id
      role
      content
      createdAt
      metadata
    }
  }
`;

const CLEAR_CHAT_HISTORY = gql`
  mutation ClearChatHistory($userId: String!, $projectId: ID!) {
    clearChatHistory(userId: $userId, projectId: $projectId)
  }
`;

function ProjectDashboard({ userId, projectId, projects, onProjectChange, onCreateProject, onSignOut }) {
  // Maintain active tab across refreshes using localStorage
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'overview';
  });
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const chatContainerRef = useRef(null);

  const { loading, error, data, refetch } = useQuery(GET_PROJECT, {
    variables: { userId, projectId },
    pollInterval: 30000 // Refresh every 30 seconds to see task updates
  });

  const [executeTask] = useMutation(EXECUTE_TASK, {
    onCompleted: () => refetch()
  });

  const [updateTaskStatus] = useMutation(UPDATE_TASK_STATUS, {
    onCompleted: () => refetch()
  });

  const [sendChat, { loading: chatting }] = useMutation(CHAT, {
    onCompleted: () => {
      refetch(); // Refresh project data to get updated metrics
      refetchChatMessages(); // Refresh chat history
    }
  });
  const [createGoal] = useMutation(CREATE_GOAL, { onCompleted: () => refetch() });
  const [createTask] = useMutation(CREATE_TASK, { onCompleted: () => refetch() });
  const [recordMetric] = useMutation(RECORD_METRIC, { onCompleted: () => refetch() });
  const [completeReminder] = useMutation(COMPLETE_REMINDER, { onCompleted: () => refetch() });
  const [snoozeReminder] = useMutation(SNOOZE_REMINDER, { onCompleted: () => refetch() });
  const [clearChatHistory] = useMutation(CLEAR_CHAT_HISTORY, {
    onCompleted: () => {
      setMessages([]);
      refetchChatMessages();
    }
  });

  // Fetch chat messages separately
  const { data: chatData, refetch: refetchChatMessages } = useQuery(GET_CHAT_MESSAGES, {
    variables: { userId, projectId },
    skip: !userId || !projectId
  });

  // Load chat messages from database into local state
  useEffect(() => {
    if (chatData?.getChatMessages) {
      const formattedMessages = chatData.getChatMessages.map(msg => ({
        role: msg.role,
        text: msg.content
      }));
      setMessages(formattedMessages);
    }
  }, [chatData]);


  if (loading) return <div style={{ padding: '2rem', color: '#ccc' }}>Loading project...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#f88' }}>Error: {error.message}</div>;

  const project = data.getProject;
  if (!project) return <div style={{ padding: '2rem', color: '#f88' }}>Project not found</div>;

  const handleExecuteTask = async (taskId) => {
    try {
      await executeTask({ variables: { taskId } });
    } catch (error) {
      console.error('Error executing task:', error);
    }
  };

  const handleTaskStatusChange = async (taskId, newStatus) => {
    try {
      await updateTaskStatus({ 
        variables: { 
          taskId, 
          status: newStatus,
          result: { manually_updated: true, updated_at: new Date().toISOString() }
        } 
      });
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatInput('');

    try {
      const res = await sendChat({
        variables: { userId, projectId, message: userMessage }
      });

      const reply = res.data.chat.reply;
      setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: "⚠️ Error: " + err.message }]);
    }
  };

  const handleCompleteReminder = async (reminderId) => {
    try {
      await completeReminder({ variables: { reminderId } });
    } catch (error) {
      console.error('Error completing reminder:', error);
    }
  };

  const handleSnoozeReminder = async (reminderId, minutes) => {
    try {
      const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      await snoozeReminder({ variables: { reminderId, snoozeUntil } });
    } catch (error) {
      console.error('Error snoozing reminder:', error);
    }
  };

  const handleClearChatHistory = async () => {
    if (window.confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
      try {
        await clearChatHistory({ variables: { userId, projectId } });
      } catch (error) {
        console.error('Error clearing chat history:', error);
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'in_progress': return '#FF9800';
      case 'failed': return '#F44336';
      case 'pending': return '#9E9E9E';
      default: return '#9E9E9E';
    }
  };

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 1: return '🔴 High';
      case 2: return '🟡 Medium';
      case 3: return '🟢 Low';
      default: return '🟡 Medium';
    }
  };

  const getTodaysMetrics = (metrics) => {
    const today = new Date().toDateString();
    const todaysMetrics = metrics.filter(metric => 
      new Date(metric.recordedAt).toDateString() === today
    );
    
    // Group by metric name and get the latest value for each
    const grouped = {};
    todaysMetrics.forEach(metric => {
      if (!grouped[metric.name] || new Date(metric.recordedAt) > new Date(grouped[metric.name].recordedAt)) {
        grouped[metric.name] = metric;
      }
    });
    
    return grouped;
  };

  return (
    <div style={{
      backgroundColor: '#0D0D0D',
      color: '#D9D9E3',
      minHeight: '100vh',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Header */}
      <header style={{
        background: '#1A1A1A',
        padding: '1rem 2rem',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ color: '#5D4B8C', margin: 0, fontSize: '1.5rem' }}>RavenLoom</h1>
          <select
            value={projectId}
            onChange={(e) => onProjectChange(e.target.value)}
            style={{
              background: '#2D2D40',
              color: '#D9D9E3',
              border: '1px solid #444',
              borderRadius: '4px',
              padding: '0.5rem',
              fontSize: '1rem'
            }}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <button
            onClick={onCreateProject}
            style={{
              background: '#5D4B8C',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '0.5rem 1rem',
              cursor: 'pointer'
            }}
          >
            + New Project
          </button>
        </div>
        <button
          onClick={onSignOut}
          style={{
            background: 'none',
            color: '#aaa',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          Sign Out
        </button>
      </header>

      {/* Navigation Tabs */}
      <nav style={{
        background: '#1A1A1A',
        padding: '0 2rem',
        borderBottom: '1px solid #333'
      }}>
        {['overview', 'tasks', 'goals', 'metrics', 'chat'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              localStorage.setItem('activeTab', tab);
            }}
            style={{
              background: activeTab === tab ? '#5D4B8C' : 'transparent',
              color: activeTab === tab ? '#fff' : '#aaa',
              border: 'none',
              padding: '1rem 1.5rem',
              cursor: 'pointer',
              textTransform: 'capitalize',
              borderBottom: activeTab === tab ? '2px solid #5D4B8C' : 'none'
            }}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main style={{ padding: '2rem' }}>
        {activeTab === 'overview' && (
          <div>
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ color: '#5D4B8C', margin: '0 0 0.5rem 0' }}>{project.title}</h1>
              <p style={{ color: '#aaa', margin: '0 0 1rem 0' }}>{project.description}</p>
              <div style={{ display: 'flex', gap: '2rem', fontSize: '0.9rem' }}>
                <span style={{ color: '#888' }}>Domain: <strong>{project.domain}</strong></span>
                <span style={{ color: '#888' }}>Status: <strong>{project.status}</strong></span>
                <span style={{ color: '#888' }}>Goals: <strong>{project.goals.length}</strong></span>
                <span style={{ color: '#888' }}>Tasks: <strong>{project.tasks.length}</strong></span>
              </div>
            </div>

            {/* Today's Metrics */}
            <TodaysMetrics metrics={project.metrics} />

            {/* Goals Summary */}
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ color: '#D9D9E3', marginBottom: '1rem' }}>Goals Overview</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {project.goals.map(goal => (
                  <div key={goal.id} style={{
                    background: '#1A1A1A',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    border: `2px solid ${goal.status === 'completed' ? '#4CAF50' : '#333'}`
                  }}>
                    <h3 style={{ color: '#5D4B8C', margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{goal.title}</h3>
                    <p style={{ color: '#aaa', margin: '0 0 1rem 0', fontSize: '0.9rem' }}>{goal.description}</p>
                    {goal.targetValue && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                          Progress: {goal.currentValue || 0} / {goal.targetValue} {goal.unit}
                        </div>
                        <div style={{
                          background: '#333',
                          height: '6px',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            background: '#5D4B8C',
                            height: '100%',
                            width: `${Math.min(100, ((goal.currentValue || 0) / goal.targetValue) * 100)}%`,
                            transition: 'width 0.3s'
                          }} />
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#888' }}>
                      <span>{getPriorityLabel(goal.priority)}</span>
                      <span>{goal.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reminders */}
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ color: '#D9D9E3', marginBottom: '1rem' }}>Upcoming Reminders</h2>
              <RemindersSection 
                reminders={data.getUpcomingReminders || []}
                onComplete={handleCompleteReminder}
                onSnooze={handleSnoozeReminder}
              />
            </div>

            {/* Recent Tasks */}
            <div>
              <h2 style={{ color: '#D9D9E3', marginBottom: '1rem' }}>Recent Tasks</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {project.tasks.slice(0, 5).map(task => (
                  <div key={task.id} style={{
                    background: '#1A1A1A',
                    padding: '1rem',
                    borderRadius: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <span style={{ color: '#D9D9E3' }}>{task.title}</span>
                      <span style={{ color: '#888', marginLeft: '1rem', fontSize: '0.8rem' }}>
                        {task.type} • {getPriorityLabel(task.priority)}
                      </span>
                    </div>
                    <span style={{ 
                      color: getStatusColor(task.status),
                      fontSize: '0.8rem',
                      fontWeight: 'bold'
                    }}>
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <TasksTab 
            tasks={project.tasks} 
            goals={project.goals}
            onExecuteTask={handleExecuteTask}
            onStatusChange={handleTaskStatusChange}
          />
        )}

        {activeTab === 'goals' && (
          <GoalsTab 
            goals={project.goals} 
            projectId={projectId}
            onCreateGoal={createGoal}
          />
        )}

        {activeTab === 'metrics' && (
          <MetricsTab 
            metrics={project.metrics} 
            goals={project.goals}
            projectId={projectId}
            onRecordMetric={recordMetric}
          />
        )}

        {activeTab === 'chat' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ color: '#D9D9E3', margin: 0 }}>AI Assistant</h2>
              {messages.length > 0 && (
                <button
                  onClick={handleClearChatHistory}
                  style={{
                    background: '#F44336',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  🗑️ Clear History
                </button>
              )}
            </div>
            <div 
              ref={chatContainerRef}
              style={{
                background: '#1A1A1A',
                padding: '1rem',
                borderRadius: '8px',
                height: '60vh',
                overflowY: 'auto',
                marginBottom: '1rem'
              }}>
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  ref={idx === messages.length - 1 ? (el) => {
                    if (el && activeTab === 'chat') {
                      setTimeout(() => el.scrollIntoView({ behavior: 'auto', block: 'end' }), 100);
                    }
                  } : null}
                  style={{
                    textAlign: msg.role === 'user' ? 'right' : 'left',
                    background: msg.role === 'user' ? '#3A8DFF' : '#2D2D40',
                    color: '#fff',
                    padding: '0.75rem 1rem',
                    borderRadius: '1rem',
                    margin: '0.5rem 0',
                    maxWidth: '80%',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  ) : (
                    msg.text
                  )}
                </div>
              ))}
              {chatting && <div style={{ color: '#888' }}>🤖 Thinking...</div>}
            </div>

            <form onSubmit={handleChatSubmit} style={{ display: 'flex' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about your project..."
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  fontSize: '1rem',
                  borderRadius: '1rem 0 0 1rem',
                  border: 'none',
                  outline: 'none',
                  background: '#333',
                  color: '#fff'
                }}
              />
              <button type="submit" style={{
                padding: '0.75rem 1.25rem',
                fontSize: '1rem',
                backgroundColor: '#3A8DFF',
                color: '#fff',
                border: 'none',
                borderRadius: '0 1rem 1rem 0',
                cursor: 'pointer'
              }}>
                Send
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

function TasksTab({ tasks, goals, onExecuteTask, onStatusChange }) {
  const [filter, setFilter] = useState('all');

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true;
    return task.status === filter;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'in_progress': return '#FF9800';
      case 'failed': return '#F44336';
      case 'pending': return '#9E9E9E';
      default: return '#9E9E9E';
    }
  };

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 1: return '🔴 High';
      case 2: return '🟡 Medium';
      case 3: return '🟢 Low';
      default: return '🟡 Medium';
    }
  };

  const getGoalTitle = (goalId) => {
    const goal = goals.find(g => g.id === goalId);
    return goal ? goal.title : 'No Goal';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ color: '#D9D9E3', margin: 0 }}>Tasks</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            background: '#1A1A1A',
            color: '#D9D9E3',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '0.5rem'
          }}
        >
          <option value="all">All Tasks</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredTasks.map(task => (
          <div key={task.id} style={{
            background: '#1A1A1A',
            padding: '1.5rem',
            borderRadius: '8px',
            border: `1px solid ${getStatusColor(task.status)}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ color: '#5D4B8C', margin: '0 0 0.5rem 0' }}>{task.title}</h3>
                <p style={{ color: '#aaa', margin: '0 0 0.5rem 0' }}>{task.description}</p>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#888' }}>
                  <span>Type: {task.type}</span>
                  <span>Priority: {getPriorityLabel(task.priority)}</span>
                  <span>Assigned: {task.assignedTo}</span>
                  <span>Goal: {getGoalTitle(task.goalId)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                <span style={{ 
                  color: getStatusColor(task.status),
                  fontWeight: 'bold',
                  fontSize: '0.9rem'
                }}>
                  {task.status}
                </span>
                {task.status === 'pending' && task.assignedTo === 'ai' && (
                  <button
                    onClick={() => onExecuteTask(task.id)}
                    style={{
                      background: '#5D4B8C',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    Execute
                  </button>
                )}
                {task.status === 'pending' && (
                  <select
                    onChange={(e) => onStatusChange(task.id, e.target.value)}
                    style={{
                      background: '#333',
                      color: '#D9D9E3',
                      border: '1px solid #555',
                      borderRadius: '4px',
                      padding: '0.25rem',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="">Change Status</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </select>
                )}
              </div>
            </div>
            {task.completedAt && (
              <div style={{ fontSize: '0.8rem', color: '#888' }}>
                Completed: {new Date(task.completedAt).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalsTab({ goals, projectId, onCreateGoal }) {
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreateGoal = async (goalData) => {
    try {
      await onCreateGoal({
        variables: {
          projectId,
          input: goalData
        }
      });
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error creating goal:', error);
    }
  };

  if (showCreateForm) {
    return <GoalCreateForm onSubmit={handleCreateGoal} onCancel={() => setShowCreateForm(false)} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ color: '#D9D9E3', margin: 0 }}>Goals</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            background: '#5D4B8C',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '0.5rem 1rem',
            cursor: 'pointer'
          }}
        >
          + Add Goal
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {goals.map(goal => (
          <div key={goal.id} style={{
            background: '#1A1A1A',
            padding: '1.5rem',
            borderRadius: '8px',
            border: `2px solid ${goal.status === 'completed' ? '#4CAF50' : '#333'}`
          }}>
            <h3 style={{ color: '#5D4B8C', margin: '0 0 1rem 0' }}>{goal.title}</h3>
            <p style={{ color: '#aaa', margin: '0 0 1rem 0' }}>{goal.description}</p>
            
            {goal.targetValue && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#D9D9E3', fontSize: '0.9rem' }}>Progress</span>
                  <span style={{ color: '#888', fontSize: '0.8rem' }}>
                    {goal.currentValue || 0} / {goal.targetValue} {goal.unit}
                  </span>
                </div>
                <div style={{
                  background: '#333',
                  height: '8px',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    background: goal.status === 'completed' ? '#4CAF50' : '#5D4B8C',
                    height: '100%',
                    width: `${Math.min(100, ((goal.currentValue || 0) / goal.targetValue) * 100)}%`,
                    transition: 'width 0.3s'
                  }} />
                </div>
                <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>
                  {Math.round(((goal.currentValue || 0) / goal.targetValue) * 100)}% complete
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#888' }}>
              <span>Priority: {goal.priority === 1 ? '🔴 High' : goal.priority === 2 ? '🟡 Medium' : '🟢 Low'}</span>
              <span>Status: {goal.status}</span>
            </div>

            {goal.targetDate && (
              <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
                Target: {new Date(goal.targetDate).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsTab({ metrics, goals, projectId, onRecordMetric }) {
  const [showRecordForm, setShowRecordForm] = useState(false);

  const handleRecordMetric = async (metricData) => {
    try {
      await onRecordMetric({
        variables: {
          projectId,
          input: metricData
        }
      });
      setShowRecordForm(false);
    } catch (error) {
      console.error('Error recording metric:', error);
    }
  };

  const groupedMetrics = metrics.reduce((acc, metric) => {
    if (!acc[metric.name]) acc[metric.name] = [];
    acc[metric.name].push(metric);
    return acc;
  }, {});

  if (showRecordForm) {
    return <MetricRecordForm goals={goals} onSubmit={handleRecordMetric} onCancel={() => setShowRecordForm(false)} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ color: '#D9D9E3', margin: 0 }}>Metrics</h2>
        <button
          onClick={() => setShowRecordForm(true)}
          style={{
            background: '#5D4B8C',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '0.5rem 1rem',
            cursor: 'pointer'
          }}
        >
          📊 Record Metric
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {Object.entries(groupedMetrics).map(([name, metricList]) => {
          const latest = metricList[0]; // Most recent
          const trend = metricList.length > 1 ? 
            (latest.value > metricList[1].value ? '📈' : 
             latest.value < metricList[1].value ? '📉' : '➡️') : '➡️';
          
          return (
            <div key={name} style={{
              background: '#1A1A1A',
              padding: '1.5rem',
              borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ color: '#5D4B8C', margin: 0 }}>{name}</h3>
                <span style={{ fontSize: '1.5rem' }}>{trend}</span>
              </div>
              
              <div style={{ fontSize: '2rem', color: '#D9D9E3', marginBottom: '0.5rem' }}>
                {latest.value} {latest.unit}
              </div>
              
              <div style={{ fontSize: '0.8rem', color: '#888' }}>
                Last updated: {new Date(latest.recordedAt).toLocaleString()}
              </div>
              
              <div style={{ fontSize: '0.8rem', color: '#888' }}>
                Source: {latest.source}
              </div>

              {metricList.length > 1 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '0.5rem' }}>
                    Recent history ({metricList.length} records)
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'end', height: '40px' }}>
                    {metricList.slice(0, 10).reverse().map((metric, idx) => {
                      const maxValue = Math.max(...metricList.map(m => m.value));
                      const height = (metric.value / maxValue) * 30;
                      return (
                        <div
                          key={idx}
                          style={{
                            background: '#5D4B8C',
                            width: '8px',
                            height: `${height}px`,
                            borderRadius: '2px',
                            opacity: 0.7 + (idx * 0.03)
                          }}
                          title={`${metric.value} ${metric.unit} on ${new Date(metric.recordedAt).toLocaleDateString()}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricRecordForm({ goals, onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [goalId, setGoalId] = useState('');
  const [source, setSource] = useState('manual');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      goalId: goalId || null,
      name,
      value: parseFloat(value),
      unit,
      source
    });
  };

  const commonMetrics = [
    { name: 'Weight', unit: 'lbs' },
    { name: 'Body Fat %', unit: '%' },
    { name: 'Waist Size', unit: 'inches' },
    { name: 'Exercise Minutes', unit: 'minutes' },
    { name: 'Steps', unit: 'steps' },
    { name: 'Calories Consumed', unit: 'calories' },
    { name: 'Water Intake', unit: 'cups' }
  ];

  return (
    <div>
      <h2 style={{ color: '#D9D9E3', marginBottom: '2rem' }}>Record Metric</h2>
      
      <form onSubmit={handleSubmit} style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1.5rem',
        maxWidth: '500px'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>
            Metric Name *
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            {commonMetrics.map(metric => (
              <button
                key={metric.name}
                type="button"
                onClick={() => {
                  setName(metric.name);
                  setUnit(metric.unit);
                }}
                style={{
                  background: name === metric.name ? '#5D4B8C' : '#333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                {metric.name}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g., Weight"
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              background: '#1A1A1A',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#D9D9E3'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>
              Value *
            </label>
            <input
              type="number"
              step="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              placeholder="e.g., 175.5"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                background: '#1A1A1A',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#D9D9E3'
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>
              Unit
            </label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g., lbs, kg, minutes"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                background: '#1A1A1A',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#D9D9E3'
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>
            Associated Goal (Optional)
          </label>
          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              background: '#1A1A1A',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#D9D9E3'
            }}
          >
            <option value="">No specific goal</option>
            {goals.map(goal => (
              <option key={goal.id} value={goal.id}>{goal.title}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button
            type="submit"
            disabled={!name.trim() || !value.trim()}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontSize: '1rem',
              backgroundColor: (name.trim() && value.trim()) ? '#5D4B8C' : '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: (name.trim() && value.trim()) ? 'pointer' : 'not-allowed'
            }}
          >
            Record Metric
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontSize: '1rem',
              backgroundColor: '#333',
              color: '#D9D9E3',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function GoalCreateForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');
  const [priority, setPriority] = useState(2);
  const [targetDate, setTargetDate] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      title,
      description,
      targetValue: targetValue ? parseFloat(targetValue) : null,
      unit,
      priority,
      targetDate: targetDate || null
    });
  };

  return (
    <div>
      <h2 style={{ color: '#D9D9E3', marginBottom: '2rem' }}>Create New Goal</h2>
      
      <form onSubmit={handleSubmit} style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1.5rem',
        maxWidth: '500px'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>
            Goal Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g., Lose 20 pounds"
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              background: '#1A1A1A',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#D9D9E3'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you want to achieve..."
            rows={3}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              background: '#1A1A1A',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#D9D9E3',
              resize: 'vertical'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>
              Target Value
            </label>
            <input
              type="number"
              step="0.1"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="e.g., 160"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                background: '#1A1A1A',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#D9D9E3'
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>
              Unit
            </label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g., pounds, lbs, kg"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                background: '#1A1A1A',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#D9D9E3'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                background: '#1A1A1A',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#D9D9E3'
              }}
            >
              <option value={1}>🔴 High</option>
              <option value={2}>🟡 Medium</option>
              <option value={3}>🟢 Low</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>
              Target Date
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                background: '#1A1A1A',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#D9D9E3'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button
            type="submit"
            disabled={!title.trim()}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontSize: '1rem',
              backgroundColor: title.trim() ? '#5D4B8C' : '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: title.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Create Goal
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontSize: '1rem',
              backgroundColor: '#333',
              color: '#D9D9E3',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function RemindersSection({ reminders, onComplete, onSnooze }) {
  const getReminderIcon = (type) => {
    switch (type) {
      case 'metric_reminder': return '📊';
      case 'task_due': return '📋';
      case 'goal_check': return '🎯';
      default: return '⏰';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 1: return '#F44336'; // High - Red
      case 2: return '#FF9800'; // Medium - Orange
      case 3: return '#4CAF50'; // Low - Green
      default: return '#9E9E9E';
    }
  };

  const getTimeStatus = (dueAt) => {
    const now = new Date();
    const due = new Date(dueAt);
    const diffMs = due.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffMs < 0) {
      const overdue = Math.abs(diffHours);
      if (overdue < 1) return { text: 'Overdue by minutes', color: '#F44336' };
      if (overdue < 24) return { text: `Overdue by ${Math.floor(overdue)}h`, color: '#F44336' };
      return { text: `Overdue by ${Math.floor(overdue / 24)}d`, color: '#F44336' };
    }
    
    if (diffHours < 1) return { text: 'Due soon', color: '#FF9800' };
    if (diffHours < 24) return { text: `Due in ${Math.floor(diffHours)}h`, color: '#FF9800' };
    if (diffHours < 168) return { text: `Due in ${Math.floor(diffHours / 24)}d`, color: '#4CAF50' };
    return { text: 'Due later', color: '#9E9E9E' };
  };

  if (reminders.length === 0) {
    return (
      <div style={{
        background: '#1A1A1A',
        padding: '2rem',
        borderRadius: '8px',
        textAlign: 'center',
        color: '#888'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
        <div>No upcoming reminders!</div>
        <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
          All caught up with your tasks and goals.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {reminders.map(reminder => {
        const timeStatus = getTimeStatus(reminder.dueAt);
        return (
          <div key={reminder.id} style={{
            background: '#1A1A1A',
            padding: '1rem',
            borderRadius: '8px',
            border: `1px solid ${getPriorityColor(reminder.priority)}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>{getReminderIcon(reminder.type)}</span>
                <h4 style={{ color: '#D9D9E3', margin: 0, fontSize: '1rem' }}>
                  {reminder.title}
                </h4>
                {reminder.isRecurring && (
                  <span style={{ 
                    background: '#5D4B8C', 
                    color: '#fff', 
                    padding: '0.1rem 0.4rem', 
                    borderRadius: '4px', 
                    fontSize: '0.7rem' 
                  }}>
                    {reminder.recurrencePattern}
                  </span>
                )}
              </div>
              
              {reminder.description && (
                <p style={{ color: '#aaa', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
                  {reminder.description}
                </p>
              )}
              
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#888' }}>
                <span style={{ color: timeStatus.color, fontWeight: 'bold' }}>
                  {timeStatus.text}
                </span>
                <span>Due: {new Date(reminder.dueAt).toLocaleString()}</span>
                {reminder.metricName && <span>Metric: {reminder.metricName}</span>}
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
              <button
                onClick={() => onComplete(reminder.id)}
                style={{
                  background: '#4CAF50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.4rem 0.8rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 'bold'
                }}
              >
                ✓ Complete
              </button>
              
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  onClick={() => onSnooze(reminder.id, 30)}
                  style={{
                    background: '#FF9800',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.3rem 0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.7rem'
                  }}
                >
                  30m
                </button>
                <button
                  onClick={() => onSnooze(reminder.id, 60)}
                  style={{
                    background: '#FF9800',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.3rem 0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.7rem'
                  }}
                >
                  1h
                </button>
                <button
                  onClick={() => onSnooze(reminder.id, 1440)}
                  style={{
                    background: '#FF9800',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.3rem 0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.7rem'
                  }}
                >
                  1d
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TodaysMetrics({ metrics }) {
  const getTodaysMetrics = (metrics) => {
    // Get start and end of today in user's local timezone
    // This approach can be extended for:
    // - Weekly goals: startOfWeek/endOfWeek 
    // - Monthly goals: startOfMonth/endOfMonth
    // - Yearly goals: startOfYear/endOfYear
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    const todaysMetrics = metrics.filter(metric => {
      const metricDate = new Date(metric.recordedAt);
      return metricDate >= startOfToday && metricDate <= endOfToday;
    });
    
    // If no metrics found for today, show the most recent one as a fallback
    const metricsToShow = todaysMetrics.length > 0 ? todaysMetrics : metrics.slice(0, 1);
    
    // Group by metric name and get the latest value for each
    const grouped = {};
    metricsToShow.forEach(metric => {
      if (!grouped[metric.name] || new Date(metric.recordedAt) > new Date(grouped[metric.name].recordedAt)) {
        grouped[metric.name] = metric;
      }
    });
    
    return { todaysMetrics: grouped, hasToday: todaysMetrics.length > 0 };
  };

  const { todaysMetrics, hasToday } = getTodaysMetrics(metrics);
  const metricNames = Object.keys(todaysMetrics);

  if (metricNames.length === 0) {
    return (
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#D9D9E3', marginBottom: '1rem' }}>Today's Progress</h2>
        <div style={{
          background: '#1A1A1A',
          padding: '2rem',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#888'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
          <div>No metrics recorded today</div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Start tracking your progress by chatting with the AI or recording metrics manually.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{ color: '#D9D9E3', marginBottom: '1rem' }}>
        {hasToday ? "Today's Progress" : "Latest Progress"}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {metricNames.map(name => {
          const metric = todaysMetrics[name];
          const icon = getMetricIcon(name);
          const color = getMetricColor(name);
          
          return (
            <div key={name} style={{
              background: '#1A1A1A',
              padding: '1.5rem',
              borderRadius: '8px',
              border: `2px solid ${color}`,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{icon}</div>
              <h3 style={{ color: '#D9D9E3', margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
                {name}
              </h3>
              <div style={{ fontSize: '1.8rem', color: color, fontWeight: 'bold', marginBottom: '0.25rem' }}>
                {metric.value} {metric.unit}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#888' }}>
                {new Date(metric.recordedAt).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getMetricIcon(metricName) {
  const name = metricName.toLowerCase();
  if (name.includes('calorie')) return '🔥';
  if (name.includes('weight')) return '⚖️';
  if (name.includes('step')) return '👟';
  if (name.includes('water')) return '💧';
  if (name.includes('exercise') || name.includes('workout')) return '💪';
  if (name.includes('sleep')) return '😴';
  if (name.includes('heart') || name.includes('bpm')) return '❤️';
  if (name.includes('protein')) return '🥩';
  if (name.includes('carb')) return '🍞';
  if (name.includes('fat')) return '🥑';
  return '📊';
}

function getMetricColor(metricName) {
  const name = metricName.toLowerCase();
  if (name.includes('calorie')) return '#FF6B35';
  if (name.includes('weight')) return '#4ECDC4';
  if (name.includes('step')) return '#45B7D1';
  if (name.includes('water')) return '#0EA5E9';
  if (name.includes('exercise') || name.includes('workout')) return '#10B981';
  if (name.includes('sleep')) return '#8B5CF6';
  if (name.includes('heart') || name.includes('bpm')) return '#EF4444';
  return '#5D4B8C';
}

export default ProjectDashboard;