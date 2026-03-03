import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function confidenceLabel(score: number): { label: string; color: string } {
  if (score >= 0.85) return { label: 'High', color: 'text-green-400' }
  if (score >= 0.55) return { label: 'Medium', color: 'text-amber-400' }
  return { label: 'Low', color: 'text-red-400' }
}

export function confidencePercent(score: number): string {
  return `${Math.round(score * 100)}%`
}

export const NODE_TYPE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  PERSON:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  PRODUCT:  { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', dot: 'bg-purple-400' },
  COMPANY:  { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  dot: 'bg-green-400' },
  CONCEPT:  { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  dot: 'bg-amber-400' },
  EVENT:    { bg: 'bg-rose-500/10',   border: 'border-rose-500/30',   text: 'text-rose-400',   dot: 'bg-rose-400' },
  LOCATION: { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   text: 'text-cyan-400',   dot: 'bg-cyan-400' },
  RULE:     { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  DECISION: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', dot: 'bg-orange-400' },
  PROCESS:  { bg: 'bg-teal-500/10',   border: 'border-teal-500/30',   text: 'text-teal-400',   dot: 'bg-teal-400' },
  CUSTOM:   { bg: 'bg-slate-500/10',  border: 'border-slate-500/30',  text: 'text-slate-400',  dot: 'bg-slate-400' },
}

export function getNodeColors(type: string) {
  return NODE_TYPE_COLORS[type.toUpperCase()] ?? NODE_TYPE_COLORS.CUSTOM
}
