import { prisma } from '../prisma'
import type { KgNode, KgEdge } from '@prisma/client'

// ─── Scope ancestry ──────────────────────────────────────────────────────────

export async function getAncestorScopeIds(scopeId: string): Promise<string[]> {
  const ids: string[] = [scopeId]
  let current = await prisma.scope.findUnique({
    where: { id: scopeId },
    select: { parentScopeId: true },
  })
  while (current?.parentScopeId) {
    ids.push(current.parentScopeId)
    current = await prisma.scope.findUnique({
      where: { id: current.parentScopeId },
      select: { parentScopeId: true },
    })
  }
  return ids
}

// ─── Vector search ───────────────────────────────────────────────────────────

export interface NodeWithScore extends KgNode {
  score: number
}

/**
 * Vector similarity search over kg_nodes.
 * Tries 3072-dim first (v2 embeddings), falls back to 1536-dim (v1).
 */
export async function vectorSearchNodes(
  teamId: string,
  embedding: number[],
  topK = 5
): Promise<NodeWithScore[]> {
  const embeddingStr = `[${embedding.join(',')}]`

  // Try v2 (3072-dim) column first
  try {
    const rows = await prisma.$queryRaw<Array<KgNode & { score: number }>>`
      SELECT *, 1 - (embedding_v2 <=> ${embeddingStr}::vector) AS score
      FROM kg_nodes
      WHERE team_id = ${teamId}
        AND embedding_v2 IS NOT NULL
      ORDER BY embedding_v2 <=> ${embeddingStr}::vector
      LIMIT ${topK}
    `
    if (rows.length > 0) return rows
  } catch {
    // v2 column might not exist yet — fall through to v1
  }

  // Fall back to v1 (1536-dim)
  const rows = await prisma.$queryRaw<Array<KgNode & { score: number }>>`
    SELECT *, 1 - (embedding <=> ${embeddingStr}::vector) AS score
    FROM kg_nodes
    WHERE team_id = ${teamId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `
  return rows
}

// ─── Node with context ───────────────────────────────────────────────────────

export interface NodeContext {
  node: KgNode
  outEdges: KgEdge[]
  childNodes: KgNode[]
  facts: Array<{ id: string; content: string; contextTags: string[]; confidenceScore: number }>
  chunks: Array<{ id: string; content: string }>
}

/**
 * Load full context for a node: edges (filtered by activeContext), children, facts, chunks.
 */
export async function getNodeContext(
  node: KgNode,
  activeContext: string[]
): Promise<NodeContext> {
  const [outEdges, childNodes, facts, chunks] = await Promise.all([
    prisma.kgEdge.findMany({ where: { sourceNodeId: node.id } }),
    prisma.kgNode.findMany({ where: { parentNodeId: node.id } }),
    prisma.fact.findMany({
      where: { teamId: node.teamId },
      select: { id: true, content: true, contextTags: true, confidenceScore: true },
      take: 10,
    }),
    // KgChunk has no Prisma relation — raw query
    prisma.$queryRaw<Array<{ id: string; content: string }>>`
      SELECT id, content FROM kg_chunks
      WHERE team_id = ${node.teamId}
        AND ${node.id} = ANY(linked_node_ids)
      LIMIT 5
    `,
  ])

  // Filter edges by active context
  const filteredEdges = outEdges.filter((edge) => {
    const conditions = edge.contextConditions as Array<{ tag: string }> | null
    if (!conditions || conditions.length === 0) return true
    return conditions.every((c) => activeContext.includes(c.tag))
  })

  return { node, outEdges: filteredEdges, childNodes, facts, chunks }
}

// ─── Scope tree ──────────────────────────────────────────────────────────────

export async function getScopeTree(teamId: string, userId: string) {
  const allScopes = await prisma.scope.findMany({
    where: {
      teamId,
      OR: [
        { type: { not: 'PRIVATE' } },
        { ownerId: userId },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })

  // Build tree
  type ScopeWithChildren = (typeof allScopes)[number] & { children: ScopeWithChildren[] }
  const map = new Map<string, ScopeWithChildren>()
  allScopes.forEach((s) => map.set(s.id, { ...s, children: [] }))

  const roots: ScopeWithChildren[] = []
  allScopes.forEach((s) => {
    const node = map.get(s.id)!
    if (s.parentScopeId && map.has(s.parentScopeId)) {
      map.get(s.parentScopeId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

// ─── Graph data for visualization ────────────────────────────────────────────

export async function getGraphData(teamId: string, parentNodeId?: string | null) {
  const [nodes, edges] = await Promise.all([
    prisma.kgNode.findMany({
      where: { teamId, parentNodeId: parentNodeId ?? null },
      orderBy: { mentionCount: 'desc' },
      take: 200,
    }),
    prisma.kgEdge.findMany({
      where: { teamId },
      take: 500,
    }),
  ])

  // Filter edges to only include those between visible nodes
  const nodeIds = new Set(nodes.map((n) => n.id))
  const filteredEdges = edges.filter(
    (e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId)
  )

  return { nodes, edges: filteredEdges }
}
