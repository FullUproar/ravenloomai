'use client'

import { useState, useRef, useEffect } from 'react'
import { SendHorizonal, Loader2, RotateCcw } from 'lucide-react'
import { cn, confidencePercent } from '@/lib/utils'
import { useAuth } from '@/lib/auth/context'
import { auth } from '@/lib/auth/firebase'
import { ContextFilter } from './ContextFilter'
import { TraversalPath } from './TraversalPath'
import type { TraversalResult } from '@/lib/ai/traversal'

interface Message {
  id: string
  type: 'user' | 'answer'
  content: string
  result?: TraversalResult
  timestamp: Date
}

// Read active scope from localStorage
function getActiveScope() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('rl_active_scope')
}

export function AskInterface() {
  const { user, teamId } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeContext, setActiveContext] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [query])

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit() {
    if (!query.trim() || loading) return

    const scopeId = getActiveScope()
    if (!scopeId || !teamId) {
      setError('Select a scope before asking.')
      return
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      type: 'user',
      content: query.trim(),
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setQuery('')
    setLoading(true)
    setError('')

    try {
      const token = await auth?.currentUser?.getIdToken()
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: userMsg.content,
          scopeId,
          teamId,
          activeContext,
        }),
      })

      if (!res.ok) throw new Error(await res.text())

      const result: TraversalResult = await res.json()

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'answer',
          content: result.answer,
          result,
          timestamp: new Date(),
        },
      ])
    } catch (e) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Context filter bar */}
      <div className="px-4 md:px-6 py-2.5 border-b border-border bg-card/30 shrink-0">
        <ContextFilter
          activeContext={activeContext}
          onChange={setActiveContext}
          teamId={teamId}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-primary fill-current" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
              </svg>
            </div>
            <h2 className="text-sm font-medium text-foreground mb-1">Ask your knowledge graph</h2>
            <p className="text-xs text-muted-foreground max-w-xs">
              Raven searches your knowledge graph and shows exactly which nodes were traversed to find the answer.
            </p>

            {/* Example prompts */}
            <div className="mt-6 space-y-2 w-full max-w-sm">
              {[
                'What did we decide about player count?',
                'What are the manufacturing constraints for Troublemaker?',
                'What context matters for retail vs wholesale pricing?',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setQuery(example)}
                  className="w-full text-left px-4 py-2.5 rounded-lg bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border/50 hover:border-border transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn('max-w-2xl', msg.type === 'user' && 'ml-auto')}>
            {msg.type === 'user' ? (
              <div className="bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-sm px-4 py-3">
                <p className="text-sm text-foreground">{msg.content}</p>
              </div>
            ) : (
              <div className="animate-fade-in">
                {/* Answer header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-primary fill-current" aria-hidden="true">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                    </svg>
                  </div>
                  <span className="text-xs text-muted-foreground">Raven</span>
                  {msg.result && (
                    <span className={cn(
                      'text-[10px] font-mono ml-1',
                      msg.result.confidence >= 0.82 ? 'text-green-400' :
                      msg.result.confidence >= 0.5  ? 'text-amber-400' : 'text-muted-foreground/60'
                    )}>
                      {confidencePercent(msg.result.confidence)} confidence
                    </span>
                  )}
                </div>

                {/* Answer text */}
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>

                  {/* Traversal path */}
                  {msg.result && (
                    <TraversalPath
                      path={msg.result.traversalPath}
                      durationMs={msg.result.durationMs}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Traversing knowledge graph…
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
            {error}
            <button onClick={() => setError('')} className="ml-auto hover:opacity-70">
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 md:px-6 py-4 border-t border-border bg-card/30 shrink-0">
        <div className="flex items-end gap-2 bg-secondary border border-border rounded-xl px-3 py-2 focus-within:border-primary transition-colors">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your knowledge graph…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[24px]"
          />
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || loading}
            className={cn(
              'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
              query.trim() && !loading
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-muted-foreground cursor-not-allowed'
            )}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SendHorizonal className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
