/**
 * LearningObjectiveService - Research projects that aggregate questions/answers
 *
 * Learning Objectives can be assigned to:
 * - A human team member: They ask/answer questions at their own pace
 * - Raven (assigned_to = null): Raven proactively generates questions
 */

import db from '../db.js';
import * as AIService from './AIService.js';
import * as QuestionService from './QuestionService.js';

// ============================================================================
// Learning Objective CRUD
// ============================================================================

/**
 * Create a new learning objective
 */
export async function createObjective(teamId, userId, { title, description = null, assignedTo = null }) {
  const result = await db.query(
    `INSERT INTO learning_objectives (team_id, title, description, assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [teamId, title, description, assignedTo, userId]
  );

  const objective = mapObjective(result.rows[0]);

  // If assigned to Raven, generate initial questions
  if (!assignedTo) {
    await generateInitialQuestions(objective, teamId, userId);
  }

  return objective;
}

/**
 * Get all learning objectives for a team
 */
export async function getObjectives(teamId, { status = null, assignedTo = undefined } = {}) {
  let query = `
    SELECT lo.*,
      creator.display_name as created_by_name,
      assignee.display_name as assigned_to_name,
      (SELECT COUNT(*) FROM team_questions tq WHERE tq.learning_objective_id = lo.id) as question_count,
      (SELECT COUNT(*) FROM team_questions tq WHERE tq.learning_objective_id = lo.id AND tq.status = 'answered') as answered_count
    FROM learning_objectives lo
    LEFT JOIN users creator ON lo.created_by = creator.id
    LEFT JOIN users assignee ON lo.assigned_to = assignee.id
    WHERE lo.team_id = $1
  `;

  const params = [teamId];
  let paramIndex = 2;

  if (status) {
    query += ` AND lo.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (assignedTo !== undefined) {
    if (assignedTo === null) {
      query += ` AND lo.assigned_to IS NULL`; // Raven-assigned
    } else {
      query += ` AND lo.assigned_to = $${paramIndex}`;
      params.push(assignedTo);
      paramIndex++;
    }
  }

  query += ` ORDER BY lo.created_at DESC`;

  const result = await db.query(query, params);
  return result.rows.map(mapObjective);
}

/**
 * Get a single learning objective by ID
 */
export async function getObjectiveById(objectiveId) {
  const result = await db.query(
    `SELECT lo.*,
      creator.display_name as created_by_name,
      assignee.display_name as assigned_to_name,
      (SELECT COUNT(*) FROM team_questions tq WHERE tq.learning_objective_id = lo.id) as question_count,
      (SELECT COUNT(*) FROM team_questions tq WHERE tq.learning_objective_id = lo.id AND tq.status = 'answered') as answered_count
     FROM learning_objectives lo
     LEFT JOIN users creator ON lo.created_by = creator.id
     LEFT JOIN users assignee ON lo.assigned_to = assignee.id
     WHERE lo.id = $1`,
    [objectiveId]
  );

  if (result.rows.length === 0) return null;
  return mapObjective(result.rows[0]);
}

/**
 * Update a learning objective
 */
export async function updateObjective(objectiveId, { title, description, status, assignedTo }) {
  const result = await db.query(
    `UPDATE learning_objectives
     SET title = COALESCE($2, title),
         description = COALESCE($3, description),
         status = COALESCE($4, status),
         assigned_to = COALESCE($5, assigned_to),
         completed_at = CASE WHEN $4 = 'completed' THEN NOW() ELSE completed_at END
     WHERE id = $1
     RETURNING *`,
    [objectiveId, title, description, status, assignedTo]
  );

  if (result.rows.length === 0) return null;
  return mapObjective(result.rows[0]);
}

/**
 * Get questions for a learning objective
 */
export async function getObjectiveQuestions(objectiveId) {
  const result = await db.query(
    `SELECT q.*,
       asker.display_name as asked_by_name,
       answerer.display_name as answered_by_name
     FROM team_questions q
     LEFT JOIN users asker ON q.asked_by = asker.id
     LEFT JOIN users answerer ON q.answered_by = answerer.id
     WHERE q.learning_objective_id = $1
       AND q.parent_question_id IS NULL
     ORDER BY q.created_at ASC`,
    [objectiveId]
  );

  return result.rows.map(mapQuestion);
}

/**
 * Get follow-up questions for a parent question
 */
export async function getFollowUpQuestions(parentQuestionId) {
  const result = await db.query(
    `SELECT q.*,
       asker.display_name as asked_by_name,
       answerer.display_name as answered_by_name
     FROM team_questions q
     LEFT JOIN users asker ON q.asked_by = asker.id
     LEFT JOIN users answerer ON q.answered_by = answerer.id
     WHERE q.parent_question_id = $1
     ORDER BY q.created_at ASC`,
    [parentQuestionId]
  );

  return result.rows.map(mapQuestion);
}

// ============================================================================
// Raven's Question Generation
// ============================================================================

/**
 * Generate initial questions for a Raven-assigned learning objective
 */
async function generateInitialQuestions(objective, teamId, creatorUserId) {
  try {
    const questions = await AIService.generateLearningQuestions(
      objective.title,
      objective.description,
      [], // No existing Q&A yet
      { count: 3, isInitial: true }
    );

    for (const q of questions) {
      await createRavenQuestion(teamId, creatorUserId, objective.id, q, null);
    }

    // Update questions_asked count
    await db.query(
      `UPDATE learning_objectives SET questions_asked = questions_asked + $2 WHERE id = $1`,
      [objective.id, questions.length]
    );

    console.log(`Generated ${questions.length} initial questions for LO: ${objective.title}`);
  } catch (error) {
    console.error('Error generating initial questions:', error);
  }
}

/**
 * Process an answered question and decide next action for Raven-assigned LOs
 * Called when a question in a Raven-assigned LO gets answered
 */
export async function processAnsweredQuestion(questionId, teamId) {
  // Get the question and its learning objective
  const question = await QuestionService.getQuestionById(questionId);
  if (!question || !question.learningObjectiveId) return null;

  const objective = await getObjectiveById(question.learningObjectiveId);
  if (!objective || objective.assignedTo !== null) return null; // Not Raven-assigned

  // Check if we've hit the limit
  if (objective.questionsAsked >= objective.maxQuestions) {
    console.log(`LO "${objective.title}" hit max questions limit`);
    return null;
  }

  // Get existing Q&A for context
  const existingQuestions = await getObjectiveQuestions(objective.id);
  const answeredQA = existingQuestions
    .filter(q => q.status === 'answered')
    .map(q => ({ question: q.question, answer: q.answer }));

  // Ask AI to decide next action
  const decision = await AIService.decideLearningNextStep(
    objective.title,
    objective.description,
    answeredQA,
    { question: question.question, answer: question.answer }
  );

  if (decision.action === 'complete') {
    // Mark LO as complete
    await updateObjective(objective.id, { status: 'completed' });
    console.log(`LO "${objective.title}" marked complete: ${decision.reason}`);
    return { action: 'completed', reason: decision.reason };
  }

  if (decision.action === 'followup') {
    // Create a follow-up question
    const newQ = await createRavenQuestion(
      teamId,
      objective.createdBy,
      objective.id,
      decision.question,
      questionId // Parent question
    );

    await db.query(
      `UPDATE learning_objectives SET questions_asked = questions_asked + 1 WHERE id = $1`,
      [objective.id]
    );

    return { action: 'followup', question: newQ };
  }

  if (decision.action === 'new_question') {
    // Create a new top-level question
    const newQ = await createRavenQuestion(
      teamId,
      objective.createdBy,
      objective.id,
      decision.question,
      null
    );

    await db.query(
      `UPDATE learning_objectives SET questions_asked = questions_asked + 1 WHERE id = $1`,
      [objective.id]
    );

    return { action: 'new_question', question: newQ };
  }

  return null;
}

/**
 * Create a question asked by Raven
 */
async function createRavenQuestion(teamId, creatorUserId, objectiveId, questionText, parentQuestionId) {
  const result = await db.query(
    `INSERT INTO team_questions (team_id, asked_by, question, learning_objective_id, parent_question_id, asked_by_raven)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING *`,
    [teamId, creatorUserId, questionText, objectiveId, parentQuestionId]
  );

  return mapQuestion(result.rows[0]);
}

/**
 * Manually trigger Raven to ask a follow-up question on a specific answered question
 */
export async function askFollowUp(questionId, teamId, userId) {
  const question = await QuestionService.getQuestionById(questionId);
  if (!question || question.status !== 'answered') {
    throw new Error('Question must be answered before requesting follow-up');
  }

  // Get learning objective context if exists
  let context = null;
  if (question.learningObjectiveId) {
    const objective = await getObjectiveById(question.learningObjectiveId);
    context = { title: objective.title, description: objective.description };
  }

  // Generate follow-up question
  const followUpText = await AIService.generateFollowUpQuestion(
    question.question,
    question.answer,
    context
  );

  if (!followUpText) {
    return null;
  }

  // Create the follow-up question
  const result = await db.query(
    `INSERT INTO team_questions (team_id, asked_by, question, learning_objective_id, parent_question_id, asked_by_raven)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING *`,
    [teamId, userId, followUpText, question.learningObjectiveId, questionId]
  );

  return mapQuestion(result.rows[0]);
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapObjective(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    description: row.description,
    status: row.status,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name || (row.assigned_to === null ? 'Raven' : null),
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    questionsAsked: row.questions_asked || 0,
    maxQuestions: row.max_questions || 20,
    questionCount: parseInt(row.question_count) || 0,
    answeredCount: parseInt(row.answered_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function mapQuestion(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    question: row.question,
    answer: row.answer,
    status: row.status,
    askedBy: row.asked_by,
    askedByName: row.asked_by_name || null,
    askedByRaven: row.asked_by_raven || false,
    answeredBy: row.answered_by,
    answeredByName: row.answered_by_name || null,
    answeredAt: row.answered_at,
    parentQuestionId: row.parent_question_id,
    learningObjectiveId: row.learning_objective_id,
    createdAt: row.created_at
  };
}

export default {
  createObjective,
  getObjectives,
  getObjectiveById,
  updateObjective,
  getObjectiveQuestions,
  getFollowUpQuestions,
  processAnsweredQuestion,
  askFollowUp
};
