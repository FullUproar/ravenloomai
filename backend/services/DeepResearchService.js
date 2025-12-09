/**
 * DeepResearchService - Performs deep research on internal KB/KG
 *
 * Similar to web research, but queries the team's knowledge base and graph
 * to synthesize comprehensive answers for complex questions.
 *
 * Features:
 * - Breaks questions into sub-questions
 * - Iteratively explores KB/KG with learning objectives
 * - Aggregates findings across many sources
 * - Synthesizes comprehensive reports
 */

import db from '../db.js';
import OpenAI from 'openai';
import * as KnowledgeService from './KnowledgeService.js';
import * as KnowledgeGraphService from './KnowledgeGraphService.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================================
// RESEARCH SESSION MANAGEMENT
// ============================================================================

/**
 * Start a new deep research session
 */
export async function startResearch(teamId, userId, question) {
  // Create research session
  const result = await db.query(`
    INSERT INTO deep_research_sessions (team_id, user_id, question, status, learning_objectives, findings)
    VALUES ($1, $2, $3, 'in_progress', '[]', '[]')
    RETURNING *
  `, [teamId, userId, question]);

  const session = result.rows[0];

  // Generate initial learning objectives
  const objectives = await generateLearningObjectives(question, teamId);

  // Update session with objectives
  await db.query(`
    UPDATE deep_research_sessions
    SET learning_objectives = $1
    WHERE id = $2
  `, [JSON.stringify(objectives), session.id]);

  return {
    sessionId: session.id,
    question,
    objectives,
    status: 'in_progress'
  };
}

/**
 * Generate learning objectives for a research question
 */
async function generateLearningObjectives(question, teamId) {
  // Get a sample of what's in the KB to understand available data
  const stats = await KnowledgeGraphService.getGraphStats(teamId);
  const sampleFacts = await KnowledgeService.getFacts(teamId, { limit: 20 });
  const sampleCategories = [...new Set(sampleFacts.map(f => f.category))];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a research planner. Given a research question and information about available data, break down the question into specific learning objectives that can be answered by searching a knowledge base.

Available data summary:
- ${stats.nodeCount} entities in knowledge graph
- ${sampleFacts.length}+ stored facts
- Categories: ${sampleCategories.join(', ') || 'general'}

Each objective should be:
- Specific and searchable
- Likely answerable from internal company data
- Building toward the main question

Return JSON array of objectives:
[
  {"objective": "...", "searchQueries": ["query1", "query2"], "priority": 1-3},
  ...
]

Return ONLY valid JSON.`
      },
      {
        role: 'user',
        content: question
      }
    ],
    max_tokens: 1000,
    temperature: 0.3
  });

  let content = response.choices[0].message.content;

  // Strip markdown code blocks if present
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  }

  try {
    return JSON.parse(content);
  } catch {
    return [{ objective: question, searchQueries: [question], priority: 1 }];
  }
}

/**
 * Execute a single research step - investigate one objective
 */
export async function executeResearchStep(sessionId, objectiveIndex = 0) {
  // Get session
  const sessionResult = await db.query(`
    SELECT * FROM deep_research_sessions WHERE id = $1
  `, [sessionId]);

  if (sessionResult.rows.length === 0) {
    throw new Error('Research session not found');
  }

  const session = sessionResult.rows[0];
  const objectives = typeof session.learning_objectives === 'string'
    ? JSON.parse(session.learning_objectives)
    : session.learning_objectives;
  const findings = typeof session.findings === 'string'
    ? JSON.parse(session.findings)
    : session.findings;

  if (objectiveIndex >= objectives.length) {
    // All objectives complete, synthesize final report
    return synthesizeReport(session, objectives, findings);
  }

  const objective = objectives[objectiveIndex];
  const stepFindings = [];

  // Search KB for each query related to this objective
  for (const query of objective.searchQueries || [objective.objective]) {
    // Search facts
    const facts = await KnowledgeService.searchFacts(session.team_id, query, 10);
    if (facts.length > 0) {
      stepFindings.push({
        type: 'facts',
        query,
        results: facts.map(f => ({ content: f.content, category: f.category }))
      });
    }

    // Search knowledge graph
    const graphResults = await KnowledgeGraphService.graphRAGSearch(session.team_id, query);
    if (graphResults.chunks?.length > 0 || graphResults.entryNodes?.length > 0) {
      stepFindings.push({
        type: 'graph',
        query,
        nodes: graphResults.entryNodes?.map(n => ({ name: n.name, type: n.type, description: n.description })) || [],
        chunks: graphResults.chunks?.map(c => c.content).slice(0, 5) || []
      });
    }

    // Search decisions
    const decisions = await KnowledgeService.searchDecisions(session.team_id, query, 5);
    if (decisions.length > 0) {
      stepFindings.push({
        type: 'decisions',
        query,
        results: decisions.map(d => ({ what: d.what, why: d.why }))
      });
    }
  }

  // Analyze findings for this objective
  const analysis = await analyzeStepFindings(objective, stepFindings);

  // Update session with new findings
  findings.push({
    objectiveIndex,
    objective: objective.objective,
    raw: stepFindings,
    analysis
  });

  await db.query(`
    UPDATE deep_research_sessions
    SET findings = $1, current_step = $2
    WHERE id = $3
  `, [JSON.stringify(findings), objectiveIndex + 1, sessionId]);

  // Check if we should continue or if we have enough
  const shouldContinue = objectiveIndex < objectives.length - 1;

  return {
    sessionId,
    currentStep: objectiveIndex + 1,
    totalSteps: objectives.length,
    objective: objective.objective,
    analysis,
    complete: !shouldContinue,
    status: shouldContinue ? 'in_progress' : 'synthesizing'
  };
}

/**
 * Analyze findings from a research step
 */
async function analyzeStepFindings(objective, findings) {
  if (findings.length === 0) {
    return {
      summary: 'No relevant information found for this objective.',
      keyPoints: [],
      confidence: 'low'
    };
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are analyzing research findings. Given an objective and the data found, provide:
1. A brief summary of what was learned
2. Key points (bullet points)
3. Confidence level (high/medium/low)
4. Any gaps or follow-up questions

Return JSON:
{
  "summary": "...",
  "keyPoints": ["point1", "point2"],
  "confidence": "high|medium|low",
  "gaps": ["gap1"]
}`
      },
      {
        role: 'user',
        content: `Objective: ${objective.objective}\n\nFindings:\n${JSON.stringify(findings, null, 2)}`
      }
    ],
    max_tokens: 500,
    temperature: 0
  });

  let content = response.choices[0].message.content;

  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  }

  try {
    return JSON.parse(content);
  } catch {
    return { summary: content, keyPoints: [], confidence: 'medium' };
  }
}

