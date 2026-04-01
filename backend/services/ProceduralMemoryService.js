/**
 * ProceduralMemoryService — Institutional decision rules and playbooks
 *
 * Encodes HOW the organization thinks, not just WHAT it knows.
 *
 * Three types of procedural knowledge:
 *
 * 1. DECISION RULES: "When X happens, do Y"
 *    - "When a product launch date changes, flag manufacturing and marketing"
 *    - "When asked about pricing, always check the most recent quarter"
 *
 * 2. REASONING PATTERNS: "To answer X, follow steps Y"
 *    - "To determine product profitability, check COGS, retail price, and volume"
 *    - "To verify a launch date, check both the roadmap AND the manufacturing timeline"
 *
 * 3. CONSTRAINTS: "X must always be true"
 *    - "A product can have at most one active launch date"
 *    - "Revenue targets for sequential years must be non-decreasing"
 *    - "A person can hold at most one primary role"
 *
 * Based on:
 * - Agentic Knowledge Base Patterns (The New Stack, 2026) — Playbook pattern
 * - Neuro-Symbolic Reasoning for Enterprise KGs (TechRxiv, 2025)
 * - AGM Belief Revision theory (1985) — Minimal change principle
 */

import db from '../db.js';
import { callOpenAI, generateEmbedding } from './AIService.js';

// ============================================================================
// PROCEDURE CRUD
// ============================================================================

/**
 * Create a new procedure (decision rule, playbook, or constraint).
 */
export async function createProcedure(teamId, {
  name, description, procedureType, triggerCondition, actionSteps,
  scopeId, appliesToTypes, appliesToRelationships,
  confidence, trustTier, source, createdBy
}) {
  const embedding = await generateEmbedding(
    `${name}: ${triggerCondition}. ${description || ''}`
  ).catch(() => null);

  const result = await db.query(`
    INSERT INTO procedures (team_id, name, description, procedure_type,
      trigger_condition, action_steps, scope_id, applies_to_types,
      applies_to_relationships, confidence, trust_tier, source, created_by, embedding)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `, [
    teamId, name, description, procedureType,
    triggerCondition, JSON.stringify(actionSteps),
    scopeId, appliesToTypes || [],
    appliesToRelationships || [],
    confidence || 0.9, trustTier || 'official',
    source, createdBy,
    embedding ? `[${embedding.join(',')}]` : null
  ]);

  return result.rows[0];
}

/**
 * Get procedures relevant to a query or event.
 */
export async function findRelevantProcedures(teamId, context, { limit = 5 } = {}) {
  const embedding = await generateEmbedding(context).catch(() => null);

  if (embedding) {
    // Vector similarity search on procedure embeddings
    const result = await db.query(`
      SELECT *, 1 - (embedding <=> $1) AS relevance
      FROM procedures
      WHERE team_id = $2 AND status = 'active' AND embedding IS NOT NULL
      ORDER BY embedding <=> $1
      LIMIT $3
    `, [`[${embedding.join(',')}]`, teamId, limit]);
    return result.rows.filter(r => parseFloat(r.relevance) > 0.5);
  }

  // Fallback: keyword match on trigger condition
  const words = context.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return [];

  const patterns = words.map(w => `%${w}%`);
  const placeholders = patterns.map((_, i) =>
    `trigger_condition ILIKE $${i + 2} OR name ILIKE $${i + 2}`
  ).join(' OR ');

  const result = await db.query(
    `SELECT * FROM procedures WHERE team_id = $1 AND status = 'active' AND (${placeholders}) LIMIT $${patterns.length + 2}`,
    [teamId, ...patterns, limit]
  );
  return result.rows;
}

/**
 * Get all procedures for a team.
 */
export async function getProcedures(teamId, { type, status = 'active' } = {}) {
  let query = `SELECT * FROM procedures WHERE team_id = $1 AND status = $2`;
  const params = [teamId, status];
  if (type) {
    query += ` AND procedure_type = $3`;
    params.push(type);
  }
  query += ` ORDER BY trigger_count DESC, created_at DESC`;
  const result = await db.query(query, params);
  return result.rows;
}

// ============================================================================
// PROCEDURE EXECUTION (Check constraints, trigger rules)
// ============================================================================

/**
 * Check if a new triple violates any active constraints.
 * Called during confirmRemember before saving.
 *
 * Returns: { violations: [...], warnings: [...] }
 */
