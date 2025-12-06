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

// ============================================================================
// TeamDashboard Component
// ============================================================================

function TeamDashboard({ teamId, channelId, user, onSignOut }) {
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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
  const [activeView, setActiveView] = useState('chat'); // 'chat', 'tasks', or 'ask'
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [taskFilter, setTaskFilter] = useState('open'); // 'open', 'my', 'all'
  // Q&A state
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askHistory, setAskHistory] = useState([]);
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

  // Determine active channel
  const activeChannelId = channelId || channels.find(c => c.isDefault)?.id || channels[0]?.id;
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

  // Mutations
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [createChannel] = useMutation(CREATE_CHANNEL);
  const [inviteTeamMember] = useMutation(INVITE_TEAM_MEMBER);
  const [createTaskDirect] = useMutation(CREATE_TASK_DIRECT);
  const [updateTask] = useMutation(UPDATE_TASK);
  const [completeTask] = useMutation(COMPLETE_TASK);
  const [snoozeAlert] = useMutation(SNOOZE_ALERT);
  const [cancelAlert] = useMutation(CANCEL_ALERT);
  const [executeAskCompany] = useLazyQuery(ASK_COMPANY, {
    fetchPolicy: 'network-only'
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on channel change
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChannelId]);

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
    navigate(`/team/${teamId}/channel/${id}`);
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
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      await createTaskDirect({
        variables: {
          teamId,
          input: {
            title: newTaskTitle.trim(),
            priority: newTaskPriority,
            channelId: activeChannelId
          }
        }
      });

      setShowCreateTask(false);
      setNewTaskTitle('');
      setNewTaskPriority('medium');
      await refetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task: ' + error.message);
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
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Team Header */}
        <div className="sidebar-header">
          <button onClick={handleBackToTeams} className="back-btn">←</button>
          <h2 className="team-name">{team.name}</h2>
        </div>

        {/* View Toggle */}
        <div className="view-toggle">
          <button
            className={`view-btn ${activeView === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveView('chat')}
          >
            Chat
          </button>
          <button
            className={`view-btn ${activeView === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveView('tasks')}
          >
            Tasks {tasks.length > 0 && `(${tasks.length})`}
          </button>
          <button
            className={`view-btn ${activeView === 'ask' ? 'active' : ''}`}
            onClick={() => setActiveView('ask')}
          >
            Ask
          </button>
          {pendingAlerts.length > 0 && (
            <div className="alerts-indicator" title={`${pendingAlerts.length} pending reminders`}>
              {pendingAlerts.length}
            </div>
          )}
        </div>

        {/* Channels */}
        <div className="channels-section">
          <div className="section-header">
            <span>Channels</span>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="add-btn"
              title="Create channel"
            >
              +
            </button>
          </div>

          <div className="channel-list">
            {channels.map((channel) => (
              <button
                key={channel.id}
                className={`channel-item ${channel.id === activeChannelId ? 'active' : ''}`}
                onClick={() => handleSelectChannel(channel.id)}
              >
                # {channel.name}
              </button>
            ))}
          </div>

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
        </div>

        {/* Team Members Section */}
        <div className="members-section">
          <div className="section-header">
            <span>Team ({team.members?.length || 0})</span>
            <button
              onClick={() => setShowInviteModal(true)}
              className="add-btn"
              title="Invite member"
            >
              +
            </button>
          </div>

          <div className="member-list">
            {team.members?.slice(0, 5).map((member) => (
              <div key={member.id} className="member-item">
                <span className="member-avatar">
                  {(member.user?.displayName || member.user?.email || '?')[0].toUpperCase()}
                </span>
                <span className="member-name">
                  {member.user?.displayName || member.user?.email}
                </span>
                {member.role === 'owner' && <span className="member-role">owner</span>}
              </div>
            ))}
            {(team.members?.length || 0) > 5 && (
              <button
                className="show-more-btn"
                onClick={() => setShowMembersPanel(true)}
              >
                +{team.members.length - 5} more
              </button>
            )}
          </div>

          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <div className="pending-invites">
              <span className="pending-label">Pending ({pendingInvites.length})</span>
              {pendingInvites.slice(0, 3).map((invite) => (
                <div key={invite.id} className="invite-item">
                  <span className="invite-email">{invite.email}</span>
                </div>
              ))}
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
        </div>

        {/* User Info */}
        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{user.displayName || user.email}</span>
          </div>
          <button onClick={onSignOut} className="sign-out-btn">
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      {activeView === 'chat' ? (
        <main className="chat-area">
          {/* Channel Header */}
          <header className="chat-header">
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
                <p>No messages yet.</p>
                <p className="hint">
                  Try: <code>@raven remember [something]</code> to save a fact
                </p>
                <p className="hint">
                  Or: <code>@raven [question]</code> to ask something
                </p>
              </div>
            ) : (
              <div className="messages-list">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.isAi ? 'ai-message' : 'user-message'}`}
                  >
                    <div className="message-header">
                      <span className="message-author">
                        {message.isAi ? '🪶 Raven' : (message.user?.displayName || message.user?.email || 'User')}
                      </span>
                      <span className="message-time">
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        className="message-reply-btn"
                        onClick={() => handleReplyTo(message)}
                        title="Reply to this message"
                      >
                        ↩
                      </button>
                    </div>
                    <div className="message-content">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
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
            <h3>Tasks</h3>
            <div className="tasks-filters">
              <button
                className={`filter-btn ${taskFilter === 'open' ? 'active' : ''}`}
                onClick={() => setTaskFilter('open')}
              >
                Open
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
            <button
              className="btn-primary"
              onClick={() => setShowCreateTask(true)}
            >
              + New Task
            </button>
          </header>

          {/* Tasks List */}
          <div className="tasks-container">
            {tasks.length === 0 ? (
              <div className="tasks-empty">
                <p>No tasks yet.</p>
                <p className="hint">Create a task or use <code>@raven task [description]</code> in chat</p>
              </div>
            ) : (
              <div className="tasks-list">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`task-item ${task.status} priority-${task.priority}`}
                  >
                    <button
                      className="task-checkbox"
                      onClick={() => task.status === 'done' ? handleToggleTaskStatus(task) : handleCompleteTask(task.id)}
                      title={task.status === 'done' ? 'Reopen task' : 'Complete task'}
                    >
                      {task.status === 'done' ? '✓' : task.status === 'in_progress' ? '▶' : '○'}
                    </button>
                    <div className="task-content">
                      <span className="task-title">{task.title}</span>
                      {task.description && (
                        <span className="task-description">{task.description}</span>
                      )}
                      <div className="task-meta">
                        {task.priority !== 'medium' && (
                          <span className={`task-priority priority-${task.priority}`}>
                            {task.priority}
                          </span>
                        )}
                        {task.assignedToUser && (
                          <span className="task-assignee">
                            {task.assignedToUser.displayName || task.assignedToUser.email}
                          </span>
                        )}
                        {task.dueAt && (
                          <span className="task-due">
                            Due: {new Date(task.dueAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="task-actions">
                      {task.status === 'todo' && (
                        <button
                          className="task-action-btn"
                          onClick={() => handleToggleTaskStatus(task)}
                          title="Start working"
                        >
                          Start
                        </button>
                      )}
                      {task.status === 'in_progress' && (
                        <button
                          className="task-action-btn"
                          onClick={() => handleCompleteTask(task.id)}
                          title="Mark complete"
                        >
                          Done
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create Task Modal */}
          {showCreateTask && (
            <div className="modal-overlay" onClick={() => setShowCreateTask(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>New Task</h3>
                <form onSubmit={handleCreateTask}>
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Task title..."
                    autoFocus
                    className="input-field"
                  />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="input-field"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <div className="form-actions">
                    <button type="submit" className="btn-primary">Create Task</button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateTask(false);
                        setNewTaskTitle('');
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
        </main>
      ) : activeView === 'ask' ? (
        <main className="ask-area">
          {/* Ask Header */}
          <header className="ask-header">
            <h3>Ask the Company</h3>
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
                <p>Ask anything about your company's knowledge</p>
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
          </div>
        </main>
      ) : null}
    </div>
  );
}

export default TeamDashboard;
