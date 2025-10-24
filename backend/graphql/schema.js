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
    createdAt: DateTime!
  }

  type ChatResponse {
    message: Message!
    conversation: Conversation!
    persona: Persona!
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

    # Relationships
    persona: Persona
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
  # MEMORY TYPES (3-Tier System)
  # ============================================================================

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

    # Conversations
    getConversation(projectId: ID!, userId: String!): Conversation
    getConversationHistory(conversationId: ID!, limit: Int): [Message!]!

    # Tasks
    getTasks(projectId: ID!, status: String): [Task!]!

    # Metrics
    getMetrics(projectId: ID!, goalId: ID, dateFrom: DateTime, dateTo: DateTime): [Metric!]!

    # Memory
    getProjectMemories(projectId: ID!): [ProjectMemory!]!
    getMemoriesByType(projectId: ID!, memoryType: String!): [ProjectMemory!]!
    getMemoryStats(projectId: ID!): MemoryStats!
    getConversationSummary(conversationId: ID!): ConversationSummary
  }

  # ============================================================================
  # MUTATIONS
  # ============================================================================

  type Mutation {
    # Projects
    createProject(userId: String!, input: ProjectInput!): Project!
    updateProject(projectId: ID!, input: ProjectInput!): Project!
    deleteProject(projectId: ID!): Boolean!

    # Personas
    createPersona(projectId: ID!, userId: String!, input: PersonaInput!): Persona!
    createPersonaFromGoal(projectId: ID!, userId: String!, userGoal: String!, preferences: CommunicationPreferencesInput): Persona!
    updatePersonaCommunication(personaId: ID!, preferences: CommunicationPreferencesInput!): Persona!
    deactivatePersona(personaId: ID!): Boolean!

    # Conversations & Chat
    sendMessage(projectId: ID!, userId: String!, message: String!): ChatResponse!
    clearConversation(conversationId: ID!): Boolean!

    # Tasks
    createTask(projectId: ID!, input: TaskInput!): Task!
    updateTask(taskId: ID!, input: TaskInput!): Task!
    updateTaskStatus(taskId: ID!, status: String!, result: JSON): Task!
    deleteTask(taskId: ID!): Boolean!

    # Metrics
    recordMetric(projectId: ID!, input: MetricInput!): Metric!

    # Memory
    setProjectMemory(projectId: ID!, input: MemoryInput!): ProjectMemory!
    removeProjectMemory(projectId: ID!, key: String!): Boolean!
    updateMemoryImportance(projectId: ID!, key: String!, importance: Int!): ProjectMemory!
    createConversationSummary(conversationId: ID!): ConversationSummary!
  }
`;
