/**
 * /owners/[slug]/statement — Context-Aware Statement Route (Stage 2)
 *
 * Server Component. Connects to both management and investment statement
 * pipelines through Stage 0's context resolver.
 *
 * Architecture:
 *   authenticateStatementUser() → resolveStatementContexts(slug) →
 *   context branching → correct pipeline → correct component
 *
 * Context routing:
 *   - Management context → ownerFinancialService.getFinancial() → FinancialTab
 *   - Investment context → loadPartnerStatementForEntity() → PartnerReport
 *   - Both contexts → inline selector via ?context=management|investment
 *
 * Auth: staff-only via authenticateStatementUser() (HB5).
 *   Fail closed before rendering any content.
 *
 * Stage 0: statementContextResolver provides context resolution.
 * Stage 1: loadPartnerStatementForEntity provides entity-based loading.
 * Stage 2: this file connects everything.
 *
 * Old pipeline (statementAuthService.orchestrate*, statementBuilderService,
 * partner/StatementPreview, owners/ConstitutionalTrace*) is preserved —
 * consumed by /partner/[slug]/statement and tests. Not deleted.
 *
 * @see resolveStatementContexts — Stage 0 context resolution
 * @see loadPartnerStatementForEntity — Stage 1 entity-based loading
 * @see FinancialTab — management rendering (REUSE)
 * @see PartnerReport — investment rendering (REUSE)
 */

import 'server-only'
import { redirect, notFound } from 'next/navigation'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import {
  resolveStatementContexts,
  type ManagedOwnerStatementContext,
  type InvestmentStatementContext,
  type StatementContextResolution,
} from '@/lib/statements/statementContextResolver'
import {
  resolveRouteDecision,
  parseContextParam as parseCtxParam,
} from '@/lib/statements/statementRouteDecision'
import { getFinancial } from '@/lib/owners/ownerFinancialService'
import { loadPartnerStatementForEntity } from '@/lib/lifecycle/partnerStatementService'
import { FinancialTab } from '@/components/owners/tabs/FinancialTab'
import { PartnerReport } from '@/components/partner/PartnerReport'
import type { PartnerFacingStatementDTO } from '@/lib/lifecycle/partnerStatementTypes'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Props {
  params: { slug: string }
  searchParams: { context?: string }
}

// ─────────────────────────────────────────────────────────────
// Error UI (inline — no new components)
// ─────────────────────────────────────────────────────────────

function StatementUnavailable({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md text-center px-6">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Statement Unavailable</h1>
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  )
}

function StatementError({ message, retryable }: { message: string; retryable?: boolean }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md text-center px-6">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">
          {retryable ? 'Temporarily Unavailable' : 'Statement Error'}
        </h1>
        <p className="text-sm text-gray-600">{message}</p>
        {retryable && (
          <p className="text-xs text-gray-400 mt-2">Please try again in a few moments.</p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Context selector (inline — no new components)
// ─────────────────────────────────────────────────────────────

function ContextSelector({
  slug,
  managedCtx,
  investmentCtx,
}: {
  slug: string
  managedCtx: ManagedOwnerStatementContext
  investmentCtx: InvestmentStatementContext
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <div className="mb-8">
          <a
            href={`/owners/${slug}?tab=financial`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            &larr; Back to Financial
          </a>
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          {managedCtx.canonicalName}
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          This owner has both management and investment relationships. Select a statement type:
        </p>

        <div className="space-y-4">
          {/* Management option */}
          <a
            href={`/owners/${slug}/statement?context=management`}
            className="block rounded-lg border border-gray-200 bg-white p-6 hover:border-blue-300 hover:shadow-sm transition-colors"
          >
            <h2 className="text-base font-medium text-gray-900 mb-1">
              Owner Management Statement
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              Financial summary of managed properties — income, expenses, payments.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {managedCtx.managedProperties.map(name => (
                <span
                  key={name}
                  className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                >
                  {name}
                </span>
              ))}
            </div>
          </a>

          {/* Investment option */}
          <a
            href={`/owners/${slug}/statement?context=investment`}
            className="block rounded-lg border border-gray-200 bg-white p-6 hover:border-blue-300 hover:shadow-sm transition-colors"
          >
            <h2 className="text-base font-medium text-gray-900 mb-1">
              Investment Statement
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              Partner investment report — capital, ownership, financial position.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {investmentCtx.investmentProperties.map(name => (
                <span
                  key={name}
                  className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                >
                  {name}
                </span>
              ))}
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Management pipeline renderer
// ─────────────────────────────────────────────────────────────

async function renderManagementStatement(
  slug: string,
  ctx: ManagedOwnerStatementContext,
) {
  const dto = await getFinancial({
    properties: ctx.managedProperties,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <a
            href={`/owners/${slug}?tab=financial`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            &larr; Back to Financial
          </a>
        </div>
        <FinancialTab dto={dto} ownerSlug={slug} fromDate={null} toDate={null} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Investment pipeline renderer
// ─────────────────────────────────────────────────────────────

async function renderInvestmentStatement(
  slug: string,
  ctx: InvestmentStatementContext,
  resolution: StatementContextResolution,
) {
  const dto = await loadPartnerStatementForEntity({
    entityId: ctx.entityId,
    canonicalName: ctx.canonicalName,
    propertyNames: ctx.investmentProperties,
    entityType: resolution.entityType ?? undefined,
    slug,
  })

  if (!dto) {
    return (
      <StatementError message="Could not load investment statement data. The reporting engine returned no results for this entity." />
    )
  }

  // Narrow to PartnerFacingStatementDTO (default viewMode='partner')
  if (dto.meta.viewMode !== 'partner') {
    return (
      <StatementError message="Unexpected statement type returned. Expected partner-facing statement." />
    )
  }

  const partnerDto = dto as PartnerFacingStatementDTO

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <a
            href={`/owners/${slug}?tab=financial`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            &larr; Back to Financial
          </a>
        </div>
        <PartnerReport dto={partnerDto} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default async function OwnerStatementPage({ params, searchParams }: Props) {
  const { slug } = params
  const requestedContext = parseCtxParam(searchParams.context)

  // ── Step 1: Staff authentication (fail closed) ────────────────────────────
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      redirect('/login')
    }
    // NOT_STAFF, STAFF_INACTIVE, AUTH_ERROR → 404
    notFound()
  }

  // ── Step 2: Context resolution (Stage 0) ──────────────────────────────────
  const resolution = await resolveStatementContexts(slug)

  // ── Step 3: Pure decision (extracted for testability) ─────────────────────
  const decision = resolveRouteDecision(resolution, requestedContext)

  // ── Step 4: Act on decision ───────────────────────────────────────────────
  switch (decision.action) {
    case 'not_found':
      notFound()
      // eslint-disable-next-line no-fallthrough
    case 'error':
      return <StatementError message={decision.message} />
    case 'unavailable':
      return <StatementUnavailable message={decision.message} />
    case 'retryable_error':
      return <StatementError message={decision.message} retryable />
    case 'invalid_context':
      return <StatementUnavailable message={decision.message} />
    case 'render_management':
      return renderManagementStatement(slug, decision.ctx)
    case 'render_investment':
      return renderInvestmentStatement(slug, decision.ctx, decision.resolution)
    case 'show_selector':
      return (
        <ContextSelector
          slug={slug}
          managedCtx={decision.managedCtx}
          investmentCtx={decision.investmentCtx}
        />
      )
  }
}
