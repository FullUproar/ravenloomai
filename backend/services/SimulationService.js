/**
 * SimulationService - LLM personas for testing the knowledge system
 *
 * Creates simulated users (Dana, Shawn, Alex) who:
 * 1. Generate remember statements in their persona voice
 * 2. Ask questions that test retrieval, multi-hop, and context filtering
 * 3. Evaluate answer quality against expected results
 *
 * Used to iterate on extraction prompts, retrieval strategies,
 * and grooming parameters.
 */

import { callOpenAI } from './AIService.js';
import * as RavenService from './RavenService.js';
import * as TripleGroomingService from './TripleGroomingService.js';
import * as TripleService from './TripleService.js';

// ============================================================================
// PERSONAS
// ============================================================================

const PERSONAS = {
  dana: {
    name: 'Dana',
    role: 'ops_manager',
    description: 'Ops manager at a 14-person marketing agency. Moderate tech comfort. Pain: "I can\'t get through a day without people answering things I already answered."',
    rememberPrompt: `You are Dana, an ops manager. Generate realistic statements you would paste into a knowledge tool.
Your style: paste Slack-like threads, use "we decided", reference people by first name, use casual professional language.
Produce 3-5 statements that a small company ops manager would want to remember.
Topics: client processes (Net 30, approval flows), team assignments, vendor contacts, recurring deadlines.
Return JSON: { "statements": ["statement1", "statement2", ...] }`,
    askPrompt: `You are Dana, asking questions of your company's knowledge base.
Your style: operational, direct. "What did we decide about X?", "Who handles Y?", "What's our policy on Z?"
Generate 3-5 questions. Some should require connecting multiple facts (multi-hop).
Return JSON: { "questions": [{ "question": "...", "type": "direct|multi_hop|contextual", "expectedConcepts": ["concept1"] }] }`
  },

  shawn: {
    name: 'Shawn',
    role: 'founder',
    description: 'Founder of a tabletop games company. Feeds strategy docs, product timelines, investor updates.',
    rememberPrompt: `You are Shawn, founder of Full Uproar Games, a tabletop game company.
Generate realistic statements about your company that you'd want stored in a knowledge base.
Topics: product launch dates, manufacturing details, revenue targets, team milestones, game mechanics.
Products: Fugly's Mayhem Machine (card game modifier), Hack Your Deck (game mod), BattleCard Rejects (TCG parody),
  HOA the Game (board game), Top This (card game), Trolls vs Idols (social deduction), Afterroar HQ (digital platform).
Return JSON: { "statements": ["statement1", "statement2", ...] }`,
    askPrompt: `You are Shawn, founder of Full Uproar Games. Ask questions about your product pipeline.
Some questions should REQUIRE multi-hop reasoning:
- "When does Hack Your Deck launch?" (requires knowing HYD is part of Fugly's Mayhem Machine which launches July 1)
- "What's our manufacturing lead time?" (requires knowing Panda Games manufactures, they're in China, timeline is 6 weeks)
Return JSON: { "questions": [{ "question": "...", "type": "direct|multi_hop|contextual", "expectedConcepts": ["concept1"] }] }`
  },

  alex: {
    name: 'Alex',
    role: 'new_hire',
    description: 'New hire at the company. Asks basic questions to get oriented. Never provides context.',
    rememberPrompt: `You are Alex, a new hire at a tabletop games company called Full Uproar Games.
You wouldn't normally remember things — you're learning. Generate 1-2 simple statements you might paste
from your onboarding docs.
Return JSON: { "statements": ["statement1"] }`,
    askPrompt: `You are Alex, a new hire at Full Uproar Games. Ask basic orientation questions.
Your style: broad, no context provided. "What does the company do?", "Who is the CEO?", "What products do we make?"
These test zero-context retrieval — the system should find answers without knowing your context.
Return JSON: { "questions": [{ "question": "...", "type": "direct|multi_hop|contextual", "expectedConcepts": ["concept1"] }] }`
  }
};

