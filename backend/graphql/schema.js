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

  # Team Settings (proactive AI, rate limits, etc.)
  type TeamSettings {
    proactiveAI: ProactiveAISettings!
  }

  type ProactiveAISettings {
    enabled: Boolean!
    morningFocusEnabled: Boolean!
    smartNudgesEnabled: Boolean!
    insightsEnabled: Boolean!
    meetingPrepEnabled: Boolean!
  }

  input ProactiveAISettingsInput {
    enabled: Boolean
    morningFocusEnabled: Boolean
    smartNudgesEnabled: Boolean
    insightsEnabled: Boolean
    meetingPrepEnabled: Boolean
  }

  input UpdateTeamSettingsInput {
    proactiveAI: ProactiveAISettingsInput
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
    channelType: String!  # public, raven_dm, calendar
    ownerId: String  # For raven_dm - the user who owns this DM
    isDefault: Boolean!
    createdBy: String
    threads(limit: Int): [Thread!]!
    messages(limit: Int, before: ID): [Message!]!
    # AI Focus - items kept in AI context for this channel
    focusGoalId: ID
    focusGoal: Goal
    focusProjectId: ID
    focusProject: Project
    focusTaskId: ID
    focusTask: Task
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
    stage: String             # PM: concept, design, development, testing, launch, maintenance
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
    # PM Enhancement fields (modular)
    context: String           # GTD context
    isUrgent: Boolean         # Eisenhower matrix
    importance: String        # low, normal, high, critical
    isQuickTask: Boolean      # 2-minute rule flag
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
  # CALENDAR EVENTS
  # ============================================================================

  type Event {
    id: ID!
    teamId: ID!
    title: String!
    description: String
    location: String
    startAt: DateTime!
    endAt: DateTime!
    isAllDay: Boolean!
    timezone: String
    color: String
    reminderMinutes: Int
    recurrenceRule: String
    # Google Calendar sync
    googleEventId: String
    googleCalendarId: String
    syncStatus: String  # local, synced, sync_error
    lastSyncedAt: DateTime
    syncError: String
    # Relationships
    task: Task
    taskId: ID
    project: Project
    projectId: ID
    createdBy: String
    createdByUser: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateEventInput {
    title: String!
    description: String
    location: String
    startAt: DateTime!
    endAt: DateTime!
    isAllDay: Boolean
    timezone: String
    color: String
    reminderMinutes: Int
    recurrenceRule: String
    taskId: ID
    projectId: ID
  }

  input UpdateEventInput {
    title: String
    description: String
    location: String
    startAt: DateTime
    endAt: DateTime
    isAllDay: Boolean
    timezone: String
    color: String
    reminderMinutes: Int
    recurrenceRule: String
    taskId: ID
    projectId: ID
  }

  # Calendar items result (events + task due dates)
  type CalendarItemsResult {
    events: [Event!]!
    tasksDue: [Task!]!
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
  # AI PRODUCTIVITY FEATURES (Morning Focus, Standups, Insights, Nudges)
  # ============================================================================

  # Morning Focus - AI-generated daily plan
  type MorningFocus {
    id: ID!
    status: String!
    aiPlan: MorningFocusPlan
    aiSummary: String
    tasks: [Task!]
    events: [Event!]
    workload: WorkloadAnalysis
  }

  type MorningFocusPlan {
    greeting: String!
    topPriority: String!
    scheduledBlocks: [ScheduledBlock!]
    tasksToComplete: [String!]
    warnings: [String!]
    tip: String
  }

  type ScheduledBlock {
    time: String!
    activity: String!
    duration: String!
    type: String!  # focus, meeting, break
  }

  # Daily Standup
  type DailyStandup {
    id: ID!
    status: String!
    responses: JSON
    aiSummary: String
    questions: [StandupQuestion!]!
  }

  type StandupQuestion {
    id: String!
    question: String!
    placeholder: String
  }

  type TeamStandup {
    id: ID!
    userId: String!
    userName: String
    avatarUrl: String
    responses: JSON
    aiSummary: String
    completedAt: DateTime
  }

  # Weekly Review
  type WeeklyReview {
    id: ID!
    status: String!
    weekStart: DateTime
    weekEnd: DateTime
    review: WeeklyReviewContent
    stats: WeeklyStats
  }

  type WeeklyReviewContent {
    headline: String
    highlights: [String!]
    metrics: JSON
    areasOfFocus: [String!]
    celebration: String
  }

  type WeeklyStats {
    tasksCompleted: Int!
    tasksCreated: Int!
    standupsCompleted: Int!
    messagesSent: Int!
    meetings: Int!
  }

  # Workload Analysis
  type WorkloadAnalysis {
    weekStart: DateTime
    weekEnd: DateTime
    tasksDue: Int!
    estimatedTaskHours: Float!
    meetingHours: Float!
    availableHours: Float!
    workloadRatio: Float!
    workloadLevel: String!  # light, balanced, heavy, overloaded
    recommendation: String
  }

  # Proactive Nudges
  type ProactiveNudge {
    id: ID!
    nudgeType: String!  # overdue_task, stale_task, upcoming_deadline, meeting_prep
    title: String!
    message: String!
    priority: String!  # low, medium, high, urgent
    relatedTaskId: ID
    relatedEventId: ID
    suggestedActions: [NudgeAction!]
    createdAt: DateTime!
  }

  type NudgeAction {
    action: String!
    label: String!
  }

  # Task Health
  type TaskHealth {
    taskId: ID!
    taskTitle: String
    healthScore: Float!  # 0.0 to 1.0
    riskLevel: String!  # low, medium, high, critical
    riskFactors: [String!]
    interventions: [TaskIntervention!]
  }

  type TaskIntervention {
    intervention: String!
    impact: String!  # low, medium, high
  }

  # AI Insights
  type TeamInsights {
    insights: [Insight!]
    recommendations: [Recommendation!]
    summary: String
    metrics: InsightMetrics
    cached: Boolean
    generatedAt: DateTime
  }

  type Insight {
    title: String!
    description: String!
    sentiment: String!  # positive, neutral, warning
  }

  type Recommendation {
    title: String!
    action: String!
  }

  type InsightMetrics {
    tasksCompleted: Int
    overdueTasks: Int
    atRiskTasks: Int
    messagesThisWeek: Int
  }

  # Meeting Prep
  type MeetingPrep {
    id: ID!
    eventId: ID!
    eventTitle: String
    eventDescription: String
    eventStart: DateTime
    relatedFacts: [Fact!]
    relatedDecisions: [Decision!]
    relatedTasks: [Task!]
    suggestedAgenda: [AgendaItem!]
    contextSummary: String
    cached: Boolean
  }

  type AgendaItem {
    item: String!
    notes: String
  }

  # Focus Time Preferences
  type FocusPreferences {
    id: ID!
    preferredFocusHours: JSON
    minFocusBlockMinutes: Int
    maxMeetingsPerDay: Int
    workStartHour: Int
    workEndHour: Int
    workDays: [Int!]
    morningFocusEnabled: Boolean
    morningFocusTime: String
    dailyStandupEnabled: Boolean
    dailyStandupTime: String
    weeklyReviewEnabled: Boolean
    weeklyReviewDay: Int
    weeklyReviewTime: String
    nudgeOverdueTasks: Boolean
    nudgeStaleTasks: Boolean
    nudgeUpcomingDeadlines: Boolean
  }

  input UpdateFocusPreferencesInput {
    preferredFocusHours: JSON
    minFocusBlockMinutes: Int
    maxMeetingsPerDay: Int
    workStartHour: Int
    workEndHour: Int
    workDays: [Int!]
    morningFocusEnabled: Boolean
    morningFocusTime: String
    dailyStandupEnabled: Boolean
    dailyStandupTime: String
    weeklyReviewEnabled: Boolean
    weeklyReviewDay: Int
    weeklyReviewTime: String
    nudgeOverdueTasks: Boolean
    nudgeStaleTasks: Boolean
    nudgeUpcomingDeadlines: Boolean
  }

  # ============================================================================
  # TEAM QUESTIONS (for when Raven doesn't have a confident answer)
  # ============================================================================

  type TeamQuestion {
    id: ID!
    teamId: ID!
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
# ============================================================================  # PROJECT MANAGEMENT ENHANCEMENTS (Modular - can be removed)  # ============================================================================
  # QUERIES
  # ============================================================================
# ============================================================================
  # PROJECT MANAGEMENT ENHANCEMENTS (Modular - can be removed)
  # ============================================================================

  # User Availability & Work Schedule
  type UserAvailability {
    id: ID!
    userId: String!
    teamId: ID!
    timezone: String!
    workDayStart: String!
    workDayEnd: String!
    workDays: [Int!]!
    weeklyCapacityHours: Float!
    proModeEnabled: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input UserAvailabilityInput {
    timezone: String
    workDayStart: String
    workDayEnd: String
    workDays: [Int!]
    weeklyCapacityHours: Float
    proModeEnabled: Boolean
  }

  # Time Off / Vacation
  type TimeOff {
    id: ID!
    userId: String!
    user: User
    teamId: ID!
    startDate: String!
    endDate: String!
    type: String!
    description: String
    isHalfDay: Boolean!
    halfDayPeriod: String
    status: String!
    approvedBy: String
    approvedByUser: User
    createdAt: DateTime!
  }

  input CreateTimeOffInput {
    startDate: String!
    endDate: String!
    type: String
    description: String
    isHalfDay: Boolean
    halfDayPeriod: String
  }

  # GTD Contexts
  type TaskContext {
    id: ID!
    teamId: ID!
    name: String!
    icon: String
    color: String
    sortOrder: Int!
    isActive: Boolean!
  }

  input CreateTaskContextInput {
    name: String!
    icon: String
    color: String
  }

  # Milestones
  type Milestone {
    id: ID!
    teamId: ID!
    projectId: ID
    project: Project
    name: String!
    description: String
    targetDate: String
    completedAt: DateTime
    status: String!
    sortOrder: Int!
    goalId: ID
    goal: Goal
    createdBy: String
    createdByUser: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateMilestoneInput {
    projectId: ID
    name: String!
    description: String
    targetDate: String
    goalId: ID
  }

  input UpdateMilestoneInput {
    name: String
    description: String
    targetDate: String
    status: String
    goalId: ID
  }

  # Project Templates
  type ProjectTemplate {
    id: ID!
    teamId: ID!
    name: String!
    description: String
    templateData: JSON!
    industryType: String
    isActive: Boolean!
    createdBy: String
    createdByUser: User
    createdAt: DateTime!
  }

  input CreateProjectTemplateInput {
    name: String!
    description: String
    templateData: JSON
    industryType: String
  }

  # Time Blocks
  type TimeBlock {
    id: ID!
    userId: String!
    user: User
    teamId: ID!
    taskId: ID
    task: Task
    title: String
    startTime: DateTime!
    endTime: DateTime!
    status: String!
    calendarEventId: ID
    googleEventId: String
    actualStart: DateTime
    actualEnd: DateTime
    focusScore: Int
    notes: String
    createdAt: DateTime!
  }

  input CreateTimeBlockInput {
    taskId: ID
    title: String
    startTime: DateTime!
    endTime: DateTime!
  }

  input UpdateTimeBlockInput {
    title: String
    startTime: DateTime
    endTime: DateTime
    status: String
    focusScore: Int
    notes: String
  }

  # Team Workload
  type UserWorkload {
    userId: String!
    user: User
    displayName: String
    teamId: ID
    openTasks: Int!
    overdueTasks: Int!
    dueThisWeek: Int!
    totalEstimatedHours: Float!
    weeklyCapacity: Float!
    utilizationPercent: Float!
    isOverallocated: Boolean!
  }

  type TeamWorkloadSummary {
    teamId: ID!
    totalOpenTasks: Int!
    totalOverdueTasks: Int!
    averageUtilization: Float!
    overallocatedMembers: [UserWorkload!]!
    underallocatedMembers: [UserWorkload!]!
    members: [UserWorkload!]!
  }

  # Meeting Preferences
  type MeetingPreferences {
    id: ID!
    userId: String!
    preferredMeetingStart: String!
    preferredMeetingEnd: String!
    bufferBefore: Int!
    bufferAfter: Int!
    maxMeetingsPerDay: Int!
    noMeetingDays: [Int!]!
    protectedFocusStart: String
    protectedFocusEnd: String
  }

  input MeetingPreferencesInput {
    preferredMeetingStart: String
    preferredMeetingEnd: String
    bufferBefore: Int
    bufferAfter: Int
    maxMeetingsPerDay: Int
    noMeetingDays: [Int!]
    protectedFocusStart: String
    protectedFocusEnd: String
  }

  # Smart Scheduling
  type SchedulingSuggestion {
    startTime: DateTime!
    endTime: DateTime!
    score: Float!
    conflicts: [String!]
    attendeesAvailable: [String!]!
  }

  type SchedulingResult {
    suggestions: [SchedulingSuggestion!]!
    unavailableUsers: [String!]!
    message: String
  }

  input ScheduleMeetingInput {
    attendeeIds: [String!]!
    durationMinutes: Int!
    preferredDateStart: DateTime
    preferredDateEnd: DateTime
    title: String
  }

  # User Feature Flags (Pro Mode)
  type UserFeatureFlags {
    id: ID!
    userId: String!
    proModeEnabled: Boolean!
    showGanttChart: Boolean!
    showTimeTracking: Boolean!
    showDependenciesGraph: Boolean!
    showResourceAllocation: Boolean!
    showCriticalPath: Boolean!
    showEisenhowerMatrix: Boolean!
    showWorkloadHistogram: Boolean!
    showMilestones: Boolean!
    showTimeBlocking: Boolean!
    showContexts: Boolean!
    showWBS: Boolean!
    preferredProductivityMethod: String!
    workflowPersona: String!
  }

  input UserFeatureFlagsInput {
    proModeEnabled: Boolean
    showGanttChart: Boolean
    showTimeTracking: Boolean
    showDependenciesGraph: Boolean
    showResourceAllocation: Boolean
    showCriticalPath: Boolean
    showEisenhowerMatrix: Boolean
    showWorkloadHistogram: Boolean
    showMilestones: Boolean
    showTimeBlocking: Boolean
    showContexts: Boolean
    showWBS: Boolean
    preferredProductivityMethod: String
    workflowPersona: String
  }

  # Eisenhower Matrix
  type EisenhowerMatrix {
    doNow: [Task!]!
    schedule: [Task!]!
    delegate: [Task!]!
    eliminate: [Task!]!
  }

  # Gantt Chart Data
  type GanttTask {
    id: ID!
    title: String!
    startDate: DateTime
    endDate: DateTime
    progress: Float!
    dependencies: [GanttDependency!]!
    assignee: User
    isCriticalPath: Boolean!
    isMilestone: Boolean!
    color: String
  }

  type GanttDependency {
    fromTaskId: ID!
    toTaskId: ID!
    type: String!
  }

  type GanttData {
    tasks: [GanttTask!]!
    milestones: [Milestone!]!
    criticalPath: [ID!]!
    projectStart: DateTime
    projectEnd: DateTime
  }

  # Workload Histogram
  type WorkloadHistogramEntry {
    date: String!
    userId: String!
    userName: String!
    scheduledHours: Float!
    capacityHours: Float!
    utilizationPercent: Float!
  }

  type WorkloadHistogram {
    entries: [WorkloadHistogramEntry!]!
    startDate: String!
    endDate: String!
    teamId: ID!
  }

  # Work Breakdown Structure (WBS)
  type WBSNode {
    id: ID!
    title: String
    name: String
    description: String
    type: String!
    status: String
    estimatedHours: Float!
    actualHours: Float!
    rollupEstimatedHours: Float!
    rollupActualHours: Float!
    completionPercent: Int!
    assignedTo: String
    parentId: ID
    children: [WBSNode!]!
  }

  input WBSTaskInput {
    title: String!
    description: String
    estimatedHours: Float
    parentTaskId: ID
  }

  # Generic WBS Draft (Ephemeral Tree)
  type WBSDraft {
    id: ID!
    teamId: ID!
    createdBy: String!
    createdByUser: User
    name: String!
    description: String
    treeData: JSON!
    materializedProjectId: ID
    materializedProject: Project
    materializedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type WBSDraftNode {
    id: String!
    label: String!
    estimatedHours: Float
    children: [WBSDraftNode!]!
  }

  input WBSDraftInput {
    name: String!
    description: String
    treeData: JSON!
  }

  input WBSDraftNodeInput {
    id: String!
    label: String!
    estimatedHours: Float
    children: [WBSDraftNodeInput!]
  }

  # AI Materialization result
  type WBSMaterializationResult {
    project: Project!
    tasksCreated: Int!
    totalEstimatedHours: Float!
    aiSummary: String
  }

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
    getMyCalendarChat(teamId: ID!): Channel!  # Gets or creates user's private Calendar Chat

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

    # Integrations (Google Drive, etc.)
    getMyIntegrations: [Integration!]!
    getDriveFiles(folderId: String, pageSize: Int, pageToken: String): DriveFilesResult!
    getDriveFileContent(fileId: String!): DriveFileContent!
    getGooglePickerConfig: GooglePickerConfig!

    # Knowledge Base
    getKnowledgeBaseSources(teamId: ID!): [KnowledgeBaseSource!]!
    getKnowledgeBaseDocuments(teamId: ID!, sourceId: ID): [KnowledgeBaseDocument!]!
    isInKnowledgeBase(teamId: ID!, provider: String!, sourceId: String!): Boolean!

    # GIFs (Tenor API)
    searchGifs(query: String!, limit: Int): [Gif!]!
    getTrendingGifs(limit: Int): [Gif!]!
    getGifCategories: [GifCategory!]!

    # Calendar Events
    getEvents(teamId: ID!, startDate: DateTime, endDate: DateTime, taskId: ID, projectId: ID): [Event!]!
    getEvent(eventId: ID!): Event
    getCalendarMonth(teamId: ID!, year: Int!, month: Int!): [Event!]!
    getCalendarItems(teamId: ID!, startDate: DateTime!, endDate: DateTime!): CalendarItemsResult!
    exportCalendarICS(teamId: ID!, startDate: DateTime, endDate: DateTime): String!

    # ============================================================================
    # AI PRODUCTIVITY FEATURES
    # ============================================================================

    # Morning Focus (AI daily plan)
    getMorningFocus(teamId: ID!): MorningFocus

    # Daily Standup
    getMyStandup(teamId: ID!): DailyStandup
    getTeamStandups(teamId: ID!): [TeamStandup!]!

    # Weekly Review
    getWeeklyReview(teamId: ID!): WeeklyReview

    # Workload Analysis
    getMyWorkload(teamId: ID!): WorkloadAnalysis

    # Proactive Nudges
    getMyNudges(teamId: ID!): [ProactiveNudge!]!

    # Task Health
    getTaskHealth(taskId: ID!): TaskHealth
    getAtRiskTasks(teamId: ID!, threshold: Float): [TaskHealth!]!

    # AI Insights
    getTeamInsights(teamId: ID!): TeamInsights

    # Meeting Prep
    getMeetingPrep(eventId: ID!): MeetingPrep
    getUpcomingMeetingsNeedingPrep(teamId: ID!, hoursAhead: Int): [Event!]!

    # Focus Preferences
    getMyFocusPreferences(teamId: ID!): FocusPreferences

    # Team Settings (admin only)
    getTeamSettings(teamId: ID!): TeamSettings!
    getAIUsageStats(teamId: ID!, period: String): AIUsageStats

    # ============================================================================
    # PROJECT MANAGEMENT QUERIES (Modular - can be removed)
    # ============================================================================

    # User Availability
    getMyAvailability(teamId: ID!): UserAvailability
    getTeamAvailability(teamId: ID!): [UserAvailability!]!

    # Time Off
    getMyTimeOff(teamId: ID!): [TimeOff!]!
    getTeamTimeOff(teamId: ID!, startDate: String, endDate: String): [TimeOff!]!

    # GTD Contexts
    getTaskContexts(teamId: ID!): [TaskContext!]!

    # Milestones
    getMilestones(teamId: ID!, projectId: ID): [Milestone!]!
    getMilestone(milestoneId: ID!): Milestone

    # Project Templates
    getProjectTemplates(teamId: ID!): [ProjectTemplate!]!
    getProjectTemplate(templateId: ID!): ProjectTemplate

    # Time Blocks
    getMyTimeBlocks(teamId: ID!, startDate: DateTime, endDate: DateTime): [TimeBlock!]!

    # Team Workload & Resource Allocation
    getTeamWorkload(teamId: ID!): TeamWorkloadSummary!
    getUserWorkload(teamId: ID!, userId: String!): UserWorkload

    # Meeting Preferences
    getMyMeetingPreferences: MeetingPreferences

    # Smart Scheduling
    findMeetingTimes(teamId: ID!, input: ScheduleMeetingInput!): SchedulingResult!

    # Feature Flags (Pro Mode)
    getMyFeatureFlags: UserFeatureFlags

    # Eisenhower Matrix
    getEisenhowerMatrix(teamId: ID!): EisenhowerMatrix!

    # Gantt Chart
    getGanttData(teamId: ID!, projectId: ID): GanttData!

    # Workload Histogram
    getWorkloadHistogram(teamId: ID!, startDate: String!, endDate: String!): WorkloadHistogram!

    # Work Breakdown Structure
    getWBSData(projectId: ID!): WBSNode!

    # WBS Drafts (Generic Ephemeral Trees)
    getWBSDrafts(teamId: ID!): [WBSDraft!]!
    getWBSDraft(draftId: ID!): WBSDraft
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

    # AI Focus - Set context for AI in a channel
    setChannelAIFocus(channelId: ID!, goalId: ID, projectId: ID, taskId: ID): Channel!
    clearChannelAIFocus(channelId: ID!): Channel!

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

    # Calendar Events
    createEvent(teamId: ID!, input: CreateEventInput!): Event!
    updateEvent(eventId: ID!, input: UpdateEventInput!): Event!
    deleteEvent(eventId: ID!): Boolean!
    syncEventToGoogle(eventId: ID!): Event!
    importCalendarFromGoogle(teamId: ID!, calendarId: String, daysBack: Int, daysForward: Int): [Event!]!

    # ============================================================================
    # AI PRODUCTIVITY FEATURES
    # ============================================================================

    # Generate Morning Focus (AI daily plan)
    generateMorningFocus(teamId: ID!): MorningFocus!

    # Daily Standup
    submitStandup(ceremonyId: ID!, responses: JSON!): DailyStandup!

    # Generate Weekly Review
    generateWeeklyReview(teamId: ID!): WeeklyReview!

    # Nudge Actions
    dismissNudge(nudgeId: ID!): Boolean!
    actOnNudge(nudgeId: ID!): Boolean!

    # Generate Task Health (recalculate)
    refreshTaskHealth(taskId: ID!): TaskHealth!
    refreshTeamTaskHealth(teamId: ID!): [TaskHealth!]!

    # Generate AI Insights (refresh)
    refreshTeamInsights(teamId: ID!): TeamInsights!

    # Generate Meeting Prep
    generateMeetingPrep(teamId: ID!, eventId: ID!): MeetingPrep!
    markMeetingPrepViewed(prepId: ID!): MeetingPrep!

    # Update Focus Preferences
    updateFocusPreferences(teamId: ID!, input: UpdateFocusPreferencesInput!): FocusPreferences!

    # Generate Nudges
    generateNudges(teamId: ID!): [ProactiveNudge!]!

    # ============================================================================
    # PROJECT MANAGEMENT MUTATIONS (Modular - can be removed)
    # ============================================================================

    # User Availability
    updateMyAvailability(teamId: ID!, input: UserAvailabilityInput!): UserAvailability!

    # Time Off
    createTimeOff(teamId: ID!, input: CreateTimeOffInput!): TimeOff!
    updateTimeOff(timeOffId: ID!, input: CreateTimeOffInput!): TimeOff!
    deleteTimeOff(timeOffId: ID!): Boolean!
    approveTimeOff(timeOffId: ID!): TimeOff!
    rejectTimeOff(timeOffId: ID!, reason: String): TimeOff!

    # GTD Contexts
    createTaskContext(teamId: ID!, input: CreateTaskContextInput!): TaskContext!
    updateTaskContext(contextId: ID!, input: CreateTaskContextInput!): TaskContext!
    deleteTaskContext(contextId: ID!): Boolean!
    setTaskContext(taskId: ID!, context: String): Task!

    # Milestones
    createMilestone(teamId: ID!, input: CreateMilestoneInput!): Milestone!
    updateMilestone(milestoneId: ID!, input: UpdateMilestoneInput!): Milestone!
    completeMilestone(milestoneId: ID!): Milestone!
    deleteMilestone(milestoneId: ID!): Boolean!

    # Project Templates
    createProjectTemplate(teamId: ID!, input: CreateProjectTemplateInput!): ProjectTemplate!
    updateProjectTemplate(templateId: ID!, input: CreateProjectTemplateInput!): ProjectTemplate!
    deleteProjectTemplate(templateId: ID!): Boolean!
    createProjectFromTemplate(teamId: ID!, templateId: ID!, name: String!): Project!

    # Project Stage
    updateProjectStage(projectId: ID!, stage: String!): Project!

    # Time Blocks
    createTimeBlock(teamId: ID!, input: CreateTimeBlockInput!): TimeBlock!
    updateTimeBlock(blockId: ID!, input: UpdateTimeBlockInput!): TimeBlock!
    deleteTimeBlock(blockId: ID!): Boolean!
    startTimeBlock(blockId: ID!): TimeBlock!
    completeTimeBlock(blockId: ID!, focusScore: Int, notes: String): TimeBlock!

    # Meeting Preferences
    updateMyMeetingPreferences(input: MeetingPreferencesInput!): MeetingPreferences!

    # Feature Flags (Pro Mode)
    updateMyFeatureFlags(input: UserFeatureFlagsInput!): UserFeatureFlags!
    enableProMode: UserFeatureFlags!
    disableProMode: UserFeatureFlags!
    setWorkflowPersona(persona: String!): UserFeatureFlags!

    # Task Eisenhower Fields
    setTaskUrgency(taskId: ID!, isUrgent: Boolean!): Task!
    setTaskImportance(taskId: ID!, importance: String!): Task!

    # Quick Task (2-minute rule)
    markAsQuickTask(taskId: ID!, isQuick: Boolean!): Task!

    # Work Breakdown Structure
    createWBSTask(projectId: ID!, teamId: ID!, input: WBSTaskInput!): Task!
    updateWBSTask(taskId: ID!, input: WBSTaskInput!): Task!

    # WBS Drafts (Generic Ephemeral Trees)
    createWBSDraft(teamId: ID!, input: WBSDraftInput!): WBSDraft!
    updateWBSDraft(draftId: ID!, input: WBSDraftInput!): WBSDraft!
    deleteWBSDraft(draftId: ID!): Boolean!

    # AI Materialization - Convert WBS draft to real project/tasks
    materializeWBSDraft(draftId: ID!, teamId: ID!, projectName: String): WBSMaterializationResult!
  }
`;
