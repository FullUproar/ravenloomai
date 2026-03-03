import { generateEmbedding } from './openai'
import { askWithFallback } from './claude'
import { vectorSearchNodes, getAncestorScopeIds, getNodeContext } from '../db/queries/graph'
import { prisma } from '../db/prisma'
import type { KgEdge } from '@prisma/client'

export interface TraversalStep {
  nodeId: string
  nodeName: string
  nodeType: string
  depth: number
  confidence: number
  candidateAnswer: string
  edgesUsed: Array<{ relationship: string; contextConditions: unknown }>
  wasUsed: boolean // true = this node's answer was the winner
}

export interface TraversalResult {
  answer: string
  confidence: number
  traversalPath: TraversalStep[]
  durationMs: number
}

const CONFIDENCE_THRESHOLD = 0.82 // stop drilling if we hit this
const MAX_DEPTH = 3
const TOP_K_NODES = 5

/**
 * Build a context string for a node — its description, edges, and facts.
 */
function buildNodeContext(
  nodeName: string,
  nodeDescription: string | null,
  outEdges: KgEdge[],
  facts: Array<{ content: string; contextTags: string[] }>,
  chunks: Array<{ content: string }>
): string {
  const parts: string[] = []

  if (nodeDescription) parts.push(`Node: ${nodeName}\nDescription: ${nodeDescription}`)

  if (outEdges.length > 0) {
    parts.push(
      'Relationships:\n' +
        outEdges
          .map((e) => {
            const conditions = e.contextConditions as Array<{ tag: string }> | null
            const ctx = conditions?.length ? ` [context: ${conditions.map((c) => c.tag).join(', ')}]` : ''
            return `  ${nodeName} --[${e.relationship}]--> (${e.targetNodeId})${ctx}`
          })
          .join('\n')
    )
  }

  if (facts.length > 0) {
    parts.push('Known facts:\n' + facts.slice(0, 8).map((f) => `  • ${f.content}`).join('\n'))
  }

  if (chunks.length > 0) {
    parts.push('Source material:\n' + chunks.slice(0, 3).map((c) => c.content).join('\n---\n'))
  }

  return parts.join('\n\n')
}

/**
 * Recursively drill into a node and its children to find the best answer.
 */
async function drillNode(
  query: string,
  nodeId: string,
  activeContext: string[],
  depth: number,
  path: TraversalStep[]
): Promise<{ answer: string; confidence: number; step: TraversalStep }> {
  const node = await prisma.kgNode.findUnique({ where: { id: nodeId } })
  if (!node) {
    return {
      answer: '',
      confidence: 0,
      step: {
        nodeId,
        nodeName: 'Unknown',
        nodeType: 'CUSTOM',
        depth,
        confidence: 0,
        candidateAnswer: '',
        edgesUsed: [],
        wasUsed: false,
      },
    }
  }

  const ctx = await getNodeContext(node, activeContext)
  const contextStr = buildNodeContext(
    node.name,
    node.description,
    ctx.outEdges,
    ctx.facts,
    ctx.chunks
  )

  const { text, confidence } = await askWithFallback(query, contextStr)

  const step: TraversalStep = {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    depth,
    confidence,
    candidateAnswer: text,
    edgesUsed: ctx.outEdges.map((e) => ({
      relationship: e.relationship,
      contextConditions: e.contextConditions,
    })),
    wasUsed: false,
  }

  // If confidence is good enough OR we've hit max depth, stop drilling
  if (confidence >= CONFIDENCE_THRESHOLD || depth >= MAX_DEPTH || ctx.childNodes.length === 0) {
    return { answer: text, confidence, step }
  }

  // Drill into children — find the one with the best answer
  let bestAnswer = text
  let bestConfidence = confidence
  let bestStep = step

  for (const child of ctx.childNodes.slice(0, 3)) {
    // limit to 3 children per level
    const childResult = await drillNode(query, child.id, activeContext, depth + 1, path)
    path.push(childResult.step)

    if (childResult.confidence > bestConfidence) {
      bestAnswer = childResult.answer
      bestConfidence = childResult.confidence
      bestStep = childResult.step
    }
  }

  return { answer: bestAnswer, confidence: bestConfidence, step: bestStep }
}

/**
 * Main drill-down traversal algorithm.
 *
 * 1. Embed the query
 * 2. Find top-K entry nodes via vector search
 * 3. For each entry node, drill down through children
 * 4. Return the best answer with full traversal path
 */
export async function drillDownAnswer(
  query: string,
  scopeId: string,
  activeContext: string[],
  teamId: string
): Promise<TraversalResult> {
  const startMs = Date.now()
  const traversalPath: TraversalStep[] = []

  // 1. Generate query embedding
  const embedding = await generateEmbedding(query)

  // 2. Scope inheritance — search across current + ancestors
  const scopeIds = await getAncestorScopeIds(scopeId)

  // 3. Vector search for entry nodes
  const entryNodes = await vectorSearchNodes(teamId, embedding, TOP_K_NODES)

  if (entryNodes.length === 0) {
    return {
      answer: "I don't have enough information in the knowledge graph to answer this question yet.",
      confidence: 0,
      traversalPath: [],
      durationMs: Date.now() - startMs,
    }
  }

  // 4. Drill into each entry node
  let bestAnswer = ''
  let bestConfidence = 0
  let bestStepId: string | null = null

  for (const entryNode of entryNodes) {
    const result = await drillNode(query, entryNode.id, activeContext, 0, traversalPath)
    traversalPath.push(result.step)

    if (result.confidence > bestConfidence) {
      bestAnswer = result.answer
      bestConfidence = result.confidence
      bestStepId = result.step.nodeId
    }
  }

  // Mark the winning step
  traversalPath.forEach((step) => {
    if (step.nodeId === bestStepId) step.wasUsed = true
  })

  // 5. If confidence is still low, broaden search with scope-level facts
  if (bestConfidence < 0.4) {
    const scopeFacts = await prisma.fact.findMany({
      where: { scopeId: { in: scopeIds } },
      orderBy: { confidenceScore: 'desc' },
      take: 15,
      select: { content: true, contextTags: true, confidenceScore: true },
    })
    const broadContext = scopeFacts.map((f) => `• ${f.content}`).join('\n')
    if (broadContext) {
      const { text, confidence } = await askWithFallback(query, broadContext)
      if (confidence > bestConfidence) {
        bestAnswer = text
        bestConfidence = confidence
      }
    }
  }

  return {
    answer: bestAnswer || "I couldn't find a confident answer in the knowledge graph for this question.",
    confidence: bestConfidence,
    traversalPath,
    durationMs: Date.now() - startMs,
  }
}
