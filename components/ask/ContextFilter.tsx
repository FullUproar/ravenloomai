'use client'

import { useState, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  activeContext: string[]
  onChange: (context: string[]) => void
  teamId: string | null
}

// Common context tags (would be fetched from server in prod)
const SUGGESTED_TAGS = [
  'on Earth', 'daytime', 'nighttime', 'in production', 'in development',
  'retail pricing', 'wholesale pricing', 'US market', 'EU market',
  'tournament rules', 'casual rules',
]

export function ContextFilter({ activeContext, onChange, teamId }: Props) {
  const [showInput, setShowInput] = useState(false)
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    // Filter suggestions to those not already active
    setSuggestions(SUGGESTED_TAGS.filter((t) => !activeContext.includes(t)))
  }, [activeContext])

  function addTag(tag: string) {
    const clean = tag.trim()
    if (clean && !activeContext.includes(clean)) {
      onChange([...activeContext, clean])
    }
    setInput('')
    setShowInput(false)
  }

  function removeTag(tag: string) {
    onChange(activeContext.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label-mono text-[10px]">Context:</span>

      {activeContext.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
        >
          {tag}
          <button onClick={() => removeTag(tag)} className="hover:text-primary/60">
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}

      {showInput ? (
        <div className="relative">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTag(input)
              if (e.key === 'Escape') setShowInput(false)
            }}
            placeholder="Add context…"
            className="h-6 w-32 px-2 text-xs rounded-full bg-secondary border border-border text-foreground outline-none focus:border-primary"
          />
          {suggestions.length > 0 && input === '' && (
            <div className="absolute top-8 left-0 z-10 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[160px]">
              {suggestions.slice(0, 5).map((s) => (
                <button
                  key={s}
                  onClick={() => addTag(s)}
                  className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground border border-dashed border-border hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="w-2.5 h-2.5" />
          Add
        </button>
      )}
    </div>
  )
}
