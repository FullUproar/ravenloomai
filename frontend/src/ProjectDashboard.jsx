import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  TaskSuggestion,
  MilestoneSuggestion,
  MetricCard,
  ProgressCard,
  parseMessageElements
} from './ChatElements.jsx';

const GET_PROJECT = gql`
  query GetProject($userId: String!, $projectId: ID!) {
    getProject(userId: $userId, projectId: $projectId) {
      id
      title
      description
      status
      completionType
      outcome
      persona {
        id
        displayName
        archetype
        specialization
        voice
      }
      tasks {
        id
        title
        description
        status
        gtdType
        context
        energyLevel
        timeEstimate
        dueDate
      }
    }
  }
`;

const GET_CONVERSATION = gql`
  query GetConversation($projectId: ID!, $userId: String!) {
    getConversation(projectId: $projectId, userId: $userId) {
      id
      topic
      status
      messages {
        id
        content
        senderName
        senderType
        createdAt
      }
    }
  }
`;

const SEND_MESSAGE = gql`
  mutation SendMessage($projectId: ID!, $userId: String!, $message: String!) {
    sendMessage(projectId: $projectId, userId: $userId, message: $message) {
      message {
        id
        content
        senderName
        senderType
        createdAt
      }
      persona {
        displayName
        archetype
      }
    }
  }
`;

