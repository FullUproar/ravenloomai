'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/context'
import { CaptureBar } from '@/components/knowledge/CaptureBar'
import { FactCard } from '@/components/knowledge/FactCard'
import { apiGet } from '@/lib/api'

const CATEGORIES = ['all', 'product', 'manufacturing', 'marketing', 'sales', 'general']

interface FactData {
  id: string
  content: string
  category?: string
  confidenceScore: number
  contextTags: string[]
  sourceUrl?: string
  createdAt: string
  validUntil?: string
}

interface KnowledgeResponse {
  facts: FactData[]
  total: number
}

export default function KnowledgePage() {
  const { teamId } = useAuth()
  const [facts, setFacts] = useState<FactData[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  const scopeId = typeof window !== 'undefined' ? localStorage.getItem('rl_active_scope') : null

  const loadFacts = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ teamId })
      if (scopeId) params.set('scopeId', scopeId)
      if (query) params.set('q', query)
      if (category !== 'all') params.set('category', category)

      const data = await apiGet<KnowledgeResponse>(`/api/knowledge?${params}`)
      setFacts(data.facts)
      setTotal(data.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [teamId, scopeId, query, category])

  useEffect(() => { loadFacts() }, [loadFacts])

  // Re-load after capture
  function handleCaptureDone() {
    setTimeout(loadFacts, 500)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-foreground">Knowledge</h1>
            <p className="text-xs text-muted-foreground">{total} facts stored</p>
          </div>
        </div>

        {/* Capture bar */}
        <CaptureBar className="w-full" />

        {/* Search + filter */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 h-8">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search facts…"
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'shrink-0 px-3 h-6 rounded-full text-xs capitalize transition-colors',
                category === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground border border-border/50'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Facts list */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-card border border-border animate-pulse" />
          ))
        ) : facts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-foreground mb-1">No facts yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Use the capture bar above to tell Raven what you know.
              It will automatically extract and store entities, relationships, and facts.
            </p>
          </div>
        ) : (
          facts.map((fact) => (
            <FactCard
              key={fact.id}
              fact={fact}
              onDelete={(id) => setFacts((prev) => prev.filter((f) => f.id !== id))}
            />
          ))
        )}
      </div>
    </div>
  )
}
