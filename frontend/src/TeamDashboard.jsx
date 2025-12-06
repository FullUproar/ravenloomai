import { gql, useQuery, useMutation, useLazyQuery } from '@apollo/client';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

// ============================================================================
// GraphQL Operations
// ============================================================================

const GET_TEAM = gql`
  query GetTeam($teamId: ID!) {
    getTeam(teamId: $teamId) {
      id
      name
      slug
      channels {
        id
        name
        description
        isDefault
      }
      members {
        id
        userId
        role
        user {
          id
          email
          displayName
        }
      }
    }
  }
`;

const GET_MESSAGES = gql`
  query GetMessages($channelId: ID!, $limit: Int) {
    getMessages(channelId: $channelId, limit: $limit) {
      id
      content
      isAi
      mentionsAi
      aiCommand
      createdAt
      user {
        id
        email
        displayName
      }
    }
  }
`;

const SEND_MESSAGE = gql`
  mutation SendMessage($channelId: ID!, $input: SendMessageInput!) {
    sendMessage(channelId: $channelId, input: $input) {
      message {
        id
        content
        isAi
        createdAt
      }
      factsCreated {
        id
        content
        category
      }
      alertsCreated {
        id
        message
        triggerAt
      }
      tasksCreated {
        id
        title
      }
    }
  }
`;

const CREATE_CHANNEL = gql`
  mutation CreateChannel($teamId: ID!, $input: CreateChannelInput!) {
    createChannel(teamId: $teamId, input: $input) {
      id
      name
      description
    }
  }
`;

const INVITE_TEAM_MEMBER = gql`
  mutation InviteTeamMember($teamId: ID!, $input: InviteTeamMemberInput!) {
    inviteTeamMember(teamId: $teamId, input: $input) {
      id
      email
      role
      token
      expiresAt
    }
  }
`;

const GET_TEAM_INVITES = gql`
  query GetTeamInvites($teamId: ID!) {
    getTeamInvites(teamId: $teamId) {
      id
      email
      role
      token
      expiresAt
      createdAt
    }
  }
`;

const GET_TASKS = gql`
  query GetTasks($teamId: ID!, $status: String, $assignedTo: String) {
    getTasks(teamId: $teamId, status: $status, assignedTo: $assignedTo) {
      id
      title
      description
      status
      priority
      assignedTo
      assignedToUser {
        id
        displayName
        email
      }
      dueAt
      completedAt
      createdAt
    }
  }
`;

const CREATE_TASK_DIRECT = gql`
  mutation CreateTask($teamId: ID!, $input: CreateTaskInput!) {
    createTask(teamId: $teamId, input: $input) {
      id
      title
      status
      priority
    }
  }
`;

const UPDATE_TASK = gql`
  mutation UpdateTask($taskId: ID!, $input: UpdateTaskInput!) {
    updateTask(taskId: $taskId, input: $input) {
      id
      title
      status
      priority
      assignedTo
      dueAt
    }
  }
`;

const COMPLETE_TASK = gql`
  mutation CompleteTask($taskId: ID!) {
    completeTask(taskId: $taskId) {
      id
      status
      completedAt
    }
  }
`;

const GET_ALERTS = gql`
  query GetAlerts($teamId: ID!, $status: String) {
    getAlerts(teamId: $teamId, status: $status) {
      id
      message
      triggerAt
      triggerType
      status
      channelId
      createdAt
    }
  }
`;

const SNOOZE_ALERT = gql`
  mutation SnoozeAlert($alertId: ID!, $until: DateTime!) {
    snoozeAlert(alertId: $alertId, until: $until) {
      id
      status
      snoozedUntil
    }
  }
`;

const CANCEL_ALERT = gql`
  mutation CancelAlert($alertId: ID!) {
    cancelAlert(alertId: $alertId) {
      id
      status
    }
  }
`;

const ASK_COMPANY = gql`
  query AskCompany($teamId: ID!, $input: AskCompanyInput!) {
    askCompany(teamId: $teamId, input: $input) {
      answer
      confidence
      suggestedFollowups
      factsUsed {
        id
        content
        category
      }
    }
  }
`;

const GET_TEAM_QUESTIONS = gql`
  query GetTeamQuestions($teamId: ID!, $status: String) {
    getTeamQuestions(teamId: $teamId, status: $status) {
      id
      question
      aiAnswer
      aiConfidence
      status
      answer
      answeredAt
      askedByUser {
        id
        displayName
        email
      }
      answeredByUser {
        id
        displayName
      }
      assignees {
        id
        displayName
        email
      }
      createdAt
    }
  }
`;

const CREATE_TEAM_QUESTION = gql`
  mutation CreateTeamQuestion($teamId: ID!, $input: CreateTeamQuestionInput!) {
    createTeamQuestion(teamId: $teamId, input: $input) {
      id
      question
      status
    }
  }
`;

const ANSWER_TEAM_QUESTION = gql`
  mutation AnswerTeamQuestion($questionId: ID!, $input: AnswerTeamQuestionInput!) {
    answerTeamQuestion(questionId: $questionId, input: $input) {
      id
      answer
      status
      answeredAt
    }
  }
`;

const GET_DAILY_DIGEST = gql`
  query GetDailyDigest($teamId: ID!) {
    getDailyDigest(teamId: $teamId) {
      teamId
      date
      overdueTasks {
        id
        title
        dueAt
      }
      dueTodayTasks {
        id
        title
        dueAt
      }
      recentDecisions {
        id
        what
        why
      }
      activitySummary
    }
  }
`;

// Goals queries
const GET_GOALS = gql`
  query GetGoals($teamId: ID!, $status: String) {
    getGoals(teamId: $teamId, status: $status) {
      id
      title
      description
      targetDate
      startDate
      status
      progress
      taskCount
      completedTaskCount
      owner {
        id
        displayName
        email
      }
      projects {
        id
        name
        status
        taskCount
        completedTaskCount
      }
    }
  }
`;

const CREATE_GOAL = gql`
  mutation CreateGoal($teamId: ID!, $input: CreateGoalInput!) {
    createGoal(teamId: $teamId, input: $input) {
      id
      title
      description
      status
      progress
    }
  }
`;

const UPDATE_GOAL = gql`
  mutation UpdateGoal($goalId: ID!, $input: UpdateGoalInput!) {
    updateGoal(goalId: $goalId, input: $input) {
      id
      title
      status
      progress
    }
  }
`;

// Projects queries
const GET_PROJECTS = gql`
  query GetProjects($teamId: ID!, $goalId: ID) {
    getProjects(teamId: $teamId, goalId: $goalId) {
      id
      name
      description
      status
      color
      dueDate
      goalsInherit
      taskCount
      completedTaskCount
      goals {
        id
        title
        status
      }
      owner {
        id
        displayName
      }
    }
  }
`;

const CREATE_PROJECT = gql`
  mutation CreateProject($teamId: ID!, $input: CreateProjectInput!) {
    createProject(teamId: $teamId, input: $input) {
      id
      name
      description
      status
      color
      goalsInherit
    }
  }
`;

const SET_PROJECT_GOALS = gql`
  mutation SetProjectGoals($projectId: ID!, $goalIds: [ID!]!) {
    setProjectGoals(projectId: $projectId, goalIds: $goalIds) {
      id
      title
    }
  }
`;

const SET_TASK_GOALS = gql`
  mutation SetTaskGoals($taskId: ID!, $goalIds: [ID!]!) {
    setTaskGoals(taskId: $taskId, goalIds: $goalIds) {
      id
      title
    }
  }
`;

// Task detail with comments
const GET_TASK_DETAIL = gql`
  query GetTask($taskId: ID!) {
    getTask(taskId: $taskId) {
      id
      title
      description
      status
      priority
      dueAt
      startDate
      estimatedHours
      actualHours
      tags
      assignedToUser {
        id
        displayName
        email
      }
      createdByUser {
        id
        displayName
      }
      project {
        id
        name
        color
        goalsInherit
      }
      goals {
        id
        title
        status
        linkType
      }
      directGoals {
        id
        title
        status
      }
      comments {
        id
        content
        createdAt
        user {
          id
          displayName
          email
        }
      }
      activity {
        id
        action
        oldValue
        newValue
        createdAt
        user {
          id
          displayName
        }
      }
      createdAt
      updatedAt
    }
  }
`;

const ADD_TASK_COMMENT = gql`
  mutation AddTaskComment($taskId: ID!, $input: CreateTaskCommentInput!) {
    addTaskComment(taskId: $taskId, input: $input) {
      id
      content
      createdAt
      user {
        id
        displayName
      }
    }
  }
`;

const REOPEN_TASK = gql`
  mutation ReopenTask($taskId: ID!) {
    reopenTask(taskId: $taskId) {
      id
      status
      completedAt
    }
  }
`;

// ============================================================================
// TeamDashboard Component
// ============================================================================