const CREATE_TASK = gql`
  mutation CreateTask($projectId: ID!, $input: TaskInput!) {
    createTask(projectId: $projectId, input: $input) {
      id
      title
      description
      status
      gtdType
      context
    }
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

function ProjectDashboard({ userId, projectId, projects, onProjectChange, onCreateProject, onSignOut }) {
  const [message, setMessage] = useState('');
  const [selectedContext, setSelectedContext] = useState('all');
  const messagesEndRef = useRef(null);

  const { loading: projectLoading, data: projectData } = useQuery(GET_PROJECT, {
    variables: { userId, projectId },
  });

  const { loading: chatLoading, data: chatData, refetch: refetchChat } = useQuery(GET_CONVERSATION, {
    variables: { userId, projectId: parseInt(projectId) },
    pollInterval: 5000, // Poll every 5 seconds for new messages
  });

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    onCompleted: () => {
      refetchChat();
      setMessage('');
    }
  });

  const [updateTaskStatus] = useMutation(UPDATE_TASK_STATUS, {
    refetchQueries: ['GetProject']
  });

  const [createTask] = useMutation(CREATE_TASK, {
    refetchQueries: ['GetProject', 'GetConversation']
  });

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatData]);

  if (projectLoading) {
    return <div style={{ color: '#ccc', padding: '2rem' }}>Loading project...</div>;
  }

  const project = projectData?.getProject;
  const conversation = chatData?.getConversation;
  const messages = conversation?.messages || [];
  const tasks = project?.tasks || [];

  // Filter tasks by context
  const filteredTasks = selectedContext === 'all'
    ? tasks
    : tasks.filter(t => t.context === selectedContext);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

    try {
      await sendMessage({
        variables: {
          projectId: parseInt(projectId),
          userId,
          message: message.trim()
        }
      });
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message: ' + error.message);
    }
  };

  const handleToggleTask = async (taskId, currentStatus) => {
    const newStatus = currentStatus === 'completed' ? 'not_started' : 'completed';
    try {
      await updateTaskStatus({
        variables: { taskId, status: newStatus }
      });
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleAcceptTask = async (task) => {
    try {
      await createTask({
        variables: {
          projectId: parseInt(projectId),
          input: {
            title: task.title,
            description: task.description || '',
            type: 'manual',
            gtdType: task.gtdType || 'next_action',
            context: task.context || '@anywhere',
            energyLevel: task.energyLevel || 'medium',
            timeEstimate: task.timeEstimate || null
          }
        }
      });
      console.log('Task added successfully');
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task: ' + error.message);
    }
  };

  const handleAcceptMilestone = async (milestone) => {
    // For now, just create it as a high-priority task
    // In the future, this could be a separate milestone type
    try {
      await createTask({
        variables: {
          projectId: parseInt(projectId),
          input: {
            title: milestone.title,
            description: milestone.description || '',
            type: 'milestone',
            gtdType: 'project',
            context: '@anywhere',
            energyLevel: 'high',
            dueDate: milestone.dueDate || null
          }
        }
      });
      console.log('Milestone added successfully');
    } catch (error) {
      console.error('Error creating milestone:', error);
      alert('Failed to create milestone: ' + error.message);
    }
  };

  const contexts = ['all', '@home', '@office', '@computer', '@errands', '@phone', '@anywhere'];

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: '#0D0D0D',
      color: '#D9D9E3',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Main Chat Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        maxWidth: '900px',
        margin: '0 auto',
        width: '100%'
      }}>
        {/* Header */}
        <header style={{
          padding: '1.5rem 2rem',
          borderBottom: '1px solid #2D2D40',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '1.5rem',
              color: '#5D4B8C',
              fontWeight: '600'
            }}>
              {project?.title}
            </h1>
            {project?.persona && (
              <p style={{
                margin: '0.25rem 0 0 0',
                fontSize: '0.9rem',
                color: '#9D8BCC'
              }}>
                with {project.persona.displayName}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <select
              value={projectId}
              onChange={(e) => onProjectChange(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#1A1A1A',
                color: '#D9D9E3',
                border: '1px solid #2D2D40',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <button
              onClick={onSignOut}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#2D2D40',
                color: '#D9D9E3',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Messages Container */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {messages.length === 0 && !chatLoading && (
            <div style={{
              textAlign: 'center',
              padding: '3rem 2rem',
              color: '#666'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
              <h3 style={{ color: '#888', marginBottom: '0.5rem' }}>Start your conversation</h3>
              <p style={{ color: '#666', fontSize: '0.9rem' }}>
                Ask {project?.persona?.displayName || 'your AI coach'} anything about your project
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              persona={project?.persona}
              onAcceptTask={handleAcceptTask}
              onAcceptMilestone={handleAcceptMilestone}
            />
          ))}

          {sending && (
            <div style={{
              alignSelf: 'flex-start',
              padding: '1rem 1.25rem',
              backgroundColor: '#1A1A1A',
              borderRadius: '16px',
              maxWidth: '80%',
              color: '#666'
            }}>
              <span>Thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <form onSubmit={handleSendMessage} style={{
          padding: '1.5rem 2rem',
          borderTop: '1px solid #2D2D40',
          backgroundColor: '#0D0D0D'
        }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Message ${project?.persona?.displayName || 'AI Coach'}...`}
              rows={1}
              style={{
                flex: 1,
                padding: '0.875rem 1rem',
                fontSize: '1rem',
                backgroundColor: '#1A1A1A',
                border: '2px solid #2D2D40',
                borderRadius: '12px',
                color: '#D9D9E3',
                resize: 'none',
                lineHeight: '1.5',
                fontFamily: 'inherit',
                minHeight: '48px',
                maxHeight: '120px'
              }}
              onFocus={(e) => e.target.style.borderColor = '#5D4B8C'}
              onBlur={(e) => e.target.style.borderColor = '#2D2D40'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={!message.trim() || sending}
              style={{
                padding: '0.875rem 2rem',
                fontSize: '1rem',
                backgroundColor: (message.trim() && !sending) ? '#5D4B8C' : '#333',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                cursor: (message.trim() && !sending) ? 'pointer' : 'not-allowed',
                fontWeight: '500',
                minHeight: '48px'
              }}
            >
              Send
            </button>
          </div>
        </form>
      </div>

      {/* Tasks Sidebar */}
      <aside style={{
        width: '320px',
        borderLeft: '1px solid #2D2D40',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0A0A0A'
      }}>
        <div style={{
          padding: '1.5rem 1.25rem',
          borderBottom: '1px solid #2D2D40'
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.1rem',
            color: '#D9D9E3'
          }}>
            Tasks
          </h3>

          {/* Context Filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {contexts.map(ctx => (
              <button
                key={ctx}
                onClick={() => setSelectedContext(ctx)}
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.8rem',
                  backgroundColor: selectedContext === ctx ? '#5D4B8C' : '#1A1A1A',
                  color: selectedContext === ctx ? '#fff' : '#888',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                {ctx}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 1.25rem'
        }}>
          {filteredTasks.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '2rem 1rem',
              color: '#666'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📝</div>
              <p style={{ fontSize: '0.9rem' }}>
                No tasks yet
              </p>
            </div>
          )}

          {filteredTasks.map(task => (
            <div
              key={task.id}
              style={{
                padding: '1rem',
                marginBottom: '0.75rem',
                backgroundColor: '#1A1A1A',
                borderRadius: '8px',
                border: '1px solid #2D2D40',
                cursor: 'pointer'
              }}
              onClick={() => handleToggleTask(task.id, task.status)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={task.status === 'completed'}
                  onChange={() => {}}
                  style={{
                    marginTop: '0.25rem',
                    cursor: 'pointer',
                    accentColor: '#5D4B8C'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{
                    color: task.status === 'completed' ? '#666' : '#D9D9E3',
                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                    marginBottom: '0.5rem',
                    fontSize: '0.95rem'
                  }}>
                    {task.title}
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    flexWrap: 'wrap'
                  }}>
                    {task.context && (
                      <span style={{
                        backgroundColor: '#2D2D40',
                        color: '#9D8BCC',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '8px'
                      }}>
                        {task.context}
                      </span>
                    )}
                    {task.energyLevel && (
                      <span style={{
                        backgroundColor: task.energyLevel === 'high' ? '#4A2222' :
                                       task.energyLevel === 'medium' ? '#4A4422' : '#224A22',
                        color: task.energyLevel === 'high' ? '#FF6B6B' :
                               task.energyLevel === 'medium' ? '#FFD93D' : '#6BCF7F',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '8px'
                      }}>
                        {task.energyLevel}
                      </span>
                    )}
                    {task.timeEstimate && (
                      <span style={{ color: '#666' }}>
                        ⏱️ {task.timeEstimate}m
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Project Info Footer */}
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid #2D2D40',
          fontSize: '0.85rem'
        }}>
          {project?.outcome && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ color: '#666', marginBottom: '0.25rem' }}>Goal:</div>
              <div style={{ color: '#9D8BCC' }}>{project.outcome}</div>
            </div>
          )}
          <div style={{ color: '#666' }}>
            {tasks.filter(t => t.status === 'completed').length} / {tasks.length} tasks completed
          </div>
        </div>
      </aside>
    </div>
  );
}

