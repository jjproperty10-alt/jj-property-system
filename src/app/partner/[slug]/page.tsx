import 'server-only'
import { redirect, notFound } from 'next/navigation'
import { loadStatementForCurrentPartner } from '@/lib/lifecycle/partnerAuthService'
import { PartnerReport } from '@/components/partner/PartnerReport'

export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
}

/**
 * /partner/[slug] — Partner Report Page
 *
 * Server Component. Delegates to loadStatementForCurrentPartner() which:
 *   1. Authenticates via createSupabaseServerClient() (cookie-aware, anon key)
 *   2. Resolves authorized slug → entity using createServiceClient() (service-role)
 *   3. Returns PartnerFacingStatementDTO | AuthorizationFailure
 *
 * Failure discriminant: AuthorizationFailure has { ok: false }; DTO has no 'ok' field.
 *
 * Security:
 *   - NO_SESSION → /login (not a loop: /login does not redirect back to /partner/*)
 *   - All other failures → notFound() — generic 404; never exposes slug validity,
 *     mapping existence, or cross-partner identity details
 *   - Raw AuthorizationError codes are never sent to the browser
 *
 * resolveAndLoadForVerifiedUser() MUST NOT be called from here (internal/test only).
 * P-ARCH-6: no jj_* fields in partner view — enforced by PartnerFacingStatementDTO shape.
 */
export default async function PartnerReportPage({ params }: Props) {
  const result = await loadStatementForCurrentPartner({
    requestedSlug: params.slug,
    viewMode: 'partner',
  })

  // Discriminate on 'ok' field: AuthorizationFailure = { ok: false }; DTO has no 'ok'
  if ('ok' in result) {
    if (result.error === 'NO_SESSION') {
      redirect('/login')
    }
    // All other errors (NO_MAPPING, SLUG_MISMATCH, ENTITY_NOT_FOUND, etc.) → 404
    notFound()
  }

  return <PartnerReport dto={result} />
}
