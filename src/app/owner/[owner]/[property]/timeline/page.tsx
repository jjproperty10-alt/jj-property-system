/**
 * /owner/[owner]/[property]/timeline — Investment Timeline page
 *
 * Server Component. Loads InvestmentTimelineDTO via timelineService.
 *
 * Security:
 * - Validates entity+property relationship exists in lifecycle.partner_entry
 *   before returning any data. URL slugs are NOT trusted for authorization.
 * - Returns notFound() when no lifecycle data exists for this combination.
 *   (This is expected for properties without lifecycle records — not an error.)
 *
 * @see timelineService.loadInvestmentTimeline (server-side, service_role)
 * @see M9-A spec: "Server-Side Security" requirements
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadInvestmentTimeline } from '@/lib/lifecycle/timelineService'
import { InvestmentTimeline } from '@/components/owner/InvestmentTimeline'

interface Props {
  params: { owner: string; property: string }
}

export default async function InvestmentTimelinePage({ params }: Props) {
  const ownerName    = decodeURIComponent(params.owner)
  const propertyName = decodeURIComponent(params.property)

  // loadInvestmentTimeline validates the entity+property relationship server-side.
  // Returns null when no lifecycle record exists — show notFound() to avoid
  // leaking which combinations are valid vs. not.
  const dto = await loadInvestmentTimeline(ownerName, propertyName)

  if (!dto) notFound()

  const ownerSlug    = encodeURIComponent(ownerName)
  const propertySlug = encodeURIComponent(propertyName)

  return (
    <div>
      {/* Back navigation */}
      <div className="bg-[#1e3a5f] px-6 py-3 border-b border-blue-900">
        <div className="max-w-3xl mx-auto">
          <Link
            href={`/owner/${ownerSlug}/${propertySlug}`}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Property Overview
          </Link>
        </div>
      </div>

      {/* Timeline */}
      <InvestmentTimeline dto={dto} />
    </div>
  )
}