/**
 * Synthesize final research report
 */
async function synthesizeReport(session, objectives, findings) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are synthesizing a research report. Given the original question, learning objectives, and findings from each objective, create a comprehensive report.

Structure:
1. Executive Summary (2-3 sentences)
2. Key Findings (organized by topic)
3. Detailed Analysis
4. Gaps & Limitations
5. Recommendations (if applicable)

Be thorough but concise. Reference specific data found.`
      },
      {
        role: 'user',
        content: `Question: ${session.question}\n\nObjectives: ${JSON.stringify(objectives)}\n\nFindings: ${JSON.stringify(findings)}`
      }
    ],
    max_tokens: 2000,
    temperature: 0.3
  });

  const report = response.choices[0].message.content;

  // Update session as complete
  await db.query(`
    UPDATE deep_research_sessions
    SET status = 'complete', report = $1, completed_at = NOW()
    WHERE id = $2
  `, [report, session.id]);

  return {
    sessionId: session.id,
    question: session.question,
    report,
    complete: true,
    status: 'complete'
  };
}

/**
 * Run full research (all steps) - for background execution
 */
export async function runFullResearch(teamId, userId, question) {
  const session = await startResearch(teamId, userId, question);

  let stepIndex = 0;
  const maxSteps = 10; // Safety limit

  while (stepIndex < maxSteps) {
    const result = await executeResearchStep(session.sessionId, stepIndex);

    if (result.complete) {
      return result;
    }

    stepIndex++;
  }

  // If we hit max steps, synthesize what we have
  const sessionResult = await db.query(`
    SELECT * FROM deep_research_sessions WHERE id = $1
  `, [session.sessionId]);

  const finalSession = sessionResult.rows[0];
  const objectives = typeof finalSession.learning_objectives === 'string'
    ? JSON.parse(finalSession.learning_objectives)
    : finalSession.learning_objectives;
  const findings = typeof finalSession.findings === 'string'
    ? JSON.parse(finalSession.findings)
    : finalSession.findings;

  return synthesizeReport(finalSession, objectives, findings);
}

/**
 * Get research session status
 */
export async function getResearchSession(sessionId) {
  const result = await db.query(`
    SELECT * FROM deep_research_sessions WHERE id = $1
  `, [sessionId]);

  if (result.rows.length === 0) {
    return null;
  }

  const session = result.rows[0];
  return {
    id: session.id,
    question: session.question,
    status: session.status,
    currentStep: session.current_step,
    totalSteps: Array.isArray(session.learning_objectives)
      ? session.learning_objectives.length
      : JSON.parse(session.learning_objectives || '[]').length,
    report: session.report,
    createdAt: session.created_at,
    completedAt: session.completed_at
  };
}

/**
 * Get all research sessions for a team
 */
export async function getTeamResearchSessions(teamId, limit = 20) {
  const result = await db.query(`
    SELECT id, question, status, current_step, created_at, completed_at
    FROM deep_research_sessions
    WHERE team_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [teamId, limit]);

  return result.rows;
}

export default {
  startResearch,
  executeResearchStep,
  runFullResearch,
  getResearchSession,
  getTeamResearchSessions
};