function MessageBubble({ message, persona, onAcceptTask, onAcceptMilestone }) {
  const isUser = message.senderType === 'user';
  const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  // Parse message for structured elements
  const { cleanedContent, elements } = isUser
    ? { cleanedContent: message.content, elements: [] }
    : parseMessageElements(message.content);

  const handleDismiss = () => {
    // Just a visual feedback - could store dismissed items in state if needed
    console.log('Dismissed');
  };

  return (
    <div style={{
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '80%',
      display: 'flex',
      gap: '0.75rem',
      flexDirection: isUser ? 'row-reverse' : 'row'
    }}>
      {/* Avatar */}
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        backgroundColor: isUser ? '#2D2D40' : '#5D4B8C',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: '1.2rem'
      }}>
        {isUser ? '👤' : '🤖'}
      </div>

      {/* Message Content */}
      <div>
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'baseline',
          marginBottom: '0.25rem',
          flexDirection: isUser ? 'row-reverse' : 'row'
        }}>
          <span style={{
            fontSize: '0.9rem',
            fontWeight: '500',
            color: isUser ? '#9D8BCC' : '#5D4B8C'
          }}>
            {message.senderName}
          </span>
          <span style={{
            fontSize: '0.75rem',
            color: '#666'
          }}>
            {timestamp}
          </span>
        </div>

        <div>
          <div style={{
            padding: '1rem 1.25rem',
            backgroundColor: isUser ? '#2D2D40' : '#1A1A1A',
            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            color: '#D9D9E3',
            lineHeight: '1.6'
          }}>
            {isUser ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
            ) : (
              <ReactMarkdown
                components={{
                  p: ({node, ...props}) => <p style={{ margin: '0 0 0.75rem 0' }} {...props} />,
                  ul: ({node, ...props}) => <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }} {...props} />,
                  ol: ({node, ...props}) => <ol style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }} {...props} />,
                  li: ({node, ...props}) => <li style={{ margin: '0.25rem 0' }} {...props} />,
                  strong: ({node, ...props}) => <strong style={{ color: '#9D8BCC', fontWeight: '600' }} {...props} />,
                  em: ({node, ...props}) => <em style={{ color: '#aaa' }} {...props} />,
                  code: ({node, inline, ...props}) =>
                    inline ? (
                      <code style={{
                        background: '#0D0D0D',
                        padding: '0.2rem 0.4rem',
                        borderRadius: '4px',
                        fontSize: '0.9em',
                        color: '#9D8BCC'
                      }} {...props} />
                    ) : (
                      <code style={{
                        display: 'block',
                        background: '#0D0D0D',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        margin: '0.5rem 0',
                        overflow: 'auto',
                        fontSize: '0.9em'
                      }} {...props} />
                    )
                }}
              >
                {cleanedContent}
              </ReactMarkdown>
            )}
          </div>

          {/* Render structured elements */}
          {elements.map((element, idx) => {
            if (element.type === 'task') {
              return (
                <TaskSuggestion
                  key={idx}
                  task={element.task}
                  onAccept={onAcceptTask}
                  onDismiss={handleDismiss}
                />
              );
            }
            if (element.type === 'milestone') {
              return (
                <MilestoneSuggestion
                  key={idx}
                  milestone={element.milestone}
                  onAccept={onAcceptMilestone}
                  onDismiss={handleDismiss}
                />
              );
            }
            if (element.type === 'metric') {
              return <MetricCard key={idx} metric={element.metric} />;
            }
            if (element.type === 'progress') {
              return <ProgressCard key={idx} {...element.progress} />;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

export default ProjectDashboard;
