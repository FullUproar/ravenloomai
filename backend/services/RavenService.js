/**
 * RavenService - Clean Ask/Remember interface for knowledge management
 *
 * Ask: Instant AI response to questions (read-only)
 * Remember: Preview → Confirm flow for saving knowledge (supervised learning)
 *
 * Features:
 * - Mismatch detection (question submitted to Remember)
 * - Conflict detection (existing facts that may contradict new info)
 * - Source attribution (store original quote + URL for provenance)
 */

import db from '../db.js';
import * as AIService from './AIService.js';
import * as KnowledgeService from './KnowledgeService.js';
import * as ScopeService from './ScopeService.js';
import { graphRAGSearch } from './KnowledgeGraphService.js';
import KnowledgeBaseService from './KnowledgeBaseService.js';
import crypto from 'crypto';

// Generate UUID using Node.js crypto
const generateUUID = () => crypto.randomUUID();

// In-memory store for pending Remember previews (could be Redis in production)
const pendingPreviews = new Map();

// ============================================================================
// ASK (Instant read-only response)
// ============================================================================

/**
 * Ask Raven a question - instant AI response
 * @param {string} scopeId - The scope to search within
 * @param {string} userId - The user asking
 * @param {string} question - The question to answer
 */
export async function ask(scopeId, userId, question) {
  console.log(`[RavenService.ask] scopeId=${scopeId}, question="${question}"`);

  // Get scope and team info
  const scope = await ScopeService.getScopeById(scopeId);
  if (!scope) {
    throw new Error('Scope not found');
  }

  const teamId = scope.teamId;

  // Get search scope IDs (current scope + ancestors)
  const searchScopeIds = await ScopeService.getSearchScopeIds(scopeId, userId, true);
  console.log(`[RavenService.ask] Searching ${searchScopeIds.length} scopes`);

  // Search for relevant knowledge
  let knowledge = await KnowledgeService.getKnowledgeContext(teamId, question);
  console.log(`[RavenService.ask] Semantic search found ${knowledge.facts.length} facts`);

  // If semantic search found no facts, also include recent facts as context
  // This helps when embeddings are missing or search terms don't match
  if (knowledge.facts.length === 0) {
    console.log(`[RavenService.ask] No semantic matches, fetching recent facts as fallback`);
    const recentFacts = await KnowledgeService.getFacts(teamId, { limit: 20 });
    knowledge.facts = recentFacts;
    console.log(`[RavenService.ask] Added ${recentFacts.length} recent facts as context`);
  }

  // Log fact content for debugging
  if (knowledge.facts.length > 0) {
    console.log(`[RavenService.ask] Facts: ${knowledge.facts.map(f => f.content).join(' | ')}`);
  }

  // GraphRAG search for richer context
  let graphContext = { entryNodes: [], relatedNodes: [], chunks: [] };
  try {
    graphContext = await graphRAGSearch(teamId, question, { topK: 5, hopDepth: 1 });
    console.log(`[RavenService.ask] GraphRAG: ${graphContext.entryNodes.length} entry nodes, ${graphContext.chunks.length} chunks`);
  } catch (err) {
    console.error('[RavenService.ask] GraphRAG error:', err.message);
  }

  // Search KB documents
  let kbDocuments = [];
  try {
    kbDocuments = await KnowledgeBaseService.searchDocuments(teamId, question, 5);
  } catch (err) {
    console.error('[RavenService.ask] KB search error:', err.message);
  }

  // Generate AI answer
  const answer = await AIService.generateCompanyAnswer(
    question,
    knowledge.facts,
    knowledge.decisions,
    kbDocuments,
    graphContext
  );

  return {
    answer: answer.answer,
    confidence: answer.confidence,
    factsUsed: knowledge.facts.slice(0, 5),
    suggestedFollowups: answer.followups || []
  };
}

// ============================================================================
// REMEMBER (Preview → Confirm flow)
// ============================================================================

/**
 * Preview a Remember statement - extract facts and detect conflicts
 * @param {string} scopeId - The scope to store facts in
 * @param {string} userId - The user remembering
 * @param {string} statement - The statement to remember
 * @param {string} sourceUrl - Optional external URL for attribution
 */
