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
import {
  graphRAGSearch,
  hierarchicalGraphRAGSearch,
  processDocument,
  searchNodes,
  upsertNode,
  attachFactToNode,
  getRootNodes,
  processFactIntoGraph
} from './KnowledgeGraphService.js';
import KnowledgeBaseService from './KnowledgeBaseService.js';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
import * as GoogleDriveService from './GoogleDriveService.js';
import * as ConfirmationEventService from './ConfirmationEventService.js';
import crypto from 'crypto';

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

  // Hierarchical GraphRAG search - depth-aware based on question type
  let graphContext = { entryNodes: [], relatedNodes: [], chunks: [], facts: [], intent: 'detail' };
  try {
    graphContext = await hierarchicalGraphRAGSearch(teamId, question, {
      topK: 5,
      maxDepth: 2,
      targetScale: 'auto'  // Auto-detect if overview or detail question
    });
    console.log(`[RavenService.ask] HierarchicalRAG: ${graphContext.entryNodes.length} entry nodes, ${graphContext.facts.length} facts, intent=${graphContext.intent}`);

    // Merge graph facts with knowledge facts (dedupe by ID)
    if (graphContext.facts && graphContext.facts.length > 0) {
      const existingIds = new Set(knowledge.facts.map(f => f.id));
      const newFacts = graphContext.facts.filter(f => !existingIds.has(f.id));
      knowledge.facts = [...knowledge.facts, ...newFacts];
      console.log(`[RavenService.ask] Added ${newFacts.length} additional facts from graph hierarchy`);
    }
  } catch (err) {
    console.error('[RavenService.ask] HierarchicalRAG error:', err.message);
    // Fallback to basic graphRAG
    try {
      graphContext = await graphRAGSearch(teamId, question, { topK: 5, hopDepth: 1 });
    } catch (fallbackErr) {
      console.error('[RavenService.ask] GraphRAG fallback error:', fallbackErr.message);
    }
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
// HIERARCHY DETECTION FOR REMEMBER
// ============================================================================

/**
 * Detect hierarchy hints in a statement
 * E.g., "For Gen Con 2026, our booth is #1847" → parent: "Gen Con 2026"
 *
 * Returns suggested parent entity and hierarchy action
 */
async function detectHierarchy(teamId, statement) {
  try {
    // Use AI to extract hierarchy hints
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Analyze this statement for hierarchy hints. Look for:
1. Context prefixes: "For X...", "Regarding X...", "About X...", "In X..."
2. Possessive references: "X's booth", "the X project"
3. Temporal contexts: "At Gen Con 2026...", "During Q1..."
4. Organizational: "In the marketing team...", "For the website..."

Extract the parent entity name if one is implied. Return JSON:
{
  "hasHierarchy": true/false,
  "parentName": "Entity Name" or null,
  "parentType": "event|project|product|process|concept|company" or null,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`
        },
        { role: 'user', content: statement }
      ],
      max_tokens: 200,
      temperature: 0
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[detectHierarchy] Error:', error.message);
  }

  return { hasHierarchy: false, parentName: null, parentType: null, confidence: 0 };
}

/**
 * Find or suggest a parent entity for a statement
 */
async function findSuggestedParent(teamId, hierarchyHint) {
  if (!hierarchyHint.hasHierarchy || !hierarchyHint.parentName) {
    return null;
  }

  // Search for existing entities matching the parent name
  const existingNodes = await searchNodes(teamId, hierarchyHint.parentName, { limit: 5 });

  // Look for exact or close matches
  const parentName = hierarchyHint.parentName.toLowerCase();
  const exactMatch = existingNodes.find(n =>
    n.name.toLowerCase() === parentName
  );

  if (exactMatch) {
    return {
      action: 'attach_to_existing',
      node: {
        id: exactMatch.id,
        name: exactMatch.name,
        type: exactMatch.type,
        scaleLevel: exactMatch.scaleLevel
      },
      confidence: hierarchyHint.confidence
    };
  }

  // Check for close matches (contains the name)
  const closeMatch = existingNodes.find(n =>
    n.name.toLowerCase().includes(parentName) ||
    parentName.includes(n.name.toLowerCase())
  );

  if (closeMatch) {
    return {
      action: 'attach_to_existing',
      node: {
        id: closeMatch.id,
        name: closeMatch.name,
        type: closeMatch.type,
        scaleLevel: closeMatch.scaleLevel
      },
      confidence: hierarchyHint.confidence * 0.8,  // Lower confidence for partial match
      alternativeName: hierarchyHint.parentName  // User might want to create a new one
    };
  }

  // No existing match - suggest creating a new container
  return {
    action: 'create_container',
    suggestedName: hierarchyHint.parentName,
    suggestedType: hierarchyHint.parentType || 'concept',
    confidence: hierarchyHint.confidence
  };
}

// ============================================================================
// REMEMBER (Preview → Confirm flow)
// ============================================================================

/**
 * Preview a Remember statement - extract facts and detect conflicts
 * Now also detects hierarchy and suggests placement
 *
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

  // NEW: Detect hierarchy hints and suggest placement
  let suggestedParent = null;
  let hierarchyAction = 'standalone';
  try {
    const hierarchyHint = await detectHierarchy(teamId, statement);
    console.log(`[RavenService.previewRemember] Hierarchy hint:`, hierarchyHint);

    if (hierarchyHint.hasHierarchy) {
      suggestedParent = await findSuggestedParent(teamId, hierarchyHint);
      if (suggestedParent) {
        hierarchyAction = suggestedParent.action;
        console.log(`[RavenService.previewRemember] Suggested parent:`, suggestedParent);
      }
    }
  } catch (err) {
    console.error('[RavenService.previewRemember] Hierarchy detection error:', err.message);
  }

  // Persist preview to database (replaces in-memory Map)
  const result = await db.query(
    `INSERT INTO remember_previews
       (scope_id, team_id, user_id, source_text, source_url, extracted_facts, conflicts,
        is_mismatch, mismatch_suggestion, suggested_parent, hierarchy_action, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
     RETURNING id`,
    [
      scopeId, teamId, userId, statement, sourceUrl,
      JSON.stringify(extractedFacts), JSON.stringify(conflicts),
      mismatch.isMismatch, mismatch.suggestion,
      JSON.stringify(suggestedParent), JSON.stringify(hierarchyAction)
    ]
  );

  const previewId = result.rows[0].id;

  return {
    previewId,
    sourceText: statement,
    extractedFacts,
    conflicts,
    isMismatch: mismatch.isMismatch,
    mismatchSuggestion: mismatch.suggestion,
    // NEW: Hierarchy placement suggestions
    suggestedParent,
    hierarchyAction
  };
}

/**
 * Confirm and save facts from a preview
 * @param {string} previewId - The preview ID
 * @param {string[]} skipConflictIds - IDs of conflicting facts to skip/not update
 * @param {Object} hierarchyOptions - Optional hierarchy settings
 * @param {string} hierarchyOptions.parentNodeId - Attach facts to this node
 * @param {boolean} hierarchyOptions.createContainer - Create a new container node
 * @param {string} hierarchyOptions.containerName - Name for new container
 * @param {string} hierarchyOptions.containerType - Type for new container
 */
export async function confirmRemember(previewId, skipConflictIds = [], hierarchyOptions = {}, confirmingUserId = null) {
  console.log(`[RavenService.confirmRemember] previewId=${previewId}`);

  // Read preview from database
  const previewResult = await db.query(
    `SELECT * FROM remember_previews WHERE id = $1 AND status = 'pending'`,
    [previewId]
  );

  if (previewResult.rows.length === 0) {
    throw new Error('Preview not found or expired');
  }

  const row = previewResult.rows[0];
  const scopeId = row.scope_id;
  const teamId = row.team_id;
  const userId = row.user_id;
  const sourceText = row.source_text;
  const sourceUrl = row.source_url;
  const extractedFacts = row.extracted_facts || [];
  const conflicts = row.conflicts || [];
  const previewCreatedAt = row.created_at;

  // The confirming user (may differ from the stating user in team context)
  const confirmer = confirmingUserId || userId;

  const factsCreated = [];
  const factsUpdated = [];
  let targetNodeId = null;
  let nodeCreated = null;

  // Handle hierarchy options
  const { parentNodeId, createContainer, containerName, containerType } = hierarchyOptions;

  try {
    if (createContainer && containerName) {
      // Create a new container node for these facts
      console.log(`[RavenService.confirmRemember] Creating container: ${containerName}`);
      const newNode = await upsertNode(teamId, {
        name: containerName,
        type: containerType || 'concept',
        scaleLevel: 2,  // Container level
        description: `Created from remember: "${sourceText.substring(0, 100)}..."`
      }, {
        sourceType: 'remember',
        sourceId: previewId
      });
      targetNodeId = newNode.id;
      nodeCreated = { id: newNode.id, name: newNode.name, type: newNode.type };
    } else if (parentNodeId) {
      // Attach to existing node
      targetNodeId = parentNodeId;
    }
  } catch (err) {
    console.error('[RavenService.confirmRemember] Hierarchy creation error:', err.message);
    // Continue without hierarchy attachment
  }

  // Build a set of conflict fact IDs to skip
  const skipIds = new Set(skipConflictIds || []);

  for (const extractedFact of extractedFacts) {
    // Check if this fact has a conflict
    const conflict = conflicts.find(c =>
      c.extractedFactContent === extractedFact.content &&
      !skipIds.has(c.existingFact?.id)
    );

    if (conflict && conflict.conflictType === 'update') {
      // Update the existing fact (supersede it)
      await KnowledgeService.invalidateFact(conflict.existingFact.id);

      // Create new fact with reference to old one
      const newFact = await createFactWithAttribution(teamId, scopeId, {
        ...extractedFact,
        sourceQuote: sourceText,
        sourceUrl,
        sourceType: 'user_statement',
        createdBy: userId,
        kgNodeId: targetNodeId  // Attach to node if specified
      });

      factsUpdated.push(newFact);

      // Process into knowledge graph (context nodes, edges, trust data)
      await processFactIntoGraph(teamId, newFact, extractedFact).catch(err =>
        console.error('[confirmRemember] Graph processing error:', err.message)
      );

      // Log confirmation event
      await ConfirmationEventService.logConfirmationEvent({
        teamId, previewId, factId: newFact.id,
        confirmingUserId: confirmer, statingUserId: userId,
        outcome: 'confirmed', originalContent: extractedFact.content,
        responseTimeMs: Date.now() - new Date(previewCreatedAt).getTime()
      });

      // Log conflict override
      await ConfirmationEventService.logConflictOverride({
        previewId, existingFactId: conflict.existingFact.id,
        newFactId: newFact.id, conflictType: conflict.conflictType,
        userDecision: 'override', userId: confirmer
      });

    } else if (conflict && conflict.conflictType === 'duplicate') {
      // Log skip decision
      await ConfirmationEventService.logConflictOverride({
        previewId, existingFactId: conflict.existingFact.id,
        newFactId: null, conflictType: 'duplicate',
        userDecision: 'skip', userId: confirmer
      });
      continue;

    } else {
      // Create new fact
      const fact = await createFactWithAttribution(teamId, scopeId, {
        ...extractedFact,
        sourceQuote: sourceText,
        sourceUrl,
        sourceType: 'user_statement',
        createdBy: userId,
        kgNodeId: targetNodeId  // Attach to node if specified
      });
      factsCreated.push(fact);

      // Process into knowledge graph (context nodes, edges, trust data)
      await processFactIntoGraph(teamId, fact, extractedFact).catch(err =>
        console.error('[confirmRemember] Graph processing error:', err.message)
      );

      // Log confirmation event
      await ConfirmationEventService.logConfirmationEvent({
        teamId, previewId, factId: fact.id,
        confirmingUserId: confirmer, statingUserId: userId,
        outcome: 'confirmed', originalContent: extractedFact.content,
        responseTimeMs: Date.now() - new Date(previewCreatedAt).getTime()
      });
    }
  }

  // Log skipped conflicts (user chose to keep existing)
  for (const skipId of skipIds) {
    const skippedConflict = conflicts.find(c => c.existingFact?.id === skipId);
    if (skippedConflict) {
      await ConfirmationEventService.logConflictOverride({
        previewId, existingFactId: skipId,
        newFactId: null, conflictType: skippedConflict.conflictType,
        userDecision: 'keep_existing', userId: confirmer
      });
    }
  }

  // Mark preview as confirmed
  await db.query(
    `UPDATE remember_previews SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1`,
    [previewId]
  );

  return {
    success: true,
    factsCreated,
    factsUpdated,
    nodeCreated,
    attachedToNodeId: targetNodeId,
    message: `Created ${factsCreated.length} fact(s), updated ${factsUpdated.length} fact(s)${targetNodeId ? `, attached to knowledge graph` : ''}`
  };
}

/**
 * Cancel a Remember preview
 */
export async function cancelRemember(previewId) {
  const result = await db.query(
    `UPDATE remember_previews SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
    [previewId]
  );
  return result.rowCount > 0;
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
      contextTags: fact.contextTags || [],
      trustTier: fact.trustTier || 'tribal',
      contexts: fact.contexts || [],
      entities: fact.entities || [],
      intent: fact.intent || 'observation'
    }));
  } catch (error) {
    console.error('[extractFactsFromStatement] AI extraction failed, using raw statement:', error.message);
    return [{
      content: statement,
      entityType: null,
      entityName: null,
      attribute: null,
      value: null,
      category: 'general',
      confidenceScore: 0.7,
      contextTags: [],
      trustTier: 'tribal',
      contexts: [],
      entities: [],
      intent: 'observation'
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
  const { content, entityType, entityName, attribute, value, category, confidenceScore,
          sourceQuote, sourceUrl, sourceType, createdBy, contextTags = [], kgNodeId = null, trustTier = null } = factData;

  // Generate embedding
  let embedding = null;
  try {
    embedding = await AIService.generateEmbedding(content);
  } catch (err) {
    console.error('[createFactWithAttribution] Embedding generation failed:', err.message);
  }

  const result = await db.query(
    `INSERT INTO facts (team_id, scope_id, content, entity_type, entity_name, attribute, value, category,
                       confidence_score, source_type, source_quote, source_url, created_by, embedding,
                       context_tags, kg_node_id, trust_tier)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
      JSON.stringify(contextTags),
      kgNodeId,
      trustTier
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
    kgNodeId: row.kg_node_id,
    freshnessStatus: row.freshness_status,
    lastValidatedAt: row.last_validated_at,
    confidence: row.confidence ? parseFloat(row.confidence) : null,
    trustTier: row.trust_tier,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}


// ============================================================================
// DOCUMENT PROCESSING
// ============================================================================

/**
 * Process document content into the knowledge graph
 * Supports raw text content or URLs (Google Docs, web pages)
 */
export async function processDocumentContent(teamId, userId, { title, content, url }) {
  console.log(`[RavenService.processDocumentContent] Processing "${title}"`);

  let documentContent = content;
  let factsExtracted = 0;

  // If URL provided, fetch content
  if (url && !content) {
    try {
      console.log(`[RavenService.processDocumentContent] Fetching content from URL: ${url}`);
      documentContent = await fetchUrlContent(url, teamId);
    } catch (err) {
      console.error(`[RavenService.processDocumentContent] URL fetch failed:`, err.message);
      return {
        success: false,
        title,
        nodesCreated: 0,
        edgesCreated: 0,
        chunksCreated: 0,
        factsExtracted: 0,
        message: `Failed to fetch content from URL: ${err.message}`
      };
    }
  }

  if (!documentContent) {
    return {
      success: false,
      title,
      nodesCreated: 0,
      edgesCreated: 0,
      chunksCreated: 0,
      factsExtracted: 0,
      message: 'No content provided'
    };
  }

  console.log(`[RavenService.processDocumentContent] Content length: ${documentContent.length} chars`);

  try {
    // Process into knowledge graph (entities, relationships, chunks)
    const graphResult = await processDocument(teamId, {
      id: crypto.randomUUID(),
      title,
      content: documentContent
    }, { sourceType: 'document', sourceUrl: url });

    console.log(`[RavenService.processDocumentContent] Graph result: ${graphResult.nodes} nodes, ${graphResult.edges} edges, ${graphResult.chunks} chunks`);

    // Also extract atomic facts for the fact-based knowledge store
    try {
      const atomicFacts = await AIService.extractAtomicFacts(documentContent, { question: null });
      console.log(`[RavenService.processDocumentContent] Extracted ${atomicFacts.length} atomic facts`);

      // Store each fact
      for (const fact of atomicFacts.slice(0, 50)) { // Limit to 50 facts per document
        try {
          await KnowledgeService.createFact(teamId, {
            content: fact.statement,
            category: fact.category || 'general',
            sourceType: 'document',
            createdBy: userId,
            metadata: { documentTitle: title, sourceUrl: url }
          });
          factsExtracted++;
        } catch (err) {
          console.error(`[RavenService.processDocumentContent] Fact creation error:`, err.message);
        }
      }
    } catch (err) {
      console.error(`[RavenService.processDocumentContent] Fact extraction error:`, err.message);
    }

    return {
      success: true,
      title,
      nodesCreated: graphResult.nodes || 0,
      edgesCreated: graphResult.edges || 0,
      chunksCreated: graphResult.chunks || 0,
      factsExtracted,
      message: `Processed "${title}" - ${graphResult.nodes || 0} entities, ${factsExtracted} facts extracted`
    };

  } catch (err) {
    console.error(`[RavenService.processDocumentContent] Processing error:`, err);
    return {
      success: false,
      title,
      nodesCreated: 0,
      edgesCreated: 0,
      chunksCreated: 0,
      factsExtracted: 0,
      message: err.message
    };
  }
}

/**
 * Fetch content from a URL (supports Google Docs, web pages, etc.)
 */
async function fetchUrlContent(url, teamId = null) {
  // Check if it's a Google Docs URL
  const gdocsMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (gdocsMatch) {
    const docId = gdocsMatch[1];

    // First, try to use team's Google OAuth if available
    if (teamId) {
      try {
        const integration = await GoogleDriveService.getIntegration(teamId);
        if (integration) {
          console.log(`[fetchUrlContent] Using Google OAuth for team ${teamId}`);
          const content = await GoogleDriveService.getFileContent(
            teamId,
            docId,
            'application/vnd.google-apps.document'
          );
          console.log(`[fetchUrlContent] Successfully fetched private doc via OAuth`);
          return content;
        }
      } catch (oauthErr) {
        console.log(`[fetchUrlContent] OAuth fetch failed: ${oauthErr.message}, trying public access`);
        // Fall through to public access attempt
      }
    }

    // Fall back to public access
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    try {
      const response = await fetch(exportUrl);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          const connectMsg = teamId
            ? 'Connect Google Drive in Settings to access private docs, or set sharing to "Anyone with the link".'
            : 'Google Doc is not publicly accessible. Please set sharing to "Anyone with the link" and try again.';
          throw new Error(connectMsg);
        }
        throw new Error(`Failed to fetch Google Doc: ${response.statusText}`);
      }
      const text = await response.text();
      // Check if we got an HTML login page instead of the document
      if (text.includes('accounts.google.com') || text.includes('Sign in - Google')) {
        const connectMsg = teamId
          ? 'Connect Google Drive in Settings to access private docs, or set sharing to "Anyone with the link".'
          : 'Google Doc is not publicly accessible. Please set sharing to "Anyone with the link" and try again.';
        throw new Error(connectMsg);
      }
      return text;
    } catch (err) {
      if (err.message.includes('not publicly accessible') || err.message.includes('Connect Google Drive')) {
        throw err;
      }
      throw new Error(`Failed to fetch Google Doc: ${err.message}`);
    }
  }

  // For other URLs, fetch as-is
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('URL requires authentication. Please make sure the content is publicly accessible.');
      }
      throw new Error(`Failed to fetch URL (${response.status}): ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      // Basic HTML to text conversion
      const html = await response.text();
      // Strip HTML tags (basic approach)
      return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                 .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                 .replace(/<[^>]+>/g, ' ')
                 .replace(/\s+/g, ' ')
                 .trim();
    }

    return await response.text();
  } catch (err) {
    if (err.message.includes('not publicly accessible') || err.message.includes('requires authentication')) {
      throw err;
    }
    throw new Error(`Failed to fetch URL: ${err.message}`);
  }
}

export default {
  ask,
  previewRemember,
  confirmRemember,
  cancelRemember,
  getFactAttribution,
  processDocumentContent
};
