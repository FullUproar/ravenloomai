'use client'

import { useState } from 'react'
import { Trash2, ExternalLink, Tag } from 'lucide-react'
import { cn, formatRelativeTime, confidenceLabel } from '@/lib/utils'
import { auth } from '@/lib/auth/firebase'

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

interface Props {
  fact: FactData
  onDelete?: (id: string) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  product: 'Product',
  manufacturing: 'Manufacturing',
  marketing: 'Marketing',
  sales: 'Sales',
  general: 'General',
}

export function FactCard({ fact, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false)
  const confidence = confidenceLabel(fact.confidenceScore)
  const isExpired = fact.validUntil && new Date(fact.validUntil) < new Date()

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    try {
      const token = await auth?.currentUser?.getIdToken()
      await fetch(`/api/knowledge?id=${fact.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      onDelete(fact.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={cn(
      'group bg-card border border-border rounded-lg px-4 py-3 transition-colors hover:border-border/80',
      isExpired && 'opacity-50'
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-relaxed">{fact.content}</p>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {fact.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/50">
                {CATEGORY_LABELS[fact.category] ?? fact.category}
              </span>
            )}

            {fact.contextTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary/80 border border-primary/20"
              >
                <Tag className="w-2 h-2" />
                {tag}
              </span>
            ))}

            <span className={cn('text-[10px] ml-auto', confidence.color)}>
              {confidence.label}
            </span>

            <span className="text-[10px] text-muted-foreground/60">
              {formatRelativeTime(fact.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {fact.sourceUrl && (
            <a
              href={fact.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className={cn('w-3 h-3', deleting && 'animate-pulse')} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
