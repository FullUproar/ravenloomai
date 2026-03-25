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

  # Team Settings
  type TeamSettings {
    aiEnabled: Boolean!
  }

  input UpdateTeamSettingsInput {
    aiEnabled: Boolean
  }

  # ============================================================================
  # SCOPE TYPES (Hierarchical Knowledge Boundaries)
  # ============================================================================

  type Scope {
    id: ID!
    teamId: ID!
    parentScopeId: ID
    parentScope: Scope
    type: String!  # team, project, private
    name: String!
    description: String
    summary: String  # AI-generated summary for parent scope awareness
    ownerId: String  # For private scopes
    coupledScopeId: ID  # For private scopes - which public scope it's coupled to
    coupledScope: Scope
    children: [Scope!]!  # Child scopes
    path: [Scope!]!  # Breadcrumb from root to this scope
    createdBy: String
    createdByUser: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ScopeConversation {
    id: ID!
    scopeId: ID!
    scope: Scope
    userId: String  # NULL for shared team/project conversations
    messages(limit: Int, before: DateTime): [ScopeMessage!]!
    createdAt: DateTime!
    lastMessageAt: DateTime!
  }

  type ScopeMessage {
    id: ID!
    conversationId: ID!
    scopeId: ID!
    userId: String
    user: User
    content: String!
    isAi: Boolean!
    referencedFacts: [ID!]
    replyToMessageId: ID
    replyToMessage: ScopeMessage
    aiCommand: String
    metadata: JSON
    createdAt: DateTime!
  }

  input CreateScopeInput {
    parentScopeId: ID
    name: String!
    description: String
  }

  input UpdateScopeInput {
    name: String
    description: String
    summary: String
  }

  input SendScopeMessageInput {
    content: String!
    replyToMessageId: ID
  }

  type ScopeAIResponse {
    message: ScopeMessage!
    factsCreated: [Fact!]
    alertsCreated: [Alert!]
  }

  # ============================================================================
  # ASK/REMEMBER TYPES (Clean Knowledge Management)
  # ============================================================================

  # Input for conversation context (follow-up questions)
  input ConversationMessageInput {
    role: String!
    content: String!
  }

  # Response from correction logging
  type CorrectionResponse {
    success: Boolean!
  }

  # Unified search result (from facts OR triples)
  type SearchResult {
    id: ID!
    content: String!
    source: String!           # "fact" or "triple"
    conceptName: String
    relationship: String
    category: String
    trustTier: String
    confidence: Float
    createdAt: DateTime
  }

  # Response from Ask query (instant, no confirmation needed)
  type AskResponse {
    answer: String!
    confidence: Float
    factsUsed: [Fact!]!             # backward compat (triples rendered as facts)
    triplesUsed: [Triple!]          # new: structured triples
    suggestedFollowups: [String!]
    traversalPath: TraversalPath    # for animated graph visualization
  }

  # ============================================================================
  # TRIPLE-BASED KNOWLEDGE TYPES
  # ============================================================================

  # A concept node in the knowledge graph
  type Concept {
    id: ID!
    teamId: ID!
    name: String!
    type: String!
    description: String
    aliases: [String!]
    mentionCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # The atom of knowledge: (Subject --relationship--> Object) [Contexts]
  type Triple {
    id: ID!
    teamId: ID!
    scopeId: ID
    subject: Concept!
    relationship: String!
    object: Concept!
    displayText: String!
    contexts: [ContextNode!]!
    confidence: Float!
    trustTier: String!
    trustScore: Float
    status: String!
    sourceText: String
    sourceUrl: String
    isChunky: Boolean
    isUniversal: Boolean
    autoConfirmed: Boolean
    challengeFlags: [ChallengeFlag!]
    createdBy: User
    createdAt: DateTime!
  }

  # A node in the hierarchical context taxonomy
  type ContextNode {
    id: ID!
    name: String!
    type: String!
    parent: ContextNode
    children: [ContextNode!]!
    isDynamic: Boolean!
  }

  # Extracted triple from Remember preview
  type ExtractedTriple {
    subject: String!
    subjectType: String!
    relationship: String!
    object: String!
    objectType: String!
    contexts: [ExtractedContext!]!
    confidence: Float!
    trustTier: String!
    displayText: String!
    isNew: Boolean!
    challengeFlags: [ChallengeFlag!]
  }

  # Challenge flag from trust pipeline
  type ChallengeFlag {
    type: String!        # contradiction, low_source_trust, fantastical
    detail: String!
    severity: String!    # hard, soft
  }

  # Trust score for a source x topic pair
  type TrustScore {
    sourceId: String!
    sourceType: String!
    topicId: ID
    topicName: String
    score: Float!
    alpha: Float!
    beta: Float!
    sampleCount: Int!
    level: String!       # high, medium, low, unknown
  }

  # Token usage report
  type TokenUsageReport {
    totalInputTokens: Int!
    totalOutputTokens: Int!
    totalEstimatedCostUsd: Float!
    totalCalls: Int!
    byOperation: [OperationUsage!]!
  }

  type OperationUsage {
    operation: String!
    inputTokens: Int!
    outputTokens: Int!
    estimatedCostUsd: Float!
    callCount: Int!
  }

  # User model trait
  type UserModelTrait {
    id: ID!
    relationship: String!
    objectName: String!
    confidence: Float!
    displayText: String!
  }

  type ExtractedContext {
    name: String!
    type: String!
  }

  # Conflict between extracted and existing triple
  type TripleConflict {
    existingTriple: Triple
    existingDisplayText: String
    conflictType: String!
    explanation: String!
    similarity: Float
  }

  # Preview response from Remember
  type RememberPreview {
    previewId: ID!
    sourceText: String!
    extractedTriples: [ExtractedTriple!]!
    extractedFacts: [ExtractedFact!]!  # backward compat
    conflicts: [TripleConflict!]!
    isMismatch: Boolean!
    mismatchSuggestion: String
    triageLevel: String           # auto_confirm, review, requires_decision
  }

  # Result after confirming a Remember
  type RememberResult {
    success: Boolean!
    triplesCreated: [Triple!]
    triplesUpdated: [Triple!]
    conceptsCreated: [Concept!]
    factsCreated: [Fact!]!             # backward compat
    factsUpdated: [Fact!]!             # backward compat
    nodeCreated: KnowledgeNode         # backward compat
    attachedToNodeId: ID               # backward compat
    message: String
  }

  # Traversal path — for animated graph visualization
  type TraversalStep {
    phase: String!         # embedding_search, multi_hop, selected
    timestamp: Int!        # ms since traversal start
    nodesVisited: [TraversalNode!]!
  }

  type TraversalNode {
    id: ID!
    subjectId: ID
    objectId: ID
    subjectName: String
    objectName: String
    relationship: String
    similarity: Float
    displayText: String
  }

  type TraversalScope {
    id: ID!
    name: String!
  }

  type TraversalPath {
    steps: [TraversalStep!]!
    totalDurationMs: Int!
    sstScope: TraversalScope
  }

  # Graph visualization data
  type GraphNode {
    id: ID!
    name: String!
    type: String!
    mentionCount: Int!
    connectionCount: Int!
    queryCount: Int
    lastQueryAt: DateTime
    createdAt: DateTime
  }

  type GraphEdge {
    id: ID!
    sourceId: ID!
    targetId: ID!
    relationship: String!
    displayText: String!
    confidence: Float
    trustTier: String
    traversalCount: Int
  }

  type GraphData {
    nodes: [GraphNode!]!
    edges: [GraphEdge!]!
  }

  # Semantic Scope Tree node
  type SSTNode {
    id: ID!
    name: String!
    description: String
    parentId: ID
    depth: Int!
    tripleCount: Int!
    queryCount: Int!
    isRoot: Boolean!
  }

  # Graph topology analysis
  type GraphTopology {
    totalConcepts: Int!
    totalTriples: Int!
    totalEdges: Int!
    avgDegree: Float!
    maxDegree: Int!
    orphanCount: Int!
    connectedComponents: Int!
    avgPathLength: Float
    hubNodes: [HubNode!]!
    degreeDistribution: [DegreeBucket!]!
  }

  type HubNode {
    id: ID!
    name: String!
    type: String
    degree: Int!
    inDegree: Int!
    outDegree: Int!
  }

  type DegreeBucket {
    degree: Int!
    count: Int!
  }

  type NodeInspection {
    id: ID!
    name: String!
    type: String
    aliases: [String!]
    degree: Int!
    inDegree: Int!
    outDegree: Int!
    clusteringCoefficient: Float
    isProtected: Boolean
    recallCount: Int
    edges: [NodeEdge!]!
    neighborConcepts: [NeighborConcept!]!
  }

  type NodeEdge {
    tripleId: ID!
    direction: String!
    relationship: String!
    targetId: ID!
    targetName: String!
    targetType: String
    displayText: String
    confidence: Float
  }

  type NeighborConcept {
    id: ID!
    name: String!
    type: String
    sharedEdgeCount: Int!
  }

  # Graph statistics
  type TripleGraphStats {
    totalConcepts: Int!
    totalTriples: Int!
    totalContexts: Int!
    avgContextsPerTriple: Float!
    orphanConcepts: Int!
    chunkyTriples: Int!
    universalTriples: Int!
  }

  type TripleGroomReport {
    decomposed: Int!
    mergeProposals: [ConceptMergeProposal!]
    autoMerged: JSON
    pruned: Int!
    contextsDiscovered: Int!
    inferences: JSON
    relationshipsRefined: Int!
    stats: TripleGraphStats
  }

  type ConceptMergeProposal {
    conceptA: Concept!
    conceptB: Concept!
    similarity: Float!
    suggestedCanonical: String!
  }

  # Backward compat types (still used by MCP and frontend during transition)
  type ExtractedFact {
    content: String!
    entityType: String
    entityName: String
    attribute: String
    value: String
    category: String
    confidenceScore: Float
    contextTags: [String!]
  }

  type FactConflict {
    existingFact: Fact
    conflictType: String!
    explanation: String!
  }

  # Source attribution for facts
  type FactAttribution {
    sourceQuote: String
    sourceUrl: String
    sourceType: String!
    sourceId: ID
    createdBy: User
    createdAt: DateTime!
  }

  # AI Usage Statistics
  type AIUsageStats {
    period: String!
    byService: [ServiceUsage!]!
    totals: UsageTotals
    rateLimits: [RateLimitStatus!]!
  }

  type ServiceUsage {
    service: String!
    calls: Int!
    tokens: Int
  }

  type UsageTotals {
    totalCalls: Int!
    totalTokens: Int
    avgDuration: Float
    failedCalls: Int
  }

  type RateLimitStatus {
    windowType: String!
    callCount: Int!
    tokenCount: Int!
    limit: Int!
    remaining: Int!
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
    isSiteAdmin: Boolean
    siteRole: String  # 'user', 'team_creator', 'super_admin'
    createdAt: DateTime!
  }

  # Site-wide invite (required for new user registration)
  type SiteInvite {
    id: ID!
    email: String!
    invitedBy: ID
    invitedByName: String
    invitedByEmail: String
    inviteCode: String!
    status: String!  # pending, accepted, expired, revoked
    expiresAt: DateTime
    acceptedAt: DateTime
    createdAt: DateTime!
  }

  # Access code (alternative to email invite for site access)
  type AccessCode {
    id: ID!
    code: String!
    description: String
    createdBy: ID
    createdByName: String
    createdByEmail: String
    maxUses: Int
    usesRemaining: Int
    teamId: ID
    teamName: String
    isActive: Boolean!
    expiresAt: DateTime
    createdAt: DateTime!
  }

  type AccessCodeUse {
    id: ID!
    userId: String
    email: String!
    displayName: String
    usedAt: DateTime!
  }

  type AccessCodeValidation {
    valid: Boolean!
    message: String
    teamId: ID
    teamName: String
  }

  input CreateAccessCodeInput {
    description: String
    maxUses: Int
    teamId: ID
    expiresAt: DateTime
  }

  # ============================================================================
  # INTEGRATIONS (Google Drive, etc.)
  # ============================================================================

  type Integration {
    id: ID!
    provider: String!  # google, notion, etc.
    providerEmail: String
    isActive: Boolean!
    createdAt: DateTime!
  }

  type DriveFile {
    id: String!
    name: String!
    mimeType: String!
    modifiedTime: String
    webViewLink: String
    iconLink: String
  }

  type DriveFilesResult {
    files: [DriveFile!]!
    nextPageToken: String
  }

  type DriveFileContent {
    id: String!
    name: String!
    mimeType: String!
    content: String!
  }

  type GooglePickerConfig {
    clientId: String!
    apiKey: String
    accessToken: String!
    appId: String!
  }

  # ============================================================================
  # KNOWLEDGE BASE (Linked folders/files from external sources)
  # ============================================================================

  type KnowledgeBaseSource {
    id: ID!
    teamId: ID!
    provider: String!  # google_drive, notion, etc.
    sourceType: String!  # folder, file
    sourceId: String!  # External ID
    sourceName: String!
    sourcePath: String
    sourceMimeType: String
    sourceUrl: String
    status: String!  # pending, syncing, synced, error
    lastSyncedAt: DateTime
    syncError: String
    fileCount: Int
    addedBy: User
    createdAt: DateTime!
    updatedAt: DateTime!
    # Nested documents for this source
    documents: [KnowledgeBaseDocument!]
  }

  type KnowledgeBaseDocument {
    id: ID!
    sourceId: ID
    externalId: String!
    title: String!
    mimeType: String
    externalUrl: String
    hasContent: Boolean!  # Whether content has been extracted
    lastSyncedAt: DateTime
    createdAt: DateTime!
  }

  type KnowledgeBaseSyncResult {
    source: KnowledgeBaseSource!
    documentsAdded: Int!
    documentsUpdated: Int!
    errors: [String!]
  }

  # ============================================================================
  # ATTACHMENTS (Images, Files)
  # ============================================================================

  type Attachment {
    id: ID!
    teamId: ID
    uploadedBy: String!
    filename: String!
    originalName: String!
    mimeType: String!
    fileSize: Int!
    url: String!
    messageId: ID
    teamQuestionId: ID
    width: Int
    height: Int
    thumbnailUrl: String
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
    channelType: String!  # public, raven_dm
    ownerId: String  # For raven_dm - the user who owns this DM
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
    aiCommand: String  # remember, query, remind, etc.
    metadata: JSON
    hasAttachments: Boolean
    attachments: [Attachment!]
    createdAt: DateTime!
  }

  # ============================================================================
  # KNOWLEDGE BASE TYPES (Enhanced)
  # ============================================================================

  type Fact {
    id: ID!
    teamId: ID!
    scopeId: ID
    scope: Scope
    content: String!
    # Structured entity model
    entityType: String  # person, product, process, policy, etc.
    entityName: String  # "John Smith", "Widget Pro", etc.
    attribute: String   # "email", "price", "status"
    value: String       # "john@example.com", "$99", "active"
    category: String    # product, manufacturing, marketing, sales, general
    confidenceScore: Float  # 0.0 - 1.0
    sourceType: String!  # conversation, document, manual, integration, user_statement
    sourceId: ID
    # Source attribution for provenance tracking
    sourceQuote: String  # Original verbatim text that created this fact
    sourceUrl: String    # External reference URL (Google Doc, etc.)
    createdBy: String
    createdByUser: User
    validFrom: DateTime!
    validUntil: DateTime
    supersededBy: ID
    contextTags: [String!]  # Context scoping: ["project:alpha", "california", "usa"]
    metadata: JSON
    trustTier: String  # official (canonical docs) or tribal (flow of work)
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
    scopeId: ID
    scope: Scope
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

  # ============================================================================
  # AI RESPONSE TYPES
  # ============================================================================

  type AIResponse {
    message: Message!
    factsCreated: [Fact!]
    alertsCreated: [Alert!]
  }

  # Ask the Company response
  type AskCompanyResponse {
    answer: String!
    confidence: Float
    factsUsed: [Fact!]
    decisionsUsed: [Decision!]
    suggestedFollowups: [String!]
  }

  # ============================================================================
  # TEAM QUESTIONS (for when Raven doesn't have a confident answer)
  # ============================================================================

  type TeamQuestion {
    id: ID!
    teamId: ID!
    scopeId: ID
    scope: Scope
    askedBy: ID!
    askedByUser: User
    askedByName: String
    askedByRaven: Boolean!
    question: String!
    aiAnswer: String
    aiConfidence: Float!
    status: String!  # open, answered, closed
    answer: String
    answeredBy: ID
    answeredByUser: User
    answeredByName: String
    answeredAt: DateTime
    assignees: [User!]!
    channelId: ID
    context: String
    parentQuestionId: ID
    parentQuestion: TeamQuestion
    followUpQuestions: [TeamQuestion!]!
    learningObjectiveId: ID
    learningObjective: LearningObjective
    attachments: [Attachment!]
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
    learningObjectiveId: ID
  }

  input AnswerTeamQuestionInput {
    answer: String!
    addToKnowledge: Boolean
  }

  input AddToKnowledgeBaseInput {
    provider: String!  # google_drive
    sourceType: String!  # folder, file
    sourceId: String!  # External ID (Drive folder/file ID)
    sourceName: String!
    sourcePath: String
    sourceMimeType: String
    sourceUrl: String
  }

  # ============================================================================
  # LEARNING OBJECTIVES (Research projects for knowledge building)
  # ============================================================================

  type LearningObjective {
    id: ID!
    teamId: ID!
    scopeId: ID
    scope: Scope
    title: String!
    description: String
    status: String!  # active, paused, completed
    assignedTo: ID
    assignedToUser: User
    assignedToName: String  # "Raven" if assignedTo is null
    createdBy: ID!
    createdByUser: User
    createdByName: String
    questionsAsked: Int!
    maxQuestions: Int!
    questionCount: Int!
    answeredCount: Int!
    questions: [TeamQuestion!]!
    createdAt: DateTime!
    updatedAt: DateTime!
    completedAt: DateTime
  }

  input CreateLearningObjectiveInput {
    title: String!
    description: String
    assignedTo: ID  # null = assign to Raven
    maxQuestions: Int
  }

  input UpdateLearningObjectiveInput {
    title: String
    description: String
    status: String
    assignedTo: ID
  }

  # ============================================================================
  # DATA IMPORT TYPES
  # ============================================================================

  type ImportSourceChannel {
    id: String!
    name: String!
    messageCount: Int!
    threadCount: Int!
    memberCount: Int!
  }

  type ImportExportPreview {
    source: String!
    channels: [ImportSourceChannel!]!
    userCount: Int!
    totalMessages: Int!
  }

  input ChannelMappingInput {
    sourceChannelId: String!
    action: String!
    targetChannelId: ID
    newChannelName: String
  }

  type ImportResult {
    success: Boolean!
    channelsCreated: Int!
    channelsMerged: Int!
    messagesImported: Int!
    threadsImported: Int!
    errors: [String!]
  }

  # ============================================================================
  # KNOWLEDGE GAP TYPES
  # ============================================================================

  type KnowledgeGap {
    conceptId: ID!
    conceptName: String!
    conceptType: String
    gapType: String!
    question: String!
    priority: Int!
    context: String
  }

  type GapSummary {
    totalConcepts: Int!
    totalTriples: Int!
    conceptsWithIdentity: Int!
    conceptsWithoutIdentity: Int!
    thinConcepts: Int!
    undescribedConcepts: Int!
    staleConcepts: Int!
    topGapAreas: [GapArea!]!
  }

  type GapArea {
    area: String!
    gapCount: Int!
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
    getMyRavenChannel(teamId: ID!): Channel!  # Gets or creates user's private Raven DM

    # Threads
    getThread(threadId: ID!): Thread
    getThreads(channelId: ID!, limit: Int): [Thread!]!

    # Messages
    getMessages(channelId: ID!, limit: Int, before: ID): [Message!]!
    getThreadMessages(threadId: ID!, limit: Int): [Message!]!

    # Knowledge (backward compat)
    getFactCount(teamId: ID!): Int!
    getFacts(teamId: ID!, category: String, entityType: String, limit: Int): [Fact!]!
    getDecisions(teamId: ID!, limit: Int): [Decision!]!

    # Triple-based knowledge
    getTriples(teamId: ID!, scopeId: ID, conceptId: ID, limit: Int): [Triple!]!
    getTriple(tripleId: ID!): Triple
    getConcepts(teamId: ID!, type: String, limit: Int): [Concept!]!
    getConcept(conceptId: ID!): Concept
    searchConcepts(teamId: ID!, query: String!, limit: Int): [Concept!]!
    getContextNodes(teamId: ID!, type: String, parentId: ID): [ContextNode!]!
    getTripleGraphStats(teamId: ID!): TripleGraphStats!
    getGraphData(teamId: ID!, sstNodeId: ID, limit: Int): GraphData!
    getSSTTree(teamId: ID!): [SSTNode!]!

    # Ask the Company (AI Q&A)
    askCompany(teamId: ID!, input: AskCompanyInput!): AskCompanyResponse!

    # Alerts
    getAlerts(teamId: ID!, status: String): [Alert!]!
    getPendingAlerts(teamId: ID!): [Alert!]!

    # Team Invites
    getTeamInvites(teamId: ID!): [TeamInvite!]!
    validateInviteToken(token: String!): TeamInvite

    # Team Questions
    getTeamQuestions(teamId: ID!, status: String, assignedTo: ID): [TeamQuestion!]!
    getTeamQuestion(questionId: ID!): TeamQuestion
    getOpenQuestionCount(teamId: ID!): Int!
    getFollowUpQuestions(questionId: ID!): [TeamQuestion!]!

    # Learning Objectives
    getLearningObjectives(teamId: ID!, status: String, assignedTo: ID): [LearningObjective!]!
    getLearningObjective(objectiveId: ID!): LearningObjective

    # Site Admin (invite management)
    getSiteInvites: [SiteInvite!]!
    checkSiteInvite(email: String!): Boolean!
    amISiteAdmin: Boolean!
    getMySiteRole: String!

    # Super Admin Dashboard
    getAllUsers: [User!]!  # Super admin only
    getAllTeams: [Team!]!  # Super admin only

    # Access Codes (alternative to email invites)
    validateAccessCode(code: String!): AccessCodeValidation!
    getAccessCodes: [AccessCode!]!  # Admin only
    getAccessCodeUses(codeId: ID!): [AccessCodeUse!]!  # Admin only

    # Integrations (Google Drive, etc.) - team-level
    getMyIntegrations(teamId: ID!): [Integration!]!
    getDriveFiles(teamId: ID!, folderId: String, pageSize: Int, pageToken: String): DriveFilesResult!
    getDriveFileContent(teamId: ID!, fileId: String!): DriveFileContent!
    getGooglePickerConfig: GooglePickerConfig!

    # Knowledge Base
    getKnowledgeBaseSources(teamId: ID!): [KnowledgeBaseSource!]!
    getKnowledgeBaseDocuments(teamId: ID!, sourceId: ID): [KnowledgeBaseDocument!]!
    isInKnowledgeBase(teamId: ID!, provider: String!, sourceId: String!): Boolean!

    # Team Settings (admin only)
    getTeamSettings(teamId: ID!): TeamSettings!
    getAIUsageStats(teamId: ID!, period: String): AIUsageStats

    # ============================================================================
    # SCOPES
    # ============================================================================

    # Get the team's root scope
    getTeamScope(teamId: ID!): Scope!

    # Get all public scopes for a team (tree structure)
    getScopeTree(teamId: ID!): [Scope!]!

    # Get a specific scope
    getScope(scopeId: ID!): Scope

    # Get child scopes of a parent
    getChildScopes(scopeId: ID!): [Scope!]!

    # Get user's private scope for a given public scope
    getMyPrivateScope(teamId: ID!, coupledScopeId: ID!): Scope!

    # Get all user's private scopes in a team
    getMyPrivateScopes(teamId: ID!): [Scope!]!

    # Get messages in a scope conversation
    getScopeMessages(scopeId: ID!, includePrivate: Boolean, limit: Int, before: DateTime): [ScopeMessage!]!

    # Get scope conversation
    getScopeConversation(scopeId: ID!, includePrivate: Boolean): ScopeConversation

    # ============================================================================
    # ASK/REMEMBER (Clean Knowledge Interface)
    # ============================================================================

    # Ask a question - instant AI response (read-only)
    askRaven(scopeId: ID!, question: String!, conversationHistory: [ConversationMessageInput!]): AskResponse!

    # Search knowledge — searches BOTH legacy facts AND triple graph
    searchKnowledge(teamId: ID!, query: String!, limit: Int): [SearchResult!]!

    # Graph topology analysis
    getGraphTopology(teamId: ID!): GraphTopology!
    inspectNode(teamId: ID!, conceptName: String!): NodeInspection

    # Trust model
    getTrustScores(teamId: ID!, sourceId: String): [TrustScore!]!
    getTokenUsage(teamId: ID!, startDate: DateTime, endDate: DateTime): TokenUsageReport!
    getUserModel(teamId: ID!, userId: String!): [UserModelTrait!]!

    # Get fact attribution/provenance
    getFactAttribution(factId: ID!): FactAttribution

    # ============================================================================
    # KNOWLEDGE GRAPH QUERIES
    # ============================================================================

    # Get the knowledge tree (root nodes or children of a parent)
    getKnowledgeTree(teamId: ID!, parentId: ID): [KnowledgeNode!]!

    # Get a single knowledge node with its details
    getKnowledgeNode(nodeId: ID!): KnowledgeNode

    # Get ancestors of a node (breadcrumb trail)
    getKnowledgeNodeAncestors(nodeId: ID!): [KnowledgeNode!]!

    # Search knowledge nodes by name/content
    searchKnowledgeNodes(teamId: ID!, query: String!, limit: Int): [KnowledgeNode!]!

    # ============================================================================
    # KNOWLEDGE FRESHNESS QUERIES
    # ============================================================================

    # Get freshness statistics for a team's knowledge
    getFreshnessStats(teamId: ID!): FreshnessStats!

    # Get facts that need review (stale or flagged)
    getFactsNeedingReview(teamId: ID!, limit: Int, offset: Int, category: String): [FactNeedingReview!]!

    # Find facts with outdated temporal references
    getTemporallyOutdatedFacts(teamId: ID!, limit: Int): [TemporallyOutdatedFact!]!

    # ============================================================================
    # KNOWLEDGE GAP ANALYSIS
    # ============================================================================

    # Detect knowledge gaps and generate questions to fill them
    getKnowledgeGaps(teamId: ID!, focus: String, maxQuestions: Int): [KnowledgeGap!]!

    # Get high-level gap statistics
    getGapSummary(teamId: ID!): GapSummary!
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
    updateTeamSettings(teamId: ID!, input: UpdateTeamSettingsInput!): TeamSettings!

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

    # Team Questions
    createTeamQuestion(teamId: ID!, input: CreateTeamQuestionInput!): TeamQuestion!
    answerTeamQuestion(questionId: ID!, input: AnswerTeamQuestionInput!): TeamQuestion!
    assignTeamQuestion(questionId: ID!, assigneeIds: [ID!]!): TeamQuestion!
    closeTeamQuestion(questionId: ID!): TeamQuestion!
    askFollowUpQuestion(questionId: ID!): TeamQuestion  # Have Raven ask a follow-up
    rejectQuestion(questionId: ID!, reason: String): TeamQuestion  # Reject a question and get a replacement

    # Learning Objectives
    createLearningObjective(teamId: ID!, input: CreateLearningObjectiveInput!): LearningObjective!
    updateLearningObjective(objectiveId: ID!, input: UpdateLearningObjectiveInput!): LearningObjective!
    deleteLearningObjective(objectiveId: ID!): Boolean!

    # Site Admin (invite management)
    createSiteInvite(email: String!): SiteInvite!
    revokeSiteInvite(inviteId: ID!): SiteInvite
    makeSiteAdmin(userId: ID!, isAdmin: Boolean!): User

    # Super Admin (site management)
    updateUserSiteRole(userId: ID!, role: String!): User  # Super admin only
    deleteUser(userId: ID!): Boolean!  # Super admin only
    deleteTeam(teamId: ID!): Boolean!  # Super admin only

    # Access Codes (alternative to email invites)
    createAccessCode(input: CreateAccessCodeInput): AccessCode!  # Admin only
    deactivateAccessCode(codeId: ID!): AccessCode  # Admin only
    redeemAccessCode(code: String!, email: String!): AccessCodeValidation!  # Pre-login validation

    # Integrations
    disconnectIntegration(provider: String!): Boolean!
    importDriveFileToKnowledge(teamId: ID!, fileId: String!): Fact

    # Knowledge Base
    addToKnowledgeBase(teamId: ID!, input: AddToKnowledgeBaseInput!): KnowledgeBaseSource!
    removeFromKnowledgeBase(teamId: ID!, sourceId: ID!): Boolean!
    syncKnowledgeBaseSource(teamId: ID!, sourceId: ID!): KnowledgeBaseSyncResult!

    # Attachments
    attachToMessage(attachmentId: ID!, messageId: ID!): Attachment
    attachToQuestion(attachmentId: ID!, questionId: ID!): Attachment
    deleteAttachment(attachmentId: ID!): Boolean!

    # ============================================================================
    # DATA IMPORT (admin only)
    # ============================================================================

    # Parse an import file and return preview of what will be imported
    parseImportFile(teamId: ID!, source: String!, fileData: String!): ImportExportPreview!

    # Execute the import based on channel mappings
    executeImport(teamId: ID!, source: String!, fileData: String!, mappings: [ChannelMappingInput!]!): ImportResult!

    # ============================================================================
    # SCOPES
    # ============================================================================

    # Create a new scope (project or sub-scope)
    createScope(teamId: ID!, input: CreateScopeInput!): Scope!

    # Update a scope
    updateScope(scopeId: ID!, input: UpdateScopeInput!): Scope!

    # Delete a scope (and all child scopes)
    deleteScope(scopeId: ID!): Boolean!

    # Send a message in a scope conversation (triggers AI if @raven mentioned)
    sendScopeMessage(scopeId: ID!, includePrivate: Boolean, input: SendScopeMessageInput!): ScopeAIResponse!

    # ============================================================================
    # ASK/REMEMBER (Clean Knowledge Interface)
    # ============================================================================

    # Preview a Remember statement - extracts triples, detects conflicts
    previewRemember(scopeId: ID!, statement: String!, sourceUrl: String): RememberPreview!

    # Confirm and save triples from a preview
    confirmRemember(previewId: ID!, skipConflictIds: [ID!]): RememberResult!

    # Cancel a Remember preview (cleanup)
    cancelRemember(previewId: ID!): Boolean!

    # Log a correction (user says an answer was wrong)
    logCorrection(teamId: ID!, question: String!, wrongAnswer: String!, correctInfo: String, tripleIds: [ID!]): CorrectionResponse!

    # Process document content into knowledge graph
    # Accepts raw text content or a URL (Google Docs, web pages)
    processDocumentContent(teamId: ID!, title: String!, content: String, url: String): DocumentProcessResult!

    # ============================================================================
    # CONVERSATION IMPORT (AI Chat Import)
    # ============================================================================

    # Import a conversation from ChatGPT, Claude, or plain text
    importConversation(teamId: ID!, input: ConversationImportInput!): ConversationImportResult!

    # ============================================================================
    # KNOWLEDGE GRAPH NODES (Hierarchy Management)
    # ============================================================================

    # Create a new knowledge node
    createKnowledgeNode(teamId: ID!, input: CreateKnowledgeNodeInput!): KnowledgeNode!

    # Update a knowledge node
    updateKnowledgeNode(nodeId: ID!, input: UpdateKnowledgeNodeInput!): KnowledgeNode!

    # Move a node to a new parent (reparent)
    reparentKnowledgeNode(nodeId: ID!, newParentId: ID): KnowledgeNode!

    # Generate or regenerate a node's summary
    generateKnowledgeNodeSummary(nodeId: ID!): KnowledgeNode!

    # Attach a fact to a knowledge node
    attachFactToNode(factId: ID!, nodeId: ID!): Fact!

    # Delete a knowledge node (and optionally its children)
    deleteKnowledgeNode(nodeId: ID!, deleteChildren: Boolean): Boolean!

    # ============================================================================
    # KNOWLEDGE FRESHNESS MUTATIONS
    # ============================================================================

    # Mark stale knowledge for a team (facts/nodes not validated in threshold days)
    markStaleKnowledge(teamId: ID!, staleThresholdDays: Int): StaleMarkResult!

    # Validate facts as still accurate (mark as fresh)
    validateFacts(factIds: [ID!]!): ValidationResult!

    # Expire a fact (mark as no longer valid)
    expireFact(factId: ID!): Boolean!

    # Set valid time range for a fact
    setFactValidRange(factId: ID!, validFrom: DateTime, validUntil: DateTime): Fact!

    # Graph Grooming (on-demand) — legacy
    groomKnowledgeGraph(teamId: ID!): GraphGroomReport!
    mergeNodes(teamId: ID!, canonicalNodeId: ID!, duplicateNodeId: ID!): MergeResult!
    deleteOrphanNodes(teamId: ID!, nodeIds: [ID!]!): DeleteResult!

    # Triple-based grooming
    groomTripleGraph(teamId: ID!): TripleGroomReport!
    mergeConcepts(teamId: ID!, canonicalId: ID!, duplicateId: ID!): Concept!

    # Simulation
    runSimulation(teamId: ID!, personas: [String!], cycles: Int): SimulationReport!
  }

  type SimulationReport {
    persona: String!
    cycles: Int!
    rememberedCount: Int!
    questionsAsked: Int!
    correctAnswers: Int!
    multiHopSuccesses: Int!
    multiHopAttempts: Int!
    overallScore: Float!
    evaluations: JSON
    graphStats: TripleGraphStats
  }

  type GraphGroomReport {
    relationships: RelationshipReport
    duplicates: [DuplicateProposal!]!
    orphans: [OrphanNode!]!
    weights: WeightReport
    inferences: [InferenceProposal!]!
    stats: GraphStats!
  }

  type RelationshipReport { refined: Int!, total: Int, message: String }
  type WeightReport { updated: Int!, message: String }
  type MergeResult { success: Boolean!, message: String }
  type DeleteResult { deleted: Int! }

  type DuplicateProposal {
    nodeA: SimpleNode!
    nodeB: SimpleNode!
    similarity: String!
    suggestedCanonical: String!
  }

  type SimpleNode { id: ID!, name: String!, type: String!, mentions: Int }

  type OrphanNode { id: ID!, name: String!, type: String!, mentions: Int, createdAt: DateTime }

  type InferenceProposal {
    chain: String!
    relationship: String!
    statement: String!
    confidence: Float!
    sourceNodeId: ID
    targetNodeId: ID
  }

  type GraphStats { totalNodes: Int!, totalEdges: Int!, totalFacts: Int! }

  # Result of processing a document
  type DocumentProcessResult {
    success: Boolean!
    title: String!
    nodesCreated: Int!
    edgesCreated: Int!
    chunksCreated: Int!
    factsExtracted: Int!
    message: String
  }

  # ============================================================================
  # KNOWLEDGE GRAPH TYPES
  # ============================================================================

  # A node in the knowledge graph (entity with hierarchy)
  type KnowledgeNode {
    id: ID!
    teamId: ID!
    name: String!
    type: String!
    description: String
    summary: String
    scaleLevel: Int!
    childCount: Int!
    factCount: Int
    parentNode: KnowledgeNode
    children: [KnowledgeNode!]!
    facts: [Fact!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # Input for creating a knowledge node
  input CreateKnowledgeNodeInput {
    name: String!
    type: String!
    description: String
    parentNodeId: ID
    scaleLevel: Int
  }

  # Input for updating a knowledge node
  input UpdateKnowledgeNodeInput {
    name: String
    description: String
    summary: String
  }

  # Input for importing a conversation
  input ConversationImportInput {
    format: String!  # chatgpt_json, claude_markdown, plain_text
    content: String!
    title: String
    sourceUrl: String
  }

  # ============================================================================
  # KNOWLEDGE FRESHNESS TYPES
  # ============================================================================

  # Statistics about knowledge freshness
  type FreshnessStats {
    fresh: Int!
    stale: Int!
    needsReview: Int!
    expired: Int!
    total: Int!
    avgConfidence: Float
    oldestValidation: DateTime
    olderThan90Days: Int!
    healthScore: Int!  # 0-100 score indicating overall knowledge health
  }

  # A fact that needs review
  type FactNeedingReview {
    id: ID!
    content: String!
    category: String
    freshnessStatus: String!
    lastValidatedAt: DateTime
    confidence: Float
    daysSinceValidation: Int
    nodeName: String
    nodeType: String
    createdAt: DateTime!
  }

  # A fact with potentially outdated temporal references
  type TemporallyOutdatedFact {
    id: ID!
    content: String!
    category: String
    pastYearsReferenced: [String!]!
    hasPastTenseWords: Boolean!
    nodeName: String
    freshnessStatus: String
    createdAt: DateTime!
  }

  # Result of validating facts
  type ValidationResult {
    factsValidated: Int!
  }

  # Result of marking stale knowledge
  type StaleMarkResult {
    factsMarked: Int!
    nodesMarked: Int!
  }

  # Result of conversation import
  type ConversationImportResult {
    success: Boolean!
    nodesCreated: Int!
    factsCreated: Int!
    rootNodeId: ID
    message: String
  }
`;