function TeamDashboard({ teamId, initialView, initialItemId, user, onSignOut }) {
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Determine initial view from URL or default to 'chat'
  const getInitialView = () => {
    if (initialView === 'tasks' || initialView === 'goals' || initialView === 'ask') {
      return initialView;
    }
    if (initialView === 'channel' || initialView === 'chat') {
      return 'chat';
    }
    return 'chat';
  };

  // UI state
  const [messageInput, setMessageInput] = useState('');
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteSending, setInviteSending] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState(null);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [activeView, setActiveViewState] = useState(getInitialView);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProjectId, setNewTaskProjectId] = useState('');
  const [newTaskGoalId, setNewTaskGoalId] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [statusPopupTaskId, setStatusPopupTaskId] = useState(null);
  const [taskFilter, setTaskFilter] = useState('open'); // 'open', 'my', 'all'
  const [addingTask, setAddingTask] = useState(false);
  const taskInputRef = useRef(null);
  // Q&A state
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askHistory, setAskHistory] = useState([]);
  // Team questions state (for low-confidence answers)
  const [showPostQuestion, setShowPostQuestion] = useState(false);
  const [questionContext, setQuestionContext] = useState('');
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const [showOpenQuestions, setShowOpenQuestions] = useState(false);
  const [answeringQuestionId, setAnsweringQuestionId] = useState(null);
  const [questionAnswerText, setQuestionAnswerText] = useState('');
  // @mentions autocomplete state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(null);
  // @ravenloom command suggestions state
  const [showCommands, setShowCommands] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  // Reply-to state
  const [replyingTo, setReplyingTo] = useState(null);
  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Sidebar tree expansion state
  const [expandedSections, setExpandedSections] = useState({
    channels: true,
    tasks: false,
    goals: false,
    projects: false
  });
  // Goals state
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalTargetDate, setNewGoalTargetDate] = useState('');
  // Task detail panel state
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [taskComment, setTaskComment] = useState('');
  // Projects state
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectGoalId, setNewProjectGoalId] = useState('');
  const [newProjectDueDate, setNewProjectDueDate] = useState('');

  // Active channel (from URL itemId when view is chat/channel)
  const [activeChannelIdState, setActiveChannelIdState] = useState(
    (initialView === 'channel' || initialView === 'chat') ? initialItemId : null
  );

  // Wrapper to update URL when view changes
  const setActiveView = (view, itemId = null) => {
    setActiveViewState(view);

    // Build the new URL
    let newPath = `/team/${teamId}`;
    if (view === 'chat' && itemId) {
      newPath = `/team/${teamId}/channel/${itemId}`;
    } else if (view !== 'chat') {
      newPath = `/team/${teamId}/${view}`;
      if (itemId) {
        newPath += `/${itemId}`;
      }
    }

    // Update URL without full navigation
    navigate(newPath, { replace: true });
  };

  // Raven command suggestions
  const ravenCommands = [
    { cmd: '@raven remember', desc: 'Save a fact to knowledge base', example: '@raven remember our API rate limit is 100/min' },
    { cmd: '@raven task', desc: 'Create a new task', example: '@raven task Review PR #123' },
    { cmd: '@raven remind', desc: 'Set a reminder', example: '@raven remind me tomorrow to follow up' },
    { cmd: '@raven decide', desc: 'Record a decision', example: '@raven decide We will use PostgreSQL because...' },
    { cmd: '@raven summarize', desc: 'Summarize recent discussion', example: '@raven summarize' },
    { cmd: '@raven search', desc: 'Search knowledge base', example: '@raven search deployment process' },
    { cmd: '@raven status', desc: 'Get project status', example: '@raven status' },
    { cmd: '@raven help', desc: 'Show available commands', example: '@raven help' },
  ];

  // Fetch team data
  const { data: teamData, loading: teamLoading, refetch: refetchTeam } = useQuery(GET_TEAM, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  });

  const team = teamData?.getTeam;
  const channels = team?.channels || [];

  // Determine active channel - use state, URL itemId, or default
  const activeChannelId = activeChannelIdState ||
    ((initialView === 'channel' || !initialView) ? initialItemId : null) ||
    channels.find(c => c.isDefault)?.id ||
    channels[0]?.id;
  const activeChannel = channels.find(c => c.id === activeChannelId);

  // Fetch messages for active channel
  const { data: messagesData, loading: messagesLoading, refetch: refetchMessages } = useQuery(GET_MESSAGES, {
    variables: { channelId: activeChannelId, limit: 50 },
    skip: !activeChannelId,
    fetchPolicy: 'cache-and-network',
    pollInterval: 3000 // Poll every 3 seconds for new messages
  });

  const messages = messagesData?.getMessages || [];

  // Fetch team invites
  const { data: invitesData, refetch: refetchInvites } = useQuery(GET_TEAM_INVITES, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  });
  const pendingInvites = invitesData?.getTeamInvites || [];

  // Fetch tasks
  const taskQueryVars = { teamId };
  if (taskFilter === 'my') {
    taskQueryVars.assignedTo = user?.uid;
  } else if (taskFilter === 'open') {
    taskQueryVars.status = null; // Get all, filter in UI
  }

  const { data: tasksData, refetch: refetchTasks } = useQuery(GET_TASKS, {
    variables: taskQueryVars,
    fetchPolicy: 'cache-and-network',
    pollInterval: 10000 // Refresh every 10 seconds
  });

  const allTasks = tasksData?.getTasks || [];
  const tasks = taskFilter === 'open'
    ? allTasks.filter(t => t.status !== 'done')
    : taskFilter === 'my'
    ? allTasks.filter(t => t.assignedTo === user?.uid)
    : allTasks;

  // Fetch pending alerts
  const { data: alertsData, refetch: refetchAlerts } = useQuery(GET_ALERTS, {
    variables: { teamId, status: 'pending' },
    fetchPolicy: 'cache-and-network',
    pollInterval: 30000 // Check every 30 seconds
  });
  const pendingAlerts = alertsData?.getAlerts || [];

  // Fetch goals (always fetch for goal selectors throughout app)
  const { data: goalsData, refetch: refetchGoals } = useQuery(GET_GOALS, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  });
  const goals = goalsData?.getGoals || [];

  // Fetch projects
  const { data: projectsData, refetch: refetchProjects } = useQuery(GET_PROJECTS, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  });
  const projects = projectsData?.getProjects || [];

  // Fetch selected task details
  const { data: taskDetailData, refetch: refetchTaskDetail } = useQuery(GET_TASK_DETAIL, {
    variables: { taskId: selectedTaskId },
    skip: !selectedTaskId,
    fetchPolicy: 'cache-and-network'
  });
  const selectedTask = taskDetailData?.getTask;

  // Mutations
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [createChannel] = useMutation(CREATE_CHANNEL);
  const [inviteTeamMember] = useMutation(INVITE_TEAM_MEMBER);
  const [createTaskDirect] = useMutation(CREATE_TASK_DIRECT);
  const [updateTask] = useMutation(UPDATE_TASK);
  const [completeTask] = useMutation(COMPLETE_TASK);
  const [reopenTask] = useMutation(REOPEN_TASK);
  const [snoozeAlert] = useMutation(SNOOZE_ALERT);
  const [cancelAlert] = useMutation(CANCEL_ALERT);
  const [createGoal] = useMutation(CREATE_GOAL);
  const [updateGoal] = useMutation(UPDATE_GOAL);
  const [createProject] = useMutation(CREATE_PROJECT);
  const [addTaskComment] = useMutation(ADD_TASK_COMMENT);
  const [setProjectGoals] = useMutation(SET_PROJECT_GOALS);
  const [setTaskGoals] = useMutation(SET_TASK_GOALS);
  const [executeAskCompany] = useLazyQuery(ASK_COMPANY, {
    fetchPolicy: 'network-only'
  });

  // Team questions - with error handling for when table doesn't exist
  const { data: questionsData, refetch: refetchQuestions, error: questionsError } = useQuery(GET_TEAM_QUESTIONS, {
    variables: { teamId, status: showOpenQuestions ? 'open' : null },
    skip: !teamId || activeView !== 'ask',
    errorPolicy: 'all'
  });
  const teamQuestions = questionsData?.getTeamQuestions || [];
  const teamQuestionsAvailable = !questionsError;

  const [createTeamQuestion] = useMutation(CREATE_TEAM_QUESTION);
  const [answerTeamQuestion] = useMutation(ANSWER_TEAM_QUESTION);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on channel change
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChannelId]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Don't trigger shortcuts if typing in an input
      const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

      // "/" to focus message input (when not already typing)
      if (e.key === '/' && !isTyping && activeView === 'chat') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // "Escape" to close popups or cancel reply
      if (e.key === 'Escape') {
        if (showMentions) {
          setShowMentions(false);
        } else if (showCommands) {
          setShowCommands(false);
        } else if (replyingTo) {
          setReplyingTo(null);
        } else if (showCreateChannel) {
          setShowCreateChannel(false);
        } else if (showInviteModal) {
          setShowInviteModal(false);
        }
        return;
      }

      // Cmd/Ctrl + Enter to send (when in input)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isTyping) {
        // Form submit will handle this
        return;
      }

      // Keyboard navigation between views
      if (e.altKey && !isTyping) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveView('chat');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveView('tasks');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveView('ask');
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeView, showMentions, showCommands, replyingTo, showCreateChannel, showInviteModal]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || isSending) return;

    // Don't submit if selecting from popup
    if (showMentions || showCommands) return;

    let content = messageInput.trim();
    const replyToMessageId = replyingTo?.id || null;

    // Prepend reply context if replying (for display purposes)
    if (replyingTo) {
      const replyAuthor = replyingTo.isAi ? 'Raven' : (replyingTo.user?.displayName || replyingTo.user?.email || 'User');
      const replyPreview = replyingTo.content.substring(0, 50) + (replyingTo.content.length > 50 ? '...' : '');
      content = `> Replying to ${replyAuthor}: "${replyPreview}"\n\n${content}`;
    }

    setMessageInput('');
    setReplyingTo(null);
    setIsSending(true);

    try {
      await sendMessage({
        variables: {
          channelId: activeChannelId,
          input: { content, replyToMessageId }
        }
      });
      await refetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      setMessageInput(messageInput); // Restore original message on error
      alert('Failed to send message: ' + error.message);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    try {
      const { data } = await createChannel({
        variables: {
          teamId,
          input: { name: newChannelName.trim() }
        }
      });

      setShowCreateChannel(false);
      setNewChannelName('');
      await refetchTeam();
      navigate(`/team/${teamId}/channel/${data.createChannel.id}`);
    } catch (error) {
      console.error('Error creating channel:', error);
      alert('Failed to create channel: ' + error.message);
    }
  };

  const handleSelectChannel = (id) => {
    setActiveChannelIdState(id);
    setActiveView('chat', id);
    setSidebarOpen(false); // Close sidebar on mobile after selection
  };

  const handleBackToTeams = () => {
    navigate('/');
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || inviteSending) return;

    setInviteSending(true);
    try {
      const { data } = await inviteTeamMember({
        variables: {
          teamId,
          input: { email: inviteEmail.trim(), role: inviteRole }
        }
      });

      // Generate invite link
      const baseUrl = window.location.origin;
      const inviteLink = `${baseUrl}/invite/${data.inviteTeamMember.token}`;
      setLastInviteLink(inviteLink);
      setInviteEmail('');
      setInviteRole('member');
      await refetchInvites();
    } catch (error) {
      console.error('Error inviting member:', error);
      alert('Failed to send invite: ' + error.message);
    } finally {
      setInviteSending(false);
    }
  };

  const copyInviteLink = async () => {
    if (lastInviteLink) {
      await navigator.clipboard.writeText(lastInviteLink);
      alert('Invite link copied to clipboard!');
    }
  };

  const handleCreateTask = async (e) => {
    e?.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      await createTaskDirect({
        variables: {
          teamId,
          input: {
            title: newTaskTitle.trim(),
            priority: 'medium',
            channelId: activeChannelId,
            projectId: newTaskProjectId || null,
            goalIds: newTaskGoalId ? [newTaskGoalId] : [],
            dueAt: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null
          }
        }
      });

      setNewTaskTitle('');
      setNewTaskProjectId('');
      setNewTaskGoalId('');
      setNewTaskDueDate('');
      setAddingTask(false);
      await refetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task: ' + error.message);
    }
  };

  // Focus task input when adding
  useEffect(() => {
    if (addingTask && taskInputRef.current) {
      taskInputRef.current.focus();
    }
  }, [addingTask]);

  // Handle task input keyboard
  const handleTaskInputKeyDown = (e) => {
    if (e.key === 'Enter' && newTaskTitle.trim()) {
      handleCreateTask();
    } else if (e.key === 'Escape') {
      setNewTaskTitle('');
      setAddingTask(false);
    }
  };

  // Group tasks by status for Asana-like sections
  const backlogTasks = tasks.filter(t => t.status === 'backlog');
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const blockedTasks = tasks.filter(t => t.status === 'blocked');
  const doneTasks = tasks.filter(t => t.status === 'done');

  // Status icons and colors
  const statusConfig = {
    backlog: { icon: '📋', label: 'Backlog', color: 'var(--text-muted)' },
    todo: { icon: '○', label: 'To Do', color: 'var(--text-muted)' },
    in_progress: { icon: '◐', label: 'In Progress', color: 'var(--cta)' },
    blocked: { icon: '⛔', label: 'Blocked', color: 'var(--pop)' },
    done: { icon: '✓', label: 'Done', color: 'var(--success)' }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    setStatusPopupTaskId(null);
    try {
      if (newStatus === 'done') {
        await completeTask({ variables: { taskId } });
      } else {
        await updateTask({
          variables: {
            taskId,
            input: { status: newStatus }
          }
        });
      }
      await refetchTasks();
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const handleToggleTaskStatus = async (task) => {
    try {
      if (task.status === 'done') {
        // Reopen - set to todo
        await updateTask({
          variables: {
            taskId: task.id,
            input: { status: 'todo' }
          }
        });
      } else if (task.status === 'todo') {
        // Start - set to in_progress
        await updateTask({
          variables: {
            taskId: task.id,
            input: { status: 'in_progress' }
          }
        });
      } else {
        // Complete
        await completeTask({
          variables: { taskId: task.id }
        });
      }
      await refetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleCompleteTask = async (taskId) => {
    try {
      await completeTask({
        variables: { taskId }
      });
      await refetchTasks();
    } catch (error) {
      console.error('Error completing task:', error);
    }
  };

  const handleAskCompany = async (e) => {
    e.preventDefault();
    if (!askQuestion.trim() || askLoading) return;

    const question = askQuestion.trim();
    setAskLoading(true);
    setAskAnswer(null);

    try {
      const { data } = await executeAskCompany({
        variables: {
          teamId,
          input: { question }
        }
      });

      const result = data.askCompany;
      setAskAnswer(result);

      // Add to history
      setAskHistory(prev => [{
        question,
        answer: result.answer,
        confidence: result.confidence,
        factsUsed: result.factsUsed,
        suggestedFollowups: result.suggestedFollowups,
        timestamp: new Date()
      }, ...prev.slice(0, 9)]);

      setAskQuestion('');
    } catch (error) {
      console.error('Error asking company:', error);
      setAskAnswer({
        answer: 'Sorry, I encountered an error. Please try again.',
        confidence: 0,
        factsUsed: [],
        suggestedFollowups: []
      });
    } finally {
      setAskLoading(false);
    }
  };

  const handleFollowupQuestion = (question) => {
    setAskQuestion(question);
    // Auto-submit the followup
    setTimeout(() => {
      document.getElementById('ask-form')?.requestSubmit();
    }, 100);
  };

  // Post a question to the team when Raven doesn't have a confident answer
  const handlePostQuestion = async () => {
    if (!askAnswer || !askHistory.length) return;

    const lastQuestion = askHistory[0];
    try {
      await createTeamQuestion({
        variables: {
          teamId,
          input: {
            question: lastQuestion.question,
            aiAnswer: lastQuestion.answer,
            aiConfidence: lastQuestion.confidence,
            context: questionContext || null,
            assigneeIds: selectedAssignees
          }
        }
      });

      setShowPostQuestion(false);
      setQuestionContext('');
      setSelectedAssignees([]);
      refetchQuestions();

      // Show success feedback
      setAskAnswer({
        ...askAnswer,
        posted: true
      });
    } catch (error) {
      console.error('Error posting question:', error);
      alert('Failed to post question: ' + error.message);
    }
  };

  // Answer a posted team question
  const handleAnswerQuestion = async (questionId) => {
    if (!questionAnswerText.trim()) return;

    try {
      await answerTeamQuestion({
        variables: {
          questionId,
          input: {
            answer: questionAnswerText.trim(),
            addToKnowledge: true
          }
        }
      });

      setAnsweringQuestionId(null);
      setQuestionAnswerText('');
      refetchQuestions();
    } catch (error) {
      console.error('Error answering question:', error);
      alert('Failed to submit answer: ' + error.message);
    }
  };

  // Handle message input change with @mention detection
  const handleMessageInputChange = (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setMessageInput(value);

    // Find @ symbol before cursor
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      // Check if @ is at start or preceded by whitespace
      const charBefore = lastAtIndex > 0 ? value[lastAtIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
        const query = textBeforeCursor.substring(lastAtIndex + 1).toLowerCase();

        // Check if typing @raven command
        if (query.startsWith('raven') || query === 'r' || query === 'ra' || query === 'rav' || query === 'rave') {
          // Show command suggestions if @raven is mostly typed
          if (query.length >= 5 && query.startsWith('raven')) {
            const afterRaven = query.substring(5).trim();
            if (afterRaven === '' || afterRaven.startsWith(' ')) {
              setShowCommands(true);
              setShowMentions(false);
              setCommandIndex(0);
              return;
            }
          }
        }

        // Show mentions popup
        if (!query.includes(' ') && query.length < 20) {
          setMentionQuery(query);
          setMentionStartPos(lastAtIndex);
          setShowMentions(true);
          setShowCommands(false);
          setMentionIndex(0);
          return;
        }
      }
    }

    // Hide popups if no valid @ found
    setShowMentions(false);
    setShowCommands(false);
  };

  // Get filtered mention options
  const getMentionOptions = () => {
    const members = team?.members || [];
    const options = [
      // Always include @raven at the top
      { type: 'ai', id: 'raven', name: 'Raven', displayName: 'Raven (AI Assistant)', isAi: true }
    ];

    // Add team members
    members.forEach(member => {
      if (member.user) {
        options.push({
          type: 'user',
          id: member.userId,
          name: member.user.displayName || member.user.email?.split('@')[0] || 'User',
          displayName: member.user.displayName || member.user.email,
          email: member.user.email,
          isAi: false
        });
      }
    });

    // Filter by query
    if (mentionQuery) {
      return options.filter(opt =>
        opt.name.toLowerCase().includes(mentionQuery) ||
        opt.displayName.toLowerCase().includes(mentionQuery) ||
        (opt.email && opt.email.toLowerCase().includes(mentionQuery))
      );
    }
    return options;
  };

  // Select a mention from popup
  const handleSelectMention = (option) => {
    const beforeAt = messageInput.substring(0, mentionStartPos);
    const afterQuery = messageInput.substring(mentionStartPos + 1 + mentionQuery.length);
    const mentionText = option.isAi ? '@raven ' : `@${option.name} `;
    const newValue = beforeAt + mentionText + afterQuery;
    setMessageInput(newValue);
    setShowMentions(false);
    setMentionQuery('');
    setMentionStartPos(null);

    // Focus input and set cursor after mention
    setTimeout(() => {
      inputRef.current?.focus();
      const newCursorPos = beforeAt.length + mentionText.length;
      inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);

    // If @raven selected, show commands
    if (option.isAi) {
      setTimeout(() => setShowCommands(true), 100);
    }
  };

  // Select a command from popup
  const handleSelectCommand = (command) => {
    // Find @raven in the input and replace with command
    const ravenMatch = messageInput.match(/@raven\s*/i);
    if (ravenMatch) {
      const ravenIndex = messageInput.toLowerCase().indexOf('@raven');
      const beforeRaven = messageInput.substring(0, ravenIndex);
      const afterRaven = messageInput.substring(ravenIndex + ravenMatch[0].length);
      const newValue = beforeRaven + command.cmd + ' ' + afterRaven.trimStart();
      setMessageInput(newValue);

      // Set cursor at end of command
      setTimeout(() => {
        inputRef.current?.focus();
        const newCursorPos = beforeRaven.length + command.cmd.length + 1;
        inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
    setShowCommands(false);
    setCommandIndex(0);
  };

  // Handle keyboard navigation in popups
  const handleInputKeyDown = (e) => {
    const mentionOptions = getMentionOptions();

    if (showMentions && mentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % mentionOptions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + mentionOptions.length) % mentionOptions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMention(mentionOptions[mentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
      return;
    }

    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandIndex(i => (i + 1) % ravenCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandIndex(i => (i - 1 + ravenCommands.length) % ravenCommands.length);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // Only select command if just @raven with no content after
        const afterRaven = messageInput.toLowerCase().replace(/@raven\s*/, '').trim();
        if (afterRaven === '') {
          e.preventDefault();
          handleSelectCommand(ravenCommands[commandIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        setShowCommands(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        handleSelectCommand(ravenCommands[commandIndex]);
      }
    }
  };

  // Handle reply to message
  const handleReplyTo = (message) => {
    setReplyingTo(message);
    inputRef.current?.focus();
  };

  // Cancel reply
  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  // Toggle sidebar section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Handle section item click - expand section and set view
  const handleSectionItemClick = (section, view) => {
    setActiveView(view);
    if (section === 'goals') {
      refetchGoals();
    }
    setSidebarOpen(false); // Close mobile sidebar
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (teamLoading && !team) {
    return (
      <div className="app-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading team...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="app-container">
        <div className="error-screen">
          <p>Team not found</p>
          <button onClick={handleBackToTeams} className="btn-primary">
            Back to Teams
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="team-dashboard">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Team Header */}
        <div className="sidebar-header">
          <button onClick={handleBackToTeams} className="back-btn">←</button>
          <h2 className="team-name">{team.name}</h2>
        </div>

        {/* Tree Navigation */}
        <nav className="nav-tree">
          {/* Channels Section */}
          <div className={`nav-section ${expandedSections.channels ? 'expanded' : ''}`}>
            <button
              className={`nav-section-header ${activeView === 'chat' ? 'active' : ''}`}
              onClick={() => toggleSection('channels')}
            >
              <span className="nav-expand-icon">{expandedSections.channels ? '▼' : '▶'}</span>
              <span className="nav-icon">💬</span>
              <span className="nav-label">Channels</span>
              {channels.length > 0 && <span className="nav-count">{channels.length}</span>}
            </button>
            {expandedSections.channels && (
              <div className="nav-children">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    className={`nav-item ${channel.id === activeChannelId && activeView === 'chat' ? 'active' : ''}`}
                    onClick={() => {
                      handleSelectChannel(channel.id);
                      setActiveView('chat');
                    }}
                  >
                    <span className="nav-item-icon">#</span>
                    <span className="nav-item-label">{channel.name}</span>
                  </button>
                ))}
                <button
                  className="nav-item nav-action"
                  onClick={() => setShowCreateChannel(true)}
                >
                  <span className="nav-item-icon">+</span>
                  <span className="nav-item-label">New Channel</span>
                </button>
              </div>
            )}
          </div>

          {/* Tasks Section */}
          <div className={`nav-section ${expandedSections.tasks ? 'expanded' : ''}`}>
            <button
              className={`nav-section-header ${activeView === 'tasks' ? 'active' : ''}`}
              onClick={() => toggleSection('tasks')}
            >
              <span className="nav-expand-icon">{expandedSections.tasks ? '▼' : '▶'}</span>
              <span className="nav-icon">✓</span>
              <span className="nav-label">Tasks</span>
              {tasks.length > 0 && <span className="nav-count">{tasks.length}</span>}
            </button>
            {expandedSections.tasks && (
              <div className="nav-children">
                <button
                  className={`nav-item ${activeView === 'tasks' && taskFilter === 'open' ? 'active' : ''}`}
                  onClick={() => {
                    handleSectionItemClick('tasks', 'tasks');
                    setTaskFilter('open');
                  }}
                >
                  <span className="nav-item-icon">○</span>
                  <span className="nav-item-label">Open Tasks</span>
                  {allTasks.filter(t => t.status !== 'done').length > 0 && (
                    <span className="nav-item-count">{allTasks.filter(t => t.status !== 'done').length}</span>
                  )}
                </button>
                <button
                  className={`nav-item ${activeView === 'tasks' && taskFilter === 'my' ? 'active' : ''}`}
                  onClick={() => {
                    handleSectionItemClick('tasks', 'tasks');
                    setTaskFilter('my');
                  }}
                >
                  <span className="nav-item-icon">👤</span>
                  <span className="nav-item-label">My Tasks</span>
                </button>
                <button
                  className={`nav-item ${activeView === 'tasks' && taskFilter === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    handleSectionItemClick('tasks', 'tasks');
                    setTaskFilter('all');
                  }}
                >
                  <span className="nav-item-icon">☰</span>
                  <span className="nav-item-label">All Tasks</span>
                </button>
                <button
                  className="nav-item nav-action"
                  onClick={() => {
                    setActiveView('tasks');
                    setAddingTask(true);
                    setSidebarOpen(false);
                  }}
                >
                  <span className="nav-item-icon">+</span>
                  <span className="nav-item-label">New Task</span>
                </button>
              </div>
            )}
          </div>

          {/* Goals Section */}
          <div className={`nav-section ${expandedSections.goals ? 'expanded' : ''}`}>
            <button
              className={`nav-section-header ${activeView === 'goals' ? 'active' : ''}`}
              onClick={() => toggleSection('goals')}
            >
              <span className="nav-expand-icon">{expandedSections.goals ? '▼' : '▶'}</span>
              <span className="nav-icon">🎯</span>
              <span className="nav-label">Goals</span>
              {goals.length > 0 && <span className="nav-count">{goals.length}</span>}
            </button>
            {expandedSections.goals && (
              <div className="nav-children">
                <button
                  className={`nav-item ${activeView === 'goals' ? 'active' : ''}`}
                  onClick={() => handleSectionItemClick('goals', 'goals')}
                >
                  <span className="nav-item-icon">📊</span>
                  <span className="nav-item-label">All Goals</span>
                </button>
                <button
                  className="nav-item nav-action"
                  onClick={() => {
                    setActiveView('goals');
                    setShowCreateGoal(true);
                    refetchGoals();
                    setSidebarOpen(false);
                  }}
                >
                  <span className="nav-item-icon">+</span>
                  <span className="nav-item-label">New Goal</span>
                </button>
              </div>
            )}
          </div>

          {/* Projects Section */}
          <div className={`nav-section ${expandedSections.projects ? 'expanded' : ''}`}>
            <button
              className={`nav-section-header ${activeView === 'projects' ? 'active' : ''}`}
              onClick={() => toggleSection('projects')}
            >
              <span className="nav-expand-icon">{expandedSections.projects ? '▼' : '▶'}</span>
              <span className="nav-icon">📁</span>
              <span className="nav-label">Projects</span>
              {projects.length > 0 && <span className="nav-count">{projects.length}</span>}
            </button>
            {expandedSections.projects && (
              <div className="nav-children">
                <button
                  className={`nav-item ${activeView === 'projects' ? 'active' : ''}`}
                  onClick={() => handleSectionItemClick('projects', 'projects')}
                >
                  <span className="nav-item-icon">📊</span>
                  <span className="nav-item-label">All Projects</span>
                </button>
                <button
                  className="nav-item nav-action"
                  onClick={() => {
                    setActiveView('projects');
                    setShowCreateProject(true);
                    refetchProjects();
                    setSidebarOpen(false);
                  }}
                >
                  <span className="nav-item-icon">+</span>
                  <span className="nav-item-label">New Project</span>
                </button>
              </div>
            )}
          </div>

          {/* Ask - No expansion needed */}
          <div className="nav-section">
            <button
              className={`nav-section-header nav-single ${activeView === 'ask' ? 'active' : ''}`}
              onClick={() => handleSectionItemClick('ask', 'ask')}
            >
              <span className="nav-expand-icon" style={{ visibility: 'hidden' }}>▶</span>
              <span className="nav-icon">🔍</span>
              <span className="nav-label">Ask the Team</span>
            </button>
          </div>

          {/* Alerts indicator */}
          {pendingAlerts.length > 0 && (
            <div className="nav-alerts">
              <span className="nav-alerts-icon">🔔</span>
              <span className="nav-alerts-text">{pendingAlerts.length} pending reminder{pendingAlerts.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </nav>

        {/* Sidebar Footer - Team & Settings */}
        <div className="sidebar-footer">
          {/* Team Members Preview */}
          <div className="footer-team">
            <div className="footer-team-header">
              <span className="footer-label">Team ({team.members?.length || 0})</span>
              <button
                onClick={() => setShowInviteModal(true)}
                className="footer-add-btn"
                title="Invite member"
              >
                +
              </button>
            </div>
            <div className="footer-avatars">
              {team.members?.slice(0, 4).map((member) => (
                <span
                  key={member.id}
                  className="footer-avatar"
                  title={member.user?.displayName || member.user?.email}
                >
                  {(member.user?.displayName || member.user?.email || '?')[0].toUpperCase()}
                </span>
              ))}
              {(team.members?.length || 0) > 4 && (
                <span className="footer-avatar footer-avatar-more">
                  +{team.members.length - 4}
                </span>
              )}
            </div>
          </div>

          {/* Help Link */}
          <button
            className="footer-help-btn"
            onClick={() => navigate('/help')}
            title="Help & Guide"
          >
            <span>?</span>
            <span>Help</span>
          </button>

          {/* User Info & Sign Out */}
          <div className="footer-user">
            <div className="user-info">
              <span className="user-avatar">
                {(user.displayName || user.email || 'U')[0].toUpperCase()}
              </span>
              <span className="user-name">{user.displayName || user.email}</span>
            </div>
            <button onClick={onSignOut} className="sign-out-btn" title="Sign out">
              ↪
            </button>
          </div>
        </div>
      </aside>

      {/* Modals */}
      {/* Create Channel Modal */}
      {showCreateChannel && (
        <div className="modal-overlay" onClick={() => setShowCreateChannel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Channel</h3>
            <form onSubmit={handleCreateChannel}>
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="channel-name"
                autoFocus
                className="input-field"
              />
              <div className="form-actions">
                <button type="submit" className="btn-primary">Create</button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateChannel(false);
                    setNewChannelName('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => { setShowInviteModal(false); setLastInviteLink(null); }}>
          <div className="modal invite-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Invite Team Member</h3>

            {lastInviteLink ? (
              <div className="invite-success">
                <p>Invite created! Share this link:</p>
                <div className="invite-link-box">
                  <input
                    type="text"
                    value={lastInviteLink}
                    readOnly
                    className="input-field"
                  />
                  <button onClick={copyInviteLink} className="btn-primary">
                    Copy
                  </button>
                </div>
                <button
                  onClick={() => setLastInviteLink(null)}
                  className="btn-secondary"
                  style={{ marginTop: '10px' }}
                >
                  Invite Another
                </button>
              </div>
            ) : (
              <form onSubmit={handleInviteMember}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@example.com"
                  autoFocus
                  className="input-field"
                  required
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="input-field"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={inviteSending}
                  >
                    {inviteSending ? 'Sending...' : 'Send Invite'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteEmail('');
                      setLastInviteLink(null);
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {activeView === 'chat' ? (
        <main className="chat-area">
          {/* Channel Header */}
          <header className="chat-header">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <h3># {activeChannel?.name || 'Select a channel'}</h3>
            {activeChannel?.description && (
              <p className="channel-description">{activeChannel.description}</p>
            )}
          </header>

          {/* Messages */}
          <div className="messages-container">
            {messagesLoading && messages.length === 0 ? (
              <div className="messages-loading">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="messages-empty">
                <div className="empty-icon">💬</div>
                <h4>No messages yet</h4>
                <p>Start a conversation or ask Raven something</p>
                <div className="empty-suggestions">
                  <button className="suggestion-btn" onClick={() => setMessageInput('@raven remember ')}>
                    @raven remember...
                  </button>
                  <button className="suggestion-btn" onClick={() => setMessageInput('@raven ')}>
                    Ask Raven a question
                  </button>
                </div>
              </div>
            ) : (
              <div className="messages-list">
                {messages.map((message, index) => {
                  // Check if this message should be grouped with previous
                  const prevMessage = messages[index - 1];
                  const isGrouped = prevMessage &&
                    !message.isAi && !prevMessage.isAi &&
                    message.user?.id === prevMessage.user?.id &&
                    (new Date(message.createdAt) - new Date(prevMessage.createdAt)) < 5 * 60 * 1000; // 5 minutes

                  // Check if this is the start of a new group (for AI messages)
                  const isAiGrouped = prevMessage &&
                    message.isAi && prevMessage.isAi &&
                    (new Date(message.createdAt) - new Date(prevMessage.createdAt)) < 60 * 1000; // 1 minute for AI

                  const shouldShowHeader = !isGrouped && !isAiGrouped;

                  return (
                    <div
                      key={message.id}
                      className={`message ${message.isAi ? 'ai-message' : 'user-message'} ${!shouldShowHeader ? 'grouped' : ''}`}
                    >
                      {shouldShowHeader && (
                        <div className="message-header">
                          <span className="message-avatar">
                            {message.isAi ? '🪶' : (message.user?.displayName || message.user?.email || 'U')[0].toUpperCase()}
                          </span>
                          <span className="message-author">
                            {message.isAi ? 'Raven' : (message.user?.displayName || message.user?.email || 'User')}
                          </span>
                          <span className="message-time">
                            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                      <div className={`message-body ${!shouldShowHeader ? 'no-header' : ''}`}>
                        <div className="message-content">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                        <div className="message-actions">
                          <button
                            className="action-btn reply-btn"
                            onClick={() => handleReplyTo(message)}
                            title="Reply"
                          >
                            ↩
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="message-input-area">
            {/* Reply indicator */}
            {replyingTo && (
              <div className="reply-indicator">
                <span className="reply-icon">↩</span>
                <span className="reply-text">
                  Replying to {replyingTo.isAi ? 'Raven' : (replyingTo.user?.displayName || replyingTo.user?.email || 'User')}:
                  <span className="reply-preview">
                    {replyingTo.content.substring(0, 60)}{replyingTo.content.length > 60 ? '...' : ''}
                  </span>
                </span>
                <button className="reply-cancel" onClick={handleCancelReply} title="Cancel reply">×</button>
              </div>
            )}

            {/* @mentions popup */}
            {showMentions && (
              <div className="mention-popup">
                {getMentionOptions().length > 0 ? (
                  getMentionOptions().map((option, i) => (
                    <button
                      key={option.id}
                      className={`mention-option ${i === mentionIndex ? 'selected' : ''}`}
                      onClick={() => handleSelectMention(option)}
                      onMouseEnter={() => setMentionIndex(i)}
                    >
                      <span className={`mention-avatar ${option.isAi ? 'ai-avatar' : ''}`}>
                        {option.isAi ? '🪶' : option.name[0].toUpperCase()}
                      </span>
                      <span className="mention-name">{option.displayName}</span>
                      {option.isAi && <span className="mention-badge">AI</span>}
                    </button>
                  ))
                ) : (
                  <div className="mention-empty">No matches found</div>
                )}
              </div>
            )}

            {/* @ravenloom commands popup */}
            {showCommands && (
              <div className="commands-popup">
                <div className="commands-header">Raven Commands</div>
                {ravenCommands.map((cmd, i) => (
                  <button
                    key={cmd.cmd}
                    className={`command-option ${i === commandIndex ? 'selected' : ''}`}
                    onClick={() => handleSelectCommand(cmd)}
                    onMouseEnter={() => setCommandIndex(i)}
                  >
                    <span className="command-name">{cmd.cmd}</span>
                    <span className="command-desc">{cmd.desc}</span>
                  </button>
                ))}
                <div className="commands-hint">Press Tab or Enter to select, Esc to close</div>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="message-form">
              <input
                ref={inputRef}
                type="text"
                value={messageInput}
                onChange={handleMessageInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder={`Message #${activeChannel?.name || 'channel'}... (type @ to mention)`}
                disabled={isSending || !activeChannelId}
                className="message-input"
              />
              <button
                type="submit"
                disabled={isSending || !messageInput.trim() || !activeChannelId}
                className="send-btn"
              >
                {isSending ? '...' : 'Send'}
              </button>
            </form>
          </div>
        </main>
      ) : activeView === 'tasks' ? (
        <main className="tasks-area">
          {/* Tasks Header */}
          <header className="tasks-header">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <h3>Tasks</h3>
            <div className="tasks-filters">
              <button
                className={`filter-btn ${taskFilter === 'open' ? 'active' : ''}`}
                onClick={() => setTaskFilter('open')}
              >
                Open ({allTasks.filter(t => t.status !== 'done').length})
              </button>
              <button
                className={`filter-btn ${taskFilter === 'my' ? 'active' : ''}`}
                onClick={() => setTaskFilter('my')}
              >
                My Tasks
              </button>
              <button
                className={`filter-btn ${taskFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTaskFilter('all')}
              >
                All
              </button>
            </div>
          </header>

          {/* Tasks List */}
          <div className="tasks-container">
            {/* Inline Add Task */}
            <div className="task-add-section">
              {addingTask ? (
                <div className="task-add-form">
                  <div className="task-add-input-row">
                    <span className="task-add-icon">○</span>
                    <input
                      ref={taskInputRef}
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={handleTaskInputKeyDown}
                      placeholder="Write a task name..."
                      className="task-add-input"
                    />
                  </div>
                  <div className="task-add-options">
                    <select
                      className="task-add-select"
                      value={newTaskProjectId}
                      onChange={(e) => setNewTaskProjectId(e.target.value)}
                    >
                      <option value="">No project</option>
                      {projects.filter(p => p.status === 'active').map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      className="task-add-select"
                      value={newTaskGoalId}
                      onChange={(e) => setNewTaskGoalId(e.target.value)}
                    >
                      <option value="">No goal</option>
                      {goals.filter(g => g.status === 'active').map(g => (
                        <option key={g.id} value={g.id}>{g.title}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className="task-add-date"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      placeholder="Due date"
                    />
                  </div>
                  <div className="task-add-actions">
                    <button
                      className="task-cancel-btn"
                      onClick={() => { setAddingTask(false); setNewTaskTitle(''); setNewTaskProjectId(''); setNewTaskGoalId(''); setNewTaskDueDate(''); }}
                    >
                      Cancel
                    </button>
                    <button
                      className="task-add-btn"
                      onClick={handleCreateTask}
                      disabled={!newTaskTitle.trim()}
                    >
                      Add Task
                    </button>
                  </div>
                </div>
              ) : (
                <button className="task-add-trigger" onClick={() => setAddingTask(true)}>
                  <span className="task-add-icon">+</span>
                  <span>Add task...</span>
                </button>
              )}
            </div>

            {tasks.length === 0 && !addingTask ? (
              <div className="tasks-empty">
                <div className="tasks-empty-icon">✓</div>
                <h4>No tasks yet</h4>
                <p>Add a task above or use <code>@raven task</code> in chat</p>
                <div className="tasks-empty-suggestions">
                  <button className="suggestion-btn" onClick={() => setAddingTask(true)}>
                    Create your first task
                  </button>
                  <button className="suggestion-btn" onClick={() => { setActiveView('chat'); setMessageInput('@raven task '); }}>
                    Ask Raven to create a task
                  </button>
                </div>
              </div>
            ) : (
              <div className="tasks-sections">
                {/* Task Item Renderer */}
                {(() => {
                  const renderTaskItem = (task) => (
                    <div
                      key={task.id}
                      className={`task-item ${task.status} priority-${task.priority || 'medium'} ${selectedTaskId === task.id ? 'selected' : ''}`}
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <div className="task-content">
                        <span className="task-title">{task.title}</span>
                        <div className="task-meta">
                          {task.priority && task.priority !== 'medium' && (
                            <span className={`task-priority priority-${task.priority}`}>
                              {task.priority}
                            </span>
                          )}
                          {task.project && (
                            <span className="task-project">{task.project.name}</span>
                          )}
                          {task.assignedToUser && (
                            <span className="task-assignee">
                              {task.assignedToUser.displayName || task.assignedToUser.email}
                            </span>
                          )}
                          {task.dueAt && (
                            <span className={`task-due ${new Date(task.dueAt) < new Date() ? 'overdue' : ''}`}>
                              {new Date(task.dueAt).toLocaleDateString()}
                            </span>
                          )}
                          {task.status === 'done' && task.completedAt && (
                            <span className="task-completed-at">
                              Completed {new Date(task.completedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="task-status-wrapper">
                        <button
                          className={`task-status-icon ${task.status}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setStatusPopupTaskId(statusPopupTaskId === task.id ? null : task.id);
                          }}
                          title={statusConfig[task.status]?.label || task.status}
                        >
                          {statusConfig[task.status]?.icon || '○'}
                        </button>
                        {statusPopupTaskId === task.id && (
                          <div className="status-popup" onClick={(e) => e.stopPropagation()}>
                            {Object.entries(statusConfig).map(([status, config]) => (
                              <button
                                key={status}
                                className={`status-option ${task.status === status ? 'active' : ''}`}
                                onClick={() => handleStatusChange(task.id, status)}
                              >
                                <span className="status-option-icon" style={{ color: config.color }}>{config.icon}</span>
                                <span className="status-option-label">{config.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );

                  return (
                    <>
                      {/* Blocked Section */}
                      {blockedTasks.length > 0 && (
                        <div className="task-section">
                          <div className="task-section-header">
                            <span className="section-indicator blocked"></span>
                            <span className="section-title">Blocked</span>
                            <span className="section-count">{blockedTasks.length}</span>
                          </div>
                          <div className="tasks-list">
                            {blockedTasks.map(renderTaskItem)}
                          </div>
                        </div>
                      )}

                      {/* In Progress Section */}
                      {inProgressTasks.length > 0 && (
                        <div className="task-section">
                          <div className="task-section-header">
                            <span className="section-indicator in-progress"></span>
                            <span className="section-title">In Progress</span>
                            <span className="section-count">{inProgressTasks.length}</span>
                          </div>
                          <div className="tasks-list">
                            {inProgressTasks.map(renderTaskItem)}
                          </div>
                        </div>
                      )}

                      {/* To Do Section */}
                      {todoTasks.length > 0 && (
                        <div className="task-section">
                          <div className="task-section-header">
                            <span className="section-indicator todo"></span>
                            <span className="section-title">To Do</span>
                            <span className="section-count">{todoTasks.length}</span>
                          </div>
                          <div className="tasks-list">
                            {todoTasks.map(renderTaskItem)}
                          </div>
                        </div>
                      )}

                      {/* Backlog Section */}
                      {backlogTasks.length > 0 && (
                        <div className="task-section">
                          <div className="task-section-header">
                            <span className="section-indicator backlog"></span>
                            <span className="section-title">Backlog</span>
                            <span className="section-count">{backlogTasks.length}</span>
                          </div>
                          <div className="tasks-list">
                            {backlogTasks.map(renderTaskItem)}
                          </div>
                        </div>
                      )}

                      {/* Completed Section (only in "all" filter) */}
                      {taskFilter === 'all' && doneTasks.length > 0 && (
                        <div className="task-section completed-section">
                          <div className="task-section-header">
                            <span className="section-indicator done"></span>
                            <span className="section-title">Completed</span>
                            <span className="section-count">{doneTasks.length}</span>
                          </div>
                          <div className="tasks-list">
                            {doneTasks.map(renderTaskItem)}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </main>
      ) : activeView === 'ask' ? (
        <main className="ask-area">
          {/* Ask Header */}
          <header className="ask-header">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <h3>Ask the Team</h3>
            <p className="ask-subtitle">Ask questions about your team's knowledge base</p>
          </header>

          {/* Ask Form */}
          <form id="ask-form" onSubmit={handleAskCompany} className="ask-form">
            <input
              type="text"
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              placeholder="What would you like to know? (e.g., 'What's our manufacturing process?')"
              disabled={askLoading}
              className="ask-input"
            />
            <button
              type="submit"
              disabled={askLoading || !askQuestion.trim()}
              className="btn-primary"
            >
              {askLoading ? 'Thinking...' : 'Ask'}
            </button>
          </form>

          {/* Answer Display */}
          <div className="ask-content">
            {askLoading && (
              <div className="ask-loading">
                <div className="loading-spinner"></div>
                <p>Searching knowledge base...</p>
              </div>
            )}

            {askAnswer && !askLoading && (
              <div className="ask-answer-card">
                <div className="answer-content">
                  <ReactMarkdown>{askAnswer.answer}</ReactMarkdown>
                </div>

                {askAnswer.confidence > 0 && (
                  <div className="answer-confidence">
                    <span className={`confidence-badge ${askAnswer.confidence >= 0.7 ? 'high' : askAnswer.confidence >= 0.4 ? 'medium' : 'low'}`}>
                      {Math.round(askAnswer.confidence * 100)}% confidence
                    </span>
                  </div>
                )}

                {/* Post question to team - prominent when low confidence, subtle when high */}
                {teamQuestionsAvailable && !askAnswer.posted && (
                  askAnswer.confidence < 0.5 ? (
                    // Low confidence - prominent prompt
                    <div className="low-confidence-action">
                      <p className="low-confidence-message">
                        Raven isn't confident about this answer. Would you like to ask your team?
                      </p>
                      {!showPostQuestion ? (
                        <button
                          className="btn-primary"
                          onClick={() => setShowPostQuestion(true)}
                        >
                          Post Question to Team
                        </button>
                      ) : (
                        <div className="post-question-form">
                          <textarea
                            value={questionContext}
                            onChange={(e) => setQuestionContext(e.target.value)}
                            placeholder="Add any context that might help (optional)"
                            className="question-context-input"
                            rows={2}
                          />
                          <div className="assignee-select">
                            <label>Assign to (optional):</label>
                            <div className="assignee-options">
                              {members.map(member => (
                                <label key={member.userId} className="assignee-option">
                                  <input
                                    type="checkbox"
                                    checked={selectedAssignees.includes(member.userId)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedAssignees([...selectedAssignees, member.userId]);
                                      } else {
                                        setSelectedAssignees(selectedAssignees.filter(id => id !== member.userId));
                                      }
                                    }}
                                  />
                                  {member.user?.displayName || member.user?.email}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="post-question-actions">
                            <button className="btn-secondary" onClick={() => setShowPostQuestion(false)}>
                              Cancel
                            </button>
                            <button className="btn-primary" onClick={handlePostQuestion}>
                              Post Question
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // High confidence - subtle link (always available)
                    !showPostQuestion ? (
                      <div className="post-question-subtle">
                        <button
                          className="btn-link"
                          onClick={() => setShowPostQuestion(true)}
                        >
                          Not satisfied? Post to team for verification
                        </button>
                      </div>
                    ) : (
                      <div className="post-question-form compact">
                        <textarea
                          value={questionContext}
                          onChange={(e) => setQuestionContext(e.target.value)}
                          placeholder="Add any context (optional)"
                          className="question-context-input"
                          rows={2}
                        />
                        <div className="assignee-select">
                          <label>Assign to (optional):</label>
                          <div className="assignee-options">
                            {members.map(member => (
                              <label key={member.userId} className="assignee-option">
                                <input
                                  type="checkbox"
                                  checked={selectedAssignees.includes(member.userId)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedAssignees([...selectedAssignees, member.userId]);
                                    } else {
                                      setSelectedAssignees(selectedAssignees.filter(id => id !== member.userId));
                                    }
                                  }}
                                />
                                {member.user?.displayName || member.user?.email}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="post-question-actions">
                          <button className="btn-secondary" onClick={() => setShowPostQuestion(false)}>
                            Cancel
                          </button>
                          <button className="btn-primary" onClick={handlePostQuestion}>
                            Post Question
                          </button>
                        </div>
                      </div>
                    )
                  )
                )}

                {/* Posted confirmation */}
                {askAnswer.posted && (
                  <div className="question-posted-badge">
                    Question posted to team - you'll be notified when someone answers.
                  </div>
                )}

                {askAnswer.factsUsed?.length > 0 && (
                  <div className="answer-sources">
                    <span className="sources-label">Based on:</span>
                    <div className="sources-list">
                      {askAnswer.factsUsed.map((fact, i) => (
                        <span key={fact.id} className="source-tag" title={fact.content}>
                          {fact.category || 'fact'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {askAnswer.suggestedFollowups?.length > 0 && (
                  <div className="followup-questions">
                    <span className="followups-label">Related questions:</span>
                    <div className="followups-list">
                      {askAnswer.suggestedFollowups.map((q, i) => (
                        <button
                          key={i}
                          className="followup-btn"
                          onClick={() => handleFollowupQuestion(q)}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!askAnswer && !askLoading && (
              <div className="ask-empty">
                <div className="ask-empty-icon">?</div>
                <p>Ask anything about your team's knowledge</p>
                <div className="ask-examples">
                  <p className="examples-label">Try asking:</p>
                  <button className="example-btn" onClick={() => setAskQuestion("What products do we make?")}>
                    What products do we make?
                  </button>
                  <button className="example-btn" onClick={() => setAskQuestion("Who are our manufacturing partners?")}>
                    Who are our manufacturing partners?
                  </button>
                  <button className="example-btn" onClick={() => setAskQuestion("What decisions have been made recently?")}>
                    What decisions have been made recently?
                  </button>
                </div>
              </div>
            )}

            {/* History */}
            {askHistory.length > 0 && (
              <div className="ask-history">
                <h4>Recent Questions</h4>
                {askHistory.slice(0, 5).map((item, i) => (
                  <div key={i} className="history-item" onClick={() => setAskQuestion(item.question)}>
                    <span className="history-question">{item.question}</span>
                    <span className="history-time">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Team Questions Section - only show if feature is available */}
            {teamQuestionsAvailable && (
            <div className="team-questions-section">
              <div className="team-questions-header">
                <h4>Team Questions</h4>
                <button
                  className={`filter-btn ${showOpenQuestions ? 'active' : ''}`}
                  onClick={() => { setShowOpenQuestions(!showOpenQuestions); refetchQuestions(); }}
                >
                  {showOpenQuestions ? 'Show All' : 'Open Only'}
                </button>
              </div>

              {teamQuestions.length === 0 ? (
                <p className="no-questions">No questions from the team yet.</p>
              ) : (
                <div className="team-questions-list">
                  {teamQuestions.map(q => (
                    <div key={q.id} className={`team-question-card ${q.status}`}>
                      <div className="question-header">
                        <span className="question-author">
                          {q.askedByUser?.displayName || q.askedByUser?.email || 'Team member'}
                        </span>
                        <span className="question-date">
                          {new Date(q.createdAt).toLocaleDateString()}
                        </span>
                        <span className={`question-status ${q.status}`}>{q.status}</span>
                      </div>

                      <p className="question-text">{q.question}</p>

                      {q.aiAnswer && (
                        <div className="ai-attempt">
                          <span className="ai-label">Raven's attempt ({Math.round((q.aiConfidence || 0) * 100)}% confidence):</span>
                          <p className="ai-answer-preview">{q.aiAnswer.substring(0, 150)}...</p>
                        </div>
                      )}

                      {q.status === 'answered' && q.answer && (
                        <div className="human-answer">
                          <span className="answer-label">
                            Answered by {q.answeredByUser?.displayName || 'Team member'}:
                          </span>
                          <ReactMarkdown>{q.answer}</ReactMarkdown>
                        </div>
                      )}

                      {q.status === 'open' && (
                        answeringQuestionId === q.id ? (
                          <div className="answer-form">
                            <textarea
                              value={questionAnswerText}
                              onChange={(e) => setQuestionAnswerText(e.target.value)}
                              placeholder="Share your knowledge..."
                              rows={3}
                              className="answer-input"
                            />
                            <div className="answer-form-actions">
                              <button
                                className="btn-secondary"
                                onClick={() => { setAnsweringQuestionId(null); setQuestionAnswerText(''); }}
                              >
                                Cancel
                              </button>
                              <button
                                className="btn-primary"
                                onClick={() => handleAnswerQuestion(q.id)}
                                disabled={!questionAnswerText.trim()}
                              >
                                Submit Answer
                              </button>
                            </div>
                            <p className="answer-note">Your answer will be added to the knowledge base.</p>
                          </div>
                        ) : (
                          <button
                            className="btn-secondary answer-btn"
                            onClick={() => setAnsweringQuestionId(q.id)}
                          >
                            I can answer this
                          </button>
                        )
                      )}

                      {q.assignees?.length > 0 && (
                        <div className="question-assignees">
                          <span>Assigned to: </span>
                          {q.assignees.map(a => a.displayName || a.email).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
        </main>
      ) : activeView === 'goals' ? (
        <main className="goals-area">
          {/* Goals Header */}
          <header className="goals-header">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <h3>Goals</h3>
            <button className="btn-primary btn-small" onClick={() => setShowCreateGoal(true)}>
              + New Goal
            </button>
          </header>

          <div className="goals-content">
            {/* Create Goal Modal */}
            {showCreateGoal && (
              <div className="modal-overlay" onClick={() => setShowCreateGoal(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Create Goal</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newGoalTitle.trim()) return;
                    try {
                      await createGoal({
                        variables: {
                          teamId,
                          input: {
                            title: newGoalTitle.trim(),
                            targetDate: newGoalTargetDate || null
                          }
                        }
                      });
                      setNewGoalTitle('');
                      setNewGoalTargetDate('');
                      setShowCreateGoal(false);
                      refetchGoals();
                    } catch (err) {
                      alert('Failed to create goal: ' + err.message);
                    }
                  }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Goal title (e.g., Launch Q1 product line)"
                      value={newGoalTitle}
                      onChange={(e) => setNewGoalTitle(e.target.value)}
                      autoFocus
                    />
                    <input
                      type="date"
                      className="input-field"
                      style={{ marginTop: '0.75rem' }}
                      value={newGoalTargetDate}
                      onChange={(e) => setNewGoalTargetDate(e.target.value)}
                    />
                    <div className="form-actions">
                      <button type="button" className="btn-secondary" onClick={() => setShowCreateGoal(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" disabled={!newGoalTitle.trim()}>
                        Create Goal
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Create Project Modal */}
            {showCreateProject && (
              <div className="modal-overlay" onClick={() => setShowCreateProject(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Create Project</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newProjectName.trim()) return;
                    try {
                      await createProject({
                        variables: {
                          teamId,
                          input: {
                            name: newProjectName.trim(),
                            goalIds: newProjectGoalId ? [newProjectGoalId] : [],
                            dueDate: newProjectDueDate ? new Date(newProjectDueDate).toISOString() : null
                          }
                        }
                      });
                      setNewProjectName('');
                      setNewProjectGoalId('');
                      setNewProjectDueDate('');
                      setShowCreateProject(false);
                      refetchProjects();
                      refetchGoals();
                    } catch (err) {
                      alert('Failed to create project: ' + err.message);
                    }
                  }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Project name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      autoFocus
                    />
                    <input
                      type="date"
                      className="input-field"
                      style={{ marginTop: '0.75rem' }}
                      placeholder="Due date (optional)"
                      value={newProjectDueDate}
                      onChange={(e) => setNewProjectDueDate(e.target.value)}
                    />
                    <select
                      className="input-field"
                      style={{ marginTop: '0.75rem' }}
                      value={newProjectGoalId}
                      onChange={(e) => setNewProjectGoalId(e.target.value)}
                    >
                      <option value="">No goal (standalone)</option>
                      {goals.map(g => (
                        <option key={g.id} value={g.id}>{g.title}</option>
                      ))}
                    </select>
                    <div className="form-actions">
                      <button type="button" className="btn-secondary" onClick={() => setShowCreateProject(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" disabled={!newProjectName.trim()}>
                        Create Project
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Goals List */}
            {goals.length === 0 ? (
              <div className="goals-empty">
                <div className="goals-empty-icon">🎯</div>
                <h4>No goals yet</h4>
                <p>Goals help you track high-level objectives. Projects and tasks roll up to goals.</p>
                <button className="btn-primary" onClick={() => setShowCreateGoal(true)}>
                  Create Your First Goal
                </button>
              </div>
            ) : (
              <div className="goals-list">
                {goals.map(goal => (
                  <div key={goal.id} className={`goal-card ${goal.status}`}>
                    <div className="goal-header">
                      <div className="goal-status-badge">{goal.status}</div>
                      <h4 className="goal-title">{goal.title}</h4>
                      {goal.targetDate && (
                        <span className="goal-target">
                          Target: {new Date(goal.targetDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {goal.description && (
                      <p className="goal-description">{goal.description}</p>
                    )}

                    {/* Progress Bar */}
                    <div className="goal-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${goal.progress}%` }}></div>
                      </div>
                      <span className="progress-text">{goal.progress}%</span>
                    </div>

                    {/* Linked Projects */}
                    <div className="goal-projects">
                      <div className="projects-header">
                        <span className="projects-label">Projects ({goal.projects?.length || 0})</span>
                        <button
                          className="btn-link"
                          onClick={() => {
                            setNewProjectGoalId(goal.id);
                            setShowCreateProject(true);
                          }}
                        >
                          + Add Project
                        </button>
                      </div>
                      {goal.projects?.length > 0 && (
                        <div className="projects-list-compact">
                          {goal.projects.map(proj => (
                            <div key={proj.id} className="project-chip">
                              <span className="project-name">{proj.name}</span>
                              <span className="project-progress">
                                {proj.completedTaskCount}/{proj.taskCount} tasks
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Goal Actions */}
                    <div className="goal-actions">
                      {goal.status === 'active' && (
                        <>
                          <button
                            className="btn-small btn-success"
                            onClick={async () => {
                              await updateGoal({ variables: { goalId: goal.id, input: { status: 'achieved' } } });
                              refetchGoals();
                            }}
                          >
                            ✓ Mark Achieved
                          </button>
                          <button
                            className="btn-small btn-secondary"
                            onClick={async () => {
                              await updateGoal({ variables: { goalId: goal.id, input: { status: 'paused' } } });
                              refetchGoals();
                            }}
                          >
                            Pause
                          </button>
                        </>
                      )}
                      {goal.status === 'paused' && (
                        <button
                          className="btn-small btn-primary"
                          onClick={async () => {
                            await updateGoal({ variables: { goalId: goal.id, input: { status: 'active' } } });
                            refetchGoals();
                          }}
                        >
                          Resume
                        </button>
                      )}
                      {goal.status === 'achieved' && (
                        <span className="achieved-badge">🏆 Achieved!</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="goals-footer">
              <button className="btn-secondary" onClick={() => setShowCreateProject(true)}>
                + New Project
              </button>
            </div>
          </div>
        </main>
      ) : activeView === 'projects' ? (
        <main className="projects-area">
          {/* Projects Header */}
          <header className="projects-header">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <h3>Projects</h3>
            <button className="btn-primary btn-small" onClick={() => setShowCreateProject(true)}>
              + New Project
            </button>
          </header>

          <div className="projects-content">
            {/* Create Project Modal */}
            {showCreateProject && (
              <div className="modal-overlay" onClick={() => setShowCreateProject(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Create Project</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newProjectName.trim()) return;
                    try {
                      await createProject({
                        variables: {
                          teamId,
                          input: {
                            name: newProjectName.trim(),
                            goalIds: newProjectGoalId ? [newProjectGoalId] : [],
                            dueDate: newProjectDueDate ? new Date(newProjectDueDate).toISOString() : null
                          }
                        }
                      });
                      setNewProjectName('');
                      setNewProjectGoalId('');
                      setNewProjectDueDate('');
                      setShowCreateProject(false);
                      refetchProjects();
                    } catch (err) {
                      alert('Failed to create project: ' + err.message);
                    }
                  }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Project name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      autoFocus
                    />
                    <input
                      type="date"
                      className="input-field"
                      style={{ marginTop: '0.75rem' }}
                      placeholder="Due date (optional)"
                      value={newProjectDueDate}
                      onChange={(e) => setNewProjectDueDate(e.target.value)}
                    />
                    <select
                      className="input-field"
                      style={{ marginTop: '0.75rem' }}
                      value={newProjectGoalId}
                      onChange={(e) => setNewProjectGoalId(e.target.value)}
                    >
                      <option value="">No goal (standalone)</option>
                      {goals.map(g => (
                        <option key={g.id} value={g.id}>{g.title}</option>
                      ))}
                    </select>
                    <div className="form-actions">
                      <button type="button" className="btn-secondary" onClick={() => setShowCreateProject(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" disabled={!newProjectName.trim()}>
                        Create Project
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Projects List */}
            {projects.length === 0 ? (
              <div className="projects-empty">
                <div className="projects-empty-icon">📁</div>
                <h4>No projects yet</h4>
                <p>Projects help you organize tasks and track progress toward goals.</p>
                <button className="btn-primary" onClick={() => setShowCreateProject(true)}>
                  Create Your First Project
                </button>
              </div>
            ) : (
              <div className="all-projects-grid">
                {projects.map(proj => (
                  <div key={proj.id} className={`project-card-full ${proj.status}`} style={{ borderLeftColor: proj.color || '#5D4B8C' }}>
                    <div className="project-card-header">
                      <h4>{proj.name}</h4>
                      <span className={`project-status-badge ${proj.status}`}>{proj.status}</span>
                    </div>
                    {proj.description && (
                      <p className="project-description">{proj.description}</p>
                    )}
                    <div className="project-stats">
                      <div className="stat">
                        <span className="stat-value">{proj.taskCount || 0}</span>
                        <span className="stat-label">Tasks</span>
                      </div>
                      <div className="stat">
                        <span className="stat-value">{proj.completedTaskCount || 0}</span>
                        <span className="stat-label">Done</span>
                      </div>
                      {proj.dueDate && (
                        <div className="stat">
                          <span className="stat-value">{new Date(proj.dueDate).toLocaleDateString()}</span>
                          <span className="stat-label">Due</span>
                        </div>
                      )}
                    </div>
                    {proj.goals?.length > 0 && (
                      <div className="project-goals">
                        <span className="goals-label">Goals:</span>
                        {proj.goals.map(g => (
                          <span key={g.id} className="goal-tag">{g.title}</span>
                        ))}
                      </div>
                    )}
                    <div className="project-progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${proj.taskCount ? (proj.completedTaskCount / proj.taskCount) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      ) : null}

      {/* Task Detail Panel (Slide-over) */}
      {selectedTaskId && selectedTask && (
        <div className="task-detail-overlay" onClick={() => setSelectedTaskId(null)}>
          <div className="task-detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="task-detail-header">
              <button className="close-btn" onClick={() => setSelectedTaskId(null)}>×</button>
              <div className={`task-status-badge ${selectedTask.status}`}>{selectedTask.status.replace('_', ' ')}</div>
              <h3>{selectedTask.title}</h3>
            </div>

            <div className="task-detail-body">
              {/* Task Properties */}
              <div className="task-properties">
                <div className="property-row">
                  <span className="property-label">Status</span>
                  <select
                    className="property-value"
                    value={selectedTask.status}
                    onChange={async (e) => {
                      const newStatus = e.target.value;
                      if (newStatus === 'done') {
                        await completeTask({ variables: { taskId: selectedTaskId } });
                      } else {
                        await updateTask({ variables: { taskId: selectedTaskId, input: { status: newStatus } } });
                      }
                      refetchTaskDetail();
                      refetchTasks();
                    }}
                  >
                    <option value="backlog">Backlog</option>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div className="property-row">
                  <span className="property-label">Priority</span>
                  <select
                    className="property-value"
                    value={selectedTask.priority}
                    onChange={async (e) => {
                      await updateTask({ variables: { taskId: selectedTaskId, input: { priority: e.target.value } } });
                      refetchTaskDetail();
                      refetchTasks();
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="property-row">
                  <span className="property-label">Assignee</span>
                  <span className="property-value">
                    {selectedTask.assignedToUser?.displayName || selectedTask.assignedToUser?.email || 'Unassigned'}
                  </span>
                </div>

                <div className="property-row">
                  <span className="property-label">Due Date</span>
                  <input
                    type="date"
                    className="property-value"
                    value={selectedTask.dueAt ? new Date(selectedTask.dueAt).toISOString().split('T')[0] : ''}
                    onChange={async (e) => {
                      await updateTask({
                        variables: {
                          taskId: selectedTaskId,
                          input: { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null }
                        }
                      });
                      refetchTaskDetail();
                      refetchTasks();
                    }}
                  />
                </div>

                {selectedTask.project && (
                  <div className="property-row">
                    <span className="property-label">Project</span>
                    <span className="property-value project-badge" style={{ borderColor: selectedTask.project.color }}>
                      {selectedTask.project.name}
                    </span>
                  </div>
                )}

                {/* Goals */}
                <div className="property-row property-row-goals">
                  <span className="property-label">Goals</span>
                  <div className="goals-tags-container">
                    {/* Show effective goals (inherited + direct) */}
                    {selectedTask.goals?.length > 0 ? (
                      <div className="goals-tags">
                        {selectedTask.goals.map(goal => (
                          <span
                            key={goal.id}
                            className={`goal-tag ${goal.linkType}`}
                            title={goal.linkType === 'inherited' ? 'Inherited from project' : 'Direct link'}
                          >
                            {goal.title}
                            {goal.linkType === 'inherited' && <span className="inherited-indicator">↓</span>}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="no-goals-text">No goals linked</span>
                    )}

                    {/* Goal selector for direct links */}
                    <select
                      className="goal-selector"
                      value=""
                      onChange={async (e) => {
                        if (!e.target.value) return;
                        const currentDirectIds = selectedTask.directGoals?.map(g => g.id) || [];
                        const newGoalIds = [...currentDirectIds, e.target.value];
                        await setTaskGoals({
                          variables: { taskId: selectedTaskId, goalIds: newGoalIds }
                        });
                        refetchTaskDetail();
                        refetchGoals();
                      }}
                    >
                      <option value="">+ Add goal...</option>
                      {goals
                        .filter(g => g.status === 'active')
                        .filter(g => !selectedTask.directGoals?.some(dg => dg.id === g.id))
                        .map(goal => (
                          <option key={goal.id} value={goal.id}>{goal.title}</option>
                        ))
                      }
                    </select>

                    {/* Remove direct goal buttons */}
                    {selectedTask.directGoals?.length > 0 && (
                      <div className="direct-goals-remove">
                        {selectedTask.directGoals.map(goal => (
                          <button
                            key={goal.id}
                            className="remove-goal-btn"
                            title={`Remove ${goal.title}`}
                            onClick={async () => {
                              const newGoalIds = selectedTask.directGoals
                                .filter(g => g.id !== goal.id)
                                .map(g => g.id);
                              await setTaskGoals({
                                variables: { taskId: selectedTaskId, goalIds: newGoalIds }
                              });
                              refetchTaskDetail();
                              refetchGoals();
                            }}
                          >
                            × {goal.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedTask.description && (
                <div className="task-description-section">
                  <h4>Description</h4>
                  <p>{selectedTask.description}</p>
                </div>
              )}

              {/* Comments */}
              <div className="task-comments-section">
                <h4>Comments ({selectedTask.comments?.length || 0})</h4>

                {selectedTask.comments?.length > 0 ? (
                  <div className="comments-list">
                    {selectedTask.comments.map(comment => (
                      <div key={comment.id} className="comment-item">
                        <div className="comment-header">
                          <span className="comment-author">
                            {comment.user?.displayName || comment.user?.email || 'Unknown'}
                          </span>
                          <span className="comment-time">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="comment-content">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-comments">No comments yet</p>
                )}

                {/* Add Comment Form */}
                <form
                  className="add-comment-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!taskComment.trim()) return;
                    try {
                      await addTaskComment({
                        variables: {
                          taskId: selectedTaskId,
                          input: { content: taskComment.trim() }
                        }
                      });
                      setTaskComment('');
                      refetchTaskDetail();
                    } catch (err) {
                      alert('Failed to add comment: ' + err.message);
                    }
                  }}
                >
                  <textarea
                    className="comment-input"
                    placeholder="Add a comment..."
                    value={taskComment}
                    onChange={(e) => setTaskComment(e.target.value)}
                    rows={2}
                  />
                  <button type="submit" className="btn-primary btn-small" disabled={!taskComment.trim()}>
                    Comment
                  </button>
                </form>
              </div>

              {/* Activity Log */}
              {selectedTask.activity?.length > 0 && (
                <div className="task-activity-section">
                  <h4>Activity</h4>
                  <div className="activity-list">
                    {selectedTask.activity.slice(0, 10).map(act => (
                      <div key={act.id} className="activity-item">
                        <span className="activity-user">{act.user?.displayName || 'System'}</span>
                        <span className="activity-action">
                          {act.action === 'status_changed' && `changed status from ${act.oldValue} to ${act.newValue}`}
                          {act.action === 'created' && 'created this task'}
                          {act.action === 'assigned' && `assigned to ${act.newValue}`}
                          {act.action === 'commented' && 'added a comment'}
                          {act.action === 'due_date_set' && `set due date to ${act.newValue}`}
                        </span>
                        <span className="activity-time">
                          {new Date(act.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="task-detail-footer">
              <span className="task-created">
                Created {new Date(selectedTask.createdAt).toLocaleDateString()}
                {selectedTask.createdByUser && ` by ${selectedTask.createdByUser.displayName}`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamDashboard;

