import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { headers } from 'next/headers'

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]

  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

export async function verifyAuthToken(): Promise<{ uid: string; email?: string } | null> {
  try {
    const headersList = await headers()
    const authHeader = headersList.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return null

    const token = authHeader.slice(7)
    const adminApp = getAdminApp()
    const decoded = await getAuth(adminApp).verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email }
  } catch {
    return null
  }
}

export async function requireAuth() {
  const user = await verifyAuthToken()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}