export async function previewRemember(scopeId, userId, statement, sourceUrl = null) {
  console.log(`[RavenService.previewRemember] statement="${statement}"`);

  // Get scope
  const scope = await ScopeService.getScopeById(scopeId);
  if (!scope) {
    throw new Error('Scope not found');
  }

  const teamId = scope.teamId;

  // Detect if this looks like a question (mismatch)
  const mismatch = await detectMismatch(statement);

  // Extract atomic facts from the statement
  const extractedFacts = await extractFactsFromStatement(statement);
  console.log(`[RavenService.previewRemember] Extracted ${extractedFacts.length} facts`);

  // Detect conflicts with existing knowledge
  const conflicts = await detectConflicts(teamId, extractedFacts);
  console.log(`[RavenService.previewRemember] Found ${conflicts.length} conflicts`);

  // Generate a preview ID and store the preview
  const previewId = generateUUID();
  pendingPreviews.set(previewId, {
    scopeId,
    teamId,
    userId,
    sourceText: statement,
    sourceUrl,
    extractedFacts,
    conflicts,
    isMismatch: mismatch.isMismatch,
    mismatchSuggestion: mismatch.suggestion,
    createdAt: new Date()
  });

  // Clean up old previews (older than 1 hour)
  cleanupOldPreviews();

  return {
    previewId,
    sourceText: statement,
    extractedFacts,
    conflicts,
    isMismatch: mismatch.isMismatch,
    mismatchSuggestion: mismatch.suggestion
  };
}

/**
 * Confirm and save facts from a preview
 * @param {string} previewId - The preview ID
 * @param {string[]} skipConflictIds - IDs of conflicting facts to skip/not update
 */
export async function confirmRemember(previewId, skipConflictIds = []) {
  console.log(`[RavenService.confirmRemember] previewId=${previewId}`);

  const preview = pendingPreviews.get(previewId);
  if (!preview) {
    throw new Error('Preview not found or expired');
  }

  const { scopeId, teamId, userId, sourceText, sourceUrl, extractedFacts, conflicts } = preview;

  const factsCreated = [];
  const factsUpdated = [];

  // Build a set of conflict fact IDs to skip
  const skipIds = new Set(skipConflictIds || []);

  for (const extractedFact of extractedFacts) {
    // Check if this fact has a conflict
    const conflict = conflicts.find(c =>
      c.extractedFactContent === extractedFact.content &&
      !skipIds.has(c.existingFact.id)
    );

    if (conflict && conflict.conflictType === 'update') {
      // Update the existing fact (supersede it)
      const oldFact = await KnowledgeService.invalidateFact(conflict.existingFact.id);

      // Create new fact with reference to old one
      const newFact = await createFactWithAttribution(teamId, scopeId, {
        ...extractedFact,
        sourceQuote: sourceText,
        sourceUrl,
        sourceType: 'user_statement',
        createdBy: userId
      });

      factsUpdated.push(newFact);
    } else if (conflict && conflict.conflictType === 'duplicate') {
      // Skip duplicates
      continue;
    } else {
      // Create new fact
      const fact = await createFactWithAttribution(teamId, scopeId, {
        ...extractedFact,
        sourceQuote: sourceText,
        sourceUrl,
        sourceType: 'user_statement',
        createdBy: userId
      });
      factsCreated.push(fact);
    }
  }

  // Clean up the preview
  pendingPreviews.delete(previewId);

  return {
    success: true,
    factsCreated,
    factsUpdated,
    message: `Created ${factsCreated.length} fact(s), updated ${factsUpdated.length} fact(s)`
  };
}

/**
 * Cancel a Remember preview
 */
export function cancelRemember(previewId) {
  return pendingPreviews.delete(previewId);
}

/**
 * Get fact attribution/provenance
 */
