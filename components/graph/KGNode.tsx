'use client'

import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cn, getNodeColors } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

export interface KGNodeData extends Record<string, unknown> {
  label: string
  type: string
  description?: string
  mentionCount: number
  childCount: number
  scaleLevel: number
}

export type KGFlowNode = Node<KGNodeData, 'kgNode'>

function KGNodeInner({ data, selected }: NodeProps<KGFlowNode>) {
  const colors = getNodeColors(data.type ?? 'CUSTOM')

  return (
    <div
      className={cn(
        'relative px-3 py-2 rounded-lg border text-xs min-w-[120px] max-w-[200px] transition-all',
        colors.bg,
        colors.border,
        selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
      )}
    >
      <Handle type="target" position={Position.Left} className="opacity-0 hover:opacity-100" />
      <Handle type="source" position={Position.Right} className="opacity-0 hover:opacity-100" />

      <div className="flex items-center gap-1.5 mb-0.5">
        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', colors.dot)} />
        <span className={cn('text-[9px] font-mono uppercase tracking-wider opacity-70', colors.text)}>
          {data.type}
        </span>
        {data.childCount > 0 && (
          <span className="ml-auto flex items-center gap-0.5 text-[9px] text-muted-foreground">
            <ChevronRight className="w-2.5 h-2.5" />
            {data.childCount}
          </span>
        )}
      </div>

      <p className={cn('font-medium leading-tight truncate', colors.text)}>{data.label}</p>

      {data.description && (
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
          {data.description as string}
        </p>
      )}

      {data.mentionCount > 1 && (
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
          {data.mentionCount > 9 ? '9+' : data.mentionCount}
        </div>
      )}
    </div>
  )
}

export const KGNodeComponent = memo(KGNodeInner)
