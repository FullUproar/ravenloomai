import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  TaskSuggestion,
  MilestoneSuggestion,
  MetricCard,
  ProgressCard,
  parseMessageElements
} from './ChatElements.jsx';
import { initializeRavens, checkRavenPermissions } from './native-ravens.js';
import { TaskManager } from './TaskManager.jsx';
import { ProjectOverview } from './ProjectOverview.jsx';
import { SessionsList } from './SessionsList.jsx';
import { SessionBoundary } from './SessionBoundary.jsx';
import GoalsView from './GoalsView.jsx';
import ConnectionsView from './ConnectionsView.jsx';
import ShareProjectModal from './ShareProjectModal.jsx';
// import { AIHighlight, useAIHighlight } from './components/AIHighlight.jsx';

const GET_PROJECT = gql`
  query GetProject($userId: String!, $projectId: ID!) {
    getProject(userId: $userId, projectId: $projectId) {
      id
      title
      description
      status
      completionType
      outcome
      debugModeEnabled
      debugModeActivatedAt
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
        priority
        gtdType
        context
        energyLevel
        timeEstimate
        dueDate
        isRecurring
        parentTaskId
        recurrenceType
        recurrenceInterval
        recurrenceDays
        recurrenceEndType
        recurrenceEndDate
        recurrenceEndCount
        recurrenceInstancesGenerated
        lastInstanceGeneratedAt
        recurrencePaused
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
        isDebugMessage
        debugData
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
      functionsExecuted {
        name
        arguments
        result
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
      isRecurring
      recurrenceType
      recurrenceInterval
      recurrenceDays
      recurrenceEndType
      recurrenceEndDate
      recurrenceEndCount
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

const DELETE_PROJECT = gql`
  mutation DeleteProject($projectId: ID!) {
    deleteProject(projectId: $projectId)
  }
`;

const ENABLE_DEBUG_MODE = gql`
  mutation EnableDebugMode($projectId: ID!, $passcode: String!) {
    enableDebugMode(projectId: $projectId, passcode: $passcode) {
      id
      debugModeEnabled
      debugModeActivatedAt
    }
  }
`;

const DISABLE_DEBUG_MODE = gql`
  mutation DisableDebugMode($projectId: ID!) {
    disableDebugMode(projectId: $projectId) {
      id
      debugModeEnabled
    }
  }
`;

const START_WORK_SESSION = gql`
  mutation StartWorkSession($projectId: ID!, $userId: String!, $input: WorkSessionInput) {
    startWorkSession(projectId: $projectId, userId: $userId, input: $input) {
      id
      title
      focusArea
      startedAt
      status
    }
  }
`;

const END_WORK_SESSION = gql`
  mutation EndWorkSession($sessionId: ID!, $input: EndWorkSessionInput) {
    endWorkSession(sessionId: $sessionId, input: $input) {
      id
      endedAt
      durationMinutes
      status
    }
  }
`;

const GET_ACTIVE_WORK_SESSION = gql`
  query GetActiveWorkSession($projectId: ID!, $userId: String!) {
    getActiveWorkSession(projectId: $projectId, userId: $userId) {
      id
      title
      focusArea
      startedAt
      status
    }
  }
`;

const GET_WORK_SESSIONS = gql`
  query GetWorkSessions($projectId: ID!, $userId: String!, $limit: Int) {
    getWorkSessions(projectId: $projectId, userId: $userId, limit: $limit) {
      id
      title
      focusArea
      startedAt
      endedAt
      durationMinutes
      summary
      notes
      status
    }
  }
