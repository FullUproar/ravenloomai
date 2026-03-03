import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { drillDownAnswer } from '@/lib/ai/traversal'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

export const maxDuration = 30

const schema = z.object({
  query:         z.string().min(1).max(2000),
  scopeId:       z.string(),
  teamId:        z.string(),
  activeContext: z.array(z.string()).default([]),
})

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = schema.safeParse(await req.json())
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid request', details: body.error.flatten() }, { status: 400 })
  }

  const { query, scopeId, teamId, activeContext } = body.data

  try {
    const result = await drillDownAnswer(query, scopeId, activeContext, teamId)

    // Store the question in scope conversation (best-effort)
    try {
      const convo = await prisma.scopeConversation.upsert({
        where: { scopeId_userId: { scopeId, userId: null as unknown as string } },
        create: { scopeId, userId: null },
        update: {},
      })

      await prisma.scopeMessage.create({
        data: {
          conversationId: convo.id,
          scopeId,
          content: query,
          isAi: false,
        },
      })
      await prisma.scopeMessage.create({
        data: {
          conversationId: convo.id,
          scopeId,
          content: result.answer,
          isAi: true,
          metadata: JSON.parse(JSON.stringify({
            traversalPath: result.traversalPath,
            confidence: result.confidence,
            durationMs: result.durationMs,
          })),
        },
      })
    } catch {
      // Don't fail the request if history save fails
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[ask] Error:', err)
    return NextResponse.json({ error: 'Failed to process query' }, { status: 500 })
  }
}
