'use client'

import { useState, useRef, useEffect } from 'react'
import { SendHorizonal, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/context'
import { auth } from '@/lib/auth/firebase'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface ExtractionResult {
  entities: number
  relationships: number
  facts: number
}

interface Props {
  placeholder?: string
  className?: string
}

export function CaptureBar({ placeholder, className }: Props) {
  const { teamId } = useAuth()
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [text])

  async function handleCapture() {
    if (!text.trim() || status === 'loading') return
    const scopeId = localStorage.getItem('rl_active_scope')
    if (!scopeId || !teamId) return

    setStatus('loading')
    setResult(null)

    try {
      const token = await auth?.currentUser?.getIdToken()
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: text.trim(), teamId, scopeId }),
      })

      if (!res.ok) throw new Error()
      const data = await res.json()
      setResult({ entities: data.entities, relationships: data.relationships, facts: data.facts })
      setStatus('success')
      setText('')

      // Reset after 3s
      setTimeout(() => setStatus('idle'), 3000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCapture()
    }
  }

  return (
    <div className={cn('rounded-xl border border-border bg-secondary', className)}>
      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Tell Raven something to remember…'}
          rows={1}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[24px]"
        />
        <button
          onClick={handleCapture}
          disabled={!text.trim() || status === 'loading'}
          className={cn(
            'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
            text.trim() && status !== 'loading'
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-secondary-foreground/10 text-muted-foreground cursor-not-allowed'
          )}
        >
          {status === 'loading' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <SendHorizonal className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Result feedback */}
      {status === 'success' && result && (
        <div className="flex items-center gap-2 px-3 pb-2 text-xs text-green-400 animate-fade-in">
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          <span>
            Captured: {result.entities} entities, {result.relationships} relationships, {result.facts} facts
          </span>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 px-3 pb-2 text-xs text-destructive animate-fade-in">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>Failed to extract knowledge. Try again.</span>
        </div>
      )}
    </div>
  )
}
