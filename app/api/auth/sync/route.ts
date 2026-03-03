import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const schema = z.object({
  email:       z.string().email(),
  displayName: z.string().optional(),
  avatarUrl:   z.string().url().optional(),
  teamName:    z.string().optional(), // for new team creation
})

// POST /api/auth/sync — upsert user + ensure they have a team
export async function POST(req: NextRequest) {
  const firebaseUser = await requireAuth().catch(() => null)
  if (!firebaseUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { email, displayName, avatarUrl, teamName } = body.data

  // Upsert user
  const user = await prisma.user.upsert({
    where:  { firebaseUid: firebaseUser.uid },
    update: { email, displayName, avatarUrl },
    create: { firebaseUid: firebaseUser.uid, email, displayName, avatarUrl },
  })

  // Check if user has a team
  const membership = await prisma.teamMember.findFirst({
    where: { userId: user.id },
    include: { team: true },
  })

  if (membership) {
    return NextResponse.json({ user, team: membership.team })
  }

  // Create default team for new user
  const slug = (teamName ?? email.split('@')[0])
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 30)

  const uniqueSlug = `${slug}-${Date.now().toString(36)}`

  const team = await prisma.team.create({
    data: {
      name: teamName ?? `${displayName ?? email.split('@')[0]}'s Team`,
      slug: uniqueSlug,
      members: {
        create: { userId: user.id, role: 'OWNER' },
      },
      scopes: {
        create: {
          name: 'Team',
          type: 'TEAM',
          description: 'Root team knowledge scope',
        },
      },
    },
  })

  return NextResponse.json({ user, team })
}
