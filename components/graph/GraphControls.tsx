'use client'

import { useState } from 'react'
import { Plus, Filter, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onAddNode: () => void
  onRefresh: () => void
  teamId: string
}

export function GraphControls({ onAddNode, onRefresh, teamId }: Props) {
  return (
    <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
      <button
        onClick={onRefresh}
        className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shadow"
        title="Refresh graph"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onAddNode}
        className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow"
        title="Add node"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