export async function getFactAttribution(factId) {
  const result = await db.query(
    `SELECT f.source_quote, f.source_url, f.source_type, f.source_id, f.created_by, f.created_at,
            u.display_name, u.email, u.avatar_url
     FROM facts f
     LEFT JOIN users u ON f.created_by = u.id
     WHERE f.id = $1`,
    [factId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    sourceQuote: row.source_quote,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdBy: row.created_by ? {
      id: row.created_by,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url
    } : null,
    createdAt: row.created_at
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Detect if a statement looks like a question (mismatch)
 */
async function detectMismatch(statement) {
  // Simple heuristics first
  const trimmed = statement.trim();

  // Ends with question mark
  if (trimmed.endsWith('?')) {
    return {
      isMismatch: true,
      suggestion: 'This looks like a question. Would you like to Ask instead?'
    };
  }

  // Starts with question words
  const questionWords = ['what', 'when', 'where', 'who', 'why', 'how', 'is', 'are', 'do', 'does', 'can', 'could', 'would', 'should'];
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  if (questionWords.includes(firstWord)) {
    return {
      isMismatch: true,
      suggestion: 'This looks like a question. Would you like to Ask instead?'
    };
  }

  return { isMismatch: false, suggestion: null };
}

/**
 * Extract atomic facts from a statement using AI
 */
async function extractFactsFromStatement(statement) {
  try {
    const atomicFacts = await AIService.extractAtomicFacts(statement, {});
    return atomicFacts.map(fact => ({
      content: fact.statement,
      entityType: fact.entities?.[0]?.type || null,
      entityName: fact.entities?.[0]?.name || null,
      attribute: fact.attribute || null,
      value: fact.value || null,
      category: fact.category || 'general',
      confidenceScore: fact.confidence || 0.8,
      contextTags: fact.contextTags || []
    }));
  } catch (error) {
    console.error('[extractFactsFromStatement] AI extraction failed, using raw statement:', error.message);
    // Fallback: treat the whole statement as a single fact
    return [{
      content: statement,
      entityType: null,
      entityName: null,
      attribute: null,
      value: null,
      category: 'general',
      confidenceScore: 0.7,
      contextTags: []
    }];
  }
}

/**
 * Detect conflicts between new facts and existing knowledge
 */
async function detectConflicts(teamId, extractedFacts) {
  const conflicts = [];

  for (const fact of extractedFacts) {
    // Search for similar existing facts using semantic search
    const similarFacts = await KnowledgeService.searchFacts(teamId, fact.content, 5);

    for (const existing of similarFacts) {
      // Skip if similarity is too low
      if (existing.similarity && existing.similarity < 0.7) continue;

      // Determine conflict type using AI or heuristics
      const conflictType = await classifyConflict(fact.content, existing.content);

      if (conflictType !== 'none') {
        conflicts.push({
          existingFact: existing,
          conflictType,
          explanation: getConflictExplanation(conflictType, existing.content, fact.content),
          extractedFactContent: fact.content
        });
      }
    }
  }

  return conflicts;
}

/**
 * Classify the type of conflict between two facts
 */
async function classifyConflict(newContent, existingContent) {
  // Simple heuristic classification
  const newLower = newContent.toLowerCase();
  const existingLower = existingContent.toLowerCase();

  // Check for high similarity (potential duplicate)
  if (levenshteinSimilarity(newLower, existingLower) > 0.85) {
    return 'duplicate';
  }

  // Check for entity/attribute overlap with different values (potential update/contradiction)
  // This is a simplified check - in production, use AI for better classification
  const newWords = new Set(newLower.split(/\s+/));
  const existingWords = new Set(existingLower.split(/\s+/));
  const overlap = [...newWords].filter(w => existingWords.has(w)).length;
  const overlapRatio = overlap / Math.min(newWords.size, existingWords.size);

  if (overlapRatio > 0.5) {
    // High overlap but not duplicate - likely an update
    return 'update';
  }

  return 'none';
}

/**
 * Generate human-readable conflict explanation
 */
function getConflictExplanation(conflictType, existingContent, newContent) {
  switch (conflictType) {
    case 'duplicate':
      return `This appears to be a duplicate of existing knowledge: "${existingContent.substring(0, 100)}..."`;
    case 'update':
      return `This may update existing information: "${existingContent.substring(0, 100)}..."`;
    case 'contradiction':
      return `This may contradict existing knowledge: "${existingContent.substring(0, 100)}..."`;
    default:
      return 'Potential conflict with existing knowledge';
  }
}

/**
 * Simple Levenshtein similarity (0-1)
 */
function levenshteinSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLength = Math.max(a.length, b.length);
  return 1 - (distance / maxLength);
}

/**
 * Create a fact with source attribution
 */
async function createFactWithAttribution(teamId, scopeId, factData) {
  const { content, entityType, entityName, attribute, value, category, confidenceScore, sourceQuote, sourceUrl, sourceType, createdBy, contextTags = [] } = factData;

  // Generate embedding
  let embedding = null;
  try {
    embedding = await AIService.generateEmbedding(content);
  } catch (err) {
    console.error('[createFactWithAttribution] Embedding generation failed:', err.message);
  }

  const result = await db.query(
    `INSERT INTO facts (team_id, scope_id, content, entity_type, entity_name, attribute, value, category,
                       confidence_score, source_type, source_quote, source_url, created_by, embedding, context_tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      teamId,
      scopeId,
      content,
      entityType,
      entityName,
      attribute,
      value,
      category,
      confidenceScore,
      sourceType,
      sourceQuote,
      sourceUrl,
      createdBy,
      embedding ? `[${embedding.join(',')}]` : null,
      JSON.stringify(contextTags)
    ]
  );

  return mapFact(result.rows[0]);
}

/**
 * Map database row to Fact object
 */
function mapFact(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    scopeId: row.scope_id,
    content: row.content,
    entityType: row.entity_type,
    entityName: row.entity_name,
    attribute: row.attribute,
    value: row.value,
    category: row.category,
    confidenceScore: row.confidence_score ? parseFloat(row.confidence_score) : null,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceQuote: row.source_quote,
    sourceUrl: row.source_url,
    createdBy: row.created_by,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    supersededBy: row.superseded_by,
    contextTags: row.context_tags || [],
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Clean up old pending previews (older than 1 hour)
 */
function cleanupOldPreviews() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [id, preview] of pendingPreviews.entries()) {
    if (preview.createdAt < oneHourAgo) {
      pendingPreviews.delete(id);
    }
  }
}

export default {
  ask,
  previewRemember,
  confirmRemember,
  cancelRemember,
  getFactAttribution
};
