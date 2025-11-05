/**
 * Recurring Task Scheduler
 * Automatically generates task instances for recurring tasks
 */

import db from './db.js';
import { mapTaskFromDb } from './graphql/resolvers/projectResolvers.js';

/**
 * Generate instances for all recurring tasks
 * This should be run periodically (e.g., daily via cron)
 */
export async function generateRecurringTaskInstances() {
  console.log('🔄 [Recurring Task Scheduler] Starting task generation...');

  try {
    // Find all active recurring tasks
    const result = await db.query(`
      SELECT * FROM tasks
      WHERE is_recurring = true
      AND status != 'archived'
    `);

    const recurringTasks = result.rows;
    console.log(`📋 Found ${recurringTasks.length} recurring tasks`);

    let totalGenerated = 0;

    for (const template of recurringTasks) {
      try {
        const generated = await generateInstancesForTask(template);
        totalGenerated += generated;
      } catch (error) {
        console.error(`❌ Failed to generate instances for task ${template.id}:`, error);
      }
    }

    console.log(`✅ [Recurring Task Scheduler] Generated ${totalGenerated} task instances`);
    return totalGenerated;
  } catch (error) {
    console.error('❌ [Recurring Task Scheduler] Failed:', error);
    throw error;
  }
}

/**
 * Generate instances for a single recurring task
 */
async function generateInstancesForTask(template) {
  const now = new Date();
  const lookAheadDays = 30; // Generate tasks for next 30 days
  const lookAheadDate = new Date(now.getTime() + (lookAheadDays * 24 * 60 * 60 * 1000));

  // Calculate next occurrences
  const nextDates = calculateNextOccurrences(template, now, lookAheadDate);

  // Check which instances already exist
  const existingInstances = await db.query(
    `SELECT due_datetime FROM tasks
     WHERE parent_task_id = $1
     AND due_datetime >= $2`,
    [template.id, now]
  );

  const existingDueDates = new Set(
    existingInstances.rows.map(row => row.due_datetime ? new Date(row.due_datetime).toISOString().split('T')[0] : null)
  );

  let generated = 0;

  for (const dueDate of nextDates) {
    const dueDateStr = dueDate.toISOString().split('T')[0];

    // Skip if instance already exists for this date
    if (existingDueDates.has(dueDateStr)) {
      continue;
    }

    // Create the instance
    await db.query(`
      INSERT INTO tasks (
        project_id, goal_id, title, description, type, status, priority,
        assigned_to, requires_approval, due_datetime, gtd_type, context,
        energy_level, time_estimate, config, parent_task_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
      template.project_id,
      template.goal_id,
      template.title,
      template.description,
      template.type,
      'not_started',
      template.priority,
      template.assigned_to,
      template.requires_approval,
      dueDate,
      template.gtd_type,
      template.context,
      template.energy_level,
      template.time_estimate,
      template.config,
      template.id
    ]);

    generated++;
  }

  if (generated > 0) {
    // Update the recurring task with generation stats
    await db.query(`
      UPDATE tasks
      SET recurrence_instances_generated = recurrence_instances_generated + $1,
          last_instance_generated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [generated, template.id]);

    console.log(`  ✅ Generated ${generated} instances for task "${template.title}"`);
  }

  return generated;
}

/**
 * Calculate next occurrences for a recurring task within a date range
 */
function calculateNextOccurrences(template, startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);
  const interval = template.recurrence_interval || 1;
  const recurrenceDays = template.recurrence_days ? JSON.parse(template.recurrence_days) : [];

  // Safety limit
  const maxIterations = 365;
  let iterations = 0;

  switch (template.recurrence_type) {
    case 'daily':
      while (currentDate <= endDate && iterations < maxIterations) {
        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + interval);

        if (shouldStopGenerating(template, currentDate, dates.length)) break;
        if (currentDate <= endDate) {
          dates.push(new Date(currentDate));
        }

        iterations++;
      }
      break;

    case 'weekly':
      while (dates.length < maxIterations && currentDate <= endDate) {
        // For each day in recurrenceDays
        for (const dayOfWeek of recurrenceDays.sort()) {
          const date = new Date(currentDate);
          const currentDay = date.getDay() || 7; // Convert Sunday (0) to 7
          const daysToAdd = dayOfWeek - currentDay;

          if (daysToAdd >= 0) {
            date.setDate(date.getDate() + daysToAdd);
          } else {
            date.setDate(date.getDate() + daysToAdd + 7);
          }

          if (date > startDate && date <= endDate && !shouldStopGenerating(template, date, dates.length)) {
            dates.push(new Date(date));
          }
        }

        // Move to next week interval
        currentDate.setDate(currentDate.getDate() + (interval * 7));
        iterations++;

        if (iterations > maxIterations) break;
      }
      break;

    case 'monthly':
      while (currentDate <= endDate && iterations < maxIterations) {
        currentDate = new Date(currentDate);
        currentDate.setMonth(currentDate.getMonth() + interval);

        if (shouldStopGenerating(template, currentDate, dates.length)) break;
        if (currentDate <= endDate) {
          dates.push(new Date(currentDate));
        }

        iterations++;
      }
      break;

    case 'yearly':
      while (currentDate <= endDate && iterations < maxIterations) {
        currentDate = new Date(currentDate);
        currentDate.setFullYear(currentDate.getFullYear() + interval);

        if (shouldStopGenerating(template, currentDate, dates.length)) break;
        if (currentDate <= endDate) {
          dates.push(new Date(currentDate));
        }

        iterations++;
      }
      break;
  }

  return dates;
}

/**
 * Check if we should stop generating instances
 */
function shouldStopGenerating(template, date, instanceCount) {
  if (template.recurrence_end_type === 'after_date' && template.recurrence_end_date) {
    if (date > new Date(template.recurrence_end_date)) {
      return true;
    }
  }

  if (template.recurrence_end_type === 'after_count' && template.recurrence_end_count) {
    if (instanceCount >= template.recurrence_end_count) {
      return true;
    }
  }

  return false;
}

/**
 * Run scheduler once
 */
async function runOnce() {
  try {
    await generateRecurringTaskInstances();
    process.exit(0);
  } catch (error) {
    console.error('Scheduler failed:', error);
    process.exit(1);
  }
}

// If run directly, execute once
if (import.meta.url === `file://${process.argv[1]}`) {
  runOnce();
}
