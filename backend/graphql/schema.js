import { gql } from 'graphql-tag';

export default gql`
  scalar JSON
  scalar DateTime

  # ============================================================================
  # PERSONA TYPES
  # ============================================================================

  type Persona {
    id: ID!
    projectId: ID!
    userId: String!
    archetype: String!
    specialization: String!
    displayName: String!
    voice: String
    interventionStyle: String
    focusArea: String
    domainKnowledge: [String!]!
    domainMetrics: [String!]!
    customInstructions: String
    communicationPreferences: CommunicationPreferences
    context: JSON
    active: Boolean!
    color: String
    shape: String
    createdAt: DateTime!
    lastActiveAt: DateTime!
  }

  type CommunicationPreferences {
    tone: String
    verbosity: String
    emoji: Boolean
    platitudes: Boolean
  }

  type PersonaSuggestion {
    archetype: String!
    specialization: String!
    displayName: String!
    rationale: String!
    alternates: [PersonaAlternate!]
  }

  type PersonaAlternate {
    archetype: String!
    specialization: String!
    rationale: String!
  }

  input PersonaInput {
    archetype: String!
    specialization: String!
    customInstructions: String
    communicationPreferences: CommunicationPreferencesInput
  }

  input CommunicationPreferencesInput {
    tone: String
    verbosity: String
    emoji: Boolean
    platitudes: Boolean
  }

  # ============================================================================
  # CONVERSATION TYPES
  # ============================================================================

  type Conversation {
    id: ID!
    projectId: ID!
    userId: String!
    topic: String
    decisionRequired: Boolean
    status: String!
    messages: [Message!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Message {
    id: ID!
    conversationId: ID!
    senderId: String!
    senderType: String!
    senderName: String!
    senderAvatar: String
    content: String!
    addressedTo: [String!]
    inReplyTo: ID
    intent: String
    confidence: Float
    isDebugMessage: Boolean!
    debugData: JSON
    createdAt: DateTime!
  }

  type ChatResponse {
    message: Message!
    conversation: Conversation!
    persona: Persona!
    functionsExecuted: [FunctionExecution!]
  }

  type FunctionExecution {
    name: String!
    arguments: JSON!
    result: JSON!
  }

  # ============================================================================
  # PROJECT TYPES (Enhanced)
  # ============================================================================

  type Project {
    id: ID!
    userId: String!
    title: String!
    description: String
    status: String!

    # New persona-related fields
    completionType: String
    outcome: String
    healthScore: Int
    lastActivityAt: DateTime

    # Habit tracking
    habitStreakCurrent: Int
    habitStreakLongest: Int
    habitStreakTarget: Int

    # Recurring goals
    recurringGoal: JSON

    # Debug mode
    debugModeEnabled: Boolean!
    debugModeActivatedAt: DateTime

    # Relationships
    persona: Persona
    goals: [Goal!]!
    tasks: [Task!]!
    metrics: [Metric!]!

    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ============================================================================
  # TASK TYPES (Enhanced)
  # ============================================================================

  type Task {
    id: ID!
    projectId: ID!
    goalId: ID
    title: String!
    description: String
    type: String!
    status: String!
    priority: Int!
    assignedTo: String!
    requiresApproval: Boolean!

    # GTD fields
    gtdType: String
    context: String
    energyLevel: String
    timeEstimate: Int

    # Dependencies
    dependsOn: [ID!]
    blockedBy: String

    # Scheduling
    dueDate: DateTime
    scheduledFor: DateTime
    completedAt: DateTime
    autoScheduled: Boolean
    createdBy: String

    # Recurring task fields
    isRecurring: Boolean
    parentTaskId: ID
    recurrenceType: String
    recurrenceInterval: Int
    recurrenceDays: [Int!]
    recurrenceEndType: String
    recurrenceEndDate: DateTime
    recurrenceEndCount: Int
    recurrenceInstancesGenerated: Int
    lastInstanceGeneratedAt: DateTime
    recurrencePaused: Boolean

    config: JSON
    result: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ============================================================================
  # METRIC TYPES
  # ============================================================================

  type Metric {
    id: ID!
    projectId: ID!
    goalId: ID
    name: String!
    value: Float!
    unit: String
    recordedAt: DateTime!
    source: String!
    metadata: JSON
  }

  # ============================================================================
  # GOAL TYPES
  # ============================================================================

  type Goal {
    id: ID!
    projectId: ID!
    title: String!
    description: String
    targetValue: Float
    currentValue: Float
    unit: String
    priority: Int!
    status: String!
    targetDate: DateTime
    metrics: [Metric!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ============================================================================
  # MEMORY TYPES (Enhanced - Episodic + Semantic Memory)
  # ============================================================================

  # Episodic Memory - Conversation summaries
  type ConversationEpisode {
    id: ID!
    conversationId: ID!
    projectId: ID!
    userId: String!
    startMessageId: ID
    endMessageId: ID
    messageCount: Int!
    topic: String
    summary: String!
    keyPoints: [String!]!
    decisionsMade: JSON
    emotionsDetected: String
    userState: String
    createdAt: DateTime!
  }

  # Semantic Memory - Knowledge Graph nodes (facts about user/project)
  type KnowledgeNode {
    id: ID!
    userId: String!
    projectId: ID
    nodeType: String!
    label: String!
    properties: JSON
    sourceEpisodeId: ID
    sourceMessageId: ID
    confidence: Float!
    lastReinforcedAt: DateTime!
    timesMentioned: Int!
    contradictedBy: ID
    isActive: Boolean!
    createdAt: DateTime!
  }

  # Memory retrieval results with context
  type MemoryContext {
    recentEpisodes: [ConversationEpisode!]!
    relevantFacts: [KnowledgeNode!]!
    blockers: [KnowledgeNode!]!
    strengths: [KnowledgeNode!]!
  }

  # Legacy ProjectMemory (keep for backward compatibility)
  type ProjectMemory {
    id: ID!
    projectId: ID!
    memoryType: String!
    key: String!
    value: String!
    importance: Int!
    expiresAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type MemoryStats {
    totalMemories: Int!
    facts: Int!
    decisions: Int!
    blockers: Int!
    preferences: Int!
    insights: Int!
    avgImportance: Float!
    episodeCount: Int!
    knowledgeNodeCount: Int!
  }

  type ConversationSummary {
    conversationId: ID!
    summary: String
    lastSummaryAt: DateTime
    messageCountAtSummary: Int
  }

  # ============================================================================
  # INPUT TYPES
  # ============================================================================

  input ProjectInput {
    title: String!
    description: String
    completionType: String
    outcome: String
  }

  input TaskInput {
    goalId: ID
    title: String!
    description: String
    type: String!
    priority: Int
    assignedTo: String
    requiresApproval: Boolean
    dueDate: DateTime
    gtdType: String
    context: String
    energyLevel: String
    timeEstimate: Int
    config: JSON

    # Recurring task fields
    isRecurring: Boolean
    recurrenceType: String
    recurrenceInterval: Int
    recurrenceDays: [Int!]
    recurrenceEndType: String
    recurrenceEndDate: DateTime
    recurrenceEndCount: Int
  }

  input RecurringTaskInput {
    recurrenceType: String!
    recurrenceInterval: Int
    recurrenceDays: [Int!]
    recurrenceEndType: String
    recurrenceEndDate: DateTime
    recurrenceEndCount: Int
  }

  input GoalInput {
    title: String!
    description: String
    targetValue: Float
    currentValue: Float
    unit: String
    priority: Int
    status: String
    targetDate: DateTime
  }

  input MetricInput {
    goalId: ID
    name: String!
    value: Float!
    unit: String
    source: String
    metadata: JSON
  }

  input MemoryInput {
    memoryType: String!
    key: String!
    value: String!
    importance: Int
    expiresAt: DateTime
  }

  # ============================================================================
  # PERSONA NAMING TYPES
  # ============================================================================

  type AvailableName {
    id: ID!
    name: String!
    popularityRank: Int
    timesClaimed: Int!
    isAvailable: Boolean!
  }

  type PersonaName {
    id: ID!
    name: String!
    archetype: String!
    userId: ID!
    personaId: ID
    claimedAt: DateTime!
  }

  # ============================================================================
  # SHARING & CONNECTIONS TYPES
  # ============================================================================

  type UserConnection {
    id: ID!
    requesterId: String!
    recipientId: String!
    status: String!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ProjectShare {
    id: ID!
    projectId: ID!
    ownerId: String!
    sharedWithId: String!
    permissionLevel: String!
    project: Project
    createdAt: DateTime!
  }

  type UserMessage {
    id: ID!
    senderId: String!
    recipientId: String!
    content: String!
    read: Boolean!
    createdAt: DateTime!
  }

  type MessageThread {
    id: ID!
    otherUserId: String!
    lastMessageContent: String
    lastMessageSender: String
    lastMessageAt: DateTime!
    createdAt: DateTime!
  }

  # ============================================================================
  # QUERIES
  # ============================================================================

  type Query {
    # Projects
    getProject(userId: String!, projectId: ID!): Project
    getProjects(userId: String!): [Project!]!

    # Personas
    getPersona(personaId: ID!): Persona
    getActivePersona(projectId: ID!): Persona
    suggestPersona(userGoal: String!): PersonaSuggestion!

    # Persona Names
    getAvailableNames(archetype: String!): [AvailableName!]!
    checkNameAvailability(name: String!, archetype: String!): Boolean!
    getUserPersonaNames(userId: String!): [PersonaName!]!

    # Conversations
    getConversation(projectId: ID!, userId: String!): Conversation
    getConversationHistory(conversationId: ID!, limit: Int): [Message!]!

    # Tasks
    getTasks(projectId: ID!, status: String): [Task!]!

    # Goals
    getGoals(projectId: ID!): [Goal!]!
    getGoal(goalId: ID!): Goal

    # Metrics
    getMetrics(projectId: ID!, goalId: ID, dateFrom: DateTime, dateTo: DateTime): [Metric!]!

    # Memory - Legacy
    getProjectMemories(projectId: ID!): [ProjectMemory!]!
    getMemoriesByType(projectId: ID!, memoryType: String!): [ProjectMemory!]!
    getMemoryStats(projectId: ID!): MemoryStats!
    getConversationSummary(conversationId: ID!): ConversationSummary

    # Memory - Episodic & Semantic
    getMemoryContext(userId: String!, projectId: ID!, currentContext: String): MemoryContext!
    getConversationEpisodes(projectId: ID!, limit: Int): [ConversationEpisode!]!
    getKnowledgeNodes(userId: String!, projectId: ID, nodeTypes: [String!]): [KnowledgeNode!]!
    searchMemory(userId: String!, projectId: ID, query: String!): MemoryContext!

    # Sharing & Connections
    getConnections(userId: String!, status: String): [UserConnection!]!
    getSharedProjects(userId: String!): [ProjectShare!]!
    getMessages(userId: String!, otherUserId: String!, limit: Int): [UserMessage!]!
    getMessageThreads(userId: String!): [MessageThread!]!
  }

  # ============================================================================
  # MUTATIONS
  # ============================================================================

  type Mutation {
    # Projects
    createProject(userId: String!, input: ProjectInput!): Project!
    updateProject(projectId: ID!, input: ProjectInput!): Project!
    deleteProject(projectId: ID!): Boolean!
    enableDebugMode(projectId: ID!, passcode: String!): Project!
    disableDebugMode(projectId: ID!): Project!

    # Personas
    createPersona(projectId: ID!, userId: String!, input: PersonaInput!): Persona!
    createPersonaFromGoal(projectId: ID!, userId: String!, userGoal: String!, preferences: CommunicationPreferencesInput): Persona!
    updatePersonaCommunication(personaId: ID!, preferences: CommunicationPreferencesInput!): Persona!
    deactivatePersona(personaId: ID!): Boolean!

    # Persona Names
    claimPersonaName(userId: String!, name: String!, archetype: String!, color: String!, shape: String!): PersonaName!
    releasePersonaName(personaNameId: ID!): Boolean!

    # Conversations & Chat
    sendMessage(projectId: ID!, userId: String!, message: String!): ChatResponse!
    clearConversation(conversationId: ID!): Boolean!

    # Tasks
    createTask(projectId: ID!, input: TaskInput!): Task!
    updateTask(taskId: ID!, input: TaskInput!): Task!
    updateTaskStatus(taskId: ID!, status: String!, result: JSON): Task!
    deleteTask(taskId: ID!): Boolean!

    # Recurring Tasks
    generateRecurringTaskInstances(taskId: ID!): [Task!]!
    updateRecurringTask(taskId: ID!, input: RecurringTaskInput!): Task!
    pauseRecurringTask(taskId: ID!): Task!
    resumeRecurringTask(taskId: ID!): Task!

    # Goals
    createGoal(projectId: ID!, input: GoalInput!): Goal!
    updateGoal(goalId: ID!, input: GoalInput!): Goal!
    updateGoalProgress(goalId: ID!, currentValue: Float!): Goal!
    deleteGoal(goalId: ID!): Boolean!

    # Metrics
    recordMetric(projectId: ID!, input: MetricInput!): Metric!

    # Memory - Legacy
    setProjectMemory(projectId: ID!, input: MemoryInput!): ProjectMemory!
    removeProjectMemory(projectId: ID!, key: String!): Boolean!
    updateMemoryImportance(projectId: ID!, key: String!, importance: Int!): ProjectMemory!
    createConversationSummary(conversationId: ID!): ConversationSummary!

    # Memory - Episodic & Semantic (Automatic - no manual creation needed)
    triggerEpisodeSummarization(conversationId: ID!): ConversationEpisode!
    extractKnowledgeFacts(conversationId: ID!, episodeId: ID!): [KnowledgeNode!]!

    # Sharing & Connections
    sendConnectionRequest(requesterId: String!, recipientId: String!): UserConnection!
    respondToConnection(connectionId: ID!, status: String!): UserConnection!
    shareProject(projectId: ID!, ownerId: String!, sharedWithId: String!, permissionLevel: String): ProjectShare!
    unshareProject(projectId: ID!, sharedWithId: String!): Boolean!
    sendUserMessage(senderId: String!, recipientId: String!, content: String!): UserMessage!
    markMessageRead(messageId: ID!): Boolean!
  }
`;
