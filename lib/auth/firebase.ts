import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type Auth, type User } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

function initFirebase(): { app: FirebaseApp; auth: Auth } | null {
  if (!firebaseConfig.apiKey) return null
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
  return { app, auth: getAuth(app) }
}

const _firebase = initFirebase()
export const auth: Auth | null = _firebase?.auth ?? null
export const googleProvider = new GoogleAuthProvider()

export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase not configured')
  return signInWithPopup(auth, googleProvider)
}

export async function signOutUser() {
  if (!auth) throw new Error('Firebase not configured')
  return signOut(auth)
}

export { onAuthStateChanged, type User }

export async function getIdToken(): Promise<string | null> {
  const user = auth?.currentUser
  if (!user) return null
  return user.getIdToken()
}
