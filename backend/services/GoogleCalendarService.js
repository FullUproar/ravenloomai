/**
 * GoogleCalendarService - Sync events with Google Calendar
 * Uses existing OAuth tokens from user_integrations table
 */

import db from '../db.js';
import * as CalendarService from './CalendarService.js';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/**
 * Get valid access token for user (reuses GoogleDriveService pattern)
 */
async function getValidAccessToken(userId) {
  const result = await db.query(`
    SELECT access_token, refresh_token, token_expires_at, scope
    FROM user_integrations
    WHERE user_id = $1 AND provider = 'google' AND is_active = TRUE
  `, [userId]);

  if (result.rows.length === 0) {
    throw new Error('Google integration not found. Please connect Google first.');
  }

  const integration = result.rows[0];

  // Check if calendar scope is present
  const hasCalendarScope = integration.scope?.includes('calendar');
  if (!hasCalendarScope) {
    throw new Error('Calendar access not granted. Please reconnect Google with calendar permissions.');
  }

  // Check if token needs refresh
  const expiresAt = new Date(integration.token_expires_at);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer

  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    return integration.access_token;
  }

  // Token expired or expiring soon - refresh it
  const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: integration.refresh_token,
      grant_type: 'refresh_token'
    })
  });

  if (!refreshResponse.ok) {
    throw new Error('Failed to refresh Google token');
  }

  const tokens = await refreshResponse.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Update stored tokens
  await db.query(`
    UPDATE user_integrations
    SET access_token = $1, token_expires_at = $2, updated_at = NOW()
    WHERE user_id = $3 AND provider = 'google'
  `, [tokens.access_token, newExpiresAt, userId]);

  return tokens.access_token;
}

/**
 * List user's Google Calendars
 */
export async function listCalendars(userId) {
  const accessToken = await getValidAccessToken(userId);

  const response = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list calendars: ${error}`);
  }

  const data = await response.json();
  return data.items.map(cal => ({
    id: cal.id,
    summary: cal.summary,
    description: cal.description,
    primary: cal.primary || false,
    backgroundColor: cal.backgroundColor,
    accessRole: cal.accessRole
  }));
}

/**
 * Create event in Google Calendar
 */
export async function createGoogleEvent(userId, calendarId, event) {
  const accessToken = await getValidAccessToken(userId);

  const googleEvent = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: event.isAllDay
      ? { date: event.startAt.toISOString().split('T')[0] }
      : { dateTime: event.startAt.toISOString(), timeZone: event.timezone || 'UTC' },
    end: event.isAllDay
      ? { date: event.endAt.toISOString().split('T')[0] }
      : { dateTime: event.endAt.toISOString(), timeZone: event.timezone || 'UTC' }
  };

  if (event.recurrenceRule) {
    googleEvent.recurrence = [`RRULE:${event.recurrenceRule}`];
  }

  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(googleEvent)
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create Google event: ${error}`);
  }

  return response.json();
}

/**
 * Update event in Google Calendar
 */
export async function updateGoogleEvent(userId, calendarId, googleEventId, event) {
  const accessToken = await getValidAccessToken(userId);

  const googleEvent = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: event.isAllDay
      ? { date: new Date(event.startAt).toISOString().split('T')[0] }
      : { dateTime: new Date(event.startAt).toISOString(), timeZone: event.timezone || 'UTC' },
    end: event.isAllDay
      ? { date: new Date(event.endAt).toISOString().split('T')[0] }
      : { dateTime: new Date(event.endAt).toISOString(), timeZone: event.timezone || 'UTC' }
  };

  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(googleEvent)
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update Google event: ${error}`);
  }

  return response.json();
}

/**
 * Delete event from Google Calendar
 */
export async function deleteGoogleEvent(userId, calendarId, googleEventId) {
  const accessToken = await getValidAccessToken(userId);

  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  // 204 No Content is success for delete
  if (!response.ok && response.status !== 204) {
    const error = await response.text();
    throw new Error(`Failed to delete Google event: ${error}`);
  }

  return true;
}

/**
 * Sync a RavenLoom event to Google Calendar
 */
export async function syncEventToGoogle(userId, eventId, calendarId = 'primary') {
  const event = await CalendarService.getEventById(eventId);
  if (!event) {
    throw new Error('Event not found');
  }

  try {
    let googleEventId = event.googleEventId;

    if (googleEventId) {
      // Update existing Google event
      await updateGoogleEvent(userId, calendarId, googleEventId, event);
    } else {
      // Create new Google event
      const googleEvent = await createGoogleEvent(userId, calendarId, {
        ...event,
        startAt: new Date(event.startAt),
        endAt: new Date(event.endAt)
      });
      googleEventId = googleEvent.id;
    }

    // Update local event with sync info
    await CalendarService.updateEvent(eventId, {
      googleEventId,
      googleCalendarId: calendarId,
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString(),
      syncError: null
    });

    return CalendarService.getEventById(eventId);
  } catch (error) {
    // Store sync error
    await CalendarService.updateEvent(eventId, {
      syncStatus: 'sync_error',
      syncError: error.message
    });
    throw error;
  }
}

/**
 * Fetch events from Google Calendar
 */
export async function fetchGoogleEvents(userId, calendarId, timeMin, timeMax) {
  const accessToken = await getValidAccessToken(userId);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250'
  });

  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Google events: ${error}`);
  }

  const data = await response.json();
  return data.items.map(item => ({
    googleEventId: item.id,
    title: item.summary || '(No title)',
    description: item.description,
    location: item.location,
    startAt: item.start.dateTime || item.start.date,
    endAt: item.end.dateTime || item.end.date,
    isAllDay: !!item.start.date,
    googleCalendarId: calendarId
  }));
}

/**
 * Import events from Google Calendar to RavenLoom
 */
export async function importFromGoogle(userId, teamId, calendarId, timeMin, timeMax) {
  const googleEvents = await fetchGoogleEvents(userId, calendarId, timeMin, timeMax);
  const imported = [];

  for (const gEvent of googleEvents) {
    // Check if already imported
    const existing = await db.query(`
      SELECT id FROM events
      WHERE team_id = $1 AND google_event_id = $2
    `, [teamId, gEvent.googleEventId]);

    if (existing.rows.length === 0) {
      // Import new event
      const event = await CalendarService.createEvent(teamId, {
        title: gEvent.title,
        description: gEvent.description,
        location: gEvent.location,
        startAt: gEvent.startAt,
        endAt: gEvent.endAt,
        isAllDay: gEvent.isAllDay,
        googleEventId: gEvent.googleEventId,
        googleCalendarId: calendarId,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString()
      });
      imported.push(event);
    }
  }

  return imported;
}

export default {
  listCalendars,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  syncEventToGoogle,
  fetchGoogleEvents,
  importFromGoogle
};
