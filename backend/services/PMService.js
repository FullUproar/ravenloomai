/**
 * Project Management Service
 * Handles all PM enhancement features (modular - can be removed)
 *
 * Features:
 * - User Availability & Time Off
 * - GTD Contexts
 * - Milestones & Project Templates
 * - Time Blocks
 * - Team Workload / Resource Allocation
 * - Meeting Preferences & Smart Scheduling
 * - Feature Flags (Pro Mode)
 * - Eisenhower Matrix
 * - Gantt Chart Data
 * - Workload Histogram
 */

import db from '../db.js';

// ============================================================================
// USER AVAILABILITY
// ============================================================================

export async function getMyAvailability(userId, teamId) {
  const result = await db.query(
    `SELECT * FROM user_availability WHERE user_id = $1 AND team_id = $2`,
    [userId, teamId]
  );
  return result.rows[0] ? mapAvailability(result.rows[0]) : null;
}

export async function getTeamAvailability(teamId) {
  const result = await db.query(
    `SELECT ua.* FROM user_availability ua
     JOIN team_members tm ON ua.user_id = tm.user_id AND ua.team_id = tm.team_id
     WHERE ua.team_id = $1`,
    [teamId]
  );
  return result.rows.map(mapAvailability);
}

export async function updateMyAvailability(userId, teamId, input) {
  const existing = await getMyAvailability(userId, teamId);

  if (existing) {
    const result = await db.query(
      `UPDATE user_availability SET
        timezone = COALESCE($3, timezone),
        work_day_start = COALESCE($4, work_day_start),
        work_day_end = COALESCE($5, work_day_end),
        work_days = COALESCE($6, work_days),
        weekly_capacity_hours = COALESCE($7, weekly_capacity_hours),
        pro_mode_enabled = COALESCE($8, pro_mode_enabled),
        updated_at = NOW()
       WHERE user_id = $1 AND team_id = $2
       RETURNING *`,
      [userId, teamId, input.timezone, input.workDayStart, input.workDayEnd,
       input.workDays, input.weeklyCapacityHours, input.proModeEnabled]
    );
    return mapAvailability(result.rows[0]);
  } else {
    const result = await db.query(
      `INSERT INTO user_availability (user_id, team_id, timezone, work_day_start, work_day_end, work_days, weekly_capacity_hours, pro_mode_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, teamId, input.timezone || 'America/New_York',
       input.workDayStart || '09:00', input.workDayEnd || '17:00',
       input.workDays || [1,2,3,4,5], input.weeklyCapacityHours || 40,
       input.proModeEnabled || false]
    );
    return mapAvailability(result.rows[0]);
  }
}

function mapAvailability(row) {
  return {
    id: row.id,
    userId: row.user_id,
    teamId: row.team_id,
    timezone: row.timezone,
    workDayStart: row.work_day_start,
    workDayEnd: row.work_day_end,
    workDays: row.work_days,
    weeklyCapacityHours: parseFloat(row.weekly_capacity_hours),
    proModeEnabled: row.pro_mode_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ============================================================================
// TIME OFF
// ============================================================================

export async function getMyTimeOff(userId, teamId) {
  const result = await db.query(
    `SELECT * FROM time_off WHERE user_id = $1 AND team_id = $2 ORDER BY start_date DESC`,
    [userId, teamId]
  );
  return result.rows.map(mapTimeOff);
}

export async function getTeamTimeOff(teamId, startDate, endDate) {
  let query = `SELECT * FROM time_off WHERE team_id = $1`;
  const params = [teamId];

  if (startDate) {
    params.push(startDate);
    query += ` AND end_date >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    query += ` AND start_date <= $${params.length}`;
  }

  query += ` ORDER BY start_date`;
  const result = await db.query(query, params);
  return result.rows.map(mapTimeOff);
}

export async function createTimeOff(userId, teamId, input) {
  const result = await db.query(
    `INSERT INTO time_off (user_id, team_id, start_date, end_date, type, description, is_half_day, half_day_period)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, teamId, input.startDate, input.endDate, input.type || 'vacation',
     input.description, input.isHalfDay || false, input.halfDayPeriod]
  );
  return mapTimeOff(result.rows[0]);
}

export async function updateTimeOff(timeOffId, input) {
  const result = await db.query(
    `UPDATE time_off SET
      start_date = COALESCE($2, start_date),
      end_date = COALESCE($3, end_date),
      type = COALESCE($4, type),
      description = COALESCE($5, description),
      is_half_day = COALESCE($6, is_half_day),
      half_day_period = COALESCE($7, half_day_period),
      updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [timeOffId, input.startDate, input.endDate, input.type, input.description,
     input.isHalfDay, input.halfDayPeriod]
  );
  return result.rows[0] ? mapTimeOff(result.rows[0]) : null;
}

export async function deleteTimeOff(timeOffId) {
  await db.query(`DELETE FROM time_off WHERE id = $1`, [timeOffId]);
  return true;
}

export async function approveTimeOff(timeOffId, approverId) {
  const result = await db.query(
    `UPDATE time_off SET status = 'approved', approved_by = $2, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [timeOffId, approverId]
  );
  return result.rows[0] ? mapTimeOff(result.rows[0]) : null;
}

export async function rejectTimeOff(timeOffId, reason) {
  const result = await db.query(
    `UPDATE time_off SET status = 'rejected', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [timeOffId]
  );
  return result.rows[0] ? mapTimeOff(result.rows[0]) : null;
}

function mapTimeOff(row) {
  return {
    id: row.id,
    userId: row.user_id,
    teamId: row.team_id,
    startDate: row.start_date,
    endDate: row.end_date,
    type: row.type,
    description: row.description,
    isHalfDay: row.is_half_day,
    halfDayPeriod: row.half_day_period,
    status: row.status,
    approvedBy: row.approved_by,
    createdAt: row.created_at
  };
}

// ============================================================================
// GTD CONTEXTS
// ============================================================================

export async function getTaskContexts(teamId) {
  const result = await db.query(
    `SELECT * FROM task_contexts WHERE team_id = $1 AND is_active = true ORDER BY sort_order`,
    [teamId]
  );
  return result.rows.map(mapContext);
}

export async function createTaskContext(teamId, input) {
  const maxOrder = await db.query(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM task_contexts WHERE team_id = $1`,
    [teamId]
  );
  const result = await db.query(
    `INSERT INTO task_contexts (team_id, name, icon, color, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [teamId, input.name, input.icon, input.color, maxOrder.rows[0].next_order]
  );
  return mapContext(result.rows[0]);
}

export async function updateTaskContext(contextId, input) {
  const result = await db.query(
    `UPDATE task_contexts SET
      name = COALESCE($2, name),
      icon = COALESCE($3, icon),
      color = COALESCE($4, color)
     WHERE id = $1
     RETURNING *`,
    [contextId, input.name, input.icon, input.color]
  );
  return result.rows[0] ? mapContext(result.rows[0]) : null;
}

export async function deleteTaskContext(contextId) {
  await db.query(`UPDATE task_contexts SET is_active = false WHERE id = $1`, [contextId]);
  return true;
}

export async function setTaskContext(taskId, context) {
  const result = await db.query(
    `UPDATE tasks SET context = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [taskId, context]
  );
  return result.rows[0];
}

function mapContext(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    isActive: row.is_active
  };
}

// ============================================================================
// MILESTONES
// ============================================================================

export async function getMilestones(teamId, projectId) {
  let query = `SELECT * FROM milestones WHERE team_id = $1`;
  const params = [teamId];

  if (projectId) {
    params.push(projectId);
    query += ` AND project_id = $${params.length}`;
  }

  query += ` ORDER BY target_date, sort_order`;
  const result = await db.query(query, params);
  return result.rows.map(mapMilestone);
}

export async function getMilestone(milestoneId) {
  const result = await db.query(`SELECT * FROM milestones WHERE id = $1`, [milestoneId]);
  return result.rows[0] ? mapMilestone(result.rows[0]) : null;
}

export async function createMilestone(teamId, userId, input) {
  const result = await db.query(
    `INSERT INTO milestones (team_id, project_id, name, description, target_date, goal_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [teamId, input.projectId, input.name, input.description, input.targetDate, input.goalId, userId]
  );
  return mapMilestone(result.rows[0]);
}

export async function updateMilestone(milestoneId, input) {
  const result = await db.query(
    `UPDATE milestones SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      target_date = COALESCE($4, target_date),
      status = COALESCE($5, status),
      goal_id = COALESCE($6, goal_id),
      updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [milestoneId, input.name, input.description, input.targetDate, input.status, input.goalId]
  );
  return result.rows[0] ? mapMilestone(result.rows[0]) : null;
}

export async function completeMilestone(milestoneId) {
  const result = await db.query(
    `UPDATE milestones SET status = 'completed', completed_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [milestoneId]
  );
  return result.rows[0] ? mapMilestone(result.rows[0]) : null;
}

export async function deleteMilestone(milestoneId) {
  await db.query(`DELETE FROM milestones WHERE id = $1`, [milestoneId]);
  return true;
}

function mapMilestone(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    targetDate: row.target_date,
    completedAt: row.completed_at,
    status: row.status,
    sortOrder: row.sort_order,
    goalId: row.goal_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ============================================================================
// PROJECT TEMPLATES
// ============================================================================

export async function getProjectTemplates(teamId) {
  const result = await db.query(
    `SELECT * FROM project_templates WHERE team_id = $1 AND is_active = true ORDER BY name`,
    [teamId]
  );
  return result.rows.map(mapTemplate);
}

export async function getProjectTemplate(templateId) {
  const result = await db.query(`SELECT * FROM project_templates WHERE id = $1`, [templateId]);
  return result.rows[0] ? mapTemplate(result.rows[0]) : null;
}

export async function createProjectTemplate(teamId, userId, input) {
  const result = await db.query(
    `INSERT INTO project_templates (team_id, name, description, template_data, industry_type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [teamId, input.name, input.description, input.templateData || {}, input.industryType, userId]
  );
  return mapTemplate(result.rows[0]);
}

export async function updateProjectTemplate(templateId, input) {
  const result = await db.query(
    `UPDATE project_templates SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      template_data = COALESCE($4, template_data),
      industry_type = COALESCE($5, industry_type),
      updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [templateId, input.name, input.description, input.templateData, input.industryType]
  );
  return result.rows[0] ? mapTemplate(result.rows[0]) : null;
}

export async function deleteProjectTemplate(templateId) {
  await db.query(`UPDATE project_templates SET is_active = false WHERE id = $1`, [templateId]);
  return true;
}

function mapTemplate(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    description: row.description,
    templateData: row.template_data,
    industryType: row.industry_type,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

// ============================================================================
// TIME BLOCKS
// ============================================================================

export async function getMyTimeBlocks(userId, teamId, startDate, endDate) {
  let query = `SELECT * FROM time_blocks WHERE user_id = $1 AND team_id = $2`;
  const params = [userId, teamId];

  if (startDate) {
    params.push(startDate);
    query += ` AND end_time >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    query += ` AND start_time <= $${params.length}`;
  }

  query += ` ORDER BY start_time`;
  const result = await db.query(query, params);
  return result.rows.map(mapTimeBlock);
}

export async function createTimeBlock(userId, teamId, input) {
  const result = await db.query(
    `INSERT INTO time_blocks (user_id, team_id, task_id, title, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, teamId, input.taskId, input.title, input.startTime, input.endTime]
  );
  return mapTimeBlock(result.rows[0]);
}

export async function updateTimeBlock(blockId, input) {
  const result = await db.query(
    `UPDATE time_blocks SET
      title = COALESCE($2, title),
      start_time = COALESCE($3, start_time),
      end_time = COALESCE($4, end_time),
      status = COALESCE($5, status),
      focus_score = COALESCE($6, focus_score),
      notes = COALESCE($7, notes),
      updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [blockId, input.title, input.startTime, input.endTime, input.status, input.focusScore, input.notes]
  );
  return result.rows[0] ? mapTimeBlock(result.rows[0]) : null;
}

export async function deleteTimeBlock(blockId) {
  await db.query(`DELETE FROM time_blocks WHERE id = $1`, [blockId]);
  return true;
}

export async function startTimeBlock(blockId) {
  const result = await db.query(
    `UPDATE time_blocks SET status = 'in_progress', actual_start = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [blockId]
  );
  return result.rows[0] ? mapTimeBlock(result.rows[0]) : null;
}

export async function completeTimeBlock(blockId, focusScore, notes) {
  const result = await db.query(
    `UPDATE time_blocks SET status = 'completed', actual_end = NOW(), focus_score = $2, notes = $3, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [blockId, focusScore, notes]
  );
  return result.rows[0] ? mapTimeBlock(result.rows[0]) : null;
}

function mapTimeBlock(row) {
  return {
    id: row.id,
    userId: row.user_id,
    teamId: row.team_id,
    taskId: row.task_id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    calendarEventId: row.calendar_event_id,
    googleEventId: row.google_event_id,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    focusScore: row.focus_score,
    notes: row.notes,
    createdAt: row.created_at
  };
}

// ============================================================================
// TEAM WORKLOAD / RESOURCE ALLOCATION
// ============================================================================

export async function getTeamWorkload(teamId) {
  const result = await db.query(
    `SELECT
      u.id as user_id,
      u.display_name,
      $1::uuid as team_id,
      COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'done') as open_tasks,
      COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'done' AND t.due_at < NOW()) as overdue_tasks,
      COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'done' AND t.due_at BETWEEN NOW() AND NOW() + INTERVAL '7 days') as due_this_week,
      COALESCE(SUM(t.estimated_hours) FILTER (WHERE t.status != 'done'), 0) as total_estimated_hours,
      COALESCE(ua.weekly_capacity_hours, 40) as weekly_capacity
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     LEFT JOIN tasks t ON t.assigned_to = u.id AND t.team_id = $1
     LEFT JOIN user_availability ua ON ua.user_id = u.id AND ua.team_id = $1
     WHERE tm.team_id = $1
     GROUP BY u.id, u.display_name, ua.weekly_capacity_hours`,
    [teamId]
  );

  const members = result.rows.map(row => {
    const utilizationPercent = row.weekly_capacity > 0
      ? (parseFloat(row.total_estimated_hours) / parseFloat(row.weekly_capacity)) * 100
      : 0;
    return {
      userId: row.user_id,
      displayName: row.display_name,
      teamId: row.team_id,
      openTasks: parseInt(row.open_tasks),
      overdueTasks: parseInt(row.overdue_tasks),
      dueThisWeek: parseInt(row.due_this_week),
      totalEstimatedHours: parseFloat(row.total_estimated_hours),
      weeklyCapacity: parseFloat(row.weekly_capacity),
      utilizationPercent: utilizationPercent,
      isOverallocated: utilizationPercent > 100
    };
  });

  const totalOpenTasks = members.reduce((sum, m) => sum + m.openTasks, 0);
  const totalOverdueTasks = members.reduce((sum, m) => sum + m.overdueTasks, 0);
  const avgUtilization = members.length > 0
    ? members.reduce((sum, m) => sum + m.utilizationPercent, 0) / members.length
    : 0;

  return {
    teamId,
    totalOpenTasks,
    totalOverdueTasks,
    averageUtilization: avgUtilization,
    overallocatedMembers: members.filter(m => m.isOverallocated),
    underallocatedMembers: members.filter(m => m.utilizationPercent < 50),
    members
  };
}

export async function getUserWorkload(teamId, userId) {
  const summary = await getTeamWorkload(teamId);
  return summary.members.find(m => m.userId === userId) || null;
}

// ============================================================================
// MEETING PREFERENCES
// ============================================================================

export async function getMyMeetingPreferences(userId) {
  const result = await db.query(
    `SELECT * FROM meeting_preferences WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] ? mapMeetingPrefs(result.rows[0]) : getDefaultMeetingPrefs(userId);
}

export async function updateMyMeetingPreferences(userId, input) {
  const existing = await db.query(`SELECT id FROM meeting_preferences WHERE user_id = $1`, [userId]);

  if (existing.rows[0]) {
    const result = await db.query(
      `UPDATE meeting_preferences SET
        preferred_meeting_start = COALESCE($2, preferred_meeting_start),
        preferred_meeting_end = COALESCE($3, preferred_meeting_end),
        buffer_before = COALESCE($4, buffer_before),
        buffer_after = COALESCE($5, buffer_after),
        max_meetings_per_day = COALESCE($6, max_meetings_per_day),
        no_meeting_days = COALESCE($7, no_meeting_days),
        protected_focus_start = $8,
        protected_focus_end = $9,
        updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, input.preferredMeetingStart, input.preferredMeetingEnd,
       input.bufferBefore, input.bufferAfter, input.maxMeetingsPerDay,
       input.noMeetingDays, input.protectedFocusStart, input.protectedFocusEnd]
    );
    return mapMeetingPrefs(result.rows[0]);
  } else {
    const result = await db.query(
      `INSERT INTO meeting_preferences (user_id, preferred_meeting_start, preferred_meeting_end, buffer_before, buffer_after, max_meetings_per_day, no_meeting_days, protected_focus_start, protected_focus_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, input.preferredMeetingStart || '09:00', input.preferredMeetingEnd || '17:00',
       input.bufferBefore || 5, input.bufferAfter || 5, input.maxMeetingsPerDay || 8,
       input.noMeetingDays || [], input.protectedFocusStart, input.protectedFocusEnd]
    );
    return mapMeetingPrefs(result.rows[0]);
  }
}

function mapMeetingPrefs(row) {
  return {
    id: row.id,
    userId: row.user_id,
    preferredMeetingStart: row.preferred_meeting_start,
    preferredMeetingEnd: row.preferred_meeting_end,
    bufferBefore: row.buffer_before,
    bufferAfter: row.buffer_after,
    maxMeetingsPerDay: row.max_meetings_per_day,
    noMeetingDays: row.no_meeting_days || [],
    protectedFocusStart: row.protected_focus_start,
    protectedFocusEnd: row.protected_focus_end
  };
}

function getDefaultMeetingPrefs(userId) {
  return {
    id: null,
    userId,
    preferredMeetingStart: '09:00',
    preferredMeetingEnd: '17:00',
    bufferBefore: 5,
    bufferAfter: 5,
    maxMeetingsPerDay: 8,
    noMeetingDays: [],
    protectedFocusStart: null,
    protectedFocusEnd: null
  };
}

// ============================================================================
// SMART SCHEDULING
// ============================================================================

export async function findMeetingTimes(teamId, input) {
  // Get availability and existing events for all attendees
  const { attendeeIds, durationMinutes, preferredDateStart, preferredDateEnd, title } = input;

  // Default to next 7 days if no range specified
  const startRange = preferredDateStart || new Date();
  const endRange = preferredDateEnd || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Get user availability and calendar events
  const availabilityPromises = attendeeIds.map(id => getMyAvailability(id, teamId));
  const availabilities = await Promise.all(availabilityPromises);

  // Get calendar events for all attendees
  const eventsResult = await db.query(
    `SELECT ce.*, u.id as attendee_id
     FROM calendar_events ce
     JOIN team_members tm ON ce.team_id = tm.team_id
     JOIN users u ON tm.user_id = u.id
     WHERE ce.team_id = $1
       AND ce.start_at >= $2
       AND ce.end_at <= $3
       AND u.id = ANY($4)`,
    [teamId, startRange, endRange, attendeeIds]
  );

  // Simple slot finding algorithm
  const suggestions = [];
  const slotDuration = durationMinutes * 60 * 1000; // in ms

  // Check each day in range
  let currentDate = new Date(startRange);
  while (currentDate <= endRange && suggestions.length < 5) {
    const dayOfWeek = currentDate.getDay();

    // Check if all attendees work this day
    const allWork = attendeeIds.every((id, i) => {
      const avail = availabilities[i];
      return !avail || avail.workDays.includes(dayOfWeek);
    });

    if (allWork) {
      // Find common work hours (simplified: use 9-5 if no specific availability)
      const workStart = 9;
      const workEnd = 17;

      // Check each hour slot
      for (let hour = workStart; hour < workEnd; hour++) {
        const slotStart = new Date(currentDate);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + slotDuration);

        if (slotEnd.getHours() <= workEnd) {
          // Check for conflicts with existing events
          const hasConflict = eventsResult.rows.some(event => {
            const eventStart = new Date(event.start_at);
            const eventEnd = new Date(event.end_at);
            return (slotStart < eventEnd && slotEnd > eventStart);
          });

          if (!hasConflict) {
            suggestions.push({
              startTime: slotStart.toISOString(),
              endTime: slotEnd.toISOString(),
              score: 0.8 + (Math.random() * 0.2), // Simplified scoring
              conflicts: [],
              attendeesAvailable: attendeeIds
            });
          }
        }
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Sort by score and limit
  suggestions.sort((a, b) => b.score - a.score);

  return {
    suggestions: suggestions.slice(0, 5),
    unavailableUsers: [],
    message: suggestions.length > 0 ? null : 'No available time slots found in the specified range'
  };
}

// ============================================================================
// FEATURE FLAGS (PRO MODE)
// ============================================================================

export async function getMyFeatureFlags(userId) {
  const result = await db.query(
    `SELECT * FROM user_feature_flags WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] ? mapFeatureFlags(result.rows[0]) : getDefaultFeatureFlags(userId);
}

export async function updateMyFeatureFlags(userId, input) {
  const existing = await db.query(`SELECT id FROM user_feature_flags WHERE user_id = $1`, [userId]);

  if (existing.rows[0]) {
    const result = await db.query(
      `UPDATE user_feature_flags SET
        pro_mode_enabled = COALESCE($2, pro_mode_enabled),
        show_gantt_chart = COALESCE($3, show_gantt_chart),
        show_time_tracking = COALESCE($4, show_time_tracking),
        show_dependencies_graph = COALESCE($5, show_dependencies_graph),
        show_resource_allocation = COALESCE($6, show_resource_allocation),
        show_critical_path = COALESCE($7, show_critical_path),
        show_eisenhower_matrix = COALESCE($8, show_eisenhower_matrix),
        show_workload_histogram = COALESCE($9, show_workload_histogram),
        show_milestones = COALESCE($10, show_milestones),
        show_time_blocking = COALESCE($11, show_time_blocking),
        show_contexts = COALESCE($12, show_contexts),
        preferred_productivity_method = COALESCE($13, preferred_productivity_method),
        workflow_persona = COALESCE($14, workflow_persona),
        updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, input.proModeEnabled, input.showGanttChart, input.showTimeTracking, input.showDependenciesGraph,
       input.showResourceAllocation, input.showCriticalPath, input.showEisenhowerMatrix,
       input.showWorkloadHistogram, input.showMilestones, input.showTimeBlocking,
       input.showContexts, input.preferredProductivityMethod, input.workflowPersona]
    );
    return mapFeatureFlags(result.rows[0]);
  } else {
    const result = await db.query(
      `INSERT INTO user_feature_flags (user_id, pro_mode_enabled, show_gantt_chart, show_time_tracking, show_dependencies_graph, show_resource_allocation, show_critical_path, show_eisenhower_matrix, show_workload_histogram, show_milestones, show_time_blocking, show_contexts, preferred_productivity_method, workflow_persona)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [userId, input.proModeEnabled || false, input.showGanttChart || false, input.showTimeTracking || false,
       input.showDependenciesGraph || false, input.showResourceAllocation || false,
       input.showCriticalPath || false, input.showEisenhowerMatrix || false,
       input.showWorkloadHistogram || false, input.showMilestones || false,
       input.showTimeBlocking || false, input.showContexts || false,
       input.preferredProductivityMethod || 'gtd', input.workflowPersona || 'contributor']
    );
    return mapFeatureFlags(result.rows[0]);
  }
}

export async function enableProMode(userId) {
  return updateMyFeatureFlags(userId, {
    proModeEnabled: true,
    showGanttChart: true,
    showTimeTracking: true,
    showDependenciesGraph: true,
    showResourceAllocation: true,
    showCriticalPath: true,
    showEisenhowerMatrix: true,
    showWorkloadHistogram: true,
    showMilestones: true,
    showTimeBlocking: true,
    showContexts: true
  });
}

export async function disableProMode(userId) {
  // Only set proModeEnabled to false, keep individual flags for when user re-enables
  return updateMyFeatureFlags(userId, {
    proModeEnabled: false
  });
}

function mapFeatureFlags(row) {
  return {
    id: row.id,
    userId: row.user_id,
    proModeEnabled: row.pro_mode_enabled || false,
    showGanttChart: row.show_gantt_chart,
    showTimeTracking: row.show_time_tracking,
    showDependenciesGraph: row.show_dependencies_graph,
    showResourceAllocation: row.show_resource_allocation,
    showCriticalPath: row.show_critical_path,
    showEisenhowerMatrix: row.show_eisenhower_matrix,
    showWorkloadHistogram: row.show_workload_histogram,
    showMilestones: row.show_milestones,
    showTimeBlocking: row.show_time_blocking,
    showContexts: row.show_contexts,
    preferredProductivityMethod: row.preferred_productivity_method,
    workflowPersona: row.workflow_persona || 'contributor'
  };
}

function getDefaultFeatureFlags(userId) {
  return {
    id: null,
    userId,
    proModeEnabled: false,
    showGanttChart: false,
    showTimeTracking: false,
    showDependenciesGraph: false,
    showResourceAllocation: false,
    showCriticalPath: false,
    showEisenhowerMatrix: false,
    showWorkloadHistogram: false,
    showMilestones: false,
    showTimeBlocking: false,
    showContexts: false,
    preferredProductivityMethod: 'gtd',
    workflowPersona: 'contributor'
  };
}

// Persona-specific feature defaults
const PERSONA_DEFAULTS = {
  contributor: {
    // Individual contributor - focus on personal productivity
    showEisenhowerMatrix: true,
    showTimeBlocking: true,
    showContexts: true,
    showWorkloadHistogram: false,
    showGanttChart: false,
    showMilestones: false,
    showDependenciesGraph: false,
    showResourceAllocation: false,
    showCriticalPath: false,
    preferredProductivityMethod: 'gtd'
  },
  team_lead: {
    // Team lead - personal productivity + team coordination
    showEisenhowerMatrix: true,
    showTimeBlocking: true,
    showContexts: true,
    showWorkloadHistogram: true,
    showGanttChart: false,
    showMilestones: true,
    showDependenciesGraph: false,
    showResourceAllocation: true,
    showCriticalPath: false,
    preferredProductivityMethod: 'gtd'
  },
  project_manager: {
    // Project manager - full PM toolkit
    showEisenhowerMatrix: false,
    showTimeBlocking: false,
    showContexts: false,
    showWorkloadHistogram: true,
    showGanttChart: true,
    showMilestones: true,
    showDependenciesGraph: true,
    showResourceAllocation: true,
    showCriticalPath: true,
    preferredProductivityMethod: 'time_blocking'
  },
  executive: {
    // Executive - high-level oversight
    showEisenhowerMatrix: false,
    showTimeBlocking: false,
    showContexts: false,
    showWorkloadHistogram: true,
    showGanttChart: false,
    showMilestones: true,
    showDependenciesGraph: false,
    showResourceAllocation: false,
    showCriticalPath: false,
    preferredProductivityMethod: 'eisenhower'
  }
};

export async function setWorkflowPersona(userId, persona) {
  const validPersonas = ['contributor', 'team_lead', 'project_manager', 'executive'];
  if (!validPersonas.includes(persona)) {
    throw new Error(`Invalid persona: ${persona}. Must be one of: ${validPersonas.join(', ')}`);
  }

  const defaults = PERSONA_DEFAULTS[persona];
  const existing = await db.query(`SELECT id FROM user_feature_flags WHERE user_id = $1`, [userId]);

  if (existing.rows[0]) {
    const result = await db.query(
      `UPDATE user_feature_flags SET
        workflow_persona = $2,
        show_gantt_chart = $3,
        show_eisenhower_matrix = $4,
        show_workload_histogram = $5,
        show_milestones = $6,
        show_time_blocking = $7,
        show_contexts = $8,
        show_dependencies_graph = $9,
        show_resource_allocation = $10,
        show_critical_path = $11,
        preferred_productivity_method = $12,
        updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, persona, defaults.showGanttChart, defaults.showEisenhowerMatrix,
       defaults.showWorkloadHistogram, defaults.showMilestones, defaults.showTimeBlocking,
       defaults.showContexts, defaults.showDependenciesGraph, defaults.showResourceAllocation,
       defaults.showCriticalPath, defaults.preferredProductivityMethod]
    );
    return mapFeatureFlags(result.rows[0]);
  } else {
    const result = await db.query(
      `INSERT INTO user_feature_flags (user_id, workflow_persona, show_gantt_chart, show_eisenhower_matrix, show_workload_histogram, show_milestones, show_time_blocking, show_contexts, show_dependencies_graph, show_resource_allocation, show_critical_path, preferred_productivity_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [userId, persona, defaults.showGanttChart, defaults.showEisenhowerMatrix,
       defaults.showWorkloadHistogram, defaults.showMilestones, defaults.showTimeBlocking,
       defaults.showContexts, defaults.showDependenciesGraph, defaults.showResourceAllocation,
       defaults.showCriticalPath, defaults.preferredProductivityMethod]
    );
    return mapFeatureFlags(result.rows[0]);
  }
}

// ============================================================================
// EISENHOWER MATRIX
// ============================================================================

export async function getEisenhowerMatrix(teamId, userId) {
  const result = await db.query(
    `SELECT * FROM tasks
     WHERE team_id = $1
       AND status != 'done'
       AND (assigned_to = $2 OR assigned_to IS NULL)
     ORDER BY due_at`,
    [teamId, userId]
  );

  const tasks = result.rows;

  // Categorize tasks into quadrants
  // Urgent: due within 48 hours or is_urgent = true
  // Important: priority = high/urgent or importance = high/critical
  const now = new Date();
  const urgentThreshold = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const categorized = {
    doNow: [],      // Urgent + Important
    schedule: [],   // Not Urgent + Important
    delegate: [],   // Urgent + Not Important
    eliminate: []   // Not Urgent + Not Important
  };

  for (const task of tasks) {
    const isUrgent = task.is_urgent || (task.due_at && new Date(task.due_at) <= urgentThreshold);
    const isImportant = ['high', 'urgent'].includes(task.priority) ||
                        ['high', 'critical'].includes(task.importance);

    if (isUrgent && isImportant) {
      categorized.doNow.push(task);
    } else if (!isUrgent && isImportant) {
      categorized.schedule.push(task);
    } else if (isUrgent && !isImportant) {
      categorized.delegate.push(task);
    } else {
      categorized.eliminate.push(task);
    }
  }

  return categorized;
}

// ============================================================================
// GANTT CHART DATA
// ============================================================================

export async function getGanttData(teamId, projectId) {
  let query = `
    SELECT t.*,
           COALESCE(
             (SELECT COUNT(*) FILTER (WHERE status = 'done') * 100.0 / NULLIF(COUNT(*), 0)
              FROM tasks sub WHERE sub.project_id = t.project_id), 0
           ) as project_progress
    FROM tasks t
    WHERE t.team_id = $1 AND t.status != 'done'
  `;
  const params = [teamId];

  if (projectId) {
    params.push(projectId);
    query += ` AND t.project_id = $${params.length}`;
  }

  query += ` ORDER BY t.start_date, t.due_at, t.sort_order`;

  const result = await db.query(query, params);
  const milestones = await getMilestones(teamId, projectId);

  // Build dependency graph
  const tasks = result.rows.map(task => {
    // Parse dependencies if stored as JSON
    const dependencies = [];
    if (task.depends_on) {
      try {
        const deps = typeof task.depends_on === 'string' ? JSON.parse(task.depends_on) : task.depends_on;
        deps.forEach(dep => {
          dependencies.push({
            fromTaskId: dep.taskId || dep,
            toTaskId: task.id,
            type: dep.type || 'FS'
          });
        });
      } catch (e) {
        // Ignore parse errors
      }
    }

    return {
      id: task.id,
      title: task.title,
      startDate: task.start_date || task.created_at,
      endDate: task.due_at,
      progress: task.status === 'done' ? 100 : (task.status === 'in_progress' ? 50 : 0),
      dependencies,
      assignee: null, // Will be populated by resolver
      isCriticalPath: false, // Simplified - would need proper CPM algorithm
      isMilestone: false,
      color: task.priority === 'urgent' ? '#ef4444' : task.priority === 'high' ? '#f59e0b' : '#3b82f6'
    };
  });

  // Calculate project date range
  const allDates = tasks
    .flatMap(t => [t.startDate, t.endDate])
    .filter(Boolean)
    .map(d => new Date(d));

  return {
    tasks,
    milestones,
    criticalPath: [], // Simplified
    projectStart: allDates.length > 0 ? new Date(Math.min(...allDates)).toISOString() : null,
    projectEnd: allDates.length > 0 ? new Date(Math.max(...allDates)).toISOString() : null
  };
}

// ============================================================================
// WORKLOAD HISTOGRAM
// ============================================================================

export async function getWorkloadHistogram(teamId, startDate, endDate) {
  // Get team members and their time blocks / task estimates
  const members = await db.query(
    `SELECT u.id, u.display_name, COALESCE(ua.weekly_capacity_hours, 40) as capacity
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     LEFT JOIN user_availability ua ON ua.user_id = u.id AND ua.team_id = $1
     WHERE tm.team_id = $1`,
    [teamId]
  );

  // Get time blocks in range
  const blocks = await db.query(
    `SELECT user_id, start_time, end_time
     FROM time_blocks
     WHERE team_id = $1 AND start_time >= $2 AND end_time <= $3`,
    [teamId, startDate, endDate]
  );

  // Build histogram entries by day
  const entries = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();
    const isWorkday = [1, 2, 3, 4, 5].includes(dayOfWeek);

    for (const member of members.rows) {
      const dailyCapacity = isWorkday ? member.capacity / 5 : 0; // Assume 5-day work week

      // Sum scheduled hours for this user on this day
      const dayBlocks = blocks.rows.filter(b => {
        const blockDate = new Date(b.start_time).toISOString().split('T')[0];
        return b.user_id === member.id && blockDate === dateStr;
      });

      const scheduledHours = dayBlocks.reduce((sum, b) => {
        const duration = (new Date(b.end_time) - new Date(b.start_time)) / (1000 * 60 * 60);
        return sum + duration;
      }, 0);

      entries.push({
        date: dateStr,
        userId: member.id,
        userName: member.display_name,
        scheduledHours,
        capacityHours: dailyCapacity,
        utilizationPercent: dailyCapacity > 0 ? (scheduledHours / dailyCapacity) * 100 : 0
      });
    }
  }

  return {
    entries,
    startDate,
    endDate,
    teamId
  };
}

// ============================================================================
// TASK FIELD UPDATES
// ============================================================================

export async function setTaskUrgency(taskId, isUrgent) {
  const result = await db.query(
    `UPDATE tasks SET is_urgent = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [taskId, isUrgent]
  );
  return result.rows[0];
}

export async function setTaskImportance(taskId, importance) {
  const result = await db.query(
    `UPDATE tasks SET importance = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [taskId, importance]
  );
  return result.rows[0];
}

export async function markAsQuickTask(taskId, isQuick) {
  const result = await db.query(
    `UPDATE tasks SET is_quick_task = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [taskId, isQuick]
  );
  return result.rows[0];
}

// ============================================================================
// PROJECT STAGE
// ============================================================================

export async function updateProjectStage(projectId, stage) {
  const result = await db.query(
    `UPDATE projects SET stage = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [projectId, stage]
  );
  return result.rows[0];
}
