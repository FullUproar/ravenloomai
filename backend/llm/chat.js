import OpenAI from 'openai';
import db from '../db.js';

export class ChatLLM {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
  }

  async getResponse(project, message, conversationHistory = []) {
    const systemPrompt = this.buildSystemPrompt(project);

    // Build message history for OpenAI
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history
    conversationHistory.forEach(historyMsg => {
      messages.push({
        role: historyMsg.role,
        content: historyMsg.content
      });
    });

    // Add the current user message
    messages.push({ role: 'user', content: message });

    console.log('Sending to OpenAI:', messages.length, 'messages');
    console.log('Project domain:', project?.domain);
    console.log('Available tools:', project?.domain === 'health' ? 'Health tools only (no create_task)' : 'All tools');

    const chat = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use newer model that supports multiple function calls
      messages,
      // Health domain tools - NO TASK CREATION ALLOWED
      tools: project?.domain === 'health' ? [
        {
          type: 'function',
          function: {
            name: 'get_recent_metrics',
            description: 'Get recent metrics to view or update existing entries. ALWAYS use this first when user wants to update something.',
            parameters: {
              type: 'object',
              properties: {
                metricName: { type: 'string', description: 'Filter by metric name (optional)' },
                limit: { type: 'number', description: 'Number of recent metrics to retrieve (default 10)' }
              }
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'update_metric',
            description: 'Update an existing metric measurement (for corrections or changes). Use this when user says update, fix, change, correct.',
            parameters: {
              type: 'object',
              properties: {
                metricId: { type: 'string', description: 'ID of the metric to update' },
                name: { type: 'string', description: 'Metric name' },
                value: { type: 'number', description: 'Updated measurement value' },
                unit: { type: 'string', description: 'Unit of measurement' },
                goalId: { type: 'string', description: 'Associated goal ID if any' },
                recordedAt: { type: 'string', description: 'ISO timestamp when measurement was taken. Use this to correct timing if needed.' }
              },
              required: ['metricId', 'name', 'value']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'record_metric',
            description: 'Record a new metric measurement. Only use for completely new data, NOT for updates.',
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Metric name' },
                value: { type: 'number', description: 'Measurement value' },
                unit: { type: 'string', description: 'Unit of measurement' },
                goalId: { type: 'string', description: 'Associated goal ID if any' },
                recordedAt: { type: 'string', description: 'ISO timestamp when measurement was taken. If user specifies a time like "at 2pm" or "this morning", parse and use that time. Otherwise use current time.' }
              },
              required: ['name', 'value']
            }
          }
        }
      ] : [
        // Full tool set for non-health domains
        {
          type: 'function',
          function: {
            name: 'create_goal',
            description: 'Create a new goal for the user\'s project',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Goal title' },
                description: { type: 'string', description: 'Goal description' },
                targetValue: { type: 'number', description: 'Target value to achieve' },
                unit: { type: 'string', description: 'Unit of measurement' },
                priority: { type: 'integer', description: '1=high, 2=medium, 3=low' },
                targetDate: { type: 'string', description: 'Target date in YYYY-MM-DD format' }
              },
              required: ['title']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'record_metric',
            description: 'Record a new metric measurement',
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Metric name' },
                value: { type: 'number', description: 'Measurement value' },
                unit: { type: 'string', description: 'Unit of measurement' },
                goalId: { type: 'string', description: 'Associated goal ID if any' },
                recordedAt: { type: 'string', description: 'ISO timestamp when measurement was taken. If user specifies a time like "at 2pm" or "this morning", parse and use that time. Otherwise use current time.' }
              },
              required: ['name', 'value']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'update_metric',
            description: 'Update an existing metric measurement (for corrections or changes)',
            parameters: {
              type: 'object',
              properties: {
                metricId: { type: 'string', description: 'ID of the metric to update' },
                name: { type: 'string', description: 'Metric name' },
                value: { type: 'number', description: 'Updated measurement value' },
                unit: { type: 'string', description: 'Unit of measurement' },
                goalId: { type: 'string', description: 'Associated goal ID if any' },
                recordedAt: { type: 'string', description: 'ISO timestamp when measurement was taken. Use this to correct timing if needed.' }
              },
              required: ['metricId', 'name', 'value']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'get_recent_metrics',
            description: 'Get recent metrics to view or update existing entries',
            parameters: {
              type: 'object',
              properties: {
                metricName: { type: 'string', description: 'Filter by metric name (optional)' },
                limit: { type: 'number', description: 'Number of recent metrics to retrieve (default 10)' }
              }
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'create_task',
            description: 'Create a new task. DO NOT use for data operations like recording, updating, or correcting metrics - use the metric functions instead.',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Task title' },
                description: { type: 'string', description: 'Task description' },
                type: { type: 'string', description: 'Task type (e.g., measurement, action, reminder)' },
                goalId: { type: 'string', description: 'Associated goal ID if any' },
                priority: { type: 'integer', description: '1=high, 2=medium, 3=low' }
              },
              required: ['title', 'type']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'execute_compound_actions',
            description: 'Execute multiple actions at once when user requests compound commands',
            parameters: {
              type: 'object',
              properties: {
                actions: {
                  type: 'array',
                  description: 'Array of actions to execute',
                  items: {
                    type: 'object',
                    properties: {
                      action_type: { type: 'string', enum: ['create_goal', 'record_metric', 'update_metric', 'get_recent_metrics', 'create_task'] },
                      data: { type: 'object', description: 'Action-specific data' }
                    },
                    required: ['action_type', 'data']
                  }
                }
              },
              required: ['actions']
            }
          }
        }
      ],
      tool_choice: 'auto'
    });

    const response = chat.choices[0];
    
    console.log('OpenAI Response:', JSON.stringify(response, null, 2));
    
    let suggestedActions = [];
    let replyContent = response.message?.content || '';
    
    // Check if AI wants to call tool(s)
    if (response.message?.tool_calls && response.message.tool_calls.length > 0) {
      for (const toolCall of response.message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        if (functionName === 'execute_compound_actions') {
          // Handle compound actions
          for (const action of functionArgs.actions) {
            suggestedActions.push({
              type: action.action_type,
              data: action.data
            });
          }
        } else if (functionName === 'get_recent_metrics') {
          // Handle metrics query - this will be processed synchronously
          suggestedActions.push({
            type: functionName,
            data: functionArgs
          });
        } else {
          // Handle single actions
          suggestedActions.push({
            type: functionName,
            data: functionArgs
          });
        }
      }
      
      if (suggestedActions.length > 0) {
        const actionCount = suggestedActions.length;
        const actionTypes = [...new Set(suggestedActions.map(a => a.type.replace('_', ' ')))];
        replyContent = `I'll help you with ${actionCount} action${actionCount > 1 ? 's' : ''}: ${actionTypes.join(', ')}. ${replyContent}`;
      }
    }

    return {
      reply: replyContent || 'I apologize, but I had trouble generating a response.',
      suggestedActions
    };
  }

  buildSystemPrompt(project) {
    const basePrompt = `You are RavenLoom, an AI assistant helping users achieve their goals autonomously.

Project Details:
${JSON.stringify(project, null, 2)}

You can help users by:
1. Creating goals when they mention wanting to achieve something
2. Recording metrics when they tell you measurements  
3. Creating tasks for actions they need to take
4. Providing advice and motivation

IMPORTANT: You have conversation memory. Reference previous messages in this conversation when relevant. If you asked a question earlier, remember what you asked. If the user gives a short response like "yes", "no", "sure", or numbers, consider what you were discussing previously.

COMPOUND COMMANDS: When users request multiple actions in one message (like "create a weight loss goal and record my current weight"), use multiple tool calls or the execute_compound_actions function to handle all requests at once. Don't ask them to repeat themselves - just do everything they asked for.

`;

    if (project?.domain === 'health') {
      return basePrompt + `
This is a health & fitness project. You can help with:
- Weight loss/gain goals
- Exercise routines and tracking
- Nutrition planning and logging
- Health metric recording (weight, body fat, measurements, etc.)
- Creating workout or meal planning tasks

When users mention their weight, measurements, or health data, offer to record it as a metric.
When they mention goals like "lose weight" or "exercise more", offer to create specific, measurable goals.

IMPORTANT: When users specify times (like "I ate 500 calories at lunch", "this morning I weighed 175", "at 2pm I had a snack"), parse the time and include it in the recordedAt field as an ISO timestamp. Consider context like:
- "this morning" = today at 8:00 AM
- "lunch" = today at 12:00 PM  
- "dinner" = today at 7:00 PM
- "at 2pm" = today at 2:00 PM
- "yesterday" = previous day at reasonable time

CRITICAL RULE: When users mention updating, correcting, fixing, or changing existing data - NEVER create tasks! Use functions directly:

1. If user says "update", "fix", "change", "correct" about existing metrics → Use get_recent_metrics then update_metric
2. If user provides new data → Use record_metric
3. NEVER create tasks for data operations - always use the metric functions directly

UPDATE WORKFLOW:
Step 1: get_recent_metrics (to see existing data)
Step 2: update_metric (to modify the specific entry by ID)

CREATE WORKFLOW:
Step 1: record_metric (for new data)

Examples:
- "I weigh 175 lbs today" → record_metric
- "I ate 500 calories at lunch" → record_metric  
- "Actually, that was 1800 calories, not 500" → get_recent_metrics → update_metric
- "Can you fix the time on my last entry?" → get_recent_metrics → update_metric
- "My breakfast today was 7/26/2025 at 9:00AM, please update it" → get_recent_metrics → update_metric
- "Update my breakfast calories to the correct time" → get_recent_metrics → update_metric
`;
    }

    if (project?.domain === 'business') {
      return basePrompt + `
This is a business project. You can help with:
- Revenue and growth goals
- Customer acquisition targets  
- Product development milestones
- Marketing and sales metrics
- Business development tasks

When they mention business targets or metrics, offer to create goals or record data.
`;
    }

    return basePrompt + `
Help the user achieve their project goals by suggesting specific, measurable goals and tracking relevant metrics.
`;
  }
}
