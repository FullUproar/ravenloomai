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
  # PROJECT & TASK TYPES (Simplified)
  # ============================================================================

  type Project {
    id: ID!
    teamId: ID!
    name: String!
    description: String
    status: String!  # active, completed, archived
    createdBy: String
    tasks: [Task!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Task {
    id: ID!
    teamId: ID!
    projectId: ID
    channelId: ID
    title: String!
    description: String
    status: String!  # todo, in_progress, done
    priority: String!  # low, medium, high, urgent
    assignedTo: String
    assignedToUser: User
    dueAt: DateTime
    completedAt: DateTime
    createdBy: String
    sourceMessageId: ID
    createdAt: DateTime!
    updatedAt: DateTime!
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

  input CreateProjectInput {
    name: String!
    description: String
  }

  input UpdateProjectInput {
    name: String
    description: String
    status: String
  }

  input CreateTaskInput {
    projectId: ID
    channelId: ID
    title: String!
    description: String
    priority: String
    assignedTo: String
    dueAt: DateTime
  }

  input UpdateTaskInput {
    title: String
    description: String
    status: String
    priority: String
    assignedTo: String
    dueAt: DateTime
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

    # Projects & Tasks
    getProjects(teamId: ID!): [Project!]!
    getProject(projectId: ID!): Project
    getTasks(teamId: ID!, projectId: ID, status: String, assignedTo: String): [Task!]!
    getTask(taskId: ID!): Task

    # Team Invites
    getTeamInvites(teamId: ID!): [TeamInvite!]!
    validateInviteToken(token: String!): TeamInvite

    # Daily Digest
    getDailyDigest(teamId: ID!): DailyDigest!
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

    # Projects
    createProject(teamId: ID!, input: CreateProjectInput!): Project!
    updateProject(projectId: ID!, input: UpdateProjectInput!): Project!
    deleteProject(projectId: ID!): Boolean!

    # Tasks
    createTask(teamId: ID!, input: CreateTaskInput!): Task!
    updateTask(taskId: ID!, input: UpdateTaskInput!): Task!
    completeTask(taskId: ID!): Task!
    deleteTask(taskId: ID!): Boolean!
  }
`;
