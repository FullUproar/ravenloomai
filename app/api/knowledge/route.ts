import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { prisma } from '@/lib/db/prisma'
import { generateEmbedding } from '@/lib/ai/openai'
import { z } from 'zod'

// GET /api/knowledge?teamId=...&scopeId=...&q=...&category=...
export async function GET(req: NextRequest) {
  try { await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const teamId   = searchParams.get('teamId')
  const scopeId  = searchParams.get('scopeId')
  const q        = searchParams.get('q')
  const category = searchParams.get('category')
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)

  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const where: Record<string, unknown> = { teamId }
  if (scopeId) where.scopeId = scopeId
  if (category) where.category = category
  if (q) where.content = { contains: q, mode: 'insensitive' }

  const [facts, decisions, total] = await Promise.all([
    prisma.fact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, content: true, category: true,
        confidenceScore: true, contextTags: true,
        sourceUrl: true, createdAt: true, validUntil: true,
      },
    }),
    prisma.decision.findMany({
      where: { teamId, ...(q ? { what: { contains: q, mode: 'insensitive' } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.floor(limit / 2),
    }),
    prisma.fact.count({ where }),
  ])

  return NextResponse.json({ facts, decisions, total })
}

const createFactSchema = z.object({
  teamId:     z.string(),
  scopeId:    z.string(),
  content:    z.string().min(1).max(2000),
  category:   z.string().optional(),
  contextTags: z.array(z.string()).default([]),
  sourceUrl:  z.string().url().optional(),
  sourceQuote: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try { await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = createFactSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const fact = await prisma.fact.create({
    data: {
      ...body.data,
      sourceType: 'manual',
    },
  })

  // Async embedding
  generateEmbedding(fact.content).then(async (emb) => {
    await prisma.$executeRaw`
      UPDATE facts SET embedding_v2 = ${`[${emb.join(',')}]`}::vector WHERE id = ${fact.id}
    `
  }).catch(console.error)

  return NextResponse.json(fact, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  try { await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.fact.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