export async function checkConstraints(teamId, newTriple) {
  const constraints = await db.query(`
    SELECT * FROM procedures
    WHERE team_id = $1 AND status = 'active' AND procedure_type = 'constraint'
  `, [teamId]);

  const violations = [];
  const warnings = [];

  for (const constraint of constraints.rows) {
    const applies = matchesTriple(constraint, newTriple);
    if (!applies) continue;

    // Check if the constraint is violated
    const violated = await evaluateConstraint(teamId, constraint, newTriple);
    if (violated) {
      if (constraint.confidence >= 0.9) {
        violations.push({
          procedureId: constraint.id,
          name: constraint.name,
          description: constraint.description,
          triggerCondition: constraint.trigger_condition,
        });
      } else {
        warnings.push({
          procedureId: constraint.id,
          name: constraint.name,
          description: constraint.description,
        });
      }
    }
  }

  return { violations, warnings };
}

/**
 * Fire decision rules triggered by an event (triple creation, supersession, etc.)
 *
 * Returns: actions taken or recommended
 */
export async function fireRules(teamId, eventType, eventData) {
  const rules = await db.query(`
    SELECT * FROM procedures
    WHERE team_id = $1 AND status = 'active' AND procedure_type = 'decision_rule'
  `, [teamId]);

  const triggered = [];

  for (const rule of rules.rows) {
    if (!matchesEvent(rule, eventType, eventData)) continue;

    // Increment trigger count
    await db.query(`
      UPDATE procedures SET trigger_count = trigger_count + 1, last_triggered_at = NOW()
      WHERE id = $1
    `, [rule.id]);

    triggered.push({
      procedureId: rule.id,
      name: rule.name,
      triggerCondition: rule.trigger_condition,
      actionSteps: typeof rule.action_steps === 'string'
        ? JSON.parse(rule.action_steps) : rule.action_steps,
    });
  }

  return triggered;
}

/**
 * Apply relevant procedures to an Ask query.
 * Injects procedural knowledge into the answer context.
 *
 * Example: "When answering about pricing, always mention the trust tier"
 */
export async function augmentAskContext(teamId, question) {
  const procedures = await findRelevantProcedures(teamId, question, { limit: 3 });

  if (procedures.length === 0) return '';

  const lines = procedures
    .filter(p => p.procedure_type === 'reasoning_pattern' || p.procedure_type === 'decision_rule')
    .map(p => {
      const steps = typeof p.action_steps === 'string' ? JSON.parse(p.action_steps) : p.action_steps;
      const stepText = Array.isArray(steps)
        ? steps.map((s, i) => `  ${i + 1}. ${s.action || s}`).join('\n')
        : '';
      return `PROCEDURE: ${p.name}\nWhen: ${p.trigger_condition}\n${stepText}`;
    });

  return lines.length > 0
    ? `\n\nINSTITUTIONAL PROCEDURES (follow these when applicable):\n${lines.join('\n\n')}`
    : '';
}

// ============================================================================
// AUTO-DETECTION: Infer procedures from patterns in the graph
// ============================================================================

/**
 * Analyze the knowledge graph to propose new decision rules.
 * Looks for patterns like:
 * - Every time a launch date appears, manufacturing + marketing triples also exist
 * - Certain relationship types always co-occur
 * - Certain corrections always follow certain additions
 */
