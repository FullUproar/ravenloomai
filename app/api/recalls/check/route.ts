import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// Cron endpoint — triggers pending recalls whose time has come
// Called by Vercel cron every 5 minutes
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Find time-based recalls that are due
  const due = await prisma.recall.findMany({
    where: {
      status: 'PENDING',
      triggerType: 'time',
    },
    include: { fact: true },
  })

  const triggered: string[] = []
  for (const recall of due) {
    const condition = recall.triggerCondition as { datetime?: string }
    if (!condition.datetime) continue

    const triggerTime = new Date(condition.datetime)
    if (triggerTime <= now) {
      await prisma.recall.update({
        where: { id: recall.id },
        data: { status: 'TRIGGERED', triggeredAt: now },
      })
      triggered.push(recall.id)
    }
  }

  return NextResponse.json({ triggered: triggered.length, ids: triggered })
}
