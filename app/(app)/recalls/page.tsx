'use client'

import { useState, useEffect } from 'react'
import { Bell, CheckCircle2, Clock, RotateCcw, X, Plus } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useAuth } from '@/lib/auth/context'
import { auth } from '@/lib/auth/firebase'

interface RecallFact {
  id: string
  content: string
  category?: string
  contextTags: string[]
}

interface RecallItem {
  id: string
  title?: string
  status: string
  triggerType: string
  triggerCondition: { datetime?: string; recurrence?: string }
  fact: RecallFact
  createdAt: string
  triggeredAt?: string
}

const STATUS_TABS = [
  { value: 'PENDING',   label: 'Upcoming' },
  { value: 'TRIGGERED', label: 'Triggered' },
  { value: 'COMPLETED', label: 'Completed' },
]

function nextTriggerLabel(recall: RecallItem): string {
  const dt = recall.triggerCondition.datetime
  if (!dt) return 'Event-based'
  const d = new Date(dt)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  if (diffMs < 0) return 'Overdue'
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 7) return `In ${diffDays} days`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function RecallsPage() {
  const { teamId } = useAuth()
  const [recalls, setRecalls] = useState<RecallItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('PENDING')

  async function loadRecalls() {
    if (!teamId) return
    setLoading(true)
    try {
      const token = await auth?.currentUser?.getIdToken()
      const res = await fetch(`/api/recalls?teamId=${teamId}&status=${activeTab}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()
      setRecalls(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRecalls() }, [teamId, activeTab])

  async function updateStatus(id: string, status: string) {
    const token = await auth?.currentUser?.getIdToken()
    await fetch('/api/recalls', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ id, status }),
    })
    setRecalls((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-sm font-semibold text-foreground">Recalls</h1>
            <p className="text-xs text-muted-foreground">Scheduled knowledge surfaces</p>
          </div>
          <button className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-3 h-3" />
            New Recall
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'px-3 h-7 rounded-md text-xs transition-colors',
                activeTab === tab.value
                  ? 'bg-secondary text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-card border border-border animate-pulse" />
          ))
        ) : recalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No {activeTab.toLowerCase()} recalls</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Create a recall to surface specific knowledge at the right time.
            </p>
          </div>
        ) : (
          recalls.map((recall) => (
            <RecallCard
              key={recall.id}
              recall={recall}
              onComplete={() => updateStatus(recall.id, 'COMPLETED')}
              onSnooze={() => updateStatus(recall.id, 'SNOOZED')}
              onDismiss={() => updateStatus(recall.id, 'CANCELLED')}
            />
          ))
        )}
      </div>
    </div>
  )
}

function RecallCard({
  recall,
  onComplete,
  onSnooze,
  onDismiss,
}: {
  recall: RecallItem
  onComplete: () => void
  onSnooze: () => void
  onDismiss: () => void
}) {
  const nextLabel = nextTriggerLabel(recall)
  const isOverdue = nextLabel === 'Overdue'

  return (
    <div className={cn(
      'bg-card border rounded-lg p-4 transition-colors',
      isOverdue ? 'border-amber-500/30' : 'border-border'
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
          isOverdue ? 'bg-amber-500/10' : 'bg-secondary'
        )}>
          <Clock className={cn('w-4 h-4', isOverdue ? 'text-amber-400' : 'text-muted-foreground')} />
        </div>

        <div className="flex-1 min-w-0">
          {recall.title && (
            <p className="text-xs font-medium text-foreground mb-0.5">{recall.title}</p>
          )}
          <p className="text-sm text-foreground leading-relaxed line-clamp-2">
            {recall.fact.content}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn(
              'text-[10px] font-medium',
              isOverdue ? 'text-amber-400' : 'text-muted-foreground'
            )}>
              {nextLabel}
            </span>
            {recall.fact.contextTags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary/80 border border-primary/20">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onComplete}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-green-400 hover:bg-green-400/10 transition-colors"
            title="Mark complete"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onSnooze}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
            title="Snooze"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDismiss}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
