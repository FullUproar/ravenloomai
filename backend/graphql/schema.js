import { gql } from 'graphql-tag';

export default gql`
  scalar JSON
  scalar DateTime

  # ============================================================================
  # TEAM TYPES
  # ============================================================================

  type Team {
    id: ID!
    name: String!
    slug: String!
    members: [TeamMember!]!
    channels: [Channel!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TeamMember {
    id: ID!
    teamId: ID!
    userId: String!
    user: User!
    role: String!  # owner, admin, member
    displayName: String
    notificationsEnabled: Boolean
    lastSeenAt: DateTime
    createdAt: DateTime!
  }

  type TeamInvite {
    id: ID!
    teamId: ID!
    email: String!
    role: String!
    token: String!
    expiresAt: DateTime!
    acceptedAt: DateTime
    createdAt: DateTime!
  }

  type User {
    id: ID!
    email: String!
    displayName: String
    avatarUrl: String
    digestTime: String
    timezone: String
    digestEnabled: Boolean
    preferences: JSON
    createdAt: DateTime!
  }

  # ============================================================================
  # CHANNEL, THREAD & MESSAGE TYPES
  # ============================================================================

  type Channel {
    id: ID!
    teamId: ID!
    name: String!
    description: String
    aiMode: String!  # mentions_only, active, silent
    isDefault: Boolean!
    createdBy: String
    threads(limit: Int): [Thread!]!
    messages(limit: Int, before: ID): [Message!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Thread {
    id: ID!
    channelId: ID!
    title: String
    startedBy: String
    startedByUser: User
    messageCount: Int!
    lastActivityAt: DateTime!
    isResolved: Boolean!
    messages(limit: Int): [Message!]!
    createdAt: DateTime!
  }

  type Message {
    id: ID!
    channelId: ID!
    threadId: ID
    thread: Thread
    userId: String
    user: User
    content: String!
    isAi: Boolean!
    mentionsAi: Boolean!
    aiCommand: String  # remember, query, remind, task, etc.
    metadata: JSON
    createdAt: DateTime!
  }

  # ============================================================================
  # KNOWLEDGE BASE TYPES (Enhanced)
  # ============================================================================

  type Fact {
    id: ID!
    teamId: ID!
    content: String!
    # Structured entity model
    entityType: String  # person, product, process, policy, etc.
    entityName: String  # "John Smith", "Widget Pro", etc.
    attribute: String   # "email", "price", "status"
    value: String       # "john@example.com", "$99", "active"
    category: String    # product, manufacturing, marketing, sales, general
    confidenceScore: Float  # 0.0 - 1.0
    sourceType: String!  # conversation, document, manual, integration
    sourceId: ID
    createdBy: String
    createdByUser: User
    validFrom: DateTime!
    validUntil: DateTime
    supersededBy: ID
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Decision {
    id: ID!
    teamId: ID!
    what: String!
    why: String
    alternatives: JSON
    madeBy: String
    madeByUser: User
    sourceId: ID
    relatedFacts: [ID!]
    createdAt: DateTime!
  }

  type Document {
    id: ID!
    teamId: ID!
    name: String!
    fileType: String
    sourceUrl: String
    contentText: String
    uploadedBy: String
    processedAt: DateTime
    metadata: JSON
    createdAt: DateTime!
  }

  # Search result for knowledge queries
  type KnowledgeResult {
    facts: [Fact!]!
    decisions: [Decision!]!
    documents: [Document!]!
    answer: String  # AI-generated answer if applicable
  }

  # ============================================================================
  # ALERT TYPES
  # ============================================================================

  type Alert {
    id: ID!
    teamId: ID!
    channelId: ID
    createdBy: String
    triggerType: String!  # date, recurring, condition
    triggerAt: DateTime
    recurrenceRule: String
    message: String!
    relatedFactId: ID
    status: String!  # pending, sent, snoozed, cancelled
    sentAt: DateTime
    snoozedUntil: DateTime
    createdAt: DateTime!
  }

  # ============================================================================
  # GOALS, PROJECTS & TASKS
  # ============================================================================

  type Goal {
    id: ID!
    teamId: ID!
    title: String!
    description: String
    targetDate: DateTime
    startDate: DateTime
    status: String!  # active, achieved, abandoned, paused
    progress: Int!   # 0-100 (computed from linked tasks)
    owner: User
    ownerId: String
    createdBy: String
    parentGoalId: ID
    parentGoal: Goal
    childGoals: [Goal!]!
    # Many-to-many associations
    projects: [Project!]!
    tasks: [GoalTask!]!  # All tasks linked to this goal (direct + inherited)
    taskCount: Int!
    completedTaskCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # Task with goal link type info
  type GoalTask {
    id: ID!
    title: String!
    status: String!
    priority: String!
    projectId: ID
    linkType: String!  # 'direct' or 'inherited'
    createdAt: DateTime!
  }

  # Goal with link type info (for task/project views)
  type LinkedGoal {
    id: ID!
    title: String!
    status: String!
    linkType: String!  # 'direct' or 'inherited'
  }

  type Project {
    id: ID!
    teamId: ID!
    name: String!
    description: String
    status: String!  # active, completed, archived
    color: String
    dueDate: DateTime
    owner: User
    ownerId: String
    createdBy: String
    goalsInherit: Boolean!  # If true, tasks inherit goals from project
    # Many-to-many: goals linked to this project
    goals: [Goal!]!
    tasks: [Task!]!
    taskCount: Int!
    completedTaskCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Task {
    id: ID!
    teamId: ID!
    projectId: ID
    project: Project
    channelId: ID
    title: String!
    description: String
    status: String!  # todo, in_progress, done
    priority: String!  # low, medium, high, urgent
    assignedTo: String
    assignedToUser: User
    dueAt: DateTime
    startDate: DateTime
    completedAt: DateTime
    estimatedHours: Float
    actualHours: Float
    tags: [String!]
    sortOrder: Int
    createdBy: String
    createdByUser: User
    sourceMessageId: ID
    # Many-to-many: goals for this task
    goals: [LinkedGoal!]!       # Effective goals (direct + inherited)
    directGoals: [Goal!]!       # Only directly linked goals
    comments: [TaskComment!]!
    commentCount: Int!
    activity: [TaskActivity!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TaskComment {
    id: ID!
    taskId: ID!
    userId: String!
    user: User!
    content: String!
    parentCommentId: ID
    replies: [TaskComment!]
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TaskActivity {
    id: ID!
    taskId: ID!
    userId: String
    user: User
    action: String!  # created, status_changed, assigned, commented, due_date_set
    oldValue: String
    newValue: String
    createdAt: DateTime!
  }

  # ============================================================================
  # INPUT TYPES
  # ============================================================================

  input CreateTeamInput {
    name: String!
  }

  input InviteTeamMemberInput {
    email: String!
    role: String
  }

  input CreateChannelInput {
    name: String!
    description: String
    aiMode: String
  }

  input UpdateChannelInput {
    name: String
    description: String
    aiMode: String
  }

  input SendMessageInput {
    content: String!
    replyToMessageId: ID
  }

  input CreateFactInput {
    content: String!
    category: String
    entityType: String
    entityName: String
    attribute: String
    value: String
  }

  input CreateThreadInput {
    title: String
    initialMessage: String!
  }

  input AskCompanyInput {
    question: String!
  }

  input UpdateUserPreferencesInput {
    digestTime: String
    timezone: String
    digestEnabled: Boolean
    preferences: JSON
  }

  input CreateDecisionInput {
    what: String!
    why: String
    alternatives: JSON
    relatedFacts: [ID!]
  }

  input CreateAlertInput {
    channelId: ID
    triggerType: String!
    triggerAt: DateTime
    recurrenceRule: String
    message: String!
    relatedFactId: ID
  }

  input CreateGoalInput {
    title: String!
    description: String
    targetDate: DateTime
    startDate: DateTime
    ownerId: String
    parentGoalId: ID
  }

  input UpdateGoalInput {
    title: String
    description: String
    targetDate: DateTime
    startDate: DateTime
    status: String
    progress: Int
    ownerId: String
  }

  input CreateProjectInput {
    name: String!
    description: String
    goalIds: [ID!]  # Many-to-many: initial goals to link
    color: String
    dueDate: DateTime
    ownerId: String
    goalsInherit: Boolean  # Default true
  }

  input UpdateProjectInput {
    name: String
    description: String
    status: String
    goalIds: [ID!]  # Replace all goal associations
    color: String
    dueDate: DateTime
    ownerId: String
    goalsInherit: Boolean
  }

  input CreateTaskInput {
    projectId: ID
    channelId: ID
    title: String!
    description: String
    priority: String
    assignedTo: String
    dueAt: DateTime
    startDate: DateTime
    estimatedHours: Float
    tags: [String!]
    goalIds: [ID!]  # Direct goal links (in addition to inherited)
  }

  input UpdateTaskInput {
    title: String
    description: String
    status: String
    priority: String
    projectId: ID
    assignedTo: String
    dueAt: DateTime
    startDate: DateTime
    estimatedHours: Float
    actualHours: Float
    tags: [String!]
    sortOrder: Int
    goalIds: [ID!]  # Replace direct goal links
  }

  input CreateTaskCommentInput {
    content: String!
    parentCommentId: ID
  }

  # ============================================================================
  # AI RESPONSE TYPES
  # ============================================================================

  type AIResponse {
    message: Message!
    factsCreated: [Fact!]
    alertsCreated: [Alert!]
    tasksCreated: [Task!]
  }

  # Ask the Company response
  type AskCompanyResponse {
    answer: String!
    confidence: Float
    factsUsed: [Fact!]
    decisionsUsed: [Decision!]
    suggestedFollowups: [String!]
  }

  # Daily Digest
  type DailyDigest {
    teamId: ID!
    date: String!
    overdueTasks: [Task!]!
    dueTodayTasks: [Task!]!
    upcomingAlerts: [Alert!]!
    recentDecisions: [Decision!]!
    newFacts: [Fact!]!
    activitySummary: String
  }

  # ============================================================================
  # TEAM QUESTIONS (for when Raven doesn't have a confident answer)
  # ============================================================================

  type TeamQuestion {
    id: ID!
    teamId: ID!
    askedBy: ID!
    askedByUser: User
    question: String!
    aiAnswer: String
    aiConfidence: Float!
    status: String!  # open, answered, closed
    answer: String
    answeredBy: ID
    answeredByUser: User
    answeredAt: DateTime
    assignees: [User!]!
    channelId: ID
    context: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateTeamQuestionInput {
    question: String!
    aiAnswer: String
    aiConfidence: Float
    channelId: ID
    context: String
    assigneeIds: [ID!]
  }

  input AnswerTeamQuestionInput {
    answer: String!
    addToKnowledge: Boolean
  }

  # ============================================================================
  # QUERIES
  # ============================================================================

  type Query {
    # User
    me: User

    # Teams
    getTeam(teamId: ID!): Team
    getMyTeams: [Team!]!
    getTeamBySlug(slug: String!): Team

    # Channels
    getChannel(channelId: ID!): Channel
    getChannels(teamId: ID!): [Channel!]!

    # Threads
    getThread(threadId: ID!): Thread
    getThreads(channelId: ID!, limit: Int): [Thread!]!

    # Messages
    getMessages(channelId: ID!, limit: Int, before: ID): [Message!]!
    getThreadMessages(threadId: ID!, limit: Int): [Message!]!

    # Knowledge
    getFacts(teamId: ID!, category: String, entityType: String, limit: Int): [Fact!]!
    getDecisions(teamId: ID!, limit: Int): [Decision!]!
    searchKnowledge(teamId: ID!, query: String!): KnowledgeResult!

    # Ask the Company (AI Q&A)
    askCompany(teamId: ID!, input: AskCompanyInput!): AskCompanyResponse!

    # Alerts
    getAlerts(teamId: ID!, status: String): [Alert!]!
    getPendingAlerts(teamId: ID!): [Alert!]!

    # Goals
    getGoals(teamId: ID!, status: String): [Goal!]!
    getGoal(goalId: ID!): Goal
    getTasksForGoal(teamId: ID!, goalId: ID!): [GoalTask!]!  # All tasks linked to a goal

    # Projects & Tasks
    getProjects(teamId: ID!, goalId: ID, status: String): [Project!]!
    getProject(projectId: ID!): Project
    getTasks(teamId: ID!, projectId: ID, goalId: ID, status: String, assignedTo: String): [Task!]!
    getTask(taskId: ID!): Task
    getTaskComments(taskId: ID!): [TaskComment!]!
    getTaskActivity(taskId: ID!): [TaskActivity!]!

    # Team Invites
    getTeamInvites(teamId: ID!): [TeamInvite!]!
    validateInviteToken(token: String!): TeamInvite

    # Daily Digest
    getDailyDigest(teamId: ID!): DailyDigest!

    # Team Questions
    getTeamQuestions(teamId: ID!, status: String, assignedTo: ID): [TeamQuestion!]!
    getTeamQuestion(questionId: ID!): TeamQuestion
    getOpenQuestionCount(teamId: ID!): Int!
  }

  # ============================================================================
  # MUTATIONS
  # ============================================================================

  type Mutation {
    # User
    createOrUpdateUser(email: String!, displayName: String, avatarUrl: String): User!
    updateUserPreferences(input: UpdateUserPreferencesInput!): User!

    # Teams
    createTeam(input: CreateTeamInput!): Team!
    updateTeam(teamId: ID!, name: String!): Team!
    deleteTeam(teamId: ID!): Boolean!

    # Team Members & Invites
    inviteTeamMember(teamId: ID!, input: InviteTeamMemberInput!): TeamInvite!
    acceptInvite(token: String!): TeamMember!
    removeTeamMember(teamId: ID!, userId: String!): Boolean!
    updateMemberRole(teamId: ID!, userId: String!, role: String!): TeamMember!

    # Channels
    createChannel(teamId: ID!, input: CreateChannelInput!): Channel!
    updateChannel(channelId: ID!, input: UpdateChannelInput!): Channel!
    deleteChannel(channelId: ID!): Boolean!

    # Threads
    createThread(channelId: ID!, input: CreateThreadInput!): Thread!
    resolveThread(threadId: ID!): Thread!

    # Messages & AI
    sendMessage(channelId: ID!, input: SendMessageInput!): AIResponse!
    sendThreadMessage(threadId: ID!, input: SendMessageInput!): AIResponse!

    # Knowledge - Manual
    createFact(teamId: ID!, input: CreateFactInput!): Fact!
    updateFact(factId: ID!, content: String!, category: String): Fact!
    invalidateFact(factId: ID!): Fact!
    createDecision(teamId: ID!, input: CreateDecisionInput!): Decision!

    # Alerts
    createAlert(teamId: ID!, input: CreateAlertInput!): Alert!
    snoozeAlert(alertId: ID!, until: DateTime!): Alert!
    cancelAlert(alertId: ID!): Alert!

    # Goals
    createGoal(teamId: ID!, input: CreateGoalInput!): Goal!
    updateGoal(goalId: ID!, input: UpdateGoalInput!): Goal!
    deleteGoal(goalId: ID!): Boolean!

    # Projects
    createProject(teamId: ID!, input: CreateProjectInput!): Project!
    updateProject(projectId: ID!, input: UpdateProjectInput!): Project!
    deleteProject(projectId: ID!): Boolean!

    # Tasks
    createTask(teamId: ID!, input: CreateTaskInput!): Task!
    updateTask(taskId: ID!, input: UpdateTaskInput!): Task!
    completeTask(taskId: ID!): Task!
    reopenTask(taskId: ID!): Task!
    deleteTask(taskId: ID!): Boolean!
    reorderTasks(projectId: ID!, taskIds: [ID!]!): [Task!]!

    # Task Comments
    addTaskComment(taskId: ID!, input: CreateTaskCommentInput!): TaskComment!
    updateTaskComment(commentId: ID!, content: String!): TaskComment!
    deleteTaskComment(commentId: ID!): Boolean!

    # Goal Associations (many-to-many)
    linkGoalToProject(goalId: ID!, projectId: ID!): Boolean!
    unlinkGoalFromProject(goalId: ID!, projectId: ID!): Boolean!
    setProjectGoals(projectId: ID!, goalIds: [ID!]!): [Goal!]!
    linkGoalToTask(goalId: ID!, taskId: ID!): Boolean!
    unlinkGoalFromTask(goalId: ID!, taskId: ID!): Boolean!
    setTaskGoals(taskId: ID!, goalIds: [ID!]!): [Goal!]!

    # Team Questions
    createTeamQuestion(teamId: ID!, input: CreateTeamQuestionInput!): TeamQuestion!
    answerTeamQuestion(questionId: ID!, input: AnswerTeamQuestionInput!): TeamQuestion!
    assignTeamQuestion(questionId: ID!, assigneeIds: [ID!]!): TeamQuestion!
    closeTeamQuestion(questionId: ID!): TeamQuestion!
  }
`;
