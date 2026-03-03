import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { prisma } from '@/lib/db/prisma'

// GET /api/graph/node?id=...
export async function GET(req: NextRequest) {
  try { await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Fetch node first to get teamId for facts query
  const node = await prisma.kgNode.findUnique({ where: { id } })
  if (!node) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [outEdges, inEdges, childCount, facts] = await Promise.all([
    prisma.kgEdge.findMany({ where: { sourceNodeId: id }, take: 20 }),
    prisma.kgEdge.findMany({ where: { targetNodeId: id }, take: 10 }),
    prisma.kgNode.count({ where: { parentNodeId: id } }),
    prisma.fact.findMany({
      where: { teamId: node.teamId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, content: true, createdAt: true },
    }),
  ])

  return NextResponse.json({ ...node, outEdges, inEdges, childCount, facts })
}

// PATCH /api/graph/node — update node
export async function PATCH(req: NextRequest) {
  try { await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, ...data } = body as { id: string; [key: string]: unknown }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updated = await prisma.kgNode.update({ where: { id }, data })
  return NextResponse.json(updated)
}
