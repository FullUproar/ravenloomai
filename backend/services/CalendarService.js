/**
 * CalendarService - CRUD operations for calendar events
 */

import db from '../db.js';

/**
 * Create a new event
 */
export async function createEvent(teamId, {
  title,
  description = null,
  location = null,
  startAt,
  endAt,
  isAllDay = false,
  timezone = 'UTC',
  taskId = null,
  projectId = null,
  color = '#3B82F6',
  reminderMinutes = 15,
  recurrenceRule = null,
  createdBy = null,
  googleEventId = null,
  googleCalendarId = null,
  syncStatus = null,
  lastSyncedAt = null
}) {
  const result = await db.query(`
    INSERT INTO events (
      team_id, title, description, location,
      start_at, end_at, is_all_day, timezone,
      task_id, project_id, color, reminder_minutes,
      recurrence_rule, created_by,
      google_event_id, google_calendar_id, sync_status, last_synced_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *
  `, [
    teamId, title, description, location,
    startAt, endAt, isAllDay, timezone,
    taskId, projectId, color, reminderMinutes,
    recurrenceRule, createdBy,
    googleEventId, googleCalendarId, syncStatus, lastSyncedAt
  ]);

  return mapEvent(result.rows[0]);
}

/**
 * Update an existing event
 */
export async function updateEvent(eventId, updates) {
  const allowedFields = {
    title: 'title',
    description: 'description',
    location: 'location',
    startAt: 'start_at',
    endAt: 'end_at',
    isAllDay: 'is_all_day',
    timezone: 'timezone',
    taskId: 'task_id',
    projectId: 'project_id',
    color: 'color',
    reminderMinutes: 'reminder_minutes',
    recurrenceRule: 'recurrence_rule',
    googleEventId: 'google_event_id',
    googleCalendarId: 'google_calendar_id',
    syncStatus: 'sync_status',
    lastSyncedAt: 'last_synced_at',
    syncError: 'sync_error'
  };

  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, dbColumn] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      setClauses.push(`${dbColumn} = $${paramIndex}`);
      values.push(updates[key]);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return getEventById(eventId);
  }

  values.push(eventId);

  const result = await db.query(`
    UPDATE events
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `, values);

  return result.rows[0] ? mapEvent(result.rows[0]) : null;
}

/**
 * Delete an event
 */
export async function deleteEvent(eventId) {
  const result = await db.query(`
    DELETE FROM events WHERE id = $1 RETURNING id
  `, [eventId]);

  return result.rows.length > 0;
}

/**
 * Get a single event by ID
 */
export async function getEventById(eventId) {
  const result = await db.query(`
    SELECT e.*, u.display_name as created_by_name, u.email as created_by_email
    FROM events e
    LEFT JOIN users u ON e.created_by = u.id
    WHERE e.id = $1
  `, [eventId]);

  return result.rows[0] ? mapEvent(result.rows[0]) : null;
}

/**
 * Get events for a team within a date range
 */
export async function getEvents(teamId, { startDate, endDate, taskId, projectId } = {}) {
  let query = `
    SELECT e.*, u.display_name as created_by_name, u.email as created_by_email
    FROM events e
    LEFT JOIN users u ON e.created_by = u.id
    WHERE e.team_id = $1
  `;
  const params = [teamId];
  let paramIndex = 2;

  if (startDate) {
    query += ` AND e.end_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    query += ` AND e.start_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }

  if (taskId) {
    query += ` AND e.task_id = $${paramIndex}`;
    params.push(taskId);
    paramIndex++;
  }

  if (projectId) {
    query += ` AND e.project_id = $${paramIndex}`;
    params.push(projectId);
    paramIndex++;
  }

  query += ` ORDER BY e.start_at ASC`;

  const result = await db.query(query, params);
  return result.rows.map(mapEvent);
}

/**
 * Get events for a specific month (convenience for calendar views)
 */
export async function getEventsByMonth(teamId, year, month) {
  // Month is 1-indexed (1 = January)
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  return getEvents(teamId, { startDate, endDate });
}

/**
 * Get events for a specific week
 */
export async function getEventsByWeek(teamId, startOfWeek) {
  const start = new Date(startOfWeek);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(-1);

  return getEvents(teamId, { startDate: start, endDate: end });
}

/**
 * Export events to iCal format
 */
export async function exportToICS(teamId, startDate, endDate) {
  const events = await getEvents(teamId, { startDate, endDate });

  const formatDate = (date, isAllDay) => {
    const d = new Date(date);
    if (isAllDay) {
      return d.toISOString().replace(/[-:]/g, '').split('T')[0];
    }
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RavenLoom//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  for (const event of events) {
    const dtStart = event.isAllDay
      ? `DTSTART;VALUE=DATE:${formatDate(event.startAt, true)}`
      : `DTSTART:${formatDate(event.startAt, false)}`;
    const dtEnd = event.isAllDay
      ? `DTEND;VALUE=DATE:${formatDate(event.endAt, true)}`
      : `DTEND:${formatDate(event.endAt, false)}`;

    ics.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@ravenloom.com`,
      `DTSTAMP:${formatDate(new Date(), false)}`,
      dtStart,
      dtEnd,
      `SUMMARY:${escapeICS(event.title)}`
    );

    if (event.description) {
      ics.push(`DESCRIPTION:${escapeICS(event.description)}`);
    }
    if (event.location) {
      ics.push(`LOCATION:${escapeICS(event.location)}`);
    }

    ics.push('END:VEVENT');
  }

  ics.push('END:VCALENDAR');

  return ics.join('\r\n');
}

/**
 * Escape special characters for iCal format
 */
function escapeICS(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Map database row to GraphQL-friendly format
 */
function mapEvent(row) {
  if (!row) return null;

  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: row.start_at,
    endAt: row.end_at,
    isAllDay: row.is_all_day,
    timezone: row.timezone,
    googleEventId: row.google_event_id,
    googleCalendarId: row.google_calendar_id,
    syncStatus: row.sync_status,
    lastSyncedAt: row.last_synced_at,
    syncError: row.sync_error,
    recurrenceRule: row.recurrence_rule,
    taskId: row.task_id,
    projectId: row.project_id,
    color: row.color,
    reminderMinutes: row.reminder_minutes,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default {
  createEvent,
  updateEvent,
  deleteEvent,
  getEventById,
  getEvents,
  getEventsByMonth,
  getEventsByWeek,
  exportToICS
};
