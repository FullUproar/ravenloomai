'use client'

import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { cn } from '@/lib/utils'

export interface KGEdgeData extends Record<string, unknown> {
  relationship: string
  contextConditions?: Array<{ tag: string }>
  weight?: number
}

export type KGFlowEdge = Edge<KGEdgeData, 'kgEdge'>

function KGEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
  markerEnd,
}: EdgeProps<KGFlowEdge>) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })

  const conditions = data?.contextConditions as Array<{ tag: string }> | undefined
  const hasContext = conditions && conditions.length > 0
  const relationship = data?.relationship as string | undefined

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth: selected ? 2 : 1.5,
          stroke: selected ? 'hsl(var(--primary))' : hasContext ? 'hsl(230 75% 62% / 0.6)' : undefined,
          strokeDasharray: hasContext ? '4 2' : undefined,
        }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <div className={cn(
            'flex flex-col items-center gap-0.5 bg-background border rounded-md px-1.5 py-0.5 shadow-sm',
            selected ? 'border-primary/50' : 'border-border/60',
          )}>
            <span className="text-[9px] text-muted-foreground font-mono whitespace-nowrap">
              {relationship ?? 'RELATED_TO'}
            </span>
            {hasContext && conditions.map((c) => (
              <span
                key={c.tag}
                className="text-[8px] px-1 py-0 rounded-sm bg-primary/10 text-primary/80 border border-primary/20 whitespace-nowrap"
              >
                {c.tag}
              </span>
            ))}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const KGEdgeComponent = memo(KGEdgeInner)
