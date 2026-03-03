import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth/context'

export const metadata: Metadata = {
  title: 'RavenLoom',
  description: 'Context-aware knowledge graph for institutional memory',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#0d0e10',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
