import db from '../db.js';
import { ChatLLM } from '../llm/chat.js';
import { HealthExecutor } from './HealthExecutor.js';

export class TaskExecutor {
  constructor() {
    this.llm = new ChatLLM(process.env.OPENAI_API_KEY);
    this.healthExecutor = new HealthExecutor();
  }

  async executeTask(taskId) {
    const task = await this.getTaskWithContext(taskId);
    if (!task) throw new Error('Task not found');

    // Mark as in progress
    await this.updateTaskStatus(taskId, 'in_progress');

    try {
      let result;
      
      switch (task.type) {
        case 'action':
          result = await this.executeActionTask(task);
          break;
        case 'decision':
          result = await this.executeDecisionTask(task);
          break;
        case 'measurement':
          result = await this.executeMeasurementTask(task);
          break;
        case 'automation':
          result = await this.executeAutomationTask(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      await this.updateTaskStatus(taskId, 'completed', result);
      return result;

    } catch (error) {
      await this.updateTaskStatus(taskId, 'failed', { error: error.message });
      throw error;
    }
  }

  async getTaskWithContext(taskId) {
    const result = await db.query(`
      SELECT t.*, p.title as project_title, p.domain, p.config as project_config,
             g.title as goal_title, g.description as goal_description, g.target_value, g.current_value, g.unit
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN goals g ON t.goal_id = g.id
      WHERE t.id = $1
    `, [taskId]);

    return result.rows[0];
  }

  async updateTaskStatus(taskId, status, result = {}) {
    const completedAt = status === 'completed' ? new Date() : null;
    await db.query(
      `UPDATE tasks SET status = $2, result = $3, completed_at = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [taskId, status, result, completedAt]
    );
  }

  async executeActionTask(task) {
    // Check if this is a health domain project and use specialized execution
    if (task.domain === 'health') {
      try {
        const healthResult = await this.healthExecutor.executeHealthTask(task, task.project_config || {});
        return {
          type: 'action',
          domain: 'health',
          result: healthResult,
          executed_at: new Date().toISOString(),
          status: 'completed',
          success: true,
          executor: 'HealthExecutor'
        };
      } catch (error) {
        console.error('Health task execution failed:', error);
        // Fall back to generic execution
      }
    }

    // Generic execution for non-health tasks or health task fallbacks
    const context = this.buildTaskContext(task);
    const prompt = `
Task: ${task.title}
Description: ${task.description}
Project Context: ${context}

Based on this task and context, provide specific action steps that can be executed autonomously.
Return only actionable steps that don't require human interaction unless marked as requiring approval.

Format your response as a JSON object with:
{
  "steps": ["step 1", "step 2", ...],
  "estimated_duration": "time estimate",
  "success_criteria": "how to measure success",
  "next_tasks": ["suggested follow-up tasks"]
}
`;

    const aiResponse = await this.llm.getResponse(task, prompt);
    
    try {
      const actionPlan = JSON.parse(aiResponse);
      
      const result = {
        type: 'action',
        plan: actionPlan,
        executed_at: new Date().toISOString(),
        status: task.domain === 'health' ? 'completed' : 'simulated',
        duration: '5 minutes',
        success: true,
        executor: 'GenericExecutor'
      };

      // Create follow-up tasks if suggested
      if (actionPlan.next_tasks && actionPlan.next_tasks.length > 0) {
        await this.createFollowUpTasks(task.project_id, task.goal_id, actionPlan.next_tasks);
      }

      return result;
    } catch (error) {
      // Fallback if AI response isn't valid JSON
      return {
        type: 'action',
        description: task.description,
        ai_response: aiResponse,
        executed_at: new Date().toISOString(),
        status: 'completed',
        success: true,
        executor: 'Fallback'
      };
    }
  }

  async executeDecisionTask(task) {
    const context = this.buildTaskContext(task);
    const prompt = `
Decision Required: ${task.title}
Context: ${task.description}
Project Context: ${context}

Analyze this decision and provide:
1. Key factors to consider
2. Recommended decision with reasoning
3. Potential risks and mitigation strategies
4. Success metrics to track

Format as JSON with: {"decision": "...", "reasoning": "...", "risks": [...], "metrics": [...]}
`;

    const aiResponse = await this.llm.getResponse(task, prompt);
    
    return {
      type: 'decision',
      ai_analysis: aiResponse,
      decided_at: new Date().toISOString(),
      requires_human_review: task.requires_approval,
      success: true
    };
  }

  async executeMeasurementTask(task) {
    // In a real implementation, this would integrate with APIs, databases, or other data sources
    const context = this.buildTaskContext(task);
    
    return {
      type: 'measurement',
      description: task.description,
      measured_at: new Date().toISOString(),
      data_source: 'simulated', // Would be 'api', 'database', 'manual', etc.
      value: Math.random() * 100, // Simulate a measurement
      unit: task.config?.unit || 'units',
      success: true,
      note: 'Simulated measurement - integrate with real data sources'
    };
  }

  async executeAutomationTask(task) {
    const context = this.buildTaskContext(task);
    const prompt = `
Automation Task: ${task.title}
Description: ${task.description}
Project Context: ${context}

Define the automation workflow:
1. Trigger conditions
2. Actions to perform
3. Success/failure handling
4. Monitoring requirements

Format as JSON: {"workflow": [...], "triggers": [...], "monitoring": "..."}
`;

    const aiResponse = await this.llm.getResponse(task, prompt);
    
    return {
      type: 'automation',
      workflow_defined: aiResponse,
      setup_at: new Date().toISOString(),
      status: 'configured',
      success: true,
      note: 'Automation workflow defined - implement actual automation logic'
    };
  }

  buildTaskContext(task) {
    return `
Project: ${task.project_title} (${task.domain})
Goal: ${task.goal_title || 'No specific goal'}
Current Progress: ${task.current_value || 0}/${task.target_value || 'N/A'} ${task.unit || ''}
Project Config: ${JSON.stringify(task.project_config || {})}
`;
  }

  async createFollowUpTasks(projectId, goalId, taskTitles) {
    for (const title of taskTitles) {
      await db.query(
        `INSERT INTO tasks (project_id, goal_id, title, description, type, assigned_to, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [projectId, goalId, title, `Auto-generated follow-up task`, 'action', 'ai']
      );
    }
  }

  // Autonomous task scheduling and execution
  async runAutonomousLoop() {
    try {
      // Get pending tasks that don't require approval
      const result = await db.query(`
        SELECT t.*, p.domain 
        FROM tasks t 
        JOIN projects p ON t.project_id = p.id 
        WHERE t.status = 'pending' 
        AND t.assigned_to = 'ai' 
        AND t.requires_approval = false
        AND (t.due_date IS NULL OR t.due_date <= CURRENT_TIMESTAMP + INTERVAL '1 hour')
        ORDER BY t.priority ASC, t.created_at ASC
        LIMIT 5
      `);

      const tasks = result.rows;
      console.log(`Found ${tasks.length} tasks ready for autonomous execution`);

      for (const task of tasks) {
        try {
          console.log(`Executing task: ${task.title}`);
          await this.executeTask(task.id);
          console.log(`Task completed: ${task.title}`);
        } catch (error) {
          console.error(`Task execution failed: ${task.title}`, error.message);
        }
      }

    } catch (error) {
      console.error('Autonomous loop error:', error);
    }
  }
}