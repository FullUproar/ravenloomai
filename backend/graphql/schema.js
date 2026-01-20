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

  # Response from Ask query (instant, no confirmation needed)
  type AskResponse {
    answer: String!
    confidence: Float
    factsUsed: [Fact!]!
    suggestedFollowups: [String!]
  }

  # A fact extracted from a Remember statement (for preview)
  type ExtractedFact {
    content: String!
    entityType: String
    entityName: String
    attribute: String
    value: String
    category: String
    confidenceScore: Float
  }

  # Potential conflict with existing knowledge
  type FactConflict {
    existingFact: Fact!
    conflictType: String!  # contradiction, update, duplicate
    explanation: String!
  }

  # Preview response from Remember (requires confirmation)
  type RememberPreview {
    previewId: ID!
    sourceText: String!
    extractedFacts: [ExtractedFact!]!
    conflicts: [FactConflict!]!
    isMismatch: Boolean!  # True if input looks like a question
    mismatchSuggestion: String
  }

  # Result after confirming a Remember
  type RememberResult {
    success: Boolean!
    factsCreated: [Fact!]!
    factsUpdated: [Fact!]!
    message: String
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
  # GIF TYPES (Tenor API)
  # ============================================================================

  type Gif {
    id: String!
    title: String
    url: String!
    previewUrl: String
    width: Int
    height: Int
  }

  type GifCategory {
    name: String!
    imageUrl: String
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

    # Knowledge
    getFacts(teamId: ID!, category: String, entityType: String, limit: Int): [Fact!]!
    getDecisions(teamId: ID!, limit: Int): [Decision!]!
    searchKnowledge(teamId: ID!, query: String!): KnowledgeResult!

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

    # GIFs (Tenor API)
    searchGifs(query: String!, limit: Int): [Gif!]!
    getTrendingGifs(limit: Int): [Gif!]!
    getGifCategories: [GifCategory!]!

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
    askRaven(scopeId: ID!, question: String!): AskResponse!

    # Get fact attribution/provenance
    getFactAttribution(factId: ID!): FactAttribution
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

    # Preview a Remember statement - extracts facts, detects conflicts
    previewRemember(scopeId: ID!, statement: String!, sourceUrl: String): RememberPreview!

    # Confirm and save facts from a preview
    confirmRemember(previewId: ID!, skipConflictIds: [ID!]): RememberResult!

    # Cancel a Remember preview (cleanup)
    cancelRemember(previewId: ID!): Boolean!
  }
`;
