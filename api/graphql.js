import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { gql } from 'graphql-tag';
import pg from 'pg';
import OpenAI from 'openai';

const { Pool } = pg;

// Initialize PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// GraphQL Schema
const typeDefs = gql`
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

// Simplified resolvers (focusing on core functionality)
const resolvers = {
  Query: {
    getProjects: async (_, { userId }) => {
      const result = await pool.query(
        'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return result.rows.map(row => ({
        ...row,
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    },

    getProject: async (_, { userId, projectId }) => {
      const result = await pool.query(
        'SELECT * FROM projects WHERE user_id = $1 AND ($2::int IS NULL OR id = $2) LIMIT 1',
        [userId, projectId]
      );
      if (result.rows.length === 0) return null;

      const project = result.rows[0];
      return {
        ...project,
        userId: project.user_id,
        createdAt: project.created_at,
        updatedAt: project.updated_at
      };
    },

    getTasks: async (_, { projectId, status }) => {
      let query = 'SELECT * FROM tasks WHERE project_id = $1';
      const params = [projectId];

      if (status) {
        query += ' AND status = $2';
        params.push(status);
      }

      const result = await pool.query(query + ' ORDER BY priority, created_at', params);
      return result.rows.map(row => ({
        ...row,
        projectId: row.project_id,
        goalId: row.goal_id,
        assignedTo: row.assigned_to,
        requiresApproval: row.requires_approval,
        dueDate: row.due_date,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    },

    getChatMessages: async (_, { userId, projectId }) => {
      const result = await pool.query(
        'SELECT * FROM chat_messages WHERE user_id = $1 AND project_id = $2 ORDER BY created_at',
        [userId, projectId]
      );
      return result.rows.map(row => ({
        ...row,
        projectId: row.project_id,
        userId: row.user_id,
        createdAt: row.created_at
      }));
    },
  },

  Mutation: {
    createProject: async (_, { userId, input }) => {
      const { title, description, domain, config, metadata } = input;
      const result = await pool.query(
        `INSERT INTO projects (user_id, title, description, domain, config, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, title, description, domain, config || {}, metadata || {}]
      );

      const project = result.rows[0];
      return {
        ...project,
        userId: project.user_id,
        createdAt: project.created_at,
        updatedAt: project.updated_at
      };
    },

    chat: async (_, { userId, projectId, message }) => {
      // Store user message
      await pool.query(
        'INSERT INTO chat_messages (project_id, user_id, role, content) VALUES ($1, $2, $3, $4)',
        [projectId, userId, 'user', message]
      );

      // Get project context if projectId provided
      let projectContext = '';
      if (projectId) {
        const projectResult = await pool.query(
          'SELECT title, description, domain FROM projects WHERE id = $1',
          [projectId]
        );
        if (projectResult.rows.length > 0) {
          const project = projectResult.rows[0];
          projectContext = `Project: ${project.title} (${project.domain}). ${project.description || ''}`;
        }
      }

      // Get chat history
      const historyResult = await pool.query(
        'SELECT role, content FROM chat_messages WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 10',
        [projectId, userId]
      );

      const history = historyResult.rows.reverse();

      // Prepare OpenAI messages
      const messages = [
        {
          role: 'system',
          content: `You are RavenLoom AI, a helpful project management assistant. ${projectContext}
            Help users manage their projects, goals, and tasks effectively.
            When appropriate, suggest specific tasks or metrics they should track.
            Keep responses concise and actionable.`
        },
        ...history.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: message }
      ];

      // Get AI response
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages,
          temperature: 0.7,
          max_tokens: 500
        });

        const reply = completion.choices[0].message.content;

        // Store assistant message
        await pool.query(
          'INSERT INTO chat_messages (project_id, user_id, role, content) VALUES ($1, $2, $3, $4)',
          [projectId, userId, 'assistant', reply]
        );

        // Simple task/metric extraction (can be enhanced)
        const suggestedTasks = [];
        const suggestedMetrics = [];

        return {
          reply,
          suggestedTasks,
          suggestedMetrics
        };
      } catch (error) {
        console.error('OpenAI error:', error);
        return {
          reply: 'I apologize, but I encountered an error. Please try again.',
          suggestedTasks: [],
          suggestedMetrics: []
        };
      }
    },
  },

  // Type resolvers for nested fields
  Project: {
    goals: async (project) => {
      const result = await pool.query(
        'SELECT * FROM goals WHERE project_id = $1 ORDER BY priority',
        [project.id]
      );
      return result.rows.map(row => ({
        ...row,
        projectId: row.project_id,
        targetValue: row.target_value,
        currentValue: row.current_value,
        targetDate: row.target_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    },
    tasks: async (project) => {
      const result = await pool.query(
        'SELECT * FROM tasks WHERE project_id = $1 ORDER BY priority, created_at',
        [project.id]
      );
      return result.rows.map(row => ({
        ...row,
        projectId: row.project_id,
        goalId: row.goal_id,
        assignedTo: row.assigned_to,
        requiresApproval: row.requires_approval,
        dueDate: row.due_date,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    },
    metrics: async (project) => {
      const result = await pool.query(
        'SELECT * FROM metrics WHERE project_id = $1 ORDER BY recorded_at DESC',
        [project.id]
      );
      return result.rows.map(row => ({
        ...row,
        projectId: row.project_id,
        goalId: row.goal_id,
        recordedAt: row.recorded_at
      }));
    },
  },
};

// Create Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

// Create and export the handler
const handler = startServerAndCreateNextHandler(server, {
  context: async (req) => ({ req }),
});

export default handler;