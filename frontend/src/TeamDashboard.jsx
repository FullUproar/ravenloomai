import { gql, useQuery, useMutation, useLazyQuery } from '@apollo/client';
import { useState, useEffect, useRef, Component, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useToast } from './Toast.jsx';
import AdminDashboard from './pages/AdminDashboard';
import DataImportPage from './pages/DataImportPage';
import RavenCopilot from './components/RavenCopilot';
import { CommandPaletteProvider } from './components/CommandPalette';

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

const MARK_CHANNEL_SEEN = gql`
  mutation MarkChannelSeen($channelId: ID!) {
    markChannelSeen(channelId: $channelId)
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

// Team Settings (admin only)
const GET_TEAM_SETTINGS = gql`
  query GetTeamSettings($teamId: ID!) {
    getTeamSettings(teamId: $teamId) {
      aiEnabled
    }
  }
`;

const UPDATE_TEAM_SETTINGS = gql`
  mutation UpdateTeamSettings($teamId: ID!, $input: UpdateTeamSettingsInput!) {
    updateTeamSettings(teamId: $teamId, input: $input) {
      aiEnabled
    }
  }
`;


// ============================================================================
// TeamDashboard Component
// ============================================================================

function TeamDashboard({ teamId, initialView, initialItemId, user, onSignOut }) {
  const navigate = useNavigate();
  const toast = useToast();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Keyboard shortcuts modal state
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState(null);

  // Determine initial view from URL or default to 'raven'
  const getInitialView = () => {
    // Knowledge-focused views
    if (initialView === 'ask' || initialView === 'learning' || initialView === 'knowledge' || initialView === 'raven') {
      return initialView;
    }
    if (initialView === 'channel' || initialView === 'chat') {
      return 'chat';
    }
    return 'raven';  // Default to raven (AI copilot)
  };

  // UI state
  const [messageInput, setMessageInput] = useState('');
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteSending, setInviteSending] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState(null);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  // Site Admin state
  const [showSiteAdminPanel, setShowSiteAdminPanel] = useState(false);
  // Data Import state
  const [showDataImport, setShowDataImport] = useState(false);
  const [siteInviteEmail, setSiteInviteEmail] = useState('');
  const [siteInviteSending, setSiteInviteSending] = useState(false);
  // Google Drive state
  const [showDrivePanel, setShowDrivePanel] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState('root');
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);
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
  const [postingQuestion, setPostingQuestion] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  // Learning Objectives state
  const [askTab, setAskTab] = useState('questions'); // 'questions' or 'learning'
  const [showCreateLO, setShowCreateLO] = useState(false);
  const [selectedLOId, setSelectedLOId] = useState(null);
  const [newLOTitle, setNewLOTitle] = useState('');
  const [newLODescription, setNewLODescription] = useState('');
  const [newLOAssignedTo, setNewLOAssignedTo] = useState(null); // null = Raven, or a user ID
  const [newLOMaxQuestions, setNewLOMaxQuestions] = useState(5);
  const [requestingFollowUp, setRequestingFollowUp] = useState(null); // question ID
  const [creatingLO, setCreatingLO] = useState(false);
  const [rejectingQuestionId, setRejectingQuestionId] = useState(null); // question ID for reject dropdown
  const [rejectingQuestion, setRejectingQuestion] = useState(false); // loading state
  const [rejectDropdownPos, setRejectDropdownPos] = useState({ top: 0, left: 0 }); // position for fixed dropdown
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
  // Raven Copilot state
  const [copilotCollapsed, setCopilotCollapsed] = useState(false);
  // User menu dropdown state
  const [showUserMenu, setShowUserMenu] = useState(false);
  // Sidebar tree expansion state
  const [expandedSections, setExpandedSections] = useState({
    channels: true,
    team: false,
    knowledge: true
  });

  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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

  // Raven command suggestions (knowledge-focused)
  const ravenCommands = [
    { cmd: '@raven remember', desc: 'Save a fact to knowledge base', example: '@raven remember our API rate limit is 100/min' },
    { cmd: '@raven remind', desc: 'Set a reminder', example: '@raven remind me tomorrow to follow up' },
    { cmd: '@raven discuss', desc: 'Start a facilitated discussion', example: '@raven discuss our Q1 marketing strategy' },
    { cmd: '@raven decide', desc: 'Record a decision', example: '@raven decide We will use PostgreSQL because...' },
    { cmd: '@raven summarize', desc: 'Summarize recent discussion', example: '@raven summarize' },
    { cmd: '@raven search', desc: 'Search knowledge base', example: '@raven search deployment process' },
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

  // Fetch pending alerts (for reminders - will become "recalls")
  const { data: alertsData, refetch: refetchAlerts } = useQuery(GET_ALERTS, {
    variables: { teamId, status: 'pending' },
    fetchPolicy: 'cache-and-network',
    pollInterval: 30000 // Check every 30 seconds
  });
  const pendingAlerts = alertsData?.getAlerts || [];

  // Mutations
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [createChannel] = useMutation(CREATE_CHANNEL);
  const [markChannelSeen] = useMutation(MARK_CHANNEL_SEEN);
  const [inviteTeamMember] = useMutation(INVITE_TEAM_MEMBER);
  const [snoozeAlert] = useMutation(SNOOZE_ALERT);
  const [cancelAlert] = useMutation(CANCEL_ALERT);
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

  // Team Settings (admin only - will fail silently for non-admins)
  const { data: settingsData } = useQuery(GET_TEAM_SETTINGS, {
    variables: { teamId },
    skip: !teamId,
    // Don't show errors in console for non-admin users
    onError: () => {}
  });
  const teamSettings = settingsData?.getTeamSettings;
  const isAdmin = !!teamSettings; // If we can fetch settings, user is admin
  const [updateTeamSettingsMutation] = useMutation(UPDATE_TEAM_SETTINGS, {
    refetchQueries: [{ query: GET_TEAM_SETTINGS, variables: { teamId } }]
  });

  // Lazy query for private Raven channel (navigates to raven view)
  const [fetchRavenChannel] = useLazyQuery(GET_MY_RAVEN_CHANNEL, {
    onCompleted: (data) => {
      if (data?.getMyRavenChannel) {
        setRavenChannel(data.getMyRavenChannel);
        setActiveChannelIdState(data.getMyRavenChannel.id);
        setActiveView('raven');
      }
    }
  });

  // Separate query for Copilot - doesn't navigate
  const [fetchRavenChannelForCopilot] = useLazyQuery(GET_MY_RAVEN_CHANNEL, {
    onCompleted: (data) => {
      if (data?.getMyRavenChannel) {
        setRavenChannel(data.getMyRavenChannel);
      }
    }
  });

  // Fetch Raven channel if initial view is 'raven'
  useEffect(() => {
    if (initialView === 'raven' && teamId && !ravenChannel) {
      fetchRavenChannel({ variables: { teamId } });
    }
  }, [initialView, teamId, ravenChannel, fetchRavenChannel]);

  // Fetch Raven channel for Copilot (on any view except raven/chat/digest)
  useEffect(() => {
    if (teamId && !ravenChannel && initialView !== 'raven' && initialView !== 'chat' && initialView !== 'digest') {
      fetchRavenChannelForCopilot({ variables: { teamId } });
    }
  }, [teamId, ravenChannel, initialView, fetchRavenChannelForCopilot]);

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

      // "?" to show keyboard shortcuts (when not typing)
      if (e.key === '?' && !isTyping) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }

      // "Escape" to close popups or cancel reply
      if (e.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
        } else if (rejectingQuestionId) {
          setRejectingQuestionId(null);
        } else if (showMentions) {
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
          setActiveView('learning');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveView('ask');
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeView, showMentions, showCommands, replyingTo, showCreateChannel, showInviteModal, rejectingQuestionId, showShortcuts]);

  // Close reject dropdown when clicking outside
  useEffect(() => {
    if (!rejectingQuestionId) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.reject-dropdown-container')) {
        setRejectingQuestionId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [rejectingQuestionId]);

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
      toast.error('Failed to send message: ' + error.message);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!newChannelName.trim() || creatingChannel) return;

    setCreatingChannel(true);
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
      toast.error('Failed to create channel: ' + error.message);
    } finally {
      setCreatingChannel(false);
    }
  };

  const handleSelectChannel = (id) => {
    setActiveChannelIdState(id);
    setActiveView('chat', id);
    setSidebarOpen(false); // Close sidebar on mobile after selection
    // Mark channel as seen for digest tracking
    markChannelSeen({ variables: { channelId: id } }).catch(console.error);
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
      toast.error('Failed to send invite: ' + error.message);
    } finally {
      setInviteSending(false);
    }
  };

  const copyInviteLink = async () => {
    if (lastInviteLink) {
      await navigator.clipboard.writeText(lastInviteLink);
      toast.success('Invite link copied to clipboard!');
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
      toast.error('Failed to create invite: ' + error.message);
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
      toast.error('Failed to revoke invite: ' + error.message);
    }
  };

  // Google Drive handlers
  const handleConnectGoogleDrive = async () => {
    if (connectingDrive) return;
    setConnectingDrive(true);
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
      toast.error('Failed to connect Google Drive: ' + error.message);
      setConnectingDrive(false);
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
    if (disconnectingDrive) return;

    setDisconnectingDrive(true);
    try {
      await disconnectIntegration({ variables: { provider: 'google' } });
      refetchIntegrations();
      setShowDrivePanel(false);
    } catch (error) {
      console.error('Error disconnecting Google Drive:', error);
      toast.error('Failed to disconnect: ' + error.message);
    } finally {
      setDisconnectingDrive(false);
    }
  };

  const handleImportDriveFile = async (file) => {
    try {
      await importDriveFile({
        variables: { teamId, fileId: file.id }
      });
      toast.success(`Imported "${file.name}" to knowledge base!`);
    } catch (error) {
      console.error('Error importing file:', error);
      toast.error('Failed to import file: ' + error.message);
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
        toast.error('Failed to get Google Picker configuration. Please reconnect Google Drive.');
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
      toast.error('Failed to open file picker: ' + error.message);
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
          toast.error(`Failed to add "${doc.name}": ${error.message}`);
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
        toast.error('Failed to remove: ' + error.message);
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
        toast.success(`Synced! Added: ${result.documentsAdded}, Updated: ${result.documentsUpdated}`);
      }
      refetchKbSources();
    } catch (error) {
      console.error('Error syncing KB source:', error);
      toast.error('Failed to sync: ' + error.message);
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
      toast.warning('Please select an image file');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.warning('Image too large. Maximum size is 10MB');
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
      toast.error('Failed to upload image: ' + error.message);
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

  // REMOVED: Task handlers (handleCreateTask, handleStatusChange, handleToggleTaskStatus, etc.)
  // REMOVED: Task grouping variables (backlogTasks, todoTasks, etc.)
  // REMOVED: Bulk selection handlers
  // See git history for original implementation

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
    if (!askAnswer || !askHistory.length || postingQuestion) return;

    setPostingQuestion(true);
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
      toast.error('Failed to post question: ' + error.message);
    } finally {
      setPostingQuestion(false);
    }
  };

  // Answer a posted team question
  const handleAnswerQuestion = async (questionId) => {
    if (!questionAnswerText.trim() || submittingAnswer) return;

    setSubmittingAnswer(true);
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
      toast.error('Failed to submit answer: ' + error.message);
    } finally {
      setSubmittingAnswer(false);
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
      toast.error('Failed to create learning objective: ' + error.message);
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
      toast.error('Failed to request follow-up: ' + error.message);
    } finally {
      setRequestingFollowUp(null);
    }
  };

  // Canned reasons for rejecting questions
  const rejectReasons = [
    { value: 'duplicate', label: 'Duplicate', description: 'Already asked or covered' },
    { value: 'inappropriate', label: 'Inappropriate', description: 'Not suitable for this context' },
    { value: 'irrelevant', label: 'Irrelevant', description: 'Not related to the objective' },
    { value: 'other', label: 'Other', description: 'Skip and try a different direction' }
  ];

  // Toggle reject dropdown with position calculation
  const toggleRejectDropdown = (questionId, event) => {
    if (rejectingQuestionId === questionId) {
      setRejectingQuestionId(null);
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      setRejectDropdownPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 220) // align right edge, but keep 8px from left
      });
      setRejectingQuestionId(questionId);
    }
  };

  // Reject a question and get a replacement
  const handleRejectQuestion = async (questionId, reason = null) => {
    if (rejectingQuestion) return;
    setRejectingQuestion(true);
    try {
      await rejectQuestion({
        variables: { questionId, reason }
      });
      setRejectingQuestionId(null);
      refetchQuestions();
      if (selectedLOId) {
        refetchSelectedLO();
      }
    } catch (error) {
      console.error('Error rejecting question:', error);
      toast.error('Failed to reject question: ' + error.message);
    } finally {
      setRejectingQuestion(false);
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
    <CommandPaletteProvider
      teamId={teamId}
      channels={channels}
    >
    <div className={`team-dashboard ${activeView !== 'chat' && activeView !== 'digest' && activeView !== 'raven' ? (copilotCollapsed ? 'has-copilot-collapsed' : 'has-copilot') : ''}`}>
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
          {/* Raven AI Copilot */}
          <div className="nav-section">
            <button
              className={`nav-section-header nav-single ${activeView === 'raven' ? 'active' : ''}`}
              onClick={() => setActiveView('raven')}
            >
              <span className="nav-expand-icon" style={{ visibility: 'hidden' }}>▶</span>
              <span className="nav-icon">🪶</span>
              <span className="nav-label">Raven</span>
            </button>
          </div>

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
                {isAdmin && (
                  <button
                    className="nav-item nav-action"
                    onClick={() => setShowDataImport(true)}
                  >
                    <span className="nav-item-icon">📥</span>
                    <span className="nav-item-label">Import Data</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Team - Ask the Team */}
          <div className={`nav-section ${expandedSections.team ? 'expanded' : ''}`}>
            <button
              className={`nav-section-header ${activeView === 'ask' ? 'active' : ''}`}
              onClick={() => toggleSection('team')}
            >
              <span className="nav-expand-icon">{expandedSections.team ? '▼' : '▶'}</span>
              <span className="nav-icon">👥</span>
              <span className="nav-label">Team</span>
            </button>
            {expandedSections.team && (
              <div className="nav-items">
                {/* Ask the Team */}
                <button
                  className={`nav-item ${activeView === 'ask' ? 'active' : ''}`}
                  onClick={() => handleSectionItemClick('ask', 'ask')}
                >
                  <span className="nav-item-icon">🔍</span>
                  <span className="nav-item-label">Ask the Team</span>
                </button>
              </div>
            )}
          </div>

          {/* Knowledge - Research, KB, Connections */}
          <div className={`nav-section ${expandedSections.knowledge ? 'expanded' : ''}`}>
            <button
              className={`nav-section-header ${activeView === 'learning' || activeView === 'knowledge' ? 'active' : ''}`}
              onClick={() => toggleSection('knowledge')}
            >
              <span className="nav-expand-icon">{expandedSections.knowledge ? '▼' : '▶'}</span>
              <span className="nav-icon">🧠</span>
              <span className="nav-label">Knowledge</span>
              {(losAvailable && learningObjectives.filter(lo => lo.status === 'active').length > 0) && (
                <span className="nav-badge">{learningObjectives.filter(lo => lo.status === 'active').length}</span>
              )}
            </button>
            {expandedSections.knowledge && (
              <div className="nav-items">
                {/* Research */}
                <button
                  className={`nav-item ${activeView === 'learning' ? 'active' : ''}`}
                  onClick={() => handleSectionItemClick('learning', 'learning')}
                >
                  <span className="nav-item-icon">📚</span>
                  <span className="nav-item-label">Research</span>
                  {losAvailable && learningObjectives.filter(lo => lo.status === 'active').length > 0 && (
                    <span className="nav-badge">{learningObjectives.filter(lo => lo.status === 'active').length}</span>
                  )}
                </button>
                {/* Knowledge Base */}
                <button
                  className={`nav-item ${activeView === 'knowledge' ? 'active' : ''}`}
                  onClick={() => handleSectionItemClick('knowledge', 'knowledge')}
                >
                  <span className="nav-item-icon">📖</span>
                  <span className="nav-item-label">Knowledge Base</span>
                  {kbSources.length > 0 && <span className="nav-count">{kbSources.length}</span>}
                </button>
                {/* Connections (Google Drive and future integrations) */}
                <button
                  className={`nav-item ${googleIntegration ? 'nav-connected' : ''}`}
                  onClick={handleOpenDrivePanel}
                  title="Connect data sources"
                >
                  <span className="nav-item-icon">🔗</span>
                  <span className="nav-item-label">Connections</span>
                  {googleIntegration && <span className="nav-status-dot connected"></span>}
                </button>
              </div>
            )}
          </div>
          )}

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

          {/* User Info with Settings */}
          <div className="footer-user">
            <div className="user-info">
              <span className="user-avatar">
                {(user.displayName || user.email || 'U')[0].toUpperCase()}
              </span>
              <span className="user-name">{user.displayName || user.email}</span>
            </div>
            <button
              className="user-settings-btn"
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
            >
              ⚙️
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
                <button type="submit" className="btn-primary" disabled={!newChannelName.trim() || creatingChannel}>
                  {creatingChannel ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateChannel(false);
                    setNewChannelName('');
                  }}
                  className="btn-secondary"
                  disabled={creatingChannel}
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

      {/* Settings Modal (Combined Personal + Team) */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚙️ Settings</h3>
              <button className="modal-close" onClick={() => setShowSettingsModal(false)}>×</button>
            </div>

            {/* Settings Tabs */}
            <div className="settings-tabs">
              <button
                className={`settings-tab ${settingsTab === 'personal' ? 'active' : ''}`}
                onClick={() => setSettingsTab('personal')}
              >
                Personal
              </button>
              {isAdmin && (
                <button
                  className={`settings-tab ${settingsTab === 'team' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('team')}
                >
                  Team
                </button>
              )}
            </div>

            <div className="modal-body">
              {/* Personal Settings Tab */}
              {settingsTab === 'personal' && (
                <>
                  <PersonaSelector compact />
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '1rem' }}>
                    <ProModeSettings />
                  </div>
                </>
              )}

              {/* Team Settings Tab (admin only) */}
              {settingsTab === 'team' && isAdmin && teamSettings && (
                <div className="settings-section">
                  <h4>AI Features</h4>
                  <p className="settings-description">
                    Control AI-powered features for your team.
                  </p>

                  <div className="settings-toggles">
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={teamSettings.aiEnabled}
                        onChange={(e) => {
                          updateTeamSettingsMutation({
                            variables: {
                              teamId,
                              input: { aiEnabled: e.target.checked }
                            }
                          });
                        }}
                      />
                      <span className="toggle-label">
                        <strong>Enable AI Features</strong>
                        <span className="toggle-hint">Enable @raven commands and AI assistance</span>
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-text" onClick={onSignOut}>
                Sign Out
              </button>
              <button className="btn-secondary" onClick={() => setShowSettingsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Site Admin Panel - Full Dashboard */}
      {showSiteAdminPanel && (
        <AdminDashboard onClose={() => setShowSiteAdminPanel(false)} />
      )}

      {/* Data Import Page */}
      {showDataImport && (
        <DataImportPage teamId={teamId} onClose={() => setShowDataImport(false)} />
      )}

      {/* Google Drive Panel Modal */}
      {showDrivePanel && (
        <div className="modal-overlay" onClick={() => setShowDrivePanel(false)}>
          <div className="modal drive-panel-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Google Drive</h3>

            {!googleIntegration ? (
              <div className="drive-connect-prompt">
                <p>Connect your Google Drive to import documents, spreadsheets, and presentations into your knowledge base.</p>
                <button onClick={handleConnectGoogleDrive} className="btn-primary" disabled={connectingDrive}>
                  {connectingDrive ? 'Connecting...' : 'Connect Google Drive'}
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
                    disabled={disconnectingDrive}
                  >
                    {disconnectingDrive ? 'Disconnecting...' : 'Disconnect'}
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
              <img src="/web-app-manifest-192x192.png" alt="RavenLoom" className="header-brand-logo" />
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
                            <button className="btn-secondary" onClick={() => setShowPostQuestion(false)} disabled={postingQuestion}>
                              Cancel
                            </button>
                            <button className="btn-primary" onClick={handlePostQuestion} disabled={postingQuestion}>
                              {postingQuestion ? 'Posting...' : 'Post Question'}
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
                          <button className="btn-secondary" onClick={() => setShowPostQuestion(false)} disabled={postingQuestion}>
                            Cancel
                          </button>
                          <button className="btn-primary" onClick={handlePostQuestion} disabled={postingQuestion}>
                            {postingQuestion ? 'Posting...' : 'Post Question'}
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
                                disabled={!questionAnswerText.trim() || submittingAnswer}
                              >
                                {submittingAnswer ? 'Submitting...' : 'Submit Answer'}
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
                              <div className="reject-dropdown-container">
                                <button
                                  className="btn-reject"
                                  onClick={(e) => toggleRejectDropdown(q.id, e)}
                                  disabled={rejectingQuestion}
                                >
                                  {rejectingQuestion && rejectingQuestionId === q.id ? 'Removing...' : 'Remove'}
                                </button>
                                {rejectingQuestionId === q.id && (
                                  <div className="reject-dropdown" style={{ top: rejectDropdownPos.top, left: rejectDropdownPos.left }}>
                                    {rejectReasons.map(reason => (
                                      <button
                                        key={reason.value}
                                        className="reject-option"
                                        onClick={() => handleRejectQuestion(q.id, reason.value)}
                                        disabled={rejectingQuestion}
                                      >
                                        <span className="reject-option-label">{reason.label}</span>
                                        <span className="reject-option-desc">{reason.description}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
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
              <img src="/web-app-manifest-192x192.png" alt="RavenLoom" className="header-brand-logo" />
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
                  Note: Say "remember" to save knowledge to your team's shared knowledge base.
                </p>
                <div className="empty-suggestions">
                  <button className="suggestion-btn" onClick={() => setMessageInput('What do you know about our team?')}>
                    What do you know?
                  </button>
                  <button className="suggestion-btn" onClick={() => setMessageInput('remember ')}>
                    remember...
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
            <form onSubmit={handleSendMessage} className="message-form">
              <input
                ref={inputRef}
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Message Raven... (say 'remember' to save knowledge)"
                disabled={isSending}
                className="message-input"
              />
              <button
                type="submit"
                disabled={!messageInput.trim() || isSending}
                className="send-btn"
              >
                {isSending ? '...' : 'Send'}
              </button>
            </form>
          </div>
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
                  <button onClick={handleConnectGoogleDrive} className="btn-primary" disabled={connectingDrive}>
                    {connectingDrive ? 'Connecting...' : 'Connect Google Drive'}
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
                    if (!newLOTitle.trim() || creatingLO) return;
                    setCreatingLO(true);
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
                      toast.error('Failed to create learning objective: ' + err.message);
                    } finally {
                      setCreatingLO(false);
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
                        {members?.map(member => (
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
                      <button type="button" className="btn-secondary" onClick={() => setShowCreateLO(false)} disabled={creatingLO}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" disabled={!newLOTitle.trim() || creatingLO}>
                        {creatingLO ? 'Creating...' : 'Create'}
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
                                  disabled={submittingAnswer}
                                >
                                  Cancel
                                </button>
                                <button
                                  className="btn-primary"
                                  onClick={async () => {
                                    if (submittingAnswer) return;
                                    setSubmittingAnswer(true);
                                    try {
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
                                    } finally {
                                      setSubmittingAnswer(false);
                                    }
                                  }}
                                  disabled={!questionAnswerText.trim() || submittingAnswer}
                                >
                                  {submittingAnswer ? 'Submitting...' : 'Submit Answer'}
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
                                <div className="reject-dropdown-container">
                                  <button
                                    className="btn-reject"
                                    onClick={(e) => toggleRejectDropdown(q.id, e)}
                                    disabled={rejectingQuestion}
                                  >
                                    {rejectingQuestion && rejectingQuestionId === q.id ? 'Removing...' : 'Remove'}
                                  </button>
                                  {rejectingQuestionId === q.id && (
                                    <div className="reject-dropdown" style={{ top: rejectDropdownPos.top, left: rejectDropdownPos.left }}>
                                      {rejectReasons.map(reason => (
                                        <button
                                          key={reason.value}
                                          className="reject-option"
                                          onClick={() => handleRejectQuestion(q.id, reason.value)}
                                          disabled={rejectingQuestion}
                                        >
                                          <span className="reject-option-label">{reason.label}</span>
                                          <span className="reject-option-desc">{reason.description}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
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
                                        <div className="reject-dropdown-container">
                                          <button
                                            className="btn-reject btn-small"
                                            onClick={(e) => toggleRejectDropdown(fq.id, e)}
                                            disabled={rejectingQuestion}
                                          >
                                            {rejectingQuestion && rejectingQuestionId === fq.id ? '...' : 'Remove'}
                                          </button>
                                          {rejectingQuestionId === fq.id && (
                                            <div className="reject-dropdown" style={{ top: rejectDropdownPos.top, left: rejectDropdownPos.left }}>
                                              {rejectReasons.map(reason => (
                                                <button
                                                  key={reason.value}
                                                  className="reject-option"
                                                  onClick={() => handleRejectQuestion(fq.id, reason.value)}
                                                  disabled={rejectingQuestion}
                                                >
                                                  <span className="reject-option-label">{reason.label}</span>
                                                  <span className="reject-option-desc">{reason.description}</span>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
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
      ) : null}

      {/* PM Views removed - see git history */}
      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="shortcuts-modal-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="shortcuts-title">
            <div className="shortcuts-modal-header">
              <h3 className="shortcuts-modal-title" id="shortcuts-title">
                <span>⌨️</span> Keyboard Shortcuts
              </h3>
              <button className="modal-close" onClick={() => setShowShortcuts(false)} aria-label="Close">×</button>
            </div>

            <div className="shortcuts-section">
              <div className="shortcuts-section-title">Navigation</div>
              <div className="shortcut-row">
                <span className="shortcut-description">Go to Chat</span>
                <span className="shortcut-keys"><kbd className="kbd">Alt</kbd><kbd className="kbd">1</kbd></span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-description">Go to Research</span>
                <span className="shortcut-keys"><kbd className="kbd">Alt</kbd><kbd className="kbd">2</kbd></span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-description">Go to Ask</span>
                <span className="shortcut-keys"><kbd className="kbd">Alt</kbd><kbd className="kbd">3</kbd></span>
              </div>
            </div>

            <div className="shortcuts-section">
              <div className="shortcuts-section-title">List Navigation (Digest)</div>
              <div className="shortcut-row">
                <span className="shortcut-description">Next item</span>
                <span className="shortcut-keys"><kbd className="kbd">j</kbd></span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-description">Previous item</span>
                <span className="shortcut-keys"><kbd className="kbd">k</kbd></span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-description">Open selected item</span>
                <span className="shortcut-keys"><kbd className="kbd">Enter</kbd></span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-description">Jump to first / last</span>
                <span className="shortcut-keys"><kbd className="kbd">g</kbd> / <kbd className="kbd">G</kbd></span>
              </div>
            </div>

            <div className="shortcuts-section">
              <div className="shortcuts-section-title">Chat</div>
              <div className="shortcut-row">
                <span className="shortcut-description">Focus message input</span>
                <span className="shortcut-keys"><kbd className="kbd">/</kbd></span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-description">Send message</span>
                <span className="shortcut-keys"><kbd className="kbd">Enter</kbd></span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-description">New line in message</span>
                <span className="shortcut-keys"><kbd className="kbd">Shift</kbd><kbd className="kbd">Enter</kbd></span>
              </div>
            </div>

            <div className="shortcuts-section">
              <div className="shortcuts-section-title">General</div>
              <div className="shortcut-row">
                <span className="shortcut-description">Command palette</span>
                <span className="shortcut-keys"><kbd className="kbd">Cmd/Ctrl</kbd><kbd className="kbd">K</kbd></span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-description">Close modal/popup</span>
                <span className="shortcut-keys"><kbd className="kbd">Esc</kbd></span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-description">Show this help</span>
                <span className="shortcut-keys"><kbd className="kbd">?</kbd></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Raven Copilot - persistent AI assistant side panel */}
      {activeView !== 'chat' && activeView !== 'digest' && activeView !== 'raven' && ravenChannel && (
        <RavenCopilot
          teamId={teamId}
          ravenChannelId={ravenChannel.id}
          currentView={activeView}
          onNavigate={(view) => setActiveView(view)}
          collapsed={copilotCollapsed}
          onToggleCollapse={() => setCopilotCollapsed(!copilotCollapsed)}
          user={user}
        />
      )}
    </div>
    </CommandPaletteProvider>
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

