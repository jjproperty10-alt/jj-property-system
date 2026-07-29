/**
 * /partner/[slug]/statement — VS-1A Investor Statement Preview
 *
 * Server Component. Uses orchestrateStatementRequest() (HB5) for enforced
 * auth ordering: authenticate → resolve target → validate property → build preview.
 *
 * HB7: Property selection is explicit. Uses searchParams.property when provided,
 *       otherwise falls back to single-property targets only.
 *       Never uses first-element blindly.
 *
 * VS-1A scope: read-only preview only. No mutations. No draft creation.
 * "Finalize & Lock" button is always disabled.
 *
 * @see orchestrateStatementRequest — enforced auth ordering (HB5)
 * @see StatementPreview component — client component for rendering
 * @see D-VS01-1: Option A — Partner Workspace, NOT Owners Room
 * @see D-VS01-2: H1 2026 = 2026-01-01 to 2026-06-30
 * @see D-VS01-3: Opening Balance = NULL / PENDING_RECONCILIATION
 * @see D-VS01-4: Code + tests only, no production draft
 */

import 'server-only'
import { redirect, notFound } from 'next/navigation'
import { orchestrateStatementRequest } from '@/lib/statements/statementAuthService'
import { buildStatementPreview } from '@/lib/statements/statementBuilderService'
import { StatementPreview } from '@/components/partner/StatementPreview'

export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
  searchParams: { property?: string }
}

/** H1 2026 period boundaries (D-VS01-2) */
const PERIOD_START = '2026-01-01'
const PERIOD_END = '2026-06-30'

export default async function StatementPage({ params, searchParams }: Props) {
  // ── Orchestrated auth + resolution (HB5 + HB7) ───────────────────────────
  const result = await orchestrateStatementRequest(
    params.slug,
    searchParams.property,  // HB7: explicit property selection from URL
  )

  if (!result.ok) {
    switch (result.error.step) {
      case 'authenticate':
        if (result.error.error === 'NO_SESSION') {
          redirect('/login')
        }
        // NOT_STAFF, STAFF_INACTIVE, AUTH_ERROR → 404
        notFound()
        break  // unreachable, satisfies TS
      case 'resolve_target':
      case 'validate_property':
        notFound()
        break  // unreachable, satisfies TS
    }
  }

  // ── Build statement preview ───────────────────────────────────────────────
  const output = await buildStatementPreview({
    investorEntityId: result.target.entityId,
    investorName: result.target.canonicalName,
    propertyName: result.propertyName,  // HB7: validated property name
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <a
            href={`/partner/${params.slug}`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to Partner Report
          </a>
        </div>
        <StatementPreview output={output} />
      </div>
    </div>
  )
}
