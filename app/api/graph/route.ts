import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { prisma } from '@/lib/db/prisma'
import { generateEmbedding } from '@/lib/ai/openai'
import { getGraphData } from '@/lib/db/queries/graph'
import { z } from 'zod'

// GET /api/graph?teamId=...&parentNodeId=...
export async function GET(req: NextRequest) {
  try { await requireAuth() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  const parentNodeId = searchParams.get('parentNodeId') || null

  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const data = await getGraphData(teamId, parentNodeId)
  return NextResponse.json(data)
}

const createNodeSchema = z.object({
  teamId:       z.string(),
  name:         z.string().min(1).max(200),
  type:         z.string().default('CONCEPT'),
  description:  z.string().optional(),
  parentNodeId: z.string().optional(),
  properties:   z.record(z.unknown()).optional(),
})

const createEdgeSchema = z.object({
  teamId:            z.string(),
  sourceNodeId:      z.string(),
  targetNodeId:      z.string(),
  relationship:      z.string().default('RELATED_TO'),
  contextConditions: z.array(z.object({ tag: z.string() })).optional(),
})

// POST /api/graph — create node or edge
export async function POST(req: NextRequest) {
  try { await requireAuth() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const body = await req.json()

  if (body.type === 'edge') {
    const parsed = createEdgeSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid edge' }, { status: 400 })

    const edge = await prisma.kgEdge.create({
      data: {
        ...parsed.data,
        contextConditions: parsed.data.contextConditions
          ? JSON.parse(JSON.stringify(parsed.data.contextConditions))
          : undefined,
      },
    })
    return NextResponse.json(edge, { status: 201 })
  }

  // Create node
  const parsed = createNodeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid node' }, { status: 400 })

  // Generate embedding in background (don't block response)
  const node = await prisma.kgNode.create({
    data: {
      teamId:       parsed.data.teamId,
      name:         parsed.data.name,
      type:         parsed.data.type,
      description:  parsed.data.description,
      parentNodeId: parsed.data.parentNodeId,
      // Cast to satisfy Prisma's InputJsonValue type
      properties: parsed.data.properties
        ? JSON.parse(JSON.stringify(parsed.data.properties))
        : undefined,
    },
  })

  // Fire-and-forget embedding generation
  generateEmbedding(`${node.name}: ${node.description ?? ''}`).then(async (emb) => {
    await prisma.$executeRaw`
      UPDATE kg_nodes
      SET embedding_v2 = ${`[${emb.join(',')}]`}::vector
      WHERE id = ${node.id}
    `
  }).catch(console.error)

  return NextResponse.json(node, { status: 201 })
}

// DELETE /api/graph?nodeId=... or ?edgeId=...
export async function DELETE(req: NextRequest) {
  try { await requireAuth() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { searchParams } = new URL(req.url)
  const nodeId = searchParams.get('nodeId')
  const edgeId = searchParams.get('edgeId')

  if (nodeId) {
    await prisma.kgNode.delete({ where: { id: nodeId } })
    return NextResponse.json({ ok: true })
  }
  if (edgeId) {
    await prisma.kgEdge.delete({ where: { id: edgeId } })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'nodeId or edgeId required' }, { status: 400 })
}
