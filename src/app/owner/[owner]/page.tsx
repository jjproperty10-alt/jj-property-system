/**
 * /owner/[owner] — Portfolio Dashboard
 * Phase 2-B — 2026-07-13
 *
 * Server Component. Fetches the full owner portfolio via the Orchestrator.
 * Renders HeroBalance → AlertsPanel → Property Cards → Portfolio Settlement.
 *
 * Entry point for the Owner Portfolio Experience.
 * The /client-report-rc3 report is accessible from the property detail page.
 */

import { notFound } from 'next/navigation'
import { getOwnerPortfolio } from '@/lib/ownership/orchestrator'
import { HeroBalance } from '@/components/owner/HeroBalance'
import { PropertyCard } from '@/components/owner/PropertyCard'
import { AlertsPanel } from '@/components/owner/AlertsPanel'
import { PortfolioSettlement } from '@/components/owner/PortfolioSettlement'

export const dynamic = 'force-dynamic'

interface Props {
  params: { owner: string }
}

export default async function OwnerPortfolioPage({ params }: Props) {
  const ownerName = decodeURIComponent(params.owner)

  let output
  try {
    output = await getOwnerPortfolio(ownerName)
  } catch (err) {
    console.error('[/owner/[owner]] getOwnerPortfolio error:', err)
    throw err
  }

  const { dto } = output

  if (dto.properties.length === 0) {
    // Owner exists but has no properties (or not found in partnership_ownership)
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-[#1e3a5f] text-white px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 mb-0.5">
            JJ Property 10
          </div>
          <h1 className="text-lg font-bold tracking-wide">Owner Portfolio</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Hero balance */}
        <HeroBalance dto={dto} />

        {/* Alerts */}
        <AlertsPanel settlements={dto.properties} />

        {/* Property cards */}
        <div className="mb-6">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">
            Properties
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {dto.properties.map(settlement => (
              <PropertyCard
                key={settlement.propertyName}
                settlement={settlement}
                ownerName={ownerName}
              />
            ))}
          </div>
        </div>

        {/* Portfolio Settlement table */}
        <PortfolioSettlement
          settlements={dto.properties}
          ownerName={ownerName}
          finalNetBalance={dto.finalNetBalance}
          finalDirection={dto.finalDirection}
        />
      </div>
    </div>
  )
    }
