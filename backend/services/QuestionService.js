/**
 * QuestionService - Team Questions Management
 *
 * Handles questions posted when Raven doesn't have a confident answer.
 * Questions can be assigned to team members for response.
 */

import db from '../db.js';
import * as KnowledgeService from './KnowledgeService.js';

// ============================================================================
// Question CRUD
// ============================================================================

/**
 * Create a new team question
 */
export async function createQuestion(teamId, userId, {
  question,
  aiAnswer = null,
  aiConfidence = 0,
  channelId = null,
  context = null,
  assigneeIds = []
}) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Insert the question
    const result = await client.query(
      `INSERT INTO team_questions (team_id, asked_by, question, ai_answer, ai_confidence, channel_id, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [teamId, userId, question, aiAnswer, aiConfidence, channelId, context]
    );

    const questionRow = result.rows[0];

    // Add assignees if provided
    if (assigneeIds.length > 0) {
      for (const assigneeId of assigneeIds) {
        await client.query(
          `INSERT INTO question_assignees (question_id, user_id, assigned_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (question_id, user_id) DO NOTHING`,
          [questionRow.id, assigneeId, userId]
        );
      }
    }

    await client.query('COMMIT');

    return mapQuestion(questionRow);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get questions for a team
 */
export async function getQuestions(teamId, { status = null, assignedTo = null, limit = 50 } = {}) {
  let query = `
    SELECT DISTINCT ON (q.id) q.*,
      asker.display_name as asked_by_name,
      asker.email as asked_by_email,
      answerer.display_name as answered_by_name
    FROM team_questions q
    LEFT JOIN users asker ON q.asked_by = asker.id
    LEFT JOIN users answerer ON q.answered_by = answerer.id
  `;

  const params = [teamId];
  let paramIndex = 2;

  if (assignedTo) {
    query += ` INNER JOIN question_assignees qa ON qa.question_id = q.id AND qa.user_id = $${paramIndex}`;
    params.push(assignedTo);
    paramIndex++;
  }

  query += ` WHERE q.team_id = $1`;

  if (status) {
    query += ` AND q.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` ORDER BY q.id, q.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  // Wrap in subquery for proper ordering
  const wrappedQuery = `
    SELECT * FROM (${query}) sub
    ORDER BY
      CASE WHEN status = 'open' THEN 0 ELSE 1 END,
      created_at DESC
  `;

  const result = await db.query(wrappedQuery, params);
  return result.rows.map(mapQuestion);
}

/**
 * Get a single question by ID
 */
export async function getQuestionById(questionId) {
  const result = await db.query(
    `SELECT q.*,
       asker.display_name as asked_by_name,
       asker.email as asked_by_email,
       answerer.display_name as answered_by_name
     FROM team_questions q
     LEFT JOIN users asker ON q.asked_by = asker.id
     LEFT JOIN users answerer ON q.answered_by = answerer.id
     WHERE q.id = $1`,
    [questionId]
  );

  if (result.rows.length === 0) return null;
  return mapQuestion(result.rows[0]);
}

/**
 * Answer a question
 */
export async function answerQuestion(questionId, userId, answer, { addToKnowledge = false, teamId = null } = {}) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Update the question with the answer
    const result = await client.query(
      `UPDATE team_questions
       SET answer = $2, answered_by = $3, answered_at = NOW(), status = 'answered'
       WHERE id = $1
       RETURNING *`,
      [questionId, answer, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Question not found');
    }

    const questionRow = result.rows[0];

    // Optionally add the Q&A to the knowledge base
    if (addToKnowledge && teamId) {
      const factContent = `Q: ${questionRow.question}\nA: ${answer}`;
      await KnowledgeService.createFact(teamId, {
        content: factContent,
        category: 'faq',
        source: 'team_question',
        createdBy: userId
      });
    }

    await client.query('COMMIT');

    return mapQuestion(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close a question without answering
 */
export async function closeQuestion(questionId) {
  const result = await db.query(
    `UPDATE team_questions SET status = 'closed' WHERE id = $1 RETURNING *`,
    [questionId]
  );

  if (result.rows.length === 0) return null;
  return mapQuestion(result.rows[0]);
}

/**
 * Assign users to a question
 */
export async function assignQuestion(questionId, assigneeIds, assignedBy) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Clear existing assignees
    await client.query('DELETE FROM question_assignees WHERE question_id = $1', [questionId]);

    // Add new assignees
    for (const userId of assigneeIds) {
      await client.query(
        `INSERT INTO question_assignees (question_id, user_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [questionId, userId, assignedBy]
      );
    }

    await client.query('COMMIT');

    return getQuestionById(questionId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get assignees for a question
 */
export async function getQuestionAssignees(questionId) {
  const result = await db.query(
    `SELECT u.id, u.display_name, u.email, qa.assigned_at
     FROM question_assignees qa
     JOIN users u ON qa.user_id = u.id
     WHERE qa.question_id = $1
     ORDER BY qa.assigned_at`,
    [questionId]
  );

  return result.rows.map(row => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    assignedAt: row.assigned_at
  }));
}

/**
 * Get count of open questions assigned to a user
 */
export async function getOpenQuestionCount(teamId, userId) {
  const result = await db.query(
    `SELECT COUNT(*) as count
     FROM team_questions q
     JOIN question_assignees qa ON qa.question_id = q.id
     WHERE q.team_id = $1 AND qa.user_id = $2 AND q.status = 'open'`,
    [teamId, userId]
  );

  return parseInt(result.rows[0].count, 10);
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapQuestion(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    askedBy: row.asked_by,
    askedByName: row.asked_by_name || null,
    askedByEmail: row.asked_by_email || null,
    question: row.question,
    aiAnswer: row.ai_answer,
    aiConfidence: parseFloat(row.ai_confidence) || 0,
    status: row.status,
    answer: row.answer,
    answeredBy: row.answered_by,
    answeredByName: row.answered_by_name || null,
    answeredAt: row.answered_at,
    channelId: row.channel_id,
    context: row.context,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default {
  createQuestion,
  getQuestions,
  getQuestionById,
  answerQuestion,
  closeQuestion,
  assignQuestion,
  getQuestionAssignees,
  getOpenQuestionCount
};
// v2
