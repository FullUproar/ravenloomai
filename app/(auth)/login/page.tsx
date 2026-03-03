'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithGoogle } from '@/lib/auth/firebase'
import { useAuth } from '@/lib/auth/context'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && user) router.replace('/ask')
  }, [user, loading, router])

  async function handleGoogleSignIn() {
    setIsSigningIn(true)
    setError('')
    try {
      await signInWithGoogle()
      router.replace('/ask')
    } catch (e) {
      setError('Sign in failed. Please try again.')
      setIsSigningIn(false)
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-4">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary fill-current" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">RavenLoom</h1>
          <p className="text-sm text-muted-foreground mt-1">Institutional knowledge, context-aware</p>
        </div>

        {/* Sign in card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-foreground">Sign in to continue</h2>
            <p className="text-xs text-muted-foreground">Your knowledge graph is waiting.</p>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={isSigningIn || loading}
            className={cn(
              'w-full flex items-center justify-center gap-3 h-10 px-4 rounded-lg',
              'bg-secondary border border-border text-sm font-medium text-foreground',
              'hover:bg-secondary/80 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isSigningIn ? (
              <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {isSigningIn ? 'Signing in…' : 'Continue with Google'}
          </button>

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Your knowledge stays private to your organization.
        </p>
      </div>
    </div>
  )
}
