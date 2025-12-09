import { gql, useQuery, useMutation, useLazyQuery } from '@apollo/client';
import { useState, useEffect, useRef, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import CalendarView from './CalendarView';

// API base URL - uses /api prefix in production, localhost in development
const API_BASE_URL = import.meta.env.PROD
  ? '/api'
  : 'http://localhost:4000';

// Error Boundary for catching render errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('TeamDashboard Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h3>Something went wrong</h3>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

const GET_MY_RAVEN_CHANNEL = gql`
  query GetMyRavenChannel($teamId: ID!) {
    getMyRavenChannel(teamId: $teamId) {
      id
      name
      description
      channelType
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

// Learning Objectives queries
const GET_LEARNING_OBJECTIVES = gql`
  query GetLearningObjectives($teamId: ID!, $status: String) {
    getLearningObjectives(teamId: $teamId, status: $status) {
      id
      title
      description
      status
      assignedTo
      assignedToName
      createdByName
      questionsAsked
      maxQuestions
      questionCount
      answeredCount
      createdAt
      completedAt
    }
  }
`;

const GET_LEARNING_OBJECTIVE = gql`
  query GetLearningObjective($objectiveId: ID!) {
    getLearningObjective(objectiveId: $objectiveId) {
      id
      title
      description
      status
      assignedTo
      assignedToName
      createdByName
      questionsAsked
      maxQuestions
      questionCount
      answeredCount
      createdAt
      completedAt
      questions {
        id
        question
        answer
        status
        askedByRaven
        askedByName
        answeredByName
        answeredAt
        createdAt
        followUpQuestions {
          id
          question
          answer
          status
          askedByRaven
          createdAt
        }
      }
    }
  }
`;

const CREATE_LEARNING_OBJECTIVE = gql`
  mutation CreateLearningObjective($teamId: ID!, $input: CreateLearningObjectiveInput!) {
    createLearningObjective(teamId: $teamId, input: $input) {
      id
      title
      description
      status
      assignedTo
      assignedToName
    }
  }
`;

const UPDATE_LEARNING_OBJECTIVE = gql`
  mutation UpdateLearningObjective($objectiveId: ID!, $input: UpdateLearningObjectiveInput!) {
    updateLearningObjective(objectiveId: $objectiveId, input: $input) {
      id
      title
      description
      status
      assignedTo
      assignedToName
    }
  }
`;

const ASK_FOLLOWUP_QUESTION = gql`
  mutation AskFollowUpQuestion($questionId: ID!) {
    askFollowUpQuestion(questionId: $questionId) {
      id
      question
      status
      askedByRaven
      parentQuestionId
    }
  }
`;

const REJECT_QUESTION = gql`
  mutation RejectQuestion($questionId: ID!, $reason: String) {
    rejectQuestion(questionId: $questionId, reason: $reason) {
      id
      question
      status
      askedByRaven
    }
  }
`;

// Site Admin queries
const AM_I_SITE_ADMIN = gql`
  query AmISiteAdmin {
    amISiteAdmin
  }
`;

const GET_SITE_INVITES = gql`
  query GetSiteInvites {
    getSiteInvites {
      id
      email
      invitedByName
      status
      expiresAt
      acceptedAt
      createdAt
    }
  }
`;

const CREATE_SITE_INVITE = gql`
  mutation CreateSiteInvite($email: String!) {
    createSiteInvite(email: $email) {
      id
      email
      status
      expiresAt
    }
  }
`;

const REVOKE_SITE_INVITE = gql`
  mutation RevokeSiteInvite($inviteId: ID!) {
    revokeSiteInvite(inviteId: $inviteId) {
      id
      status
    }
  }
`;

// Google Drive Integration queries
const GET_MY_INTEGRATIONS = gql`
  query GetMyIntegrations {
    getMyIntegrations {
      id
      provider
      providerEmail
      isActive
      createdAt
    }
  }
`;

const GET_DRIVE_FILES = gql`
  query GetDriveFiles($folderId: String, $pageSize: Int) {
    getDriveFiles(folderId: $folderId, pageSize: $pageSize) {
      files {
        id
        name
        mimeType
        modifiedTime
        webViewLink
        iconLink
      }
      nextPageToken
    }
  }
`;

const GET_DRIVE_FILE_CONTENT = gql`
  query GetDriveFileContent($fileId: String!) {
    getDriveFileContent(fileId: $fileId) {
      id
      name
      mimeType
      content
    }
  }
`;

const SEARCH_GIFS = gql`
  query SearchGifs($query: String!, $limit: Int) {
    searchGifs(query: $query, limit: $limit) {
      id
      title
      url
      previewUrl
      width
      height
    }
  }
`;

const GET_TRENDING_GIFS = gql`
  query GetTrendingGifs($limit: Int) {
    getTrendingGifs(limit: $limit) {
      id
      title
      url
      previewUrl
      width
      height
    }
  }
`;

const DISCONNECT_INTEGRATION = gql`
  mutation DisconnectIntegration($provider: String!) {
    disconnectIntegration(provider: $provider)
  }
`;

const IMPORT_DRIVE_FILE = gql`
  mutation ImportDriveFile($teamId: ID!, $fileId: String!) {
    importDriveFileToKnowledge(teamId: $teamId, fileId: $fileId) {
      id
      content
    }
  }
`;

// Knowledge Base Queries
const GET_KNOWLEDGE_BASE_SOURCES = gql`
  query GetKnowledgeBaseSources($teamId: ID!) {
    getKnowledgeBaseSources(teamId: $teamId) {
      id
      provider
      sourceType
      sourceId
      sourceName
      sourcePath
      sourceUrl
      status
      lastSyncedAt
      syncError
      fileCount
      createdAt
    }
  }
`;

const IS_IN_KNOWLEDGE_BASE = gql`
  query IsInKnowledgeBase($teamId: ID!, $provider: String!, $sourceId: String!) {
    isInKnowledgeBase(teamId: $teamId, provider: $provider, sourceId: $sourceId)
  }
`;

const ADD_TO_KNOWLEDGE_BASE = gql`
  mutation AddToKnowledgeBase($teamId: ID!, $input: AddToKnowledgeBaseInput!) {
    addToKnowledgeBase(teamId: $teamId, input: $input) {
      id
      provider
      sourceType
      sourceId
      sourceName
      status
    }
  }
`;

const REMOVE_FROM_KNOWLEDGE_BASE = gql`
  mutation RemoveFromKnowledgeBase($teamId: ID!, $sourceId: ID!) {
    removeFromKnowledgeBase(teamId: $teamId, sourceId: $sourceId)
  }
`;

const SYNC_KNOWLEDGE_BASE_SOURCE = gql`
  mutation SyncKnowledgeBaseSource($teamId: ID!, $sourceId: ID!) {
    syncKnowledgeBaseSource(teamId: $teamId, sourceId: $sourceId) {
      source {
        id
        status
        lastSyncedAt
        fileCount
        syncError
      }
      documentsAdded
      documentsUpdated
      errors
    }
  }
`;

const GET_GOOGLE_PICKER_CONFIG = gql`
  query GetGooglePickerConfig {
    getGooglePickerConfig {
      clientId
      apiKey
      accessToken
      appId
    }
  }
`;

const ATTACH_TO_MESSAGE = gql`
  mutation AttachToMessage($attachmentId: ID!, $messageId: ID!) {
    attachToMessage(attachmentId: $attachmentId, messageId: $messageId) {
      id
      url
      originalName
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
    if (initialView === 'tasks' || initialView === 'goals' || initialView === 'ask' || initialView === 'learning' || initialView === 'projects' || initialView === 'knowledge' || initialView === 'calendar') {
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
  // Site Admin state
  const [showSiteAdminPanel, setShowSiteAdminPanel] = useState(false);
  const [siteInviteEmail, setSiteInviteEmail] = useState('');
  const [siteInviteSending, setSiteInviteSending] = useState(false);
  // Google Drive state
  const [showDrivePanel, setShowDrivePanel] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState('root');
  // Knowledge Base loading states
  const [deletingKbSourceId, setDeletingKbSourceId] = useState(null);
  const [syncingKbSourceId, setSyncingKbSourceId] = useState(null);
  const [driveFolderStack, setDriveFolderStack] = useState([{ id: 'root', name: 'My Drive' }]);
  // Image upload state
  const [pendingImage, setPendingImage] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef(null);

  // GIF Picker state
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const gifSearchTimeoutRef = useRef(null);

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
  // Learning Objectives state
  const [askTab, setAskTab] = useState('questions'); // 'questions' or 'learning'
  const [showCreateLO, setShowCreateLO] = useState(false);
  const [selectedLOId, setSelectedLOId] = useState(null);
  const [newLOTitle, setNewLOTitle] = useState('');
  const [newLODescription, setNewLODescription] = useState('');
  const [newLOAssignedTo, setNewLOAssignedTo] = useState(null); // null = Raven, or a user ID
  const [newLOMaxQuestions, setNewLOMaxQuestions] = useState(5);
  const [requestingFollowUp, setRequestingFollowUp] = useState(null); // question ID
  // @mentions autocomplete state (for chat input)
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(null);
  // @mentions for answer textarea
  const [answerShowMentions, setAnswerShowMentions] = useState(false);
  const [answerMentionQuery, setAnswerMentionQuery] = useState('');
  const [answerMentionIndex, setAnswerMentionIndex] = useState(0);
  const [answerMentionStartPos, setAnswerMentionStartPos] = useState(null);
  const answerTextareaRef = useRef(null);
  // @ravenloom command suggestions state
  const [showCommands, setShowCommands] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  // Reply-to state
  const [replyingTo, setReplyingTo] = useState(null);
  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // User menu dropdown state
  const [showUserMenu, setShowUserMenu] = useState(false);
  // Sidebar tree expansion state
  const [expandedSections, setExpandedSections] = useState({
    channels: true,
    tasks: false,
    goals: false,
    projects: false,
    knowledge: false
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

  // Private Raven chat state
  const [ravenChannel, setRavenChannel] = useState(null);

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
    { cmd: '@raven discuss', desc: 'Start a facilitated discussion', example: '@raven discuss our Q1 marketing strategy' },
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
  const members = team?.members || [];

  // Determine active channel - use state, URL itemId, or default
  const activeChannelId = activeChannelIdState ||
    ((initialView === 'channel' || !initialView) ? initialItemId : null) ||
    channels.find(c => c.isDefault)?.id ||
    channels[0]?.id;
  const activeChannel = channels.find(c => c.id === activeChannelId);

  // Sync URL with active channel when channels load and we're in chat view
  // This ensures deep links work properly on refresh
  useEffect(() => {
    if (activeChannelId && activeView === 'chat' && channels.length > 0) {
      // Only update URL if it doesn't already include the channel
      const currentChannelInUrl = initialView === 'channel' && initialItemId === activeChannelId;
      if (!currentChannelInUrl) {
        navigate(`/team/${teamId}/channel/${activeChannelId}`, { replace: true });
      }
    }
  }, [activeChannelId, activeView, channels.length, teamId, initialView, initialItemId, navigate]);

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
  const { data: questionsData, refetch: refetchQuestions, error: questionsError, loading: questionsLoading } = useQuery(GET_TEAM_QUESTIONS, {
    variables: { teamId, status: showOpenQuestions ? 'open' : null },
    skip: !teamId || activeView !== 'ask',
    errorPolicy: 'all',
    onError: (err) => console.log('Team questions query error:', err.message)
  });
  const teamQuestions = questionsData?.getTeamQuestions || [];
  // Only show team questions if query succeeded (no error) and not loading
  const teamQuestionsAvailable = !questionsError && !questionsLoading && questionsData !== undefined;

  const [createTeamQuestion] = useMutation(CREATE_TEAM_QUESTION);
  const [answerTeamQuestion] = useMutation(ANSWER_TEAM_QUESTION);

  // Learning Objectives
  const { data: losData, refetch: refetchLOs, error: losError } = useQuery(GET_LEARNING_OBJECTIVES, {
    variables: { teamId },
    skip: !teamId || (activeView !== 'ask' && activeView !== 'learning'),
    errorPolicy: 'all',
    onError: (err) => console.log('Learning objectives query error:', err.message)
  });
  const learningObjectives = losData?.getLearningObjectives || [];
  const losAvailable = !losError && losData !== undefined;

  const { data: selectedLOData, refetch: refetchSelectedLO } = useQuery(GET_LEARNING_OBJECTIVE, {
    variables: { objectiveId: selectedLOId },
    skip: !selectedLOId,
    fetchPolicy: 'cache-and-network'
  });
  const selectedLO = selectedLOData?.getLearningObjective;

  const [createLearningObjective] = useMutation(CREATE_LEARNING_OBJECTIVE);
  const [updateLearningObjective] = useMutation(UPDATE_LEARNING_OBJECTIVE);
  const [askFollowUpQuestion] = useMutation(ASK_FOLLOWUP_QUESTION);
  const [rejectQuestion] = useMutation(REJECT_QUESTION);

  // Site Admin hooks
  const { data: siteAdminData } = useQuery(AM_I_SITE_ADMIN);
  const isSiteAdmin = siteAdminData?.amISiteAdmin || false;
  const [fetchSiteInvites, { data: siteInvitesData }] = useLazyQuery(GET_SITE_INVITES);
  const [createSiteInvite] = useMutation(CREATE_SITE_INVITE);
  const [revokeSiteInvite] = useMutation(REVOKE_SITE_INVITE);
  const siteInvites = siteInvitesData?.getSiteInvites || [];

  // Google Drive hooks
  const { data: integrationsData, refetch: refetchIntegrations } = useQuery(GET_MY_INTEGRATIONS);
  const googleIntegration = integrationsData?.getMyIntegrations?.find(i => i.provider === 'google');
  const [fetchDriveFiles, { data: driveFilesData, loading: driveLoading }] = useLazyQuery(GET_DRIVE_FILES);
  const driveFiles = driveFilesData?.getDriveFiles?.files || [];
  const [disconnectIntegration] = useMutation(DISCONNECT_INTEGRATION);
  const [importDriveFile] = useMutation(IMPORT_DRIVE_FILE);
  const [attachToMessage] = useMutation(ATTACH_TO_MESSAGE);

  // GIF search queries
  const [searchGifs] = useLazyQuery(SEARCH_GIFS);
  const [fetchTrendingGifs] = useLazyQuery(GET_TRENDING_GIFS);

  // Knowledge Base hooks
  const { data: kbSourcesData, refetch: refetchKbSources } = useQuery(GET_KNOWLEDGE_BASE_SOURCES, {
    variables: { teamId },
    skip: !teamId
  });
  const kbSources = kbSourcesData?.getKnowledgeBaseSources || [];
  const [fetchPickerConfig] = useLazyQuery(GET_GOOGLE_PICKER_CONFIG);
  const [addToKnowledgeBase] = useMutation(ADD_TO_KNOWLEDGE_BASE);
  const [removeFromKnowledgeBase] = useMutation(REMOVE_FROM_KNOWLEDGE_BASE);
  const [syncKnowledgeBaseSource] = useMutation(SYNC_KNOWLEDGE_BASE_SOURCE);

  // Lazy query for private Raven channel
  const [fetchRavenChannel] = useLazyQuery(GET_MY_RAVEN_CHANNEL, {
    onCompleted: (data) => {
      if (data?.getMyRavenChannel) {
        setRavenChannel(data.getMyRavenChannel);
        setActiveChannelIdState(data.getMyRavenChannel.id);
        setActiveView('raven');
      }
    }
  });

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
    if ((!messageInput.trim() && !pendingImage) || isSending) return;

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
      // Upload image first if there's one pending
      let imageUrl = null;
      if (pendingImage) {
        const attachment = await uploadImage();
        if (attachment) {
          imageUrl = attachment.url;
          // Add image reference to content
          content = content ? `${content}\n\n![${attachment.originalName}](${attachment.url})` : `![${pendingImage.filename}](${attachment.url})`;
        }
        handleRemovePendingImage();
      }

      await sendMessage({
        variables: {
          channelId: activeChannelId,
          input: { content: content || '(Image)', replyToMessageId }
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

  // Site Admin handlers
  const handleOpenSiteAdmin = () => {
    setShowSiteAdminPanel(true);
    fetchSiteInvites();
  };

  const handleCreateSiteInvite = async (e) => {
    e.preventDefault();
    if (!siteInviteEmail.trim() || siteInviteSending) return;

    setSiteInviteSending(true);
    try {
      await createSiteInvite({
        variables: { email: siteInviteEmail.trim() }
      });
      setSiteInviteEmail('');
      fetchSiteInvites();
    } catch (error) {
      console.error('Error creating site invite:', error);
      alert('Failed to create invite: ' + error.message);
    } finally {
      setSiteInviteSending(false);
    }
  };

  const handleRevokeSiteInvite = async (inviteId) => {
    if (!window.confirm('Are you sure you want to revoke this invite?')) return;

    try {
      await revokeSiteInvite({
        variables: { inviteId }
      });
      fetchSiteInvites();
    } catch (error) {
      console.error('Error revoking invite:', error);
      alert('Failed to revoke invite: ' + error.message);
    }
  };

  // Google Drive handlers
  const handleConnectGoogleDrive = async () => {
    try {
      // Pass origin so callback knows where to redirect back
      const origin = encodeURIComponent(window.location.origin);
      const response = await fetch(`${API_BASE_URL}/oauth/google/start?userId=${user.uid}&origin=${origin}`);
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error(data.error || 'Failed to get auth URL');
      }
    } catch (error) {
      console.error('Error connecting Google Drive:', error);
      alert('Failed to connect Google Drive: ' + error.message);
    }
  };

  const handleOpenDrivePanel = () => {
    setShowDrivePanel(true);
    if (googleIntegration) {
      fetchDriveFiles({ variables: { folderId: 'root', pageSize: 20 } });
    }
  };

  const handleDriveFolderClick = (file) => {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      setDriveFolderId(file.id);
      setDriveFolderStack([...driveFolderStack, { id: file.id, name: file.name }]);
      fetchDriveFiles({ variables: { folderId: file.id, pageSize: 20 } });
    }
  };

  const handleDriveNavigateBack = (index) => {
    const folder = driveFolderStack[index];
    setDriveFolderId(folder.id);
    setDriveFolderStack(driveFolderStack.slice(0, index + 1));
    fetchDriveFiles({ variables: { folderId: folder.id, pageSize: 20 } });
  };

  const handleDisconnectGoogleDrive = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Drive?')) return;

    try {
      await disconnectIntegration({ variables: { provider: 'google' } });
      refetchIntegrations();
      setShowDrivePanel(false);
    } catch (error) {
      console.error('Error disconnecting Google Drive:', error);
      alert('Failed to disconnect: ' + error.message);
    }
  };

  const handleImportDriveFile = async (file) => {
    try {
      await importDriveFile({
        variables: { teamId, fileId: file.id }
      });
      alert(`Imported "${file.name}" to knowledge base!`);
    } catch (error) {
      console.error('Error importing file:', error);
      alert('Failed to import file: ' + error.message);
    }
  };

  const getDriveFileIcon = (mimeType) => {
    if (mimeType === 'application/vnd.google-apps.folder') return '📁';
    if (mimeType === 'application/vnd.google-apps.document') return '📄';
    if (mimeType === 'application/vnd.google-apps.spreadsheet') return '📊';
    if (mimeType === 'application/vnd.google-apps.presentation') return '📽️';
    return '📎';
  };

  const isImportableFile = (mimeType) => {
    return [
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.google-apps.presentation'
    ].includes(mimeType);
  };

  // Google Picker for Knowledge Base
  const [pickerLoaded, setPickerLoaded] = useState(false);

  const loadGooglePicker = () => {
    return new Promise((resolve, reject) => {
      if (window.google?.picker) {
        resolve();
        return;
      }
      // Load Google API script
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('picker', () => {
          setPickerLoaded(true);
          resolve();
        });
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });
  };

  const openGooglePicker = async () => {
    try {
      // Load picker if not already loaded
      await loadGooglePicker();

      // Get picker config from backend (includes fresh access token)
      const { data } = await fetchPickerConfig();
      const config = data?.getGooglePickerConfig;

      if (!config) {
        alert('Failed to get Google Picker configuration. Please reconnect Google Drive.');
        return;
      }

      // Create picker
      const picker = new window.google.picker.PickerBuilder()
        .addView(new window.google.picker.DocsView()
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true))
        .addView(new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
          .setSelectFolderEnabled(true))
        .setOAuthToken(config.accessToken)
        .setDeveloperKey(config.apiKey || '')
        .setAppId(config.appId)
        .setCallback(handlePickerCallback)
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setTitle('Select files or folders for Knowledge Base')
        .build();

      picker.setVisible(true);
    } catch (error) {
      console.error('Error opening Google Picker:', error);
      alert('Failed to open file picker: ' + error.message);
    }
  };

  const handlePickerCallback = async (data) => {
    if (data.action === window.google.picker.Action.PICKED) {
      const docs = data.docs || [];

      for (const doc of docs) {
        try {
          await addToKnowledgeBase({
            variables: {
              teamId,
              input: {
                provider: 'google_drive',
                sourceType: doc.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
                sourceId: doc.id,
                sourceName: doc.name,
                sourcePath: doc.parentId ? `/${doc.name}` : doc.name,
                sourceMimeType: doc.mimeType,
                sourceUrl: doc.url
              }
            }
          });
        } catch (error) {
          console.error(`Error adding ${doc.name} to KB:`, error);
          alert(`Failed to add "${doc.name}": ${error.message}`);
        }
      }

      // Refresh KB sources immediately and poll for sync completion
      refetchKbSources();

      // Poll every 2s for 30s to catch when sync finishes
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        pollCount++;
        refetchKbSources();
        if (pollCount >= 15) { // Stop after 30s
          clearInterval(pollInterval);
        }
      }, 2000);

      // Also clear interval if all sources are synced
      const checkSynced = setInterval(() => {
        const allSynced = kbSources.every(s => s.status === 'synced' || s.status === 'error');
        if (allSynced && kbSources.length > 0) {
          clearInterval(pollInterval);
          clearInterval(checkSynced);
        }
      }, 2000);
    }
  };

  const handleRemoveKbSource = (sourceId, sourceName) => {
    // Use setTimeout to defer the confirm dialog, avoiding blocking the paint
    setTimeout(async () => {
      if (!window.confirm(`Remove "${sourceName}" from Knowledge Base?`)) return;

      setDeletingKbSourceId(sourceId);
      try {
        await removeFromKnowledgeBase({ variables: { teamId, sourceId } });
        refetchKbSources();
      } catch (error) {
        console.error('Error removing KB source:', error);
        alert('Failed to remove: ' + error.message);
      } finally {
        setDeletingKbSourceId(null);
      }
    }, 0);
  };

  const handleSyncKbSource = async (sourceId) => {
    setSyncingKbSourceId(sourceId);
    try {
      const { data } = await syncKnowledgeBaseSource({ variables: { teamId, sourceId } });
      const result = data?.syncKnowledgeBaseSource;
      if (result) {
        alert(`Synced! Added: ${result.documentsAdded}, Updated: ${result.documentsUpdated}`);
      }
      refetchKbSources();
    } catch (error) {
      console.error('Error syncing KB source:', error);
      alert('Failed to sync: ' + error.message);
    } finally {
      setSyncingKbSourceId(null);
    }
  };

  // Image upload handlers
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image too large. Maximum size is 10MB');
      return;
    }

    // Read as base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      setPendingImage({
        data: base64,
        filename: file.name,
        mimeType: file.type,
        preview: reader.result
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePendingImage = () => {
    setPendingImage(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const uploadImage = async () => {
    if (!pendingImage) return null;

    setImageUploading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.uid
        },
        body: JSON.stringify({
          data: pendingImage.data,
          filename: pendingImage.filename,
          mimeType: pendingImage.mimeType,
          teamId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const attachment = await response.json();
      console.log('Upload successful:', attachment);
      console.log('Image URL:', attachment.url);
      return attachment;
    } catch (error) {
      console.error('Image upload error:', error);
      alert('Failed to upload image: ' + error.message);
      return null;
    } finally {
      setImageUploading(false);
    }
  };

  // GIF Picker handlers
  const handleOpenGifPicker = async () => {
    setShowGifPicker(true);
    setGifSearchQuery('');
    setGifLoading(true);
    try {
      const { data } = await fetchTrendingGifs({ variables: { limit: 20 } });
      setGifResults(data?.getTrendingGifs || []);
    } catch (error) {
      console.error('Failed to load trending GIFs:', error);
    } finally {
      setGifLoading(false);
    }
  };

  const handleGifSearch = async (query) => {
    setGifSearchQuery(query);

    // Clear previous timeout
    if (gifSearchTimeoutRef.current) {
      clearTimeout(gifSearchTimeoutRef.current);
    }

    if (!query.trim()) {
      // Load trending if search is cleared
      setGifLoading(true);
      try {
        const { data } = await fetchTrendingGifs({ variables: { limit: 20 } });
        setGifResults(data?.getTrendingGifs || []);
      } catch (error) {
        console.error('Failed to load trending GIFs:', error);
      } finally {
        setGifLoading(false);
      }
      return;
    }

    // Debounce search
    gifSearchTimeoutRef.current = setTimeout(async () => {
      setGifLoading(true);
      try {
        const { data } = await searchGifs({ variables: { query: query.trim(), limit: 20 } });
        setGifResults(data?.searchGifs || []);
      } catch (error) {
        console.error('GIF search error:', error);
      } finally {
        setGifLoading(false);
      }
    }, 300);
  };

  const handleSelectGif = (gif) => {
    // Insert GIF as markdown image in the message
    const gifMarkdown = `![${gif.title || 'GIF'}](${gif.url})`;
    setMessageInput(prev => prev ? `${prev} ${gifMarkdown}` : gifMarkdown);
    setShowGifPicker(false);
    inputRef.current?.focus();
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

  // Create a new learning objective
  const handleCreateLO = async (e) => {
    e.preventDefault();
    if (!newLOTitle.trim()) return;

    try {
      await createLearningObjective({
        variables: {
          teamId,
          input: {
            title: newLOTitle.trim(),
            description: newLODescription.trim() || null,
            assignedTo: newLOAssignedTo === 'raven' ? null : newLOAssignedTo
          }
        }
      });

      setNewLOTitle('');
      setNewLODescription('');
      setNewLOAssignedTo('raven');
      setShowCreateLO(false);
      refetchLOs();
    } catch (error) {
      console.error('Error creating learning objective:', error);
      alert('Failed to create learning objective: ' + error.message);
    }
  };

  // Ask Raven to generate a follow-up question
  const handleAskFollowUp = async (questionId) => {
    setRequestingFollowUp(questionId);
    try {
      await askFollowUpQuestion({
        variables: { questionId }
      });
      refetchQuestions();
      if (selectedLOId) {
        refetchSelectedLO();
      }
    } catch (error) {
      console.error('Error requesting follow-up:', error);
      alert('Failed to request follow-up: ' + error.message);
    } finally {
      setRequestingFollowUp(null);
    }
  };

  // Reject a question and get a replacement
  const handleRejectQuestion = async (questionId, reason = null) => {
    try {
      await rejectQuestion({
        variables: { questionId, reason }
      });
      refetchQuestions();
      if (selectedLOId) {
        refetchSelectedLO();
      }
    } catch (error) {
      console.error('Error rejecting question:', error);
      alert('Failed to reject question: ' + error.message);
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

  // Get filtered mention options for answer textarea (same list, different query)
  const getAnswerMentionOptions = () => {
    const members = team?.members || [];
    const options = [];

    // Add team members (no Raven AI in answers - these are human answers)
    members.forEach(member => {
      if (member.user) {
        options.push({
          type: 'member',
          id: member.userId,
          name: member.user.displayName || member.user.email?.split('@')[0] || 'User',
          displayName: member.user.displayName || member.user.email,
          email: member.user.email
        });
      }
    });

    if (answerMentionQuery) {
      const query = answerMentionQuery.toLowerCase();
      return options.filter(opt =>
        opt.name.toLowerCase().includes(query) ||
        opt.displayName.toLowerCase().includes(query) ||
        (opt.email && opt.email.toLowerCase().includes(query))
      );
    }
    return options;
  };

  // Handle answer input change to detect @mentions
  const handleAnswerInputChange = (e) => {
    const value = e.target.value;
    setQuestionAnswerText(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);

    // Find the last @ before cursor
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Check if it's a valid mention context (@ followed by word chars, no spaces)
      if (/^[\w]*$/.test(textAfterAt)) {
        setAnswerMentionQuery(textAfterAt.toLowerCase());
        setAnswerMentionStartPos(lastAtIndex);
        setAnswerShowMentions(true);
        setAnswerMentionIndex(0);
        return;
      }
    }

    setAnswerShowMentions(false);
    setAnswerMentionQuery('');
    setAnswerMentionStartPos(null);
  };

  // Select a mention in answer textarea
  const handleAnswerSelectMention = (option) => {
    const beforeAt = questionAnswerText.substring(0, answerMentionStartPos);
    const afterQuery = questionAnswerText.substring(answerMentionStartPos + 1 + answerMentionQuery.length);
    const mentionText = `@${option.name} `;
    const newValue = beforeAt + mentionText + afterQuery;
    setQuestionAnswerText(newValue);
    setAnswerShowMentions(false);
    setAnswerMentionQuery('');
    setAnswerMentionStartPos(null);

    // Focus textarea and set cursor after mention
    setTimeout(() => {
      answerTextareaRef.current?.focus();
      const newCursorPos = beforeAt.length + mentionText.length;
      answerTextareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Handle keyboard navigation in answer mentions
  const handleAnswerKeyDown = (e) => {
    const options = getAnswerMentionOptions();

    if (answerShowMentions && options.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAnswerMentionIndex(i => (i + 1) % options.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAnswerMentionIndex(i => (i - 1 + options.length) % options.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleAnswerSelectMention(options[answerMentionIndex]);
      } else if (e.key === 'Escape') {
        setAnswerShowMentions(false);
      }
    }
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

  // Handle opening private Raven chat
  const handleOpenRavenChat = () => {
    if (ravenChannel) {
      // Already have the channel, just switch to it
      setActiveChannelIdState(ravenChannel.id);
      setActiveView('raven');
    } else {
      // Fetch/create the Raven channel
      fetchRavenChannel({ variables: { teamId } });
    }
    setSidebarOpen(false);
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

          {/* Private Raven Chat */}
          <div className="nav-section">
            <button
              className={`nav-section-header nav-single ${activeView === 'raven' ? 'active' : ''}`}
              onClick={handleOpenRavenChat}
            >
              <span className="nav-expand-icon" style={{ visibility: 'hidden' }}>▶</span>
              <span className="nav-icon">🪶</span>
              <span className="nav-label">Raven</span>
              <span className="nav-badge nav-badge-private">Private</span>
            </button>
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

          {/* Learning Objectives / Research */}
          <div className="nav-section">
            <button
              className={`nav-section-header nav-single ${activeView === 'learning' ? 'active' : ''}`}
              onClick={() => handleSectionItemClick('learning', 'learning')}
            >
              <span className="nav-expand-icon" style={{ visibility: 'hidden' }}>▶</span>
              <span className="nav-icon">📚</span>
              <span className="nav-label">Research</span>
              {losAvailable && learningObjectives.filter(lo => lo.status === 'active').length > 0 && (
                <span className="nav-badge">{learningObjectives.filter(lo => lo.status === 'active').length}</span>
              )}
            </button>
          </div>

          {/* Calendar */}
          <div className="nav-section">
            <button
              className={`nav-section-header nav-single ${activeView === 'calendar' ? 'active' : ''}`}
              onClick={() => handleSectionItemClick('calendar', 'calendar')}
            >
              <span className="nav-expand-icon" style={{ visibility: 'hidden' }}>▶</span>
              <span className="nav-icon">📅</span>
              <span className="nav-label">Calendar</span>
            </button>
          </div>

          {/* Knowledge Base - simplified single nav item */}
          <div className="nav-section">
            <button
              className={`nav-section-header nav-single ${activeView === 'knowledge' ? 'active' : ''}`}
              onClick={() => handleSectionItemClick('knowledge', 'knowledge')}
            >
              <span className="nav-expand-icon" style={{ visibility: 'hidden' }}>▶</span>
              <span className="nav-icon">🧠</span>
              <span className="nav-label">Knowledge Base</span>
              {kbSources.length > 0 && <span className="nav-count">{kbSources.length}</span>}
            </button>
            {/* Google Drive - sub-item of Knowledge Base */}
            <button
              className={`nav-item nav-sub-item ${googleIntegration ? 'nav-drive-connected' : ''}`}
              onClick={handleOpenDrivePanel}
              title="Google Drive"
            >
              <span className="nav-icon">📁</span>
              <span className="nav-label">Drive</span>
              {googleIntegration && <span className="nav-status-dot connected"></span>}
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

      {/* Site Admin Panel Modal */}
      {showSiteAdminPanel && (
        <div className="modal-overlay" onClick={() => setShowSiteAdminPanel(false)}>
          <div className="modal site-admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Site Administration</h3>
            <p className="modal-subtitle">Manage who can join RavenLoom</p>

            {/* Create Site Invite Form */}
            <form onSubmit={handleCreateSiteInvite} className="site-invite-form">
              <input
                type="email"
                value={siteInviteEmail}
                onChange={(e) => setSiteInviteEmail(e.target.value)}
                placeholder="email@example.com"
                className="input-field"
                required
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={siteInviteSending}
              >
                {siteInviteSending ? 'Inviting...' : 'Invite to Site'}
              </button>
            </form>

            {/* Site Invites List */}
            <div className="site-invites-list">
              <h4>Pending Invites</h4>
              {siteInvites.filter(i => i.status === 'pending').length === 0 ? (
                <p className="no-invites">No pending invites</p>
              ) : (
                siteInvites.filter(i => i.status === 'pending').map(invite => (
                  <div key={invite.id} className="site-invite-item">
                    <div className="invite-info">
                      <span className="invite-email">{invite.email}</span>
                      <span className="invite-date">
                        Invited {new Date(invite.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRevokeSiteInvite(invite.id)}
                      className="btn-danger-small"
                      title="Revoke invite"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}

              <h4>Accepted Invites</h4>
              {siteInvites.filter(i => i.status === 'accepted').length === 0 ? (
                <p className="no-invites">No accepted invites yet</p>
              ) : (
                siteInvites.filter(i => i.status === 'accepted').map(invite => (
                  <div key={invite.id} className="site-invite-item accepted">
                    <div className="invite-info">
                      <span className="invite-email">{invite.email}</span>
                      <span className="invite-status">✓ Accepted</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={() => setShowSiteAdminPanel(false)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Panel Modal */}
      {showDrivePanel && (
        <div className="modal-overlay" onClick={() => setShowDrivePanel(false)}>
          <div className="modal drive-panel-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Google Drive</h3>

            {!googleIntegration ? (
              <div className="drive-connect-prompt">
                <p>Connect your Google Drive to import documents, spreadsheets, and presentations into your knowledge base.</p>
                <button onClick={handleConnectGoogleDrive} className="btn-primary">
                  Connect Google Drive
                </button>
              </div>
            ) : (
              <>
                <p className="modal-subtitle">
                  Connected as {googleIntegration.providerEmail}
                </p>

                {/* Breadcrumb Navigation */}
                <div className="drive-breadcrumb">
                  {driveFolderStack.map((folder, index) => (
                    <span key={folder.id}>
                      {index > 0 && <span className="breadcrumb-sep">/</span>}
                      <button
                        className="breadcrumb-link"
                        onClick={() => handleDriveNavigateBack(index)}
                      >
                        {folder.name}
                      </button>
                    </span>
                  ))}
                </div>

                {/* File List */}
                <div className="drive-file-list">
                  {driveLoading ? (
                    <div className="drive-loading">Loading files...</div>
                  ) : driveFiles.length === 0 ? (
                    <div className="drive-empty">No files in this folder</div>
                  ) : (
                    driveFiles.map(file => (
                      <div
                        key={file.id}
                        className={`drive-file-item ${file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : ''}`}
                        onClick={() => handleDriveFolderClick(file)}
                      >
                        <span className="drive-file-icon">{getDriveFileIcon(file.mimeType)}</span>
                        <span className="drive-file-name">{file.name}</span>
                        {isImportableFile(file.mimeType) && (
                          <button
                            className="drive-import-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleImportDriveFile(file);
                            }}
                            title="Import to knowledge base"
                          >
                            Import
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    onClick={handleDisconnectGoogleDrive}
                    className="btn-danger-small"
                  >
                    Disconnect
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDrivePanel(false)}
                    className="btn-secondary"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* GIF Picker Modal */}
      {showGifPicker && (
        <div className="modal-overlay" onClick={() => setShowGifPicker(false)}>
          <div className="modal gif-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gif-picker-header">
              <h3>Choose a GIF</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowGifPicker(false)}
              >
                ✕
              </button>
            </div>

            <div className="gif-search-container">
              <input
                type="text"
                value={gifSearchQuery}
                onChange={(e) => handleGifSearch(e.target.value)}
                placeholder="Search GIFs..."
                className="gif-search-input"
                autoFocus
              />
            </div>

            <div className="gif-results-container">
              {gifLoading ? (
                <div className="gif-loading">
                  <div className="loading-spinner"></div>
                  <span>Loading GIFs...</span>
                </div>
              ) : gifResults.length === 0 ? (
                <div className="gif-empty">
                  <p>No GIFs found. Try a different search.</p>
                </div>
              ) : (
                <div className="gif-grid">
                  {gifResults.map(gif => (
                    <button
                      key={gif.id}
                      type="button"
                      className="gif-item"
                      onClick={() => handleSelectGif(gif)}
                      title={gif.title || 'GIF'}
                    >
                      <img
                        src={gif.previewUrl || gif.url}
                        alt={gif.title || 'GIF'}
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="gif-footer">
              <span className="tenor-attribution">Powered by Tenor</span>
            </div>
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
            <div className="header-spacer"></div>
            <div className="header-brand">
              <img src="/web-app-manifest-192x192.png" alt="" className="header-brand-logo" />
              <span className="header-brand-name">RavenLoom</span>
            </div>
            <div className="header-spacer"></div>
            <div className="user-menu-container">
              <button
                className="user-menu-btn"
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-label="User menu"
              >
                <span></span><span></span><span></span>
              </button>
              {showUserMenu && (
                <>
                  <div className="user-menu-overlay" onClick={() => setShowUserMenu(false)}></div>
                  <div className="user-menu-dropdown">
                    <a href="/privacy" className="user-menu-item">Privacy Policy</a>
                    <a href="/terms" className="user-menu-item">Terms of Service</a>
                    <a href="/help" className="user-menu-item">Help</a>
                    {isSiteAdmin && (
                      <button onClick={() => { setShowUserMenu(false); handleOpenSiteAdmin(); }} className="user-menu-item">Admin</button>
                    )}
                    <div className="user-menu-divider"></div>
                    <button onClick={onSignOut} className="user-menu-item user-menu-signout">Sign Out</button>
                  </div>
                </>
              )}
            </div>
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

            {/* Image Preview */}
            {pendingImage && (
              <div className="pending-image-preview">
                <img src={pendingImage.preview} alt="Preview" />
                <button
                  type="button"
                  className="remove-image-btn"
                  onClick={handleRemovePendingImage}
                  title="Remove image"
                >
                  ✕
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="message-form">
              {/* Hidden file input */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="image-upload-btn"
                onClick={() => imageInputRef.current?.click()}
                disabled={imageUploading}
                title="Attach image"
              >
                📷
              </button>
              <button
                type="button"
                className="gif-picker-btn"
                onClick={handleOpenGifPicker}
                title="Add GIF"
              >
                GIF
              </button>
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
                disabled={isSending || (!messageInput.trim() && !pendingImage) || !activeChannelId}
                className="send-btn"
              >
                {isSending || imageUploading ? '...' : 'Send'}
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
            <div className="user-menu-container">
              <button className="user-menu-btn" onClick={() => setShowUserMenu(!showUserMenu)} aria-label="User menu">
                <span></span><span></span><span></span>
              </button>
              {showUserMenu && (
                <>
                  <div className="user-menu-overlay" onClick={() => setShowUserMenu(false)}></div>
                  <div className="user-menu-dropdown">
                    <a href="/privacy" className="user-menu-item">Privacy Policy</a>
                    <a href="/terms" className="user-menu-item">Terms of Service</a>
                    <a href="/help" className="user-menu-item">Help</a>
                    {isSiteAdmin && (
                      <button onClick={() => { setShowUserMenu(false); handleOpenSiteAdmin(); }} className="user-menu-item">Admin</button>
                    )}
                    <div className="user-menu-divider"></div>
                    <button onClick={onSignOut} className="user-menu-item user-menu-signout">Sign Out</button>
                  </div>
                </>
              )}
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
            <div className="header-spacer"></div>
            <div className="user-menu-container">
              <button className="user-menu-btn" onClick={() => setShowUserMenu(!showUserMenu)} aria-label="User menu">
                <span></span><span></span><span></span>
              </button>
              {showUserMenu && (
                <>
                  <div className="user-menu-overlay" onClick={() => setShowUserMenu(false)}></div>
                  <div className="user-menu-dropdown">
                    <a href="/privacy" className="user-menu-item">Privacy Policy</a>
                    <a href="/terms" className="user-menu-item">Terms of Service</a>
                    <a href="/help" className="user-menu-item">Help</a>
                    {isSiteAdmin && (
                      <button onClick={() => { setShowUserMenu(false); handleOpenSiteAdmin(); }} className="user-menu-item">Admin</button>
                    )}
                    <div className="user-menu-divider"></div>
                    <button onClick={onSignOut} className="user-menu-item user-menu-signout">Sign Out</button>
                  </div>
                </>
              )}
            </div>
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
                          {/* Ask Follow-up Button */}
                          <button
                            className="btn-link followup-btn"
                            onClick={() => handleAskFollowUp(q.id)}
                            disabled={requestingFollowUp === q.id}
                          >
                            {requestingFollowUp === q.id ? 'Generating follow-up...' : 'Ask Raven to dig deeper'}
                          </button>
                        </div>
                      )}

                      {q.status === 'open' && (
                        answeringQuestionId === q.id ? (
                          <div className="answer-form">
                            <div className="answer-input-container">
                              <textarea
                                ref={answerTextareaRef}
                                value={questionAnswerText}
                                onChange={handleAnswerInputChange}
                                onKeyDown={handleAnswerKeyDown}
                                placeholder="Share your knowledge... (type @ to mention someone)"
                                rows={3}
                                className="answer-input"
                              />
                              {answerShowMentions && (
                                <div className="mention-popup answer-mention-popup">
                                  {getAnswerMentionOptions().length > 0 ? (
                                    getAnswerMentionOptions().map((option, i) => (
                                      <button
                                        key={option.id}
                                        className={`mention-option ${i === answerMentionIndex ? 'selected' : ''}`}
                                        onClick={() => handleAnswerSelectMention(option)}
                                        onMouseEnter={() => setAnswerMentionIndex(i)}
                                      >
                                        <span className="mention-avatar">{option.name[0].toUpperCase()}</span>
                                        <span className="mention-name">{option.displayName}</span>
                                      </button>
                                    ))
                                  ) : (
                                    <div className="mention-empty">No matches found</div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="answer-form-actions">
                              <button
                                className="btn-secondary"
                                onClick={() => { setAnsweringQuestionId(null); setQuestionAnswerText(''); setAnswerShowMentions(false); }}
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
                            <p className="answer-note">Your answer will be added to the knowledge base. @mention team members to tag them.</p>
                          </div>
                        ) : (
                          <div className="question-action-buttons">
                            <button
                              className="btn-secondary answer-btn"
                              onClick={() => setAnsweringQuestionId(q.id)}
                            >
                              I can answer this
                            </button>
                            {q.askedByRaven && (
                              <button
                                className="btn-reject"
                                onClick={() => handleRejectQuestion(q.id, 'Too deep or off-topic')}
                                title="Reject this question and get a different one"
                              >
                                Not relevant
                              </button>
                            )}
                          </div>
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
      ) : activeView === 'raven' ? (
        <main className="chat-area raven-chat">
          {/* Raven Chat Header */}
          <header className="chat-header">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <h3>🪶 Raven <span className="header-badge-private">Private</span></h3>
            <p className="channel-description">Your private chat with Raven</p>
            <div className="header-spacer"></div>
            <div className="header-brand">
              <img src="/web-app-manifest-192x192.png" alt="" className="header-brand-logo" />
              <span className="header-brand-name">RavenLoom</span>
            </div>
            <div className="header-spacer"></div>
            <div className="user-menu-container">
              <button
                className="user-menu-btn"
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-label="User menu"
              >
                <span></span><span></span><span></span>
              </button>
              {showUserMenu && (
                <>
                  <div className="user-menu-overlay" onClick={() => setShowUserMenu(false)}></div>
                  <div className="user-menu-dropdown">
                    <a href="/privacy" className="user-menu-item">Privacy Policy</a>
                    <a href="/terms" className="user-menu-item">Terms of Service</a>
                    <a href="/help" className="user-menu-item">Help</a>
                    {isSiteAdmin && (
                      <button onClick={() => { setShowUserMenu(false); handleOpenSiteAdmin(); }} className="user-menu-item">Admin</button>
                    )}
                    <div className="user-menu-divider"></div>
                    <button onClick={onSignOut} className="user-menu-item user-menu-signout">Sign Out</button>
                  </div>
                </>
              )}
            </div>
          </header>

          {/* Messages */}
          <div className="messages-container">
            {messagesLoading && messages.length === 0 ? (
              <div className="messages-loading">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="messages-empty">
                <div className="empty-icon">🪶</div>
                <h4>Private Chat with Raven</h4>
                <p>This is your private space to chat with Raven. Other team members won't see these messages.</p>
                <p className="text-muted" style={{ marginTop: '8px', fontSize: '13px' }}>
                  Note: When you use <code>@raven remember</code>, the knowledge is still shared with your team.
                </p>
                <div className="empty-suggestions">
                  <button className="suggestion-btn" onClick={() => setMessageInput('@raven What do you know about our team?')}>
                    What do you know?
                  </button>
                  <button className="suggestion-btn" onClick={() => setMessageInput('@raven remember ')}>
                    @raven remember...
                  </button>
                </div>
              </div>
            ) : (
              <div className="messages-list">
                {messages.map((message, index) => {
                  const prevMessage = messages[index - 1];
                  const isGrouped = prevMessage &&
                    !message.isAi && !prevMessage.isAi &&
                    message.user?.id === prevMessage.user?.id &&
                    (new Date(message.createdAt) - new Date(prevMessage.createdAt)) < 5 * 60 * 1000;

                  const isAiGrouped = prevMessage &&
                    message.isAi && prevMessage.isAi &&
                    (new Date(message.createdAt) - new Date(prevMessage.createdAt)) < 60 * 1000;

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
            <div className="message-input-wrapper">
              <textarea
                ref={inputRef}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Raven..."
                rows={1}
                disabled={sendingMessage}
              />
              <button
                onClick={handleSendMessage}
                disabled={!messageInput.trim() || sendingMessage}
                className="send-btn"
                title="Send message"
              >
                {sendingMessage ? '...' : '→'}
              </button>
            </div>
          </div>
        </main>
      ) : activeView === 'calendar' ? (
        <main className="calendar-area">
          <header className="calendar-header-bar">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <h3>Calendar</h3>
            <div className="header-spacer"></div>
            <div className="user-menu-container">
              <button className="user-menu-btn" onClick={() => setShowUserMenu(!showUserMenu)} aria-label="User menu">
                <span></span><span></span><span></span>
              </button>
              {showUserMenu && (
                <>
                  <div className="user-menu-overlay" onClick={() => setShowUserMenu(false)}></div>
                  <div className="user-menu-dropdown">
                    <a href="/privacy" className="user-menu-item">Privacy Policy</a>
                    <a href="/terms" className="user-menu-item">Terms of Service</a>
                    <a href="/help" className="user-menu-item">Help</a>
                    {isSiteAdmin && (
                      <button onClick={() => { setShowUserMenu(false); handleOpenSiteAdmin(); }} className="user-menu-item">Admin</button>
                    )}
                    <div className="user-menu-divider"></div>
                    <button onClick={onSignOut} className="user-menu-item user-menu-signout">Sign Out</button>
                  </div>
                </>
              )}
            </div>
          </header>
          <CalendarView teamId={teamId} />
        </main>
      ) : activeView === 'knowledge' ? (
        <main className="knowledge-area">
          {/* Knowledge Base Header */}
          <header className="knowledge-header">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <h3>Knowledge Base</h3>
            <p className="knowledge-subtitle">Connect external documents to enhance your team's AI</p>
            <div className="header-spacer"></div>
            <div className="user-menu-container">
              <button className="user-menu-btn" onClick={() => setShowUserMenu(!showUserMenu)} aria-label="User menu">
                <span></span><span></span><span></span>
              </button>
              {showUserMenu && (
                <>
                  <div className="user-menu-overlay" onClick={() => setShowUserMenu(false)}></div>
                  <div className="user-menu-dropdown">
                    <a href="/privacy" className="user-menu-item">Privacy Policy</a>
                    <a href="/terms" className="user-menu-item">Terms of Service</a>
                    <a href="/help" className="user-menu-item">Help</a>
                    {isSiteAdmin && (
                      <button onClick={() => { setShowUserMenu(false); handleOpenSiteAdmin(); }} className="user-menu-item">Admin</button>
                    )}
                    <div className="user-menu-divider"></div>
                    <button onClick={onSignOut} className="user-menu-item user-menu-signout">Sign Out</button>
                  </div>
                </>
              )}
            </div>
          </header>

          <div className="knowledge-content">
            {/* Integration Status */}
            {!googleIntegration ? (
              <div className="knowledge-connect-prompt">
                <div className="connect-card">
                  <span className="connect-icon">🔗</span>
                  <h4>Connect Google Drive</h4>
                  <p>Link your Google Drive to add documents to your team's knowledge base.</p>
                  <button onClick={handleConnectGoogleDrive} className="btn-primary">
                    Connect Google Drive
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Add Sources Button */}
                <div className="knowledge-actions">
                  <button onClick={openGooglePicker} className="btn-primary">
                    + Add from Google Drive
                  </button>
                </div>

                {/* Sources List */}
                <div className="knowledge-sources">
                  {kbSources.length === 0 ? (
                    <div className="knowledge-empty">
                      <span className="empty-icon">📂</span>
                      <p>No sources linked yet.</p>
                      <p className="text-muted">Click "Add from Google Drive" to select folders or files to include in your knowledge base.</p>
                    </div>
                  ) : (
                    <div className="sources-grid">
                      {kbSources.map((source) => (
                        <div key={source.id} className="source-card">
                          <div className="source-icon">
                            {source.sourceType === 'folder' ? '📁' :
                             source.sourceMimeType?.includes('document') ? '📄' :
                             source.sourceMimeType?.includes('spreadsheet') ? '📊' :
                             source.sourceMimeType?.includes('presentation') ? '📽️' : '📎'}
                          </div>
                          <div className="source-info">
                            <h4 className="source-name">{source.sourceName}</h4>
                            <div className="source-meta">
                              <span className={`source-status status-${source.status}`}>
                                {source.status === 'synced' ? '✓ Synced' :
                                 source.status === 'syncing' ? '⟳ Syncing...' :
                                 source.status === 'error' ? '⚠ Error' : '○ Pending'}
                              </span>
                              {source.fileCount > 0 && (
                                <span className="source-count">{source.fileCount} files</span>
                              )}
                            </div>
                            {source.syncError && (
                              <p className="source-error">{source.syncError}</p>
                            )}
                            {source.lastSyncedAt && (
                              <span className="source-synced">
                                Last synced: {new Date(source.lastSyncedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <div className="source-actions">
                            {source.sourceUrl && (
                              <a
                                href={source.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-icon"
                                title="Open in Google Drive"
                              >
                                🔗
                              </a>
                            )}
                            <button
                              onClick={() => handleSyncKbSource(source.id)}
                              className="btn-icon"
                              title="Sync now"
                              disabled={source.status === 'syncing' || syncingKbSourceId === source.id}
                            >
                              {syncingKbSourceId === source.id ? '⏳' : '🔄'}
                            </button>
                            <button
                              onClick={() => handleRemoveKbSource(source.id, source.sourceName)}
                              className="btn-icon btn-danger"
                              title="Remove from Knowledge Base"
                              disabled={deletingKbSourceId === source.id}
                            >
                              {deletingKbSourceId === source.id ? '⏳' : '✕'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      ) : activeView === 'learning' ? (
        <main className="learning-area">
          {/* Learning Objectives Header */}
          <header className="learning-header">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <h3>Research</h3>
            <button className="btn-primary btn-small" onClick={() => setShowCreateLO(true)}>
              + New Learning Objective
            </button>
            <div className="header-spacer"></div>
            <div className="user-menu-container">
              <button className="user-menu-btn" onClick={() => setShowUserMenu(!showUserMenu)} aria-label="User menu">
                <span></span><span></span><span></span>
              </button>
              {showUserMenu && (
                <>
                  <div className="user-menu-overlay" onClick={() => setShowUserMenu(false)}></div>
                  <div className="user-menu-dropdown">
                    <a href="/privacy" className="user-menu-item">Privacy Policy</a>
                    <a href="/terms" className="user-menu-item">Terms of Service</a>
                    <a href="/help" className="user-menu-item">Help</a>
                    {isSiteAdmin && (
                      <button onClick={() => { setShowUserMenu(false); handleOpenSiteAdmin(); }} className="user-menu-item">Admin</button>
                    )}
                    <div className="user-menu-divider"></div>
                    <button onClick={onSignOut} className="user-menu-item user-menu-signout">Sign Out</button>
                  </div>
                </>
              )}
            </div>
          </header>

          <div className="learning-objectives-content">
            {/* Create LO Modal */}
            {showCreateLO && (
              <div className="modal-overlay" onClick={() => setShowCreateLO(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Create Learning Objective</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newLOTitle.trim()) return;
                    try {
                      await createLearningObjective({
                        variables: {
                          teamId,
                          input: {
                            title: newLOTitle.trim(),
                            description: newLODescription.trim() || null,
                            assignedTo: newLOAssignedTo,
                            maxQuestions: newLOMaxQuestions
                          }
                        }
                      });
                      setNewLOTitle('');
                      setNewLODescription('');
                      setNewLOAssignedTo(null);
                      setNewLOMaxQuestions(5);
                      setShowCreateLO(false);
                      refetchLOs();
                    } catch (err) {
                      alert('Failed to create learning objective: ' + err.message);
                    }
                  }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="What do you want to learn about?"
                      value={newLOTitle}
                      onChange={(e) => setNewLOTitle(e.target.value)}
                      autoFocus
                    />
                    <textarea
                      className="input-field"
                      placeholder="Description (optional) - What's the context?"
                      value={newLODescription}
                      onChange={(e) => setNewLODescription(e.target.value)}
                      rows={3}
                      style={{ marginTop: '0.75rem' }}
                    />

                    <div className="lo-assign-section" style={{ marginTop: '1rem' }}>
                      <label className="form-label">Who should research this?</label>
                      <div className="lo-assign-options">
                        <label className={`lo-assign-option ${newLOAssignedTo === null ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="loAssignee"
                            checked={newLOAssignedTo === null}
                            onChange={() => setNewLOAssignedTo(null)}
                          />
                          <span className="option-icon">🐦</span>
                          <span className="option-label">Raven</span>
                          <span className="option-desc">AI generates questions, team answers</span>
                        </label>
                        {teamMembers?.map(member => (
                          <label
                            key={member.userId}
                            className={`lo-assign-option ${newLOAssignedTo === member.userId ? 'selected' : ''}`}
                          >
                            <input
                              type="radio"
                              name="loAssignee"
                              checked={newLOAssignedTo === member.userId}
                              onChange={() => setNewLOAssignedTo(member.userId)}
                            />
                            <span className="option-label">
                              {member.user?.displayName || member.user?.email}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {newLOAssignedTo === null && (
                      <div className="lo-max-questions" style={{ marginTop: '1rem' }}>
                        <label className="form-label">Max questions Raven can ask:</label>
                        <select
                          className="input-field"
                          value={newLOMaxQuestions}
                          onChange={(e) => setNewLOMaxQuestions(parseInt(e.target.value))}
                        >
                          <option value={3}>3 questions</option>
                          <option value={5}>5 questions</option>
                          <option value={10}>10 questions</option>
                          <option value={20}>20 questions</option>
                        </select>
                      </div>
                    )}

                    <div className="form-actions">
                      <button type="button" className="btn-secondary" onClick={() => setShowCreateLO(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" disabled={!newLOTitle.trim()}>
                        Create
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Selected LO Detail View */}
            {selectedLOId && selectedLO ? (
              <div className="lo-detail-view">
                <button className="btn-link back-btn" onClick={() => setSelectedLOId(null)}>
                  ← Back to all
                </button>
                <div className="lo-detail-header">
                  <div className="lo-title-row">
                    <h4>{selectedLO.title}</h4>
                    <span className={`lo-status ${selectedLO.status}`}>{selectedLO.status}</span>
                  </div>
                  <div className="lo-actions">
                    {selectedLO.status === 'active' && (
                      <button
                        className="btn-secondary btn-small"
                        onClick={async () => {
                          await updateLearningObjective({
                            variables: { objectiveId: selectedLO.id, input: { status: 'paused' } }
                          });
                          refetchSelectedLO();
                        }}
                      >
                        Pause Questions
                      </button>
                    )}
                    {selectedLO.status === 'paused' && (
                      <button
                        className="btn-primary btn-small"
                        onClick={async () => {
                          await updateLearningObjective({
                            variables: { objectiveId: selectedLO.id, input: { status: 'active' } }
                          });
                          refetchSelectedLO();
                        }}
                      >
                        Resume Questions
                      </button>
                    )}
                    {selectedLO.status !== 'completed' && (
                      <button
                        className="btn-secondary btn-small"
                        onClick={async () => {
                          if (confirm('Mark this research as complete?')) {
                            await updateLearningObjective({
                              variables: { objectiveId: selectedLO.id, input: { status: 'completed' } }
                            });
                            refetchSelectedLO();
                            refetchLOs();
                          }
                        }}
                      >
                        Mark Complete
                      </button>
                    )}
                  </div>
                </div>
                {selectedLO.description && (
                  <p className="lo-description">{selectedLO.description}</p>
                )}
                <div className="lo-meta">
                  <span>Researcher: {selectedLO.assignedToName || 'Raven'}</span>
                  <span>Progress: {selectedLO.answeredCount}/{selectedLO.questionCount} answered</span>
                  {selectedLO.assignedTo === null && (
                    <span>Questions: {selectedLO.questionsAsked}/{selectedLO.maxQuestions}</span>
                  )}
                </div>

                {/* Questions in this LO */}
                <div className="lo-questions">
                  <h5>Questions</h5>
                  {selectedLO.questions?.length === 0 ? (
                    <p className="no-questions">No questions yet. Raven is generating them...</p>
                  ) : (
                    selectedLO.questions?.map(q => (
                      <div key={q.id} className={`lo-question-card ${q.status}`}>
                        <div className="question-header">
                          <span className="question-source">
                            {q.askedByRaven ? 'Raven asked' : q.askedByName || 'Team member asked'}
                          </span>
                          <span className={`question-status ${q.status}`}>{q.status}</span>
                        </div>
                        <p className="question-text">{q.question}</p>

                        {q.status === 'answered' && q.answer && (
                          <div className="question-answer">
                            <span className="answer-label">Answer by {q.answeredByName || 'Team'}:</span>
                            <ReactMarkdown>{q.answer}</ReactMarkdown>

                            {/* Ask Follow-up Button */}
                            <button
                              className="btn-link followup-btn"
                              onClick={() => handleAskFollowUp(q.id)}
                              disabled={requestingFollowUp === q.id}
                            >
                              {requestingFollowUp === q.id ? 'Generating...' : 'Ask Raven to follow up'}
                            </button>
                          </div>
                        )}

                        {q.status === 'open' && (
                          answeringQuestionId === q.id ? (
                            <div className="answer-form">
                              <div className="answer-input-container">
                                <textarea
                                  ref={answerTextareaRef}
                                  value={questionAnswerText}
                                  onChange={handleAnswerInputChange}
                                  onKeyDown={handleAnswerKeyDown}
                                  placeholder="Share your knowledge... (type @ to mention someone)"
                                  rows={3}
                                  className="answer-input"
                                />
                                {answerShowMentions && (
                                  <div className="mention-popup answer-mention-popup">
                                    {getAnswerMentionOptions().length > 0 ? (
                                      getAnswerMentionOptions().map((option, i) => (
                                        <button
                                          key={option.id}
                                          className={`mention-option ${i === answerMentionIndex ? 'selected' : ''}`}
                                          onClick={() => handleAnswerSelectMention(option)}
                                          onMouseEnter={() => setAnswerMentionIndex(i)}
                                        >
                                          <span className="mention-avatar">{option.name[0].toUpperCase()}</span>
                                          <span className="mention-name">{option.displayName}</span>
                                        </button>
                                      ))
                                    ) : (
                                      <div className="mention-empty">No matches found</div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="answer-form-actions">
                                <button
                                  className="btn-secondary"
                                  onClick={() => { setAnsweringQuestionId(null); setQuestionAnswerText(''); setAnswerShowMentions(false); }}
                                >
                                  Cancel
                                </button>
                                <button
                                  className="btn-primary"
                                  onClick={async () => {
                                    await answerTeamQuestion({
                                      variables: {
                                        questionId: q.id,
                                        input: { answer: questionAnswerText.trim(), addToKnowledge: true }
                                      }
                                    });
                                    setAnsweringQuestionId(null);
                                    setQuestionAnswerText('');
                                    setAnswerShowMentions(false);
                                    refetchSelectedLO();
                                  }}
                                  disabled={!questionAnswerText.trim()}
                                >
                                  Submit Answer
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="question-action-buttons">
                              <button
                                className="btn-secondary answer-btn"
                                onClick={() => setAnsweringQuestionId(q.id)}
                              >
                                Answer this
                              </button>
                              {q.askedByRaven && (
                                <button
                                  className="btn-reject"
                                  onClick={() => handleRejectQuestion(q.id, 'Too deep or off-topic')}
                                  title="Reject this question and get a different one"
                                >
                                  Not relevant
                                </button>
                              )}
                            </div>
                          )
                        )}

                        {/* Follow-up questions */}
                        {q.followUpQuestions?.length > 0 && (
                          <div className="followup-questions-list">
                            {q.followUpQuestions.map(fq => (
                              <div key={fq.id} className={`followup-question ${fq.status}`}>
                                <span className="followup-indicator">↳ Follow-up</span>
                                <p className="question-text">{fq.question}</p>
                                {fq.answer && (
                                  <div className="question-answer">
                                    <ReactMarkdown>{fq.answer}</ReactMarkdown>
                                  </div>
                                )}
                                {fq.status === 'open' && (
                                  answeringQuestionId === fq.id ? (
                                    <div className="answer-form">
                                      <textarea
                                        value={questionAnswerText}
                                        onChange={(e) => setQuestionAnswerText(e.target.value)}
                                        placeholder="Your answer..."
                                        rows={2}
                                        className="answer-input"
                                      />
                                      <div className="answer-form-actions">
                                        <button
                                          className="btn-secondary btn-small"
                                          onClick={() => { setAnsweringQuestionId(null); setQuestionAnswerText(''); }}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          className="btn-primary btn-small"
                                          onClick={async () => {
                                            await answerTeamQuestion({
                                              variables: {
                                                questionId: fq.id,
                                                input: { answer: questionAnswerText.trim(), addToKnowledge: true }
                                              }
                                            });
                                            setAnsweringQuestionId(null);
                                            setQuestionAnswerText('');
                                            refetchSelectedLO();
                                          }}
                                          disabled={!questionAnswerText.trim()}
                                        >
                                          Submit
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="question-action-buttons">
                                      <button
                                        className="btn-secondary btn-small answer-btn"
                                        onClick={() => setAnsweringQuestionId(fq.id)}
                                      >
                                        Answer
                                      </button>
                                      {fq.askedByRaven && (
                                        <button
                                          className="btn-reject btn-small"
                                          onClick={() => handleRejectQuestion(fq.id, 'Too deep or off-topic')}
                                          title="Reject this question"
                                        >
                                          Not relevant
                                        </button>
                                      )}
                                    </div>
                                  )
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Learning Objectives List */
              <div className="lo-list">
                {!losAvailable ? (
                  <p className="lo-loading">Loading...</p>
                ) : learningObjectives.length === 0 ? (
                  <div className="lo-empty">
                    <p>No learning objectives yet.</p>
                    <p className="lo-empty-hint">Create one to start researching a topic with Raven's help!</p>
                  </div>
                ) : (
                  <>
                    {/* Active LOs */}
                    {learningObjectives.filter(lo => lo.status === 'active').length > 0 && (
                      <div className="lo-section">
                        <h5>Active Research</h5>
                        {learningObjectives.filter(lo => lo.status === 'active').map(lo => (
                          <div
                            key={lo.id}
                            className="lo-card active"
                            onClick={() => setSelectedLOId(lo.id)}
                          >
                            <div className="lo-card-header">
                              <span className="lo-title">{lo.title}</span>
                              <span className="lo-researcher">{lo.assignedToName || 'Raven'}</span>
                            </div>
                            <div className="lo-progress">
                              <div
                                className="lo-progress-bar"
                                style={{ width: `${(lo.answeredCount / Math.max(lo.questionCount, 1)) * 100}%` }}
                              />
                            </div>
                            <div className="lo-stats">
                              <span>{lo.answeredCount}/{lo.questionCount} answered</span>
                              <span>{new Date(lo.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Completed LOs */}
                    {learningObjectives.filter(lo => lo.status === 'completed').length > 0 && (
                      <div className="lo-section">
                        <h5>Completed</h5>
                        {learningObjectives.filter(lo => lo.status === 'completed').map(lo => (
                          <div
                            key={lo.id}
                            className="lo-card completed"
                            onClick={() => setSelectedLOId(lo.id)}
                          >
                            <div className="lo-card-header">
                              <span className="lo-title">{lo.title}</span>
                              <span className="lo-checkmark">✓</span>
                            </div>
                            <div className="lo-stats">
                              <span>{lo.answeredCount} questions answered</span>
                              <span>Completed {new Date(lo.completedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
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
            <div className="header-spacer"></div>
            <div className="user-menu-container">
              <button className="user-menu-btn" onClick={() => setShowUserMenu(!showUserMenu)} aria-label="User menu">
                <span></span><span></span><span></span>
              </button>
              {showUserMenu && (
                <>
                  <div className="user-menu-overlay" onClick={() => setShowUserMenu(false)}></div>
                  <div className="user-menu-dropdown">
                    <a href="/privacy" className="user-menu-item">Privacy Policy</a>
                    <a href="/terms" className="user-menu-item">Terms of Service</a>
                    <a href="/help" className="user-menu-item">Help</a>
                    {isSiteAdmin && (
                      <button onClick={() => { setShowUserMenu(false); handleOpenSiteAdmin(); }} className="user-menu-item">Admin</button>
                    )}
                    <div className="user-menu-divider"></div>
                    <button onClick={onSignOut} className="user-menu-item user-menu-signout">Sign Out</button>
                  </div>
                </>
              )}
            </div>
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
            <div className="header-spacer"></div>
            <div className="user-menu-container">
              <button className="user-menu-btn" onClick={() => setShowUserMenu(!showUserMenu)} aria-label="User menu">
                <span></span><span></span><span></span>
              </button>
              {showUserMenu && (
                <>
                  <div className="user-menu-overlay" onClick={() => setShowUserMenu(false)}></div>
                  <div className="user-menu-dropdown">
                    <a href="/privacy" className="user-menu-item">Privacy Policy</a>
                    <a href="/terms" className="user-menu-item">Terms of Service</a>
                    <a href="/help" className="user-menu-item">Help</a>
                    {isSiteAdmin && (
                      <button onClick={() => { setShowUserMenu(false); handleOpenSiteAdmin(); }} className="user-menu-item">Admin</button>
                    )}
                    <div className="user-menu-divider"></div>
                    <button onClick={onSignOut} className="user-menu-item user-menu-signout">Sign Out</button>
                  </div>
                </>
              )}
            </div>
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

// Wrap with ErrorBoundary to catch render errors
function TeamDashboardWithErrorBoundary(props) {
  return (
    <ErrorBoundary>
      <TeamDashboard {...props} />
    </ErrorBoundary>
  );
}

export default TeamDashboardWithErrorBoundary;