`;

function ProjectDashboardMobile({ userId, projectId, initialView = 'overview', projects, onProjectChange, onCreateProject, onSignOut }) {
  const navigate = useNavigate();
  const { view: urlView } = useParams();

  const [message, setMessage] = useState('');
  const [selectedContext, setSelectedContext] = useState('all');
  const [currentView, setCurrentView] = useState(urlView || initialView); // 'overview', 'chat', 'tasks', 'goals', 'connections', 'project'
  const [ravensEnabled, setRavensEnabled] = useState(false);

  // Sync currentView with URL
  useEffect(() => {
    if (urlView && urlView !== currentView) {
      setCurrentView(urlView);
    }
  }, [urlView]);

  // Helper to change view and update URL
  const changeView = (newView) => {
    setCurrentView(newView);
    navigate(`/project/${projectId}/${newView}`);
  };
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showSessionsList, setShowSessionsList] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskDueTime, setNewTaskDueTime] = useState('');
  const [newTaskContext, setNewTaskContext] = useState('@anywhere');

  // Recurring task state
  const [newTaskIsRecurring, setNewTaskIsRecurring] = useState(false);
  const [newTaskRecurrenceType, setNewTaskRecurrenceType] = useState('daily');
  const [newTaskRecurrenceInterval, setNewTaskRecurrenceInterval] = useState(1);
  const [newTaskRecurrenceDays, setNewTaskRecurrenceDays] = useState([]);
  const [newTaskRecurrenceEndType, setNewTaskRecurrenceEndType] = useState('never');
  const [newTaskRecurrenceEndDate, setNewTaskRecurrenceEndDate] = useState(null);
  const [newTaskRecurrenceEndCount, setNewTaskRecurrenceEndCount] = useState(10);

  // Optimistic UI state for chat
  const [optimisticMessages, setOptimisticMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef(null);

  const messagesEndRef = useRef(null);

  // AI Highlight system - temporarily disabled
  // const { highlight, showHighlight, clearHighlight } = useAIHighlight();

  // Expose highlight function globally so AI backend can trigger it
  // useEffect(() => {
  //   window.aiHighlight = showHighlight;
  //   window.aiClearHighlight = clearHighlight;
  //   return () => {
  //     delete window.aiHighlight;
  //     delete window.aiClearHighlight;
  //   };
  // }, [showHighlight, clearHighlight]);

  const { loading: projectLoading, data: projectData, refetch: refetchProject } = useQuery(GET_PROJECT, {
    variables: { userId, projectId },
    fetchPolicy: 'cache-and-network', // Always check network for fresh data
  });

  const { loading: chatLoading, data: chatData, refetch: refetchChat } = useQuery(GET_CONVERSATION, {
    variables: { userId, projectId: parseInt(projectId) },
    pollInterval: isGenerating ? 2000 : 5000, // Poll faster while generating
  });

  const [sendMessage] = useMutation(SEND_MESSAGE);

  const [updateTaskStatus] = useMutation(UPDATE_TASK_STATUS, {
    refetchQueries: ['GetProject']
  });

  const [createTask] = useMutation(CREATE_TASK, {
    refetchQueries: ['GetProject', 'GetConversation']
  });

  const [deleteProject] = useMutation(DELETE_PROJECT);

  const [enableDebugMode] = useMutation(ENABLE_DEBUG_MODE, {
    refetchQueries: ['GetProject']
  });

  const [disableDebugMode] = useMutation(DISABLE_DEBUG_MODE, {
    refetchQueries: ['GetProject']
  });

  // Work Session state and queries
  const [activeSession, setActiveSession] = useState(null);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [sessionNotes, setSessionNotes] = useState('');

  const { data: sessionData } = useQuery(GET_ACTIVE_WORK_SESSION, {
    variables: { projectId, userId },
    onCompleted: (data) => {
      setActiveSession(data?.getActiveWorkSession);
    }
  });

  const { data: sessionsData } = useQuery(GET_WORK_SESSIONS, {
    variables: { projectId, userId, limit: 50 },
    pollInterval: 30000 // Refresh every 30 seconds
  });

  const [startWorkSession] = useMutation(START_WORK_SESSION, {
    refetchQueries: ['GetActiveWorkSession', 'GetWorkSessions'],
    onCompleted: (data) => {
      setActiveSession(data?.startWorkSession);
      setShowSessionsList(false); // Hide sessions list when starting new session
      changeView('chat');
    }
  });

  const [endWorkSession] = useMutation(END_WORK_SESSION, {
    refetchQueries: ['GetActiveWorkSession', 'GetWorkSessions'],
    onCompleted: () => {
      setActiveSession(null);
      setShowEndSessionModal(false);
      setSessionNotes('');
      // Navigate back to overview after ending session
      changeView('overview');
    }
  });

  // Debug mode state
  const [showDebugPasscodeModal, setShowDebugPasscodeModal] = useState(false);
  const [debugPasscode, setDebugPasscode] = useState('');

  useEffect(() => {
    if (currentView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatData, currentView, optimisticMessages]);

  // Check Ravens permissions on mount
  useEffect(() => {
    checkRavenPermissions().then(setRavensEnabled).catch(() => setRavensEnabled(false));
  }, []);

  // Refetch project data when switching to tasks view
  useEffect(() => {
    if (currentView === 'tasks') {
      refetchProject();
    }
  }, [currentView]);

  if (projectLoading) {
    return <div style={{ color: '#ccc', padding: '2rem' }}>Loading project...</div>;
  }

  const project = projectData?.getProject;
  const conversation = chatData?.getConversation;
  const serverMessages = conversation?.messages || [];

  // Filter out optimistic messages that match real messages (by content and sender)
  const uniqueOptimisticMessages = optimisticMessages.filter(optMsg =>
    !serverMessages.some(serverMsg =>
      serverMsg.content === optMsg.content &&
      serverMsg.senderType === optMsg.senderType &&
      Math.abs(new Date(serverMsg.createdAt) - new Date(optMsg.createdAt)) < 5000 // Within 5 seconds
    )
  );

  const messages = [...serverMessages, ...uniqueOptimisticMessages];
  const tasks = project?.tasks || [];
  const sessions = sessionsData?.getWorkSessions || [];

  const filteredTasks = selectedContext === 'all'
    ? tasks
    : tasks.filter(t => t.context === selectedContext);

  // Interleave messages with session boundaries
  const messagesWithBoundaries = useMemo(() => {
    if (!messages || messages.length === 0 || !sessions || sessions.length === 0) {
      return messages.map((msg, idx) => ({ type: 'message', data: msg, key: `msg-${idx}` }));
    }

    const items = [];
    let currentSessionIndex = -1;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const msgTime = new Date(msg.createdAt);

      // Check if we need to insert a session boundary before this message
      for (let j = currentSessionIndex + 1; j < sessions.length; j++) {
        const session = sessions[j];
        const sessionStart = new Date(session.startedAt);
        const sessionEnd = session.endedAt ? new Date(session.endedAt) : null;

        // If message is after session start and we haven't shown this session yet
        if (msgTime >= sessionStart) {
          // Insert session start boundary
          items.push({
            type: 'session-start',
            data: session,
            key: `session-start-${session.id}`
          });
          currentSessionIndex = j;

          // Check if session has ended before this message
          if (sessionEnd && msgTime > sessionEnd) {
            items.push({
              type: 'session-end',
              data: session,
              key: `session-end-${session.id}`
            });
          }
          break;
        }
      }

      // Add the message
      items.push({ type: 'message', data: msg, key: `msg-${msg.id}` });
    }

    // Check if the last session needs an end boundary
    if (currentSessionIndex >= 0 && currentSessionIndex < sessions.length) {
      const lastSession = sessions[currentSessionIndex];
      if (lastSession.endedAt) {
        const lastSessionEnd = new Date(lastSession.endedAt);
        const lastMsgTime = messages.length > 0 ? new Date(messages[messages.length - 1].createdAt) : null;

        if (lastMsgTime && lastSessionEnd > lastMsgTime) {
          items.push({
            type: 'session-end',
            data: lastSession,
            key: `session-end-${lastSession.id}`
          });
        }
      }
    }

    return items;
  }, [messages, sessions]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || isGenerating) return;

    const userMessageText = message.trim();

    // Immediately show user's message (optimistic UI)
    const optimisticUserMsg = {
      id: `temp-user-${Date.now()}`,
      content: userMessageText,
      senderName: 'You',
      senderType: 'user',
      createdAt: new Date().toISOString()
    };

    setOptimisticMessages([optimisticUserMsg]);
    setMessage(''); // Clear input immediately
    setIsGenerating(true);

    try {
      // Send message to backend
      const response = await sendMessage({
        variables: {
          projectId: parseInt(projectId),
          userId,
          message: userMessageText
        }
      });

      // Check for highlight function execution - temporarily disabled
      // const functionsExecuted = response.data?.sendMessage?.functionsExecuted || [];
      // for (const func of functionsExecuted) {
      //   if (func.name === 'highlightUIElement' && func.result?.highlight) {
      //     const { elementId, message: highlightMessage, duration } = func.result.highlight;
      //     // Trigger highlight via global function
      //     if (window.aiHighlight) {
      //       window.aiHighlight(`[data-aid="${elementId}"]`, highlightMessage, duration);
      //     }
      //   }
      // }

      // Refetch to get the complete response
      await refetchChat();

      // Clear optimistic messages AFTER refetch completes
      // This ensures the real message is already in the list before we remove the optimistic one
      setOptimisticMessages([]);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message: ' + error.message);
      setOptimisticMessages([]); // Clear on error
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setOptimisticMessages([]);
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

  const handleStartWorkSession = async () => {
    try {
      await startWorkSession({
        variables: {
          projectId,
          userId,
          input: {
            title: project?.title ? `Working on ${project.title}` : 'Work Session'
          }
        }
      });
    } catch (error) {
      console.error('Error starting work session:', error);
      alert('Failed to start work session: ' + error.message);
    }
  };

  const handleEndWorkSession = async () => {
    if (!activeSession) return;

    try {
      await endWorkSession({
        variables: {
          sessionId: activeSession.id,
          input: {
            notes: sessionNotes || null
          }
        }
      });
    } catch (error) {
      console.error('Error ending work session:', error);
      alert('Failed to end work session: ' + error.message);
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm(`Are you sure you want to delete "${project?.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteProject({
        variables: { projectId: parseInt(projectId) }
      });

      // After deleting, switch to another project or trigger project list refresh
      const remainingProjects = projects.filter(p => p.id !== projectId);
      if (remainingProjects.length > 0) {
        onProjectChange(remainingProjects[0].id);
      } else {
        // No projects left, trigger create new project flow
        onCreateProject();
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Failed to delete project: ' + error.message);
    }
  };

  const handleEnableRavens = async () => {
    try {
      // Use same API URL detection logic as main.jsx
      const isNativeApp = window.location.protocol === 'capacitor:' ||
                          window.location.protocol === 'ionic:' ||
                          window.location.hostname === 'localhost' ||
                          window.location.hostname === '10.0.2.2';

      const apiUrl = isNativeApp
        ? 'http://10.0.2.2:4013' // Native app uses emulator localhost
        : window.location.origin; // Web app uses current origin

      console.log('🪶 [handleEnableRavens] Initializing Ravens...', { userId, apiUrl, isNativeApp });
      await initializeRavens(userId, apiUrl);
      setRavensEnabled(true);
      alert('🪶 Ravens enabled! You\'ll get notifications for tasks with due dates.');
    } catch (error) {
      console.error('❌ [handleEnableRavens] Failed to enable Ravens:', error);
      alert('Failed to enable notifications: ' + error.message);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) {
      alert('Please enter a task title');
      return;
    }

    try {
      // Combine date and time into ISO datetime if both are provided
      let dueDatetime = null;
      if (newTaskDueDate) {
        const dateTimeString = newTaskDueTime
          ? `${newTaskDueDate}T${newTaskDueTime}:00`
          : `${newTaskDueDate}T09:00:00`; // Default to 9 AM if no time specified
        dueDatetime = new Date(dateTimeString).toISOString();
      }

      // Build input object
      const input = {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        type: 'manual',
        gtdType: 'next_action',
        context: newTaskContext,
        energyLevel: 'medium',
        dueDate: dueDatetime
      };

      // Add recurring fields if task is recurring
      if (newTaskIsRecurring) {
        input.isRecurring = true;
        input.recurrenceType = newTaskRecurrenceType;
        input.recurrenceInterval = newTaskRecurrenceInterval;
        input.recurrenceDays = newTaskRecurrenceDays;
        input.recurrenceEndType = newTaskRecurrenceEndType;
        input.recurrenceEndDate = newTaskRecurrenceEndDate;
        input.recurrenceEndCount = newTaskRecurrenceEndCount;
      }

      await createTask({
        variables: {
          projectId: parseInt(projectId),
          input
        }
      });

      // Reset form
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskDueDate('');
      setNewTaskDueTime('');
      setNewTaskContext('@anywhere');
      setNewTaskIsRecurring(false);
      setNewTaskRecurrenceType('daily');
      setNewTaskRecurrenceInterval(1);
      setNewTaskRecurrenceDays([]);
      setNewTaskRecurrenceEndType('never');
      setNewTaskRecurrenceEndDate(null);
      setNewTaskRecurrenceEndCount(10);
      setShowCreateTask(false);

      // If Ravens enabled and task has due date, notify user
      if (ravensEnabled && dueDatetime) {
        alert('✓ Task created! You\'ll get a Raven when it\'s due.');
      }
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task: ' + error.message);
    }
  };

  const handleToggleDebugMode = async () => {
    if (project?.debugModeEnabled) {
      // Disable debug mode
      if (!confirm('Disable debug mode?')) return;

      try {
        await disableDebugMode({
          variables: { projectId: parseInt(projectId) }
        });
      } catch (error) {
        console.error('Error disabling debug mode:', error);
        alert('Failed to disable debug mode: ' + error.message);
      }
    } else {
      // Show passcode modal
      setShowDebugPasscodeModal(true);
    }
  };

  const handleSubmitDebugPasscode = async () => {
    try {
      await enableDebugMode({
        variables: {
          projectId: parseInt(projectId),
          passcode: debugPasscode
        }
      });

      setShowDebugPasscodeModal(false);
      setDebugPasscode('');
      alert('🐛 Debug mode enabled! You\'ll now see memory system activity in red.');
    } catch (error) {
      console.error('Error enabling debug mode:', error);
      alert('Invalid passcode or error: ' + error.message);
    }
  };

  const contexts = ['all', '@home', '@office', '@computer', '@errands', '@phone', '@anywhere'];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#0D0D0D',
      color: '#D9D9E3',
      fontFamily: "'Inter', sans-serif",
      overflow: 'hidden'
    }}>
      {/* Simple Header */}
      <header style={{
        padding: '1rem',
        borderBottom: '1px solid #2D2D40',
        backgroundColor: '#0D0D0D',
        position: 'relative'
      }}>
        {/* Back button - only show when not on overview */}
        {currentView !== 'overview' && (
          <button
            onClick={() => navigate('/')}
            style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#9D8BCC',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.color = '#5D4B8C'}
            onMouseLeave={(e) => e.target.style.color = '#9D8BCC'}
          >
            ←
          </button>
        )}

        <div style={{
          fontSize: '1.2rem',
          fontWeight: '600',
          color: '#5D4B8C',
          textAlign: 'center'
        }}>
          {currentView === 'overview' && project?.title}
          {currentView === 'chat' && 'Work Session'}
          {currentView === 'tasks' && 'Tasks'}
          {currentView === 'project' && 'Project'}
        </div>
        {currentView === 'chat' && project?.persona && (
          <div style={{
            fontSize: '0.85rem',
            color: '#9D8BCC',
            textAlign: 'center',
            marginTop: '0.25rem'
          }}>
            with {project.persona.displayName}
          </div>
        )}
      </header>

      {/* Main Content Area - Single View */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* OVERVIEW VIEW */}
        {currentView === 'overview' && (
          <ProjectOverview
            project={project}
            tasks={tasks}
            onStartSession={handleStartWorkSession}
            onQuickAdd={() => setShowCreateTask(true)}
            onNavigate={(view) => changeView(view)}
          />
        )}

        {/* CHAT VIEW */}
        {currentView === 'chat' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%'
          }}>
            {/* Toggle button for sessions list */}
            <div style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#1A1A1A',
              borderBottom: '1px solid #2D2D40',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{
                fontSize: '0.9rem',
                color: '#888'
              }}>
                {showSessionsList ? 'Sessions History' : (activeSession ? activeSession.title || 'Work Session' : 'Chat')}
              </div>
              <button
                onClick={() => setShowSessionsList(!showSessionsList)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: showSessionsList ? '#5D4B8C' : '#2D2D40',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                {showSessionsList ? 'Back to Chat' : '📋 Sessions'}
              </button>
            </div>

            {/* Show either sessions list or chat */}
            {showSessionsList ? (
              <SessionsList
                sessions={sessionsData?.getWorkSessions || []}
                activeSessionId={activeSession?.id}
                onSelectSession={(session) => {
                  setShowSessionsList(false);
                  // Navigate to that session's messages
                }}
              />
            ) : (
              <>
                {/* Messages */}
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}>
              {messages.length === 0 && !chatLoading && (
                <div style={{
                  textAlign: 'center',
                  padding: '3rem 1rem',
                  color: '#666'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
                  <h3 style={{ color: '#888', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Start your conversation</h3>
                  <p style={{ color: '#666', fontSize: '0.9rem' }}>
                    Ask {project?.persona?.displayName || 'your AI coach'} anything
                  </p>
                </div>
              )}

              {messagesWithBoundaries.map((item) => {
                if (item.type === 'session-start') {
                  return <SessionBoundary key={item.key} session={item.data} type="start" />;
                }
                if (item.type === 'session-end') {
                  return <SessionBoundary key={item.key} session={item.data} type="end" />;
                }
                if (item.type === 'message') {
                  return (
                    <MessageBubble
                      key={item.key}
                      message={item.data}
                      persona={project?.persona}
                      onAcceptTask={handleAcceptTask}
                      onAcceptMilestone={handleAcceptMilestone}
                    />
                  );
                }
                return null;
              })}

              {isGenerating && (
                <div style={{
                  alignSelf: 'flex-start',
                  padding: '1rem',
                  backgroundColor: '#1A1A1A',
                  borderRadius: '16px',
                  maxWidth: '80%',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#5D4B8C',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }} />
                  {project?.persona?.displayName || 'AI'} is thinking...
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Area */}
            {activeSession ? (
              <form onSubmit={handleSendMessage} style={{
                padding: '1rem',
                borderTop: '1px solid #2D2D40',
                backgroundColor: '#0D0D0D'
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {/* Green session indicator */}
                  <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#4CAF50',
                    boxShadow: '0 0 8px rgba(76, 175, 80, 0.6)',
                    flexShrink: 0
                  }} />

                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={`Message ${project?.persona?.displayName || 'AI'}...`}
                    disabled={isGenerating}
                    style={{
                      flex: 1,
                      padding: '0.875rem 1rem',
                      fontSize: '1rem',
                      backgroundColor: isGenerating ? '#0D0D0D' : '#1A1A1A',
                      border: '2px solid #2D2D40',
                      borderRadius: '12px',
                      color: '#D9D9E3',
                      fontFamily: 'inherit',
                      opacity: isGenerating ? 0.5 : 1
                    }}
                    onFocus={(e) => !isGenerating && (e.target.style.borderColor = '#5D4B8C')}
                    onBlur={(e) => e.target.style.borderColor = '#2D2D40'}
                  />

                  {/* Button group */}
                  {isGenerating ? (
                    <button
                      type="button"
                      onClick={handleStopGeneration}
                      style={{
                        padding: '0.875rem 1.25rem',
                        fontSize: '1rem',
                        backgroundColor: '#6B2222',
                        color: '#FF6B6B',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <span style={{ fontSize: '1.2rem' }}>■</span>
                      Stop
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowEndSessionModal(true)}
                        style={{
                          padding: '0.875rem 1rem',
                          fontSize: '0.9rem',
                          backgroundColor: '#2D2D40',
                          color: '#D9D9E3',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        End
                      </button>
                      <button
                        type="submit"
                        disabled={!message.trim()}
                        style={{
                          padding: '0.875rem 1.25rem',
                          fontSize: '1rem',
                          backgroundColor: message.trim() ? '#5D4B8C' : '#333',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: message.trim() ? 'pointer' : 'not-allowed',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <span style={{ fontSize: '1.2rem' }}>↑</span>
                        Send
                      </button>
                    </>
                  )}
                </div>
              </form>
            ) : (
              <div style={{
                padding: '1.5rem',
                borderTop: '1px solid #2D2D40',
                backgroundColor: '#0D0D0D',
                textAlign: 'center'
              }}>
                <p style={{
                  color: '#888',
                  fontSize: '0.95rem',
                  margin: '0 0 1rem 0'
                }}>
                  This session has ended.
                </p>
                <button
                  onClick={() => changeView('overview')}
                  style={{
                    padding: '0.875rem 1.5rem',
                    fontSize: '1rem',
                    backgroundColor: '#5D4B8C',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  Start New Session
                </button>
              </div>
            )}
              </>
            )}
          </div>
        )}

        {/* TASKS VIEW */}
        {currentView === 'tasks' && (
          <TaskManager
            tasks={tasks}
            onCreateTask={() => setShowCreateTask(true)}
            refetchTasks={() => refetchProject()}
          />
        )}

        {/* GOALS VIEW */}
        {currentView === 'goals' && (
          <GoalsView projectId={projectId} />
        )}

        {/* CONNECTIONS VIEW */}
        {currentView === 'connections' && (
          <ConnectionsView userId={userId} />
        )}

        {/* PROJECT VIEW */}
        {currentView === 'project' && (
          <div style={{
            height: '100%',
            overflowY: 'auto',
            padding: '1.5rem'
          }}>
            {/* Project Info */}
            <div style={{
              backgroundColor: '#1A1A1A',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1rem'
            }}>
              <h3 style={{
                margin: '0 0 1rem 0',
                fontSize: '1.1rem',
                color: '#9D8BCC'
              }}>
                Project Goal
              </h3>
              <p style={{
                color: '#D9D9E3',
                lineHeight: '1.6',
                margin: 0
              }}>
                {project?.outcome || 'No goal set'}
              </p>
            </div>

            {/* Progress */}
            <div style={{
              backgroundColor: '#1A1A1A',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1rem'
            }}>
              <h3 style={{
                margin: '0 0 1rem 0',
                fontSize: '1.1rem',
                color: '#9D8BCC'
              }}>
                Progress
              </h3>
              <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#5D4B8C' }}>
                {tasks.filter(t => t.status === 'completed').length} / {tasks.length} tasks
              </div>
            </div>

            {/* Debug Mode */}
            <div style={{
              backgroundColor: '#1A1A1A',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1rem'
            }}>
              <h3 style={{
                margin: '0 0 1rem 0',
                fontSize: '1.1rem',
                color: '#9D8BCC'
              }}>
                🐛 Debug Mode
              </h3>
              <p style={{
                color: '#888',
                fontSize: '0.9rem',
                marginBottom: '1rem',
                lineHeight: '1.5'
              }}>
                See memory system activity in real-time
              </p>
              {project?.debugModeEnabled ? (
                <div>
                  <div style={{
                    padding: '1rem',
                    backgroundColor: '#2A1515',
                    borderRadius: '8px',
                    color: '#FF6B6B',
                    fontSize: '0.95rem',
                    textAlign: 'center',
                    marginBottom: '0.75rem'
                  }}>
                    ✓ Debug Mode Active
                  </div>
                  <button
                    onClick={handleToggleDebugMode}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      backgroundColor: '#6B2222',
                      color: '#FF6B6B',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: '500'
                    }}
                  >
                    Disable Debug Mode
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleToggleDebugMode}
                  style={{
                    width: '100%',
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
                  Enable Debug Mode
                </button>
              )}
            </div>

            {/* Ravens (Notifications) */}
            <div style={{
              backgroundColor: '#1A1A1A',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1rem'
            }}>
              <h3 style={{
                margin: '0 0 1rem 0',
                fontSize: '1.1rem',
                color: '#9D8BCC'
              }}>
                🪶 Task Notifications
              </h3>
              <p style={{
                color: '#888',
                fontSize: '0.9rem',
                marginBottom: '1rem',
                lineHeight: '1.5'
              }}>
                Get notified when tasks are due
              </p>
              {ravensEnabled ? (
                <div style={{
                  padding: '1rem',
                  backgroundColor: '#2D4A2D',
                  borderRadius: '8px',
                  color: '#6BCF7F',
                  fontSize: '0.95rem',
                  textAlign: 'center'
                }}>
                  ✓ Ravens Enabled
                </div>
              ) : (
                <button
                  onClick={handleEnableRavens}
                  style={{
                    width: '100%',
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
                  Enable Ravens
                </button>
              )}
            </div>

            {/* Switch Project */}
            <div style={{
              backgroundColor: '#1A1A1A',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1rem'
            }}>
              <h3 style={{
                margin: '0 0 1rem 0',
                fontSize: '1.1rem',
                color: '#9D8BCC'
              }}>
                Switch Project
              </h3>
              <select
                value={projectId}
                onChange={(e) => onProjectChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  backgroundColor: '#0D0D0D',
                  color: '#D9D9E3',
                  border: '1px solid #2D2D40',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  marginBottom: '1rem'
                }}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>

              <button
                onClick={() => setShowShareModal(true)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  backgroundColor: '#2D4A2D',
                  color: '#6BCF7F',
                  border: '1px solid #3A5A3A',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '500',
                  marginBottom: '0.75rem'
                }}
              >
                🔗 Share Project
              </button>

              <button
                onClick={handleDeleteProject}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  backgroundColor: '#4A2222',
                  color: '#FF6B6B',
                  border: '1px solid #6B2222',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '500'
                }}
              >
                Delete Project
              </button>
            </div>

            {/* Sign Out */}
            <button
              onClick={onSignOut}
              style={{
                width: '100%',
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
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav style={{
        display: 'flex',
        borderTop: '1px solid #2D2D40',
        backgroundColor: '#0A0A0A',
        padding: '0.5rem',
        justifyContent: 'space-around'
      }}>
        <button
          onClick={() => changeView('overview')}
          style={{
            flex: 1,
            padding: '0.75rem',
            backgroundColor: 'transparent',
            border: 'none',
            color: currentView === 'overview' ? '#5D4B8C' : '#666',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: '500'
          }}
        >
          <div style={{ fontSize: '1.5rem' }}>🏠</div>
          Overview
        </button>
        <button
          onClick={() => changeView('chat')}
          style={{
            flex: 1,
            padding: '0.75rem',
            backgroundColor: 'transparent',
            border: 'none',
            color: currentView === 'chat' ? '#5D4B8C' : '#666',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: '500'
          }}
        >
          <div style={{ fontSize: '1.5rem' }}>🚀</div>
          Work
        </button>
        <button
          onClick={() => changeView('tasks')}
          style={{
            flex: 1,
            padding: '0.75rem',
            backgroundColor: 'transparent',
            border: 'none',
            color: currentView === 'tasks' ? '#5D4B8C' : '#666',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: '500',
            position: 'relative'
          }}
        >
          <div style={{ fontSize: '1.5rem' }}>✓</div>
          Tasks
          {tasks.filter(t => t.status !== 'completed').length > 0 && (
            <span style={{
              position: 'absolute',
              top: '0.5rem',
              right: '1rem',
              backgroundColor: '#5D4B8C',
              color: '#fff',
              borderRadius: '10px',
              padding: '0.125rem 0.375rem',
              fontSize: '0.7rem',
              fontWeight: '600'
            }}>
              {tasks.filter(t => t.status !== 'completed').length}
            </span>
          )}
        </button>
        <button
          onClick={() => changeView('project')}
          style={{
            flex: 1,
            padding: '0.75rem',
            backgroundColor: 'transparent',
            border: 'none',
            color: currentView === 'connections' ? '#5D4B8C' : '#666',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: '500'
          }}
        >
          <div style={{ fontSize: '1.5rem' }}>🤝</div>
          Connect
        </button>
        <button
          onClick={() => changeView('project')}
          style={{
            flex: 1,
            padding: '0.75rem',
            backgroundColor: 'transparent',
            border: 'none',
            color: currentView === 'project' ? '#5D4B8C' : '#666',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: '500'
          }}
        >
          <div style={{ fontSize: '1.5rem' }}>⚙️</div>
          Project
        </button>
      </nav>

      {/* Share Project Modal */}
      {showShareModal && (
        <ShareProjectModal
          projectId={projectId}
          userId={userId}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Create Task Modal */}
      {showCreateTask && (
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
            maxHeight: '85vh',
            overflowY: 'auto'
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
                fontSize: '1.3rem',
                color: '#9D8BCC',
                fontWeight: '600'
              }}>
                Create Task
              </h2>
              <button
                onClick={() => setShowCreateTask(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#888',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem'
                }}
              >
                ✕
              </button>
            </div>

            {/* Task Title */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#9D8BCC',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}>
                Task Title *
              </label>
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="What needs to be done?"
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  backgroundColor: '#0D0D0D',
                  border: '2px solid #2D2D40',
                  borderRadius: '12px',
                  color: '#D9D9E3',
                  fontSize: '1rem',
                  fontFamily: 'inherit'
                }}
                onFocus={(e) => e.target.style.borderColor = '#5D4B8C'}
                onBlur={(e) => e.target.style.borderColor = '#2D2D40'}
              />
            </div>

            {/* Task Description */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#9D8BCC',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}>
                Description (optional)
              </label>
              <textarea
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Add any details..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  backgroundColor: '#0D0D0D',
                  border: '2px solid #2D2D40',
                  borderRadius: '12px',
                  color: '#D9D9E3',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
                onFocus={(e) => e.target.style.borderColor = '#5D4B8C'}
                onBlur={(e) => e.target.style.borderColor = '#2D2D40'}
              />
            </div>

            {/* Context */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#9D8BCC',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}>
                Context
              </label>
              <select
                value={newTaskContext}
                onChange={(e) => setNewTaskContext(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  backgroundColor: '#0D0D0D',
                  border: '2px solid #2D2D40',
                  borderRadius: '12px',
                  color: '#D9D9E3',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer'
                }}
              >
                {contexts.filter(c => c !== 'all').map(ctx => (
                  <option key={ctx} value={ctx}>{ctx}</option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#9D8BCC',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}>
                📅 Due Date (optional)
              </label>
              <input
                type="date"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  backgroundColor: '#0D0D0D',
                  border: '2px solid #2D2D40',
                  borderRadius: '12px',
                  color: '#D9D9E3',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* Due Time */}
            {newTaskDueDate && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#9D8BCC',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}>
                  ⏰ Due Time (optional)
                </label>
                <input
                  type="time"
                  value={newTaskDueTime}
                  onChange={(e) => setNewTaskDueTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    backgroundColor: '#0D0D0D',
                    border: '2px solid #2D2D40',
                    borderRadius: '12px',
                    color: '#D9D9E3',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    cursor: 'pointer'
                  }}
                />
                <p style={{
                  fontSize: '0.8rem',
                  color: '#666',
                  marginTop: '0.5rem',
                  marginBottom: 0
                }}>
                  {ravensEnabled ? '🪶 You\'ll get a Raven notification when this task is due' : 'Enable Ravens in Project settings to get notifications'}
                </p>
              </div>
            )}

            {/* Recurring Task Section */}
            <div style={{
              padding: '1rem',
              backgroundColor: '#0D0D0D',
              borderRadius: '12px',
              marginBottom: '1rem',
              border: '2px solid #2D2D40'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newTaskIsRecurring}
                  onChange={(e) => setNewTaskIsRecurring(e.target.checked)}
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

              {newTaskIsRecurring && (
                <>
                  {/* Recurrence Type */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      color: '#888',
                      fontSize: '0.875rem'
                    }}>
                      Repeat
                    </label>
                    <select
                      value={newTaskRecurrenceType}
                      onChange={(e) => setNewTaskRecurrenceType(e.target.value)}
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
                  </div>

                  {/* Recurrence Interval */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      color: '#888',
                      fontSize: '0.875rem'
                    }}>
                      Every {newTaskRecurrenceType === 'daily' ? 'X days' : newTaskRecurrenceType === 'weekly' ? 'X weeks' : newTaskRecurrenceType === 'monthly' ? 'X months' : 'X years'}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={newTaskRecurrenceInterval}
                      onChange={(e) => setNewTaskRecurrenceInterval(parseInt(e.target.value))}
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
                  </div>

                  {/* Days of Week for Weekly Recurrence */}
                  {newTaskRecurrenceType === 'weekly' && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        color: '#888',
                        fontSize: '0.875rem'
                      }}>
                        Days of Week
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                          const dayNum = index + 1;
                          const isSelected = newTaskRecurrenceDays.includes(dayNum);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                const newDays = isSelected
                                  ? newTaskRecurrenceDays.filter(d => d !== dayNum)
                                  : [...newTaskRecurrenceDays, dayNum].sort();
                                setNewTaskRecurrenceDays(newDays);
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
                    </div>
                  )}

                  {/* Recurrence End Type */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      color: '#888',
                      fontSize: '0.875rem'
                    }}>
                      Ends
                    </label>
                    <select
                      value={newTaskRecurrenceEndType}
                      onChange={(e) => setNewTaskRecurrenceEndType(e.target.value)}
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
                  </div>

                  {/* End Date */}
                  {newTaskRecurrenceEndType === 'after_date' && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        color: '#888',
                        fontSize: '0.875rem'
                      }}>
                        End Date
                      </label>
                      <input
                        type="date"
                        value={newTaskRecurrenceEndDate ? new Date(newTaskRecurrenceEndDate).toISOString().slice(0, 10) : ''}
                        onChange={(e) => setNewTaskRecurrenceEndDate(e.target.value ? new Date(e.target.value).toISOString() : null)}
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
                    </div>
                  )}

                  {/* End Count */}
                  {newTaskRecurrenceEndType === 'after_count' && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        color: '#888',
                        fontSize: '0.875rem'
                      }}>
                        Number of Occurrences
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={newTaskRecurrenceEndCount}
                        onChange={(e) => setNewTaskRecurrenceEndCount(parseInt(e.target.value))}
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
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              marginTop: '1.5rem'
            }}>
              <button
                onClick={() => setShowCreateTask(false)}
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
                onClick={handleCreateTask}
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
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Passcode Modal */}
      {showDebugPasscodeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#1A1A1A',
            borderRadius: '16px',
            padding: '1.5rem',
            maxWidth: '400px',
            width: '100%'
          }}>
            <h2 style={{
              margin: '0 0 1rem 0',
              fontSize: '1.3rem',
              color: '#9D8BCC',
              fontWeight: '600'
            }}>
              Enable Debug Mode
            </h2>
            <p style={{
              color: '#888',
              fontSize: '0.9rem',
              marginBottom: '1rem',
              lineHeight: '1.5'
            }}>
              Enter the debug passcode to enable memory system visibility:
            </p>
            <input
              type="text"
              value={debugPasscode}
              onChange={(e) => setDebugPasscode(e.target.value)}
              placeholder="Enter passcode"
              style={{
                width: '100%',
                padding: '0.875rem',
                backgroundColor: '#0D0D0D',
                border: '2px solid #2D2D40',
                borderRadius: '12px',
                color: '#D9D9E3',
                fontSize: '1rem',
                fontFamily: 'monospace',
                marginBottom: '1rem'
              }}
              onFocus={(e) => e.target.style.borderColor = '#5D4B8C'}
              onBlur={(e) => e.target.style.borderColor = '#2D2D40'}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSubmitDebugPasscode();
                }
              }}
            />
            <div style={{
              display: 'flex',
              gap: '0.75rem'
            }}>
              <button
                onClick={() => {
                  setShowDebugPasscodeModal(false);
                  setDebugPasscode('');
                }}
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
                onClick={handleSubmitDebugPasscode}
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
                Enable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Work Session Modal */}
      {showEndSessionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: '#1A1A1A',
            borderRadius: '16px',
            padding: '1.5rem',
            maxWidth: '400px',
            width: '100%',
            margin: '1rem'
          }}>
            <h2 style={{
              margin: '0 0 1rem 0',
              fontSize: '1.3rem',
              color: '#9D8BCC',
              fontWeight: '600'
            }}>
              End Work Session
            </h2>
            <p style={{
              color: '#888',
              fontSize: '0.9rem',
              marginBottom: '1rem',
              lineHeight: '1.5'
            }}>
              How did your work session go? Add any notes below (optional):
            </p>
            <textarea
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="What did you accomplish? Any blockers?"
              rows={4}
              style={{
                width: '100%',
                padding: '0.875rem',
                backgroundColor: '#0D0D0D',
                border: '2px solid #2D2D40',
                borderRadius: '12px',
                color: '#D9D9E3',
                fontSize: '1rem',
                fontFamily: 'inherit',
                marginBottom: '1rem',
                resize: 'vertical'
              }}
              onFocus={(e) => e.target.style.borderColor = '#5D4B8C'}
              onBlur={(e) => e.target.style.borderColor = '#2D2D40'}
            />
            <div style={{
              display: 'flex',
              gap: '0.75rem'
            }}>
              <button
                onClick={() => {
                  setShowEndSessionModal(false);
                  setSessionNotes('');
                }}
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
                onClick={handleEndWorkSession}
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
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, persona, onAcceptTask, onAcceptMilestone }) {
  const isUser = message.senderType === 'user';
  const isDebug = message.isDebugMessage;

  const { cleanedContent, elements } = isUser
    ? { cleanedContent: message.content, elements: [] }
    : parseMessageElements(message.content);

  const handleDismiss = () => {
    console.log('Dismissed');
  };

  // Debug messages have special styling
  if (isDebug) {
    return (
      <div style={{
        padding: '0.75rem 1rem',
        backgroundColor: '#2A1515',
        border: '1px solid #6B2222',
        borderRadius: '8px',
        marginBottom: '0.5rem'
      }}>
        <div style={{
          fontSize: '0.85rem',
          color: '#FF6B6B',
          fontFamily: 'monospace',
          lineHeight: '1.4'
        }}>
          {message.content}
        </div>
        {message.debugData && (
          <details style={{ marginTop: '0.5rem' }}>
            <summary style={{
              fontSize: '0.75rem',
              color: '#FF8C8C',
              cursor: 'pointer',
              userSelect: 'none'
            }}>
              Debug Data
            </summary>
            <pre style={{
              fontSize: '0.7rem',
              color: '#FFA5A5',
              marginTop: '0.5rem',
              overflow: 'auto',
              maxHeight: '200px'
            }}>
              {JSON.stringify(message.debugData, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start'
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

      {/* Message */}
      <div style={{ flex: 1, maxWidth: '85%' }}>
        <div style={{
          padding: '1rem',
          backgroundColor: isUser ? '#2D2D40' : '#1A1A1A',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          color: '#D9D9E3',
          lineHeight: '1.6',
          fontSize: '0.95rem'
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

        {/* Structured elements */}
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

      {/* AI Highlight Overlay - temporarily disabled */}
      {/* {highlight && (
        <AIHighlight
          targetSelector={highlight.targetSelector}
          message={highlight.message}
          duration={highlight.duration}
          onDismiss={clearHighlight}
        />
      )} */}
    </div>
  );
}

export default ProjectDashboardMobile;