// ============================================================================
// STATEMENT GENERATION
// ============================================================================

/**
 * Generate remember statements for a persona.
 */
export async function generatePersonaStatements(personaKey) {
  const persona = PERSONAS[personaKey];
  if (!persona) throw new Error(`Unknown persona: ${personaKey}`);

  const response = await callOpenAI([
    { role: 'system', content: persona.rememberPrompt }
  ], { model: 'gpt-4o', maxTokens: 1000, temperature: 0.8 });

  try {
    const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return parsed.statements || [];
  } catch {
    return [];
  }
}

/**
 * Generate ask questions for a persona, grounded in actual ingested triples.
 * Questions must be answerable from the data — otherwise evaluation is meaningless.
 */
export async function generatePersonaQuestions(personaKey, existingTriples = []) {
  const persona = PERSONAS[personaKey];
  if (!persona) throw new Error(`Unknown persona: ${personaKey}`);

  // Build a summary of what's in the graph so questions are grounded
  const triplesSummary = existingTriples.slice(0, 30).map(t =>
    `- ${t.displayText || t.display_text}`
  ).join('\n');

  const response = await callOpenAI([
    {
      role: 'system',
      content: `You are ${persona.name}, ${persona.description}

Generate questions that can be ANSWERED from the knowledge below. Do NOT ask about things not in this knowledge base.

Some questions should be DIRECT (answered by a single triple).
Some should require MULTI-HOP reasoning (connecting 2-3 triples to form an answer).
Some should be broad enough to require gathering multiple related facts.

KNOWLEDGE IN THE SYSTEM:
${triplesSummary || '(empty)'}

Return JSON: { "questions": [{ "question": "...", "type": "direct|multi_hop|broad", "expectedAnswer": "brief expected answer" }] }
Generate 4-6 questions.`
    }
  ], { model: 'gpt-4o', maxTokens: 1000, temperature: 0.5 });

  try {
    const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return parsed.questions || [];
  } catch {
    return [];
  }
}

// ============================================================================
// EVALUATION
// ============================================================================

/**
 * Evaluate an answer against expectations.
 */
