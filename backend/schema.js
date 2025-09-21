import { gql } from 'apollo-server';

export default gql`
  scalar JSON
  scalar DateTime

  type Project {
    id: ID!
    userId: String!
    title: String!
    description: String
    domain: String!
    status: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    config: JSON
    metadata: JSON
    goals: [Goal!]!
    tasks: [Task!]!
    metrics: [Metric!]!
  }

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
    createdAt: DateTime!
    updatedAt: DateTime!
    tasks: [Task!]!
    metrics: [Metric!]!
  }

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
    dueDate: DateTime
    completedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
    config: JSON
    result: JSON
  }

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

  type Reminder {
    id: ID!
    projectId: ID!
    userId: String!
    title: String!
    description: String
    type: String!
    dueAt: DateTime!
    createdAt: DateTime!
    updatedAt: DateTime!
    isRecurring: Boolean!
    recurrencePattern: String
    recurrenceInterval: Int
    recurrenceDays: JSON
    recurrenceEndDate: DateTime
    status: String!
    completedAt: DateTime
    snoozedUntil: DateTime
    taskId: ID
    goalId: ID
    metricName: String
    notificationMethods: JSON
    notificationAdvanceMinutes: Int
    priority: Int!
    metadata: JSON
  }

  type ChatMessage {
    id: ID!
    projectId: ID!
    userId: String!
    role: String!
    content: String!
    createdAt: DateTime!
    metadata: JSON
  }

  type Query {
    getProject(userId: String!, projectId: ID): Project
    getProjects(userId: String!): [Project!]!
    getTasks(projectId: ID!, status: String): [Task!]!
    getMetrics(projectId: ID!, goalId: ID, dateFrom: DateTime, dateTo: DateTime): [Metric!]!
    getReminders(userId: String!, projectId: ID, status: String): [Reminder!]!
    getUpcomingReminders(userId: String!, limit: Int): [Reminder!]!
    getChatMessages(userId: String!, projectId: ID!): [ChatMessage!]!
  }

  input ProjectInput {
    title: String!
    description: String
    domain: String!
    config: JSON
    metadata: JSON
  }

  input GoalInput {
    title: String!
    description: String
    targetValue: Float
    unit: String
    priority: Int
    targetDate: DateTime
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

  input ReminderInput {
    title: String!
    description: String
    type: String!
    dueAt: DateTime!
    isRecurring: Boolean
    recurrencePattern: String
    recurrenceInterval: Int
    recurrenceDays: JSON
    recurrenceEndDate: DateTime
    taskId: ID
    goalId: ID
    metricName: String
    notificationAdvanceMinutes: Int
    priority: Int
    metadata: JSON
  }

  type Mutation {
    createProject(userId: String!, input: ProjectInput!): Project!
    updateProject(projectId: ID!, input: ProjectInput!): Project!
    deleteProject(projectId: ID!): Boolean!
    
    createGoal(projectId: ID!, input: GoalInput!): Goal!
    updateGoal(goalId: ID!, input: GoalInput!): Goal!
    deleteGoal(goalId: ID!): Boolean!
    
    createTask(projectId: ID!, input: TaskInput!): Task!
    updateTask(taskId: ID!, input: TaskInput!): Task!
    updateTaskStatus(taskId: ID!, status: String!, result: JSON): Task!
    deleteTask(taskId: ID!): Boolean!
    
    recordMetric(projectId: ID!, input: MetricInput!): Metric!
    updateMetric(metricId: ID!, input: MetricInput!): Metric!
    
    createReminder(userId: String!, projectId: ID!, input: ReminderInput!): Reminder!
    updateReminderStatus(reminderId: ID!, status: String!): Reminder!
    snoozeReminder(reminderId: ID!, snoozeUntil: DateTime!): Reminder!
    completeReminder(reminderId: ID!): Reminder!
    
    executeTask(taskId: ID!): Task!
    chat(userId: String!, projectId: ID, message: String!): ChatReply
    clearChatHistory(userId: String!, projectId: ID!): Boolean!
  }

  type SuggestedTask {
    title: String!
    description: String
    type: String!
    priority: Int
    assignedTo: String
    requiresApproval: Boolean
  }

  type SuggestedMetric {
    name: String!
    value: Float!
    unit: String
    source: String
  }

  type ChatReply {
    reply: String
    suggestedTasks: [SuggestedTask!]
    suggestedMetrics: [SuggestedMetric!]
  }
`;