export async function proposeRules(teamId) {
  // Get the team's most common relationship patterns
  const patterns = await db.query(`
    SELECT t1.relationship AS rel1, t2.relationship AS rel2,
           COUNT(*) AS co_occurrence
    FROM triples t1
    JOIN triples t2 ON t1.subject_id = t2.subject_id
      AND t1.id < t2.id AND t2.status = 'active'
    WHERE t1.team_id = $1 AND t1.status = 'active'
    GROUP BY t1.relationship, t2.relationship
    HAVING COUNT(*) >= 3
    ORDER BY co_occurrence DESC
    LIMIT 20
  `, [teamId]);

  if (patterns.rows.length === 0) return [];

  // Ask LLM to propose rules from these patterns
  const patternList = patterns.rows.map(p =>
    `"${p.rel1}" co-occurs with "${p.rel2}" (${p.co_occurrence} times)`
  ).join('\n');

  const response = await callOpenAI([
    {
      role: 'system',
      content: `You analyze patterns in a knowledge graph and propose decision rules.

Each rule should be:
- name: short descriptive name
- trigger_condition: "When [event/condition]"
- action_steps: array of action strings
- procedure_type: "decision_rule" or "constraint" or "reasoning_pattern"

Return JSON: { "rules": [...] }
Only propose rules that represent genuine institutional knowledge, not obvious facts.
Be conservative — propose only high-confidence rules.`
    },
    {
      role: 'user',
      content: `These relationship patterns co-occur frequently in our knowledge graph:\n${patternList}\n\nPropose 2-3 decision rules or constraints that these patterns suggest.`
    }
  ], { model: 'gpt-4o-mini', maxTokens: 500, temperature: 0.3 });

  try {
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return (parsed.rules || []).map(r => ({
      ...r,
      confidence: 0.7,
      isAutoGenerated: true,
      status: 'proposed', // Human must approve
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// CAUSAL CHAIN MANAGEMENT
// ============================================================================

/**
 * When a triple is superseded, find downstream triples that may be affected.
 * Uses causal_links table + LLM inference.
 */
export async function findCausalImpact(teamId, supersededTripleId) {
  // 1. Direct causal links
  const directEffects = await db.query(`
    SELECT cl.*, t.display_text AS effect_text
    FROM causal_links cl
    JOIN triples t ON cl.effect_triple_id = t.id
    WHERE cl.cause_triple_id = $1 AND t.status = 'active'
  `, [supersededTripleId]);

  // 2. Transitive effects (2 hops)
  const transitiveEffects = await db.query(`
    SELECT cl2.effect_triple_id, t.display_text AS effect_text, 2 AS hop_distance
    FROM causal_links cl1
    JOIN causal_links cl2 ON cl1.effect_triple_id = cl2.cause_triple_id
    JOIN triples t ON cl2.effect_triple_id = t.id
    WHERE cl1.cause_triple_id = $1 AND t.status = 'active'
  `, [supersededTripleId]);

  return {
    directEffects: directEffects.rows,
    transitiveEffects: transitiveEffects.rows,
    totalAffected: directEffects.rowCount + transitiveEffects.rowCount,
  };
}

/**
 * Auto-detect causal links between triples.
 * "If launch date changes → manufacturing timeline changes"
 */
export async function detectCausalLinks(teamId, { limit = 50 } = {}) {
  // Get triples that share temporal relationships
  const candidates = await db.query(`
    SELECT t1.id AS cause_id, t1.display_text AS cause_text,
           t2.id AS effect_id, t2.display_text AS effect_text,
           t1.relationship AS cause_rel, t2.relationship AS effect_rel
    FROM triples t1
    JOIN triples t2 ON t1.object_id = t2.subject_id
      AND t1.id != t2.id AND t2.status = 'active'
    WHERE t1.team_id = $1 AND t1.status = 'active'
      AND t1.relationship IN ('launches on', 'ships via', 'depends on', 'requires',
          'blocks', 'enables', 'triggers', 'precedes')
    LIMIT $2
  `, [teamId, limit]);

  const newLinks = [];
  for (const c of candidates.rows) {
    // Check if link already exists
    const existing = await db.query(`
      SELECT 1 FROM causal_links
      WHERE cause_triple_id = $1 AND effect_triple_id = $2
    `, [c.cause_id, c.effect_id]);

    if (existing.rowCount === 0) {
      await db.query(`
        INSERT INTO causal_links (team_id, cause_triple_id, effect_triple_id, link_type, source, reasoning)
        VALUES ($1, $2, $3, 'depends_on', 'inferred', $4)
        ON CONFLICT DO NOTHING
      `, [teamId, c.cause_id, c.effect_id,
          `${c.cause_text} → ${c.effect_text} (connected via shared entity)`]);
      newLinks.push({ cause: c.cause_text, effect: c.effect_text });
    }
  }

  return { linksCreated: newLinks.length, links: newLinks };
}

// ============================================================================
// HELPERS
// ============================================================================

function matchesTriple(procedure, triple) {
  const types = procedure.applies_to_types || [];
  const rels = procedure.applies_to_relationships || [];

  if (types.length > 0 && !types.includes(triple.subjectType) && !types.includes(triple.objectType)) {
    return false;
  }
  if (rels.length > 0 && !rels.some(r => (triple.relationship || '').toLowerCase().includes(r.toLowerCase()))) {
    return false;
  }
  return true;
}

function matchesEvent(rule, eventType, eventData) {
  const trigger = (rule.trigger_condition || '').toLowerCase();
  if (eventType === 'supersede' && trigger.includes('change')) return true;
  if (eventType === 'create' && trigger.includes('new')) return true;
  if (eventType === 'conflict' && trigger.includes('conflict')) return true;
  return false;
}

async function evaluateConstraint(teamId, constraint, newTriple) {
  // Simple constraint: "at most one" — check if another triple exists
  const trigger = (constraint.trigger_condition || '').toLowerCase();

  if (trigger.includes('at most one') || trigger.includes('only one')) {
    const existing = await db.query(`
      SELECT COUNT(*) FROM triples
      WHERE team_id = $1 AND subject_id = $2
        AND relationship = $3 AND status = 'active'
    `, [teamId, newTriple.subjectId, newTriple.relationship]);
    return parseInt(existing.rows[0].count) > 0;
  }

  return false; // Can't evaluate complex constraints without a rule engine
}

export default {
  createProcedure, findRelevantProcedures, getProcedures,
  checkConstraints, fireRules, augmentAskContext,
  proposeRules, findCausalImpact, detectCausalLinks,
};
