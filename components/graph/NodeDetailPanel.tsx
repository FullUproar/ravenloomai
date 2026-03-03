'use client'

import { useState, useEffect } from 'react'
import { X, ArrowRight, ChevronDown } from 'lucide-react'
import { cn, getNodeColors, formatRelativeTime } from '@/lib/utils'
import { apiGet } from '@/lib/api'
import type { KgNode, KgEdge } from '@prisma/client'

interface NodeDetail extends KgNode {
  outEdges: KgEdge[]
  inEdges: KgEdge[]
  childCount: number
  facts: Array<{ id: string; content: string; createdAt: string }>
}

interface Props {
  nodeId: string | null
  onClose: () => void
  onDrillIn: (nodeId: string) => void
}

export function NodeDetailPanel({ nodeId, onClose, onDrillIn }: Props) {
  const [detail, setDetail] = useState<NodeDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!nodeId) { setDetail(null); return }
    setLoading(true)
    apiGet<NodeDetail>(`/api/graph/node?id=${nodeId}`)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [nodeId])

  if (!nodeId) return null

  const colors = detail ? getNodeColors(detail.type) : getNodeColors('CUSTOM')

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-card border-l border-border flex flex-col shadow-2xl animate-slide-in-right z-10">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b border-border shrink-0">
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="space-y-2">
              <div className="h-4 rounded bg-secondary animate-pulse w-3/4" />
              <div className="h-3 rounded bg-secondary animate-pulse w-1/2" />
            </div>
          ) : detail ? (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', colors.dot)} />
                <span className={cn('text-[10px] font-mono uppercase tracking-wider', colors.text)}>
                  {detail.type}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground leading-tight">{detail.name}</h3>
              {detail.description && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{detail.description}</p>
              )}
            </>
          ) : null}
        </div>
        <button onClick={onClose} className="shrink-0 p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {detail && (
          <>
            {/* Drill in */}
            {detail.childCount > 0 && (
              <button
                onClick={() => onDrillIn(detail.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors"
              >
                <span>View {detail.childCount} sub-node{detail.childCount !== 1 ? 's' : ''}</span>
                <ChevronDown className="w-3.5 h-3.5 rotate-[-90deg]" />
              </button>
            )}

            {/* Outgoing edges */}
            {detail.outEdges.length > 0 && (
              <section>
                <h4 className="label-mono text-[10px] mb-2">Relationships</h4>
                <div className="space-y-1.5">
                  {detail.outEdges.map((edge) => {
                    const conds = edge.contextConditions as Array<{ tag: string }> | null
                    return (
                      <div key={edge.id} className="flex items-center gap-2 text-xs">
                        <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                        <span className="font-mono text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                          {edge.relationship}
                        </span>
                        <span className="text-muted-foreground truncate flex-1">{edge.targetNodeId}</span>
                        {conds?.length ? (
                          <div className="flex gap-0.5 flex-wrap">
                            {conds.map((c) => (
                              <span key={c.tag} className="text-[9px] px-1 rounded bg-primary/10 text-primary/80 border border-primary/20">
                                {c.tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Facts */}
            {detail.facts.length > 0 && (
              <section>
                <h4 className="label-mono text-[10px] mb-2">Known Facts</h4>
                <div className="space-y-2">
                  {detail.facts.map((fact) => (
                    <div key={fact.id} className="bg-secondary/30 rounded-lg px-3 py-2 border border-border/50">
                      <p className="text-xs text-foreground leading-relaxed">{fact.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatRelativeTime(fact.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Properties */}
            {detail.properties && Object.keys(detail.properties as object).length > 0 && (
              <section>
                <h4 className="label-mono text-[10px] mb-2">Properties</h4>
                <div className="space-y-1">
                  {Object.entries(detail.properties as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="text-muted-foreground font-mono shrink-0">{k}:</span>
                      <span className="text-foreground">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
