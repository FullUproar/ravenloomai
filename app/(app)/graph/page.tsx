'use client'

import dynamic from 'next/dynamic'
import { useAuth } from '@/lib/auth/context'

// React Flow must be dynamically imported — no SSR
const KnowledgeGraph = dynamic(
  () => import('@/components/graph/KnowledgeGraph').then((m) => m.KnowledgeGraph),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )}
)

export default function GraphPage() {
  const { teamId } = useAuth()

  if (!teamId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select a team to view the knowledge graph.
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <KnowledgeGraph teamId={teamId} />
    </div>
  )
}
