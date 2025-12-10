/**
 * MeetingPrepService - Intelligent Meeting Preparation
 *
 * Inspired by Notion AI's meeting features.
 * Automatically surfaces relevant context before meetings:
 * - Related facts and decisions from KB
 * - Related tasks and projects
 * - Suggested agenda items
 */

import db from '../db.js';
import OpenAI from 'openai';
import * as KnowledgeService from './KnowledgeService.js';
import * as KnowledgeGraphService from './KnowledgeGraphService.js';
import * as TaskService from './TaskService.js';
import * as ProjectService from './ProjectService.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate meeting preparation for an upcoming event
 */
export async function generateMeetingPrep(teamId, eventId, userId) {
  // Get the event
  const eventResult = await db.query(
    `SELECT * FROM events WHERE id = $1 AND team_id = $2`,
    [eventId, teamId]
  );

  if (eventResult.rows.length === 0) {
    throw new Error('Event not found');
  }

  const event = eventResult.rows[0];

  // Check if prep already exists
  const existing = await db.query(
    `SELECT * FROM meeting_prep WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId]
  );

  if (existing.rows.length > 0) {
    return {
      id: existing.rows[0].id,
      eventId: event.id,
      eventTitle: event.title,
      ...existing.rows[0],
      cached: true
    };
  }

  // Extract keywords from event title and description
  const searchTerms = `${event.title} ${event.description || ''}`;

  // 1. Search for related facts
  const facts = await KnowledgeService.searchFacts(teamId, searchTerms, 10);

  // 2. Search for related decisions
  const decisions = await KnowledgeService.searchDecisions(teamId, searchTerms, 5);

  // 3. Search knowledge graph
  const graphResults = await KnowledgeGraphService.graphRAGSearch(teamId, searchTerms);

  // 4. Find related tasks (if event is linked to project or has keywords)
  let relatedTasks = [];
  if (event.project_id) {
    const projectTasks = await TaskService.getTasks(teamId, {
      projectId: event.project_id,
      status: ['todo', 'in_progress']
    });
    relatedTasks = projectTasks.slice(0, 5);
  } else {
    // Search for tasks with similar keywords
    const allTasks = await TaskService.getTasks(teamId, { status: ['todo', 'in_progress'] });
    const keywords = event.title.toLowerCase().split(/\s+/);
    relatedTasks = allTasks.filter(t =>
      keywords.some(k => t.title.toLowerCase().includes(k))
    ).slice(0, 5);
  }

  // 5. Generate AI summary and suggested agenda
  let contextSummary = '';
  let suggestedAgenda = [];

  try {
    const prompt = `You are preparing someone for an upcoming meeting. Based on the context below, generate:
1. A brief context summary (2-3 sentences)
2. Suggested agenda items (3-5 items)

MEETING: ${event.title}
${event.description ? `DESCRIPTION: ${event.description}` : ''}
TIME: ${new Date(event.start_at).toLocaleString()}

RELEVANT FACTS FROM KNOWLEDGE BASE:
${facts.slice(0, 5).map(f => `- ${f.content}`).join('\n') || 'None found'}

RECENT RELATED DECISIONS:
${decisions.slice(0, 3).map(d => `- ${d.what}: ${d.why || ''}`).join('\n') || 'None found'}

RELATED TASKS:
${relatedTasks.map(t => `- [${t.status}] ${t.title}${t.dueAt ? ` (due ${new Date(t.dueAt).toLocaleDateString()})` : ''}`).join('\n') || 'None found'}

${graphResults.chunks?.length > 0 ? `ADDITIONAL CONTEXT:\n${graphResults.chunks.slice(0, 3).map(c => c.content).join('\n')}` : ''}

Generate JSON:
{
  "contextSummary": "Brief summary of relevant context for this meeting",
  "suggestedAgenda": [
    {"item": "Agenda item 1", "notes": "Optional notes"},
    {"item": "Agenda item 2", "notes": "Optional notes"}
  ],
  "keyQuestions": ["Question to consider 1", "Question 2"]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful meeting preparation assistant. Be concise and practical.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 600,
      temperature: 0.3
    });

    let content = response.choices[0].message.content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) content = codeBlockMatch[1].trim();

    const aiResult = JSON.parse(content);
    contextSummary = aiResult.contextSummary;
    suggestedAgenda = aiResult.suggestedAgenda;
  } catch (error) {
    console.error('Error generating AI meeting prep:', error);
    contextSummary = `Meeting: ${event.title}. ${facts.length} relevant facts found, ${relatedTasks.length} related tasks.`;
    suggestedAgenda = [{ item: 'Review agenda', notes: '' }];
  }

  // Store meeting prep
  const result = await db.query(`
    INSERT INTO meeting_prep
    (team_id, event_id, user_id, related_facts, related_decisions, related_tasks, suggested_agenda, context_summary)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    teamId,
    eventId,
    userId,
    JSON.stringify(facts.slice(0, 10).map(f => ({ id: f.id, content: f.content, category: f.category }))),
    JSON.stringify(decisions.slice(0, 5).map(d => ({ id: d.id, what: d.what, why: d.why }))),
    JSON.stringify(relatedTasks.map(t => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt }))),
    JSON.stringify(suggestedAgenda),
    contextSummary
  ]);

  return {
    id: result.rows[0].id,
    eventId: event.id,
    eventTitle: event.title,
    eventDescription: event.description,
    eventStart: event.start_at,
    relatedFacts: facts.slice(0, 10),
    relatedDecisions: decisions.slice(0, 5),
    relatedTasks,
    suggestedAgenda,
    contextSummary,
    cached: false
  };
}

/**
 * Get meeting prep for an event (if exists)
 */
export async function getMeetingPrep(eventId, userId) {
  const result = await db.query(`
    SELECT mp.*, e.title as event_title, e.description as event_description, e.start_at
    FROM meeting_prep mp
    JOIN events e ON e.id = mp.event_id
    WHERE mp.event_id = $1 AND mp.user_id = $2
  `, [eventId, userId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventDescription: row.event_description,
    eventStart: row.start_at,
    relatedFacts: row.related_facts,
    relatedDecisions: row.related_decisions,
    relatedTasks: row.related_tasks,
    suggestedAgenda: row.suggested_agenda,
    contextSummary: row.context_summary,
    viewedAt: row.viewed_at
  };
}

/**
 * Mark meeting prep as viewed
 */
export async function markPrepViewed(prepId, userId) {
  await db.query(`
    UPDATE meeting_prep
    SET status = 'viewed', viewed_at = NOW()
    WHERE id = $1 AND user_id = $2
  `, [prepId, userId]);

  return { success: true };
}

/**
 * Get upcoming meetings that need prep
 */
export async function getUpcomingMeetingsNeedingPrep(teamId, userId, hoursAhead = 24) {
  const result = await db.query(`
    SELECT e.*
    FROM events e
    LEFT JOIN meeting_prep mp ON mp.event_id = e.id AND mp.user_id = $2
    WHERE e.team_id = $1
      AND e.start_at BETWEEN NOW() AND NOW() + INTERVAL '${hoursAhead} hours'
      AND mp.id IS NULL
    ORDER BY e.start_at ASC
  `, [teamId, userId]);

  return result.rows.map(e => ({
    id: e.id,
    title: e.title,
    description: e.description,
    startAt: e.start_at,
    endAt: e.end_at,
    location: e.location
  }));
}

export default {
  generateMeetingPrep,
  getMeetingPrep,
  markPrepViewed,
  getUpcomingMeetingsNeedingPrep
};
