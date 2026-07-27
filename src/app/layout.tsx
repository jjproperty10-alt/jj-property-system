/**
 * Root layout — minimal shell.
 *
 * Provides <html>, <body>, and globals.css only.
 * No OperatingFrame here — that lives in (app)/layout.tsx.
 *
 * This separation (BLOCKER 2 resolution) ensures:
 *   - Internal routes (/home, /owners, /finance, /) → (app)/layout.tsx → OperatingFrame
 *   - Partner routes (/partner/[slug]) → root layout only → no sidebar, no internal nav
 *
 * The route group `(app)` is transparent to URLs — no URL change.
 *
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — Contract A (OperatingFrame)
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract A-F7 (external isolation)
 */

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'JJ Property 10',
  description: 'Real Estate Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
