import { auth } from './auth/firebase'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth?.currentUser?.getIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(options?.headers as Record<string, string>),
    },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(error || `API error ${res.status}`)
  }
  return res.json()
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path)
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' })
}
