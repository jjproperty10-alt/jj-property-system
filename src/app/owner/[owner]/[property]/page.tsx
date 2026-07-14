/**
 * /owner/[owner]/[property] — Property Detail page
 * Phase 2-B — 2026-07-13
 *
 * Server Component. Fetches a single property's settlement data via the Orchestrator.
 * Layout: Your Share (hero) → Project View (collapsible) → Ownership Structure → Links
 *
 * Navigation:
 *   ← Back to portfolio: /owner/[owner]
 *   Full Financial Statement: /client-report-rc3 (user selects property)
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOwnerProperty } from '@/lib/ownership/orchestrator'
import { OwnerShareSection } from '@/components/owner/OwnerShareSection'
import { ProjectViewSection } from '@/components/owner/ProjectViewSection'
import { OwnershipStructure } from '@/components/owner/OwnershipStructure'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

interface Props {
  params: { owner: string; property: string }
}

export default async function OwnerPropertyPage({ params }: Props) {
  const ownerName = decodeURIComponent(params.owner)
  const propertyName = decodeURIComponent(params.property)

  const result = await getOwnerProperty(ownerName, propertyName)

  if (!result) notFound()

  const { settlement } = result

  const isReceivable = settlement.direction === 'payable_to_owner'
  const isPayable = settlement.direction === 'payable_to_jj'

  const dirColor = isReceivable ? 'text-green-300' : isPayable ? 'text-red-300' : 'text-white'
  const dirLabel = isReceivable ? 'JJ owes you' : isPayable ? 'You owe JJ' : 'Settled'

  const ownerSlug = encodeURIComponent(ownerName)

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-[#1e3a5f] text-white px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <Link
            href={`/owner/${ownerSlug}`}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 hover:text-blue-300 transition-colors mb-1"
          >
            ← Portfolio
          </Link>
          <h1 className="text-lg font-bold tracking-wide leading-tight">
            {propertyName}
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {settlement.hasOwnershipRecords && (
              <span className="text-blue-300 text-sm">
                {settlement.ownershipPct}% · Partnership
              </span>
            )}
            <span className={`text-sm font-semibold ${dirColor}`}>
              {EUR(Math.abs(settlement.ownerAdjustedBalance))} · {dirLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Your Share — hero */}
        <OwnerShareSection settlement={settlement} />

        {/* Project View (100%) — collapsible */}
        {settlement.projectAccounts.length > 0 && (
          <ProjectViewSection projectAccounts={settlement.projectAccounts} />
        )}

        {/* Ownership Structure — only for partnership properties */}
        {settlement.hasOwnershipRecords && settlement.ownershipStructure.length > 0 && (
          <OwnershipStructure
            allPartners={settlement.ownershipStructure}
            selectedOwner={ownerName}
          />
        )}

        {/* Action links */}
        <div className="flex items-center gap-3 mt-6 flex-wrap">
          <Link
            href={`/owner/${ownerSlug}/${encodeURIComponent(propertyName)}/timeline`}
            className="px-5 py-2.5 bg-purple-800 text-white text-sm rounded-lg hover:bg-purple-700 font-medium transition-colors"
          >
            Investment Timeline →
          </Link>
          <Link
            href="/client-report-rc3"
            className="px-5 py-2.5 bg-[#1e3a5f] text-white text-sm rounded-lg hover:bg-[#2d5a9e] font-medium transition-colors"
          >
            Full Financial Statement →
          </Link>
          <Link
            href={`/owner/${ownerSlug}`}
            className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            ← Back to Portfolio
          </Link>
        </div>
      </div>
    </div>
  )
            }
