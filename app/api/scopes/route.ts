import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { getScopeTree } from '@/lib/db/queries/graph'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

// GET /api/scopes?teamId=...
export async function GET(req: NextRequest) {
  const auth = await requireAuth().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  // Get user from DB
  const user = await prisma.user.findUnique({
    where: { firebaseUid: auth.uid },
    select: { id: true },
  })

  const tree = await getScopeTree(teamId, user?.id ?? '')
  return NextResponse.json(tree)
}

const createSchema = z.object({
  teamId:       z.string(),
  parentScopeId: z.string().optional(),
  name:         z.string().min(1).max(100),
  type:         z.enum(['TEAM', 'PROJECT', 'PRIVATE']).default('PROJECT'),
  description:  z.string().optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = createSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { firebaseUid: auth.uid },
    select: { id: true },
  })

  const scope = await prisma.scope.create({
    data: {
      ...body.data,
      ownerId: body.data.type === 'PRIVATE' ? user?.id : undefined,
    },
  })

  return NextResponse.json(scope, { status: 201 })
}
