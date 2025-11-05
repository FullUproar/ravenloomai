/**
 * AI Function Definitions
 *
 * Defines functions that the AI can call to perform actions in the system.
 * These are used with OpenAI's function calling feature.
 */

export const AI_FUNCTIONS = [
  {
    name: 'createGoal',
    description: 'Create a new goal for the project. Use this when the user describes a goal, objective, or outcome they want to achieve.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Clear, concise title for the goal (e.g., "Lose 10 pounds", "Launch MVP")'
        },
        description: {
          type: 'string',
          description: 'Detailed description of the goal and why it matters'
        },
        targetValue: {
          type: 'number',
          description: 'Target numeric value if the goal is measurable (optional)'
        },
        currentValue: {
          type: 'number',
          description: 'Current value if the goal is measurable (default: 0)'
        },
        unit: {
          type: 'string',
          description: 'Unit of measurement (e.g., "pounds", "users", "revenue")'
        },
        priority: {
          type: 'integer',
          description: 'Priority level: 1 (low), 2 (medium), 3 (high)',
          enum: [1, 2, 3]
        },
        targetDate: {
          type: 'string',
          description: 'Target completion date in ISO format (YYYY-MM-DD)'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'createTask',
    description: 'Create a new task. Use this when the user mentions something they need to do, an action item, or a specific step to complete.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Clear action-oriented task title (e.g., "Set up landing page", "Call vendor")'
        },
        description: {
          type: 'string',
          description: 'Details about the task and how to complete it'
        },
        goalId: {
          type: 'integer',
          description: 'ID of the goal this task contributes to (if applicable)'
        },
        type: {
          type: 'string',
          description: 'Type of task',
          enum: ['manual', 'automated', 'decision'],
          default: 'manual'
        },
        priority: {
          type: 'integer',
          description: 'Priority level: 1 (low), 2 (medium), 3 (high)',
          enum: [1, 2, 3]
        },
        gtdType: {
          type: 'string',
          description: 'GTD task type',
          enum: ['next_action', 'waiting_for', 'someday_maybe', 'project'],
          default: 'next_action'
        },
        context: {
          type: 'string',
          description: 'Where/how this task can be done',
          enum: ['@home', '@office', '@computer', '@errands', '@phone', '@anywhere']
        },
        energyLevel: {
          type: 'string',
          description: 'Energy required',
          enum: ['low', 'medium', 'high']
        },
        timeEstimate: {
          type: 'integer',
          description: 'Estimated time in minutes'
        },
        dueDate: {
          type: 'string',
          description: 'Due date in ISO format (YYYY-MM-DDTHH:mm:ss)'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'recordMetric',
    description: 'Record a metric value. Use this when the user reports progress, shares a number, or provides data about their goal.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the metric (e.g., "weight", "daily calories", "revenue")'
        },
        value: {
          type: 'number',
          description: 'Numeric value of the metric'
        },
        unit: {
          type: 'string',
          description: 'Unit of measurement (e.g., "lbs", "kcal", "$")'
        },
        goalId: {
          type: 'integer',
          description: 'ID of the goal this metric relates to (if applicable)'
        },
        source: {
          type: 'string',
          description: 'Source of the data (e.g., "user_reported", "app", "device")',
          default: 'user_reported'
        }
      },
      required: ['name', 'value']
    }
  },
  {
    name: 'updateGoalProgress',
    description: 'Update the current value of a goal. Use this when the user reports progress on an existing measurable goal.',
    parameters: {
      type: 'object',
      properties: {
        goalId: {
          type: 'integer',
          description: 'ID of the goal to update'
        },
        currentValue: {
          type: 'number',
          description: 'New current value'
        }
      },
      required: ['goalId', 'currentValue']
    }
  },
  {
    name: 'updateTaskStatus',
    description: 'Update the status of a task. Use when user indicates a task is done, in progress, or blocked.',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'integer',
          description: 'ID of the task to update'
        },
        status: {
          type: 'string',
          description: 'New status',
          enum: ['not_started', 'in_progress', 'blocked', 'done', 'cancelled']
        },
        result: {
          type: 'object',
          description: 'Optional result data or notes about completion'
        }
      },
      required: ['taskId', 'status']
    }
  },
  {
    name: 'getGoals',
    description: 'Get all goals for the current project. Use this when you need to reference existing goals or check what the user is working toward.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getTasks',
    description: 'Get tasks for the current project. Use this to see what tasks exist and their statuses.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status (optional)',
          enum: ['not_started', 'in_progress', 'blocked', 'done', 'cancelled']
        }
      },
      required: []
    }
  },
  {
    name: 'getMetrics',
    description: 'Get recent metrics for a goal. Use this to see progress trends and recent data points.',
    parameters: {
      type: 'object',
      properties: {
        goalId: {
          type: 'integer',
          description: 'ID of the goal to get metrics for (optional - if not provided, gets all metrics)'
        },
        limit: {
          type: 'integer',
          description: 'Number of recent metrics to retrieve (default: 10)',
          default: 10
        }
      },
      required: []
    }
  }
];

export default AI_FUNCTIONS;
