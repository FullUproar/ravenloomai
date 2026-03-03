'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from './firebase'
import { auth } from './firebase'

interface AuthContext {
  user: User | null
  loading: boolean
  teamId: string | null
  setTeamId: (id: string | null) => void
  getToken: () => Promise<string | null>
}

const Ctx = createContext<AuthContext>({
  user: null,
  loading: true,
  teamId: null,
  setTeamId: () => {},
  getToken: async () => null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [teamId, setTeamId] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const saved = localStorage.getItem(`rl_team_${u.uid}`)
        if (saved) {
          setTeamId(saved)
          setLoading(false)
        } else {
          // First login — sync user with backend to get/create team
          try {
            const token = await u.getIdToken()
            const res = await fetch('/api/auth/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                email: u.email ?? '',
                displayName: u.displayName ?? undefined,
                avatarUrl: u.photoURL ?? undefined,
              }),
            })
            if (res.ok) {
              const data = await res.json()
              if (data.team?.id) {
                localStorage.setItem(`rl_team_${u.uid}`, data.team.id)
                setTeamId(data.team.id)
              }
            }
          } catch (err) {
            console.error('[auth] Sync failed:', err)
          } finally {
            setLoading(false)
          }
        }
      } else {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  const handleSetTeamId = (id: string | null) => {
    setTeamId(id)
    if (user && id) localStorage.setItem(`rl_team_${user.uid}`, id)
  }

  const getToken = async () => {
    return auth?.currentUser?.getIdToken() ?? null
  }

  return (
    <Ctx.Provider value={{ user, loading, teamId, setTeamId: handleSetTeamId, getToken }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
