'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare, GitFork, BookOpen, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/ask',       label: 'Ask',       icon: MessageSquare },
  { href: '/graph',     label: 'Graph',     icon: GitFork },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/recalls',   label: 'Recalls',   icon: Bell },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="flex border-t border-border bg-background safe-area-bottom">
      {ITEMS.map((item) => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 h-14 transition-colors',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <item.icon className={cn('w-5 h-5', active && 'stroke-[2.5]')} />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
