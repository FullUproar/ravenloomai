'use client'

import { useState } from 'react'
import { ChevronDown, CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { cn, confidencePercent, getNodeColors } from '@/lib/utils'
import type { TraversalStep } from '@/lib/ai/traversal'

interface Props {
  path: TraversalStep[]
  durationMs: number
}

export function TraversalPath({ path, durationMs }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (path.length === 0) return null

  const usedSteps = path.filter((s) => s.wasUsed)
  const visitedCount = path.length

  return (
    <div className="mt-3 border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-4 py-2.5 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <span className="label-mono">Traversal</span>
          <span className="text-border">|</span>
          <span>{visitedCount} node{visitedCount !== 1 ? 's' : ''} visited</span>
          <span className="text-border">|</span>
          <span>{(durationMs / 1000).toFixed(1)}s</span>
        </div>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div className="p-4 space-y-2 bg-background/50">
          {path.map((step, i) => {
            const colors = getNodeColors(step.nodeType)
            const isUsed = step.wasUsed

            return (
              <div
                key={`${step.nodeId}-${i}`}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                  isUsed
                    ? 'border-green-500/20 bg-green-500/5'
                    : 'border-border/50 bg-secondary/20'
                )}
              >
                {/* Depth indicator */}
                {step.depth > 0 && (
                  <div
                    className="flex items-center shrink-0 mt-1"
                    style={{ paddingLeft: `${step.depth * 16}px` }}
                  >
                    <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
                  </div>
                )}

                {/* Status icon */}
                <div className="shrink-0 mt-0.5">
                  {isUsed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Node name */}
                    <span className={cn('text-xs font-medium', isUsed ? 'text-foreground' : 'text-muted-foreground')}>
                      {step.nodeName}
                    </span>

                    {/* Node type badge */}
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', colors.bg, colors.border, colors.text)}>
                      {step.nodeType}
                    </span>

                    {/* Confidence */}
                    <span className={cn(
                      'text-[10px] font-mono ml-auto',
                      step.confidence >= 0.82 ? 'text-green-400' :
                      step.confidence >= 0.5  ? 'text-amber-400' : 'text-muted-foreground'
                    )}>
                      {confidencePercent(step.confidence)}
                    </span>
                  </div>

                  {/* Edges used */}
                  {step.edgesUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {step.edgesUsed.slice(0, 4).map((e, ei) => {
                        const conditions = e.contextConditions as Array<{ tag: string }> | null
                        return (
                          <span key={ei} className="text-[10px] text-muted-foreground/70">
                            ↗ {e.relationship}
                            {conditions?.length ? (
                              <span className="text-primary/60"> [{conditions.map((c) => c.tag).join(', ')}]</span>
                            ) : null}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
