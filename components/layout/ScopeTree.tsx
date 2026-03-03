'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronRight, Folder, FolderOpen, Lock, Globe, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/context'
import { apiGet } from '@/lib/api'

interface ScopeNode {
  id: string
  name: string
  type: 'TEAM' | 'PROJECT' | 'PRIVATE'
  children: ScopeNode[]
  description?: string
}

// Persisted in localStorage
const SCOPE_KEY = 'rl_active_scope'

function useScopeState() {
  const [activeScope, setActiveScopeState] = useState<string | null>(null)
  useEffect(() => {
    setActiveScopeState(localStorage.getItem(SCOPE_KEY))
  }, [])
  const setActiveScope = (id: string) => {
    localStorage.setItem(SCOPE_KEY, id)
    setActiveScopeState(id)
    window.dispatchEvent(new CustomEvent('scope-change', { detail: { scopeId: id } }))
  }
  return { activeScope, setActiveScope }
}

function ScopeItem({
  scope,
  depth,
  activeScope,
  onSelect,
}: {
  scope: ScopeNode
  depth: number
  activeScope: string | null
  onSelect: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(depth === 0)
  const isActive = activeScope === scope.id
  const hasChildren = scope.children.length > 0

  const Icon =
    scope.type === 'PRIVATE'
      ? Lock
      : scope.type === 'TEAM'
      ? Globe
      : expanded
      ? FolderOpen
      : Folder

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setExpanded(!expanded)
          onSelect(scope.id)
        }}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        className={cn(
          'flex items-center gap-1.5 w-full h-7 pr-2 rounded-md text-xs transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
        )}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn('w-3 h-3 shrink-0 transition-transform', expanded && 'rotate-90')}
          />
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}
        <Icon className="w-3 h-3 shrink-0" />
        <span className="truncate">{scope.name}</span>
      </button>

      {expanded && hasChildren && (
        <div>
          {scope.children.map((child) => (
            <ScopeItem
              key={child.id}
              scope={child}
              depth={depth + 1}
              activeScope={activeScope}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ScopeTree() {
  const { teamId } = useAuth()
  const { activeScope, setActiveScope } = useScopeState()
  const [scopes, setScopes] = useState<ScopeNode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!teamId) return
    apiGet<ScopeNode[]>(`/api/scopes?teamId=${teamId}`)
      .then(setScopes)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [teamId])

  if (loading) {
    return (
      <div className="space-y-1 px-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-6 rounded-md bg-secondary/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (scopes.length === 0) {
    return (
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground">No scopes yet.</p>
        <button className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline">
          <Plus className="w-3 h-3" />
          Create scope
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {scopes.map((scope) => (
        <ScopeItem
          key={scope.id}
          scope={scope}
          depth={0}
          activeScope={activeScope}
          onSelect={setActiveScope}
        />
      ))}
    </div>
  )
}
