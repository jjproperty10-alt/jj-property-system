/**
 * @module ds/WorkspaceHeader
 * @description NAV-1 — Workspace / page header component.
 *
 * Stability: STABLE
 *
 * Renders a contextual header for any workspace page or PageShell page.
 * Provides title, optional subtitle, optional back navigation, and optional actions slot.
 *
 * Responsibilities:
 *   WH-R1: Display title as <h1>.
 *   WH-R2: Display subtitle when provided.
 *   WH-R3: Render deterministic back navigation (WH-F5: Next.js Link, not history.back()).
 *   WH-R4: Render actions slot.
 *
 * Guarantees:
 *   G1: Title always renders as <h1>.
 *   G2: null subtitle → no subtitle element (P-ARCH-1).
 *   G3: null backRoute → no back button.
 *   G4: null actions → no actions slot.
 *   G5: Never sticky by itself (composing workspace decides stickiness).
 *   G6: Uses only DS v1.0 tokens.
 *
 * Forbidden:
 *   WH-F1: No data fetching.
 *   WH-F2: No business logic.
 *   WH-F3: No attention badge rendering (AttentionLayer responsibility).
 *   WH-F4: No workspace switching UI.
 *   WH-F5: No history.back() — deterministic back navigation via Link.
 *
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — WorkspaceHeader contract
 * @see JJ_DESIGN_SYSTEM_V1.0.md — Part 4 Component Contracts
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────

interface WorkspaceHeaderProps {
  /** Page title — renders as <h1>. Required. */
  title: string
  /** Optional subtitle line below the title. null → not rendered (P-ARCH-1). */
  subtitle?: string | null
  /** Optional back navigation route. null → no back button. */
  backRoute?: string | null
  /** Optional actions slot (buttons, filters, etc.). null → not rendered. */
  actions?: ReactNode | null
}

// ─── Component ──────────────────────────────────────────────────────────

export function WorkspaceHeader({
  title,
  subtitle = null,
  backRoute = null,
  actions = null,
}: WorkspaceHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* G3: back button only when backRoute is provided */}
          {backRoute !== null && (
            <Link
              href={backRoute}
              className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}

          <div className="min-w-0">
            {/* G1: title always <h1> */}
            <h1 className="text-xl font-semibold text-gray-900 truncate">
              {title}
            </h1>

            {/* G2: null subtitle → no element */}
            {subtitle !== null && (
              <p className="text-sm text-gray-500 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* G4: null actions → no slot */}
        {actions !== null && (
          <div className="flex-shrink-0 flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
