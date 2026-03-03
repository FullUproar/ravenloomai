'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare, GitFork, BookOpen, Bell, Settings, LogOut, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOutUser } from '@/lib/auth/firebase'
import { useAuth } from '@/lib/auth/context'
import { ScopeTree } from './ScopeTree'

const NAV_ITEMS = [
  { href: '/ask',       label: 'Ask',       icon: MessageSquare, desc: 'Query the knowledge graph' },
  { href: '/graph',     label: 'Graph',     icon: GitFork,       desc: 'Visualize knowledge' },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen,      desc: 'Browse facts & decisions' },
  { href: '/recalls',   label: 'Recalls',   icon: Bell,          desc: 'Scheduled knowledge' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()
  const [scopeOpen, setScopeOpen] = useState(true)

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-[57px] border-b border-border shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-primary fill-current" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
        </div>
        <span className="text-sm font-semibold text-foreground tracking-tight">RavenLoom</span>
      </div>

      {/* Nav */}
      <nav className="px-2 pt-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 h-8 rounded-md text-sm transition-colors',
                active
                  ? 'bg-secondary text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Scope tree */}
      <div className="flex-1 overflow-y-auto mt-4 px-2">
        <button
          onClick={() => setScopeOpen(!scopeOpen)}
          className="flex items-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <ChevronDown
            className={cn('w-3 h-3 transition-transform', !scopeOpen && '-rotate-90')}
          />
          <span className="label-mono">Scopes</span>
        </button>

        {scopeOpen && (
          <div className="mt-1">
            <ScopeTree />
          </div>
        )}
      </div>

      {/* User + settings */}
      <div className="border-t border-border p-3 space-y-1 shrink-0">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-3 h-8 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          Settings
        </Link>
        <button
          onClick={signOutUser}
          className="flex items-center gap-2.5 w-full px-3 h-8 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          Sign out
        </button>

        {user && (
          <div className="flex items-center gap-2.5 px-3 pt-1 mt-1 border-t border-border">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? 'User'}
                className="w-6 h-6 rounded-full shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-xs text-primary font-medium">
                  {user.email?.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
          </div>
        )}
      </div>
    </div>
  )
}