export async function evaluateAnswer(question, answer, triplesUsed, questionMeta = {}) {
  const response = await callOpenAI([
    {
      role: 'system',
      content: `You are evaluating a knowledge system's answer quality.
Score each dimension 0.0-1.0:
- accuracy: Does the answer correctly use the provided triples?
- completeness: Does the answer cover the question fully?
- relevance: Are the retrieved triples relevant to the question?
- multiHopSuccess: If the question required connecting multiple facts, did it succeed? (N/A if direct question)

Return JSON: { "accuracy": 0.0-1.0, "completeness": 0.0-1.0, "relevance": 0.0-1.0, "multiHopSuccess": 0.0-1.0 | null, "reasoning": "brief explanation" }`
    },
    {
      role: 'user',
      content: `Question: ${question}
Type: ${questionMeta.type || 'unknown'}
Expected concepts: ${(questionMeta.expectedConcepts || []).join(', ') || 'none specified'}

Answer: ${answer}

Triples used: ${(triplesUsed || []).map(t => t.displayText || t.content).join('; ') || 'none'}`
    }
  ], { model: 'gpt-4o-mini', maxTokens: 300, temperature: 0 });

  try {
    return JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch {
    return { accuracy: 0, completeness: 0, relevance: 0, multiHopSuccess: null, reasoning: 'Failed to parse evaluation' };
  }
}

// ============================================================================
// SIMULATION RUNNER
// ============================================================================

/**
 * Run a full simulation cycle.
 *
 * @param {string} teamId - Team to run simulation against
 * @param {string} scopeId - Scope to use
 * @param {Object} config
 * @param {string[]} config.personas - Persona keys to simulate ['dana', 'shawn', 'alex']
 * @param {number} config.cycles - Number of remember→groom→ask cycles
 * @param {boolean} config.groomBetweenCycles - Run grooming between remember and ask
 */
export async function runSimulation(teamId, scopeId, config = {}) {
  const { personas = ['dana', 'shawn', 'alex'], cycles = 1, groomBetweenCycles = true } = config;
  const userId = 'simulation-bot';

  const report = {
    persona: personas.join(', '),
    cycles,
    rememberedCount: 0,
    questionsAsked: 0,
    evaluations: [],
    correctAnswers: 0,
    multiHopSuccesses: 0,
    multiHopAttempts: 0,
    overallScore: 0,
  };

  for (let cycle = 0; cycle < cycles; cycle++) {
    console.log(`[Simulation] Cycle ${cycle + 1}/${cycles}`);

    // REMEMBER PHASE
    for (const personaKey of personas) {
      const statements = await generatePersonaStatements(personaKey);
      console.log(`[Simulation] ${personaKey} generated ${statements.length} statements`);

      for (const statement of statements) {
        try {
          const preview = await RavenService.previewRemember(scopeId, userId, statement);
          if (!preview.isMismatch && preview.extractedTriples?.length > 0) {
            await RavenService.confirmRemember(preview.previewId, [], userId);
            report.rememberedCount += preview.extractedTriples.length;
          }
        } catch (err) {
          console.error(`[Simulation] Remember error: ${err.message}`);
        }
      }
    }

    // GROOM PHASE
    if (groomBetweenCycles) {
      console.log(`[Simulation] Running grooming...`);
      await TripleGroomingService.groomGraph(teamId);
    }

    // ASK PHASE — generate questions grounded in actual data
    const currentTriples = await TripleService.getTriples(teamId, { limit: 50 });
    for (const personaKey of personas) {
      const questions = await generatePersonaQuestions(personaKey, currentTriples);
      console.log(`[Simulation] ${personaKey} asking ${questions.length} questions`);

      for (const qMeta of questions) {
        try {
          const result = await RavenService.ask(scopeId, userId, qMeta.question);
          report.questionsAsked++;

          const evaluation = await evaluateAnswer(
            qMeta.question, result.answer, result.triplesUsed || result.factsUsed, qMeta
          );
          report.evaluations.push({
            persona: personaKey,
            cycle: cycle + 1,
            question: qMeta.question,
            type: qMeta.type,
            answer: result.answer,
            confidence: result.confidence,
            triplesFound: (result.triplesUsed || result.factsUsed || []).length,
            ...evaluation
          });

          if (evaluation.accuracy >= 0.7) report.correctAnswers++;
          if (qMeta.type === 'multi_hop') {
            report.multiHopAttempts++;
            if (evaluation.multiHopSuccess >= 0.7) report.multiHopSuccesses++;
          }
        } catch (err) {
          console.error(`[Simulation] Ask error: ${err.message}`);
        }
      }
    }
  }

  // Compute overall score
  if (report.evaluations.length > 0) {
    const avgAccuracy = report.evaluations.reduce((s, e) => s + (e.accuracy || 0), 0) / report.evaluations.length;
    const avgCompleteness = report.evaluations.reduce((s, e) => s + (e.completeness || 0), 0) / report.evaluations.length;
    const avgRelevance = report.evaluations.reduce((s, e) => s + (e.relevance || 0), 0) / report.evaluations.length;
    report.overallScore = (avgAccuracy + avgCompleteness + avgRelevance) / 3;
  }

  // Add final graph stats
  report.graphStats = await TripleService.getGraphStats(teamId);

  console.log(`[Simulation] Complete. Score: ${(report.overallScore * 100).toFixed(1)}%, Correct: ${report.correctAnswers}/${report.questionsAsked}, Multi-hop: ${report.multiHopSuccesses}/${report.multiHopAttempts}`);

  return report;
}

export default {
  generatePersonaStatements,
  generatePersonaQuestions,
  evaluateAnswer,
  runSimulation,
  PERSONAS,
};
