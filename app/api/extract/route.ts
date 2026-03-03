import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { extractEntitiesAndRelationships } from '@/lib/ai/claude'
import { generateEmbedding } from '@/lib/ai/openai'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

export const maxDuration = 30

const schema = z.object({
  text:       z.string().min(1).max(10000),
  teamId:     z.string(),
  scopeId:    z.string(),
  contextTags: z.array(z.string()).default([]),
})

export async function POST(req: NextRequest) {
  try { await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { text, teamId, scopeId, contextTags } = body.data

  const extracted = await extractEntitiesAndRelationships(text)

  // Upsert nodes
  const nodeMap = new Map<string, string>() // name → id

  for (const entity of extracted.entities) {
    const existing = await prisma.kgNode.findFirst({
      where: { teamId, name: { equals: entity.name, mode: 'insensitive' } },
    })

    if (existing) {
      await prisma.kgNode.update({
        where: { id: existing.id },
        data: { mentionCount: { increment: 1 }, description: entity.description ?? existing.description },
      })
      nodeMap.set(entity.name, existing.id)
    } else {
      const node = await prisma.kgNode.create({
        data: {
          teamId,
          name: entity.name,
          type: entity.type,
          description: entity.description,
        },
      })
      nodeMap.set(entity.name, node.id)

      // Generate embedding async
      generateEmbedding(`${entity.name}: ${entity.description ?? ''}`).then(async (emb) => {
        await prisma.$executeRaw`
          UPDATE kg_nodes
          SET embedding_v2 = ${`[${emb.join(',')}]`}::vector
          WHERE id = ${node.id}
        `
      }).catch(console.error)
    }
  }

  // Create edges
  const createdEdges: Array<{ source: string; target: string; relationship: string }> = []
  for (const rel of extracted.relationships) {
    const sourceId = nodeMap.get(rel.source)
    const targetId = nodeMap.get(rel.target)
    if (!sourceId || !targetId) continue

    const existing = await prisma.kgEdge.findFirst({
      where: { sourceNodeId: sourceId, targetNodeId: targetId, relationship: rel.relationship },
    })

    if (existing) {
      await prisma.kgEdge.update({
        where: { id: existing.id },
        data: { weight: { increment: 0.1 } },
      })
    } else {
      await prisma.kgEdge.create({
        data: {
          teamId,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          relationship: rel.relationship,
          contextConditions: rel.contextConditions ? JSON.parse(JSON.stringify(rel.contextConditions)) : null,
          sourceType: 'conversation',
        },
      })
      createdEdges.push({ source: rel.source, target: rel.target, relationship: rel.relationship })
    }
  }

  // Create facts
  const createdFacts: string[] = []
  for (const fact of extracted.facts) {
    const embedding = await generateEmbedding(fact.content)
    const newFact = await prisma.fact.create({
      data: {
        teamId,
        scopeId,
        content: fact.content,
        category: fact.category,
        contextTags: [...(fact.contextTags ?? []), ...contextTags],
        sourceType: 'conversation',
      },
    })

    // Store embedding async
    prisma.$executeRaw`
      UPDATE facts
      SET embedding_v2 = ${`[${embedding.join(',')}]`}::vector
      WHERE id = ${newFact.id}
    `.catch(console.error)

    createdFacts.push(fact.content)
  }

  return NextResponse.json({
    entities: extracted.entities.length,
    relationships: createdEdges.length,
    facts: createdFacts.length,
    extracted,
  })
}
