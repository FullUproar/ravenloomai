import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

// GET /api/recalls?teamId=...&status=...
export async function GET(req: NextRequest) {
  try { await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  const status = searchParams.get('status') ?? 'PENDING'

  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const recalls = await prisma.recall.findMany({
    where: { teamId, status: status as 'PENDING' | 'TRIGGERED' | 'COMPLETED' | 'SNOOZED' | 'CANCELLED' },
    include: { fact: { select: { id: true, content: true, category: true, contextTags: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 50,
  })

  return NextResponse.json(recalls)
}

const createSchema = z.object({
  teamId:          z.string(),
  scopeId:         z.string(),
  factId:          z.string(),
  title:           z.string().optional(),
  triggerType:     z.enum(['time', 'event']).default('time'),
  triggerCondition: z.object({
    datetime:    z.string().optional(), // ISO string
    recurrence:  z.string().optional(), // cron expression
    pattern:     z.string().optional(), // for event type
  }),
})

export async function POST(req: NextRequest) {
  try { await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = createSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const recall = await prisma.recall.create({ data: body.data })
  return NextResponse.json(recall, { status: 201 })
}

const updateSchema = z.object({
  id:     z.string(),
  status: z.enum(['PENDING', 'TRIGGERED', 'COMPLETED', 'SNOOZED', 'CANCELLED']).optional(),
  snoozedUntil: z.string().optional(),
})

export async function PATCH(req: NextRequest) {
  try { await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = updateSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { id, status, snoozedUntil } = body.data
  const updated = await prisma.recall.update({
    where: { id },
    data: {
      ...(status && { status }),
      ...(snoozedUntil && { snoozedUntil: new Date(snoozedUntil) }),
      ...(status === 'TRIGGERED' && { triggeredAt: new Date() }),
      ...(status === 'COMPLETED' && { completedAt: new Date() }),
    },
  })
  return NextResponse.json(updated)
}
