/**
 * Reservations Tab — "How is the rental business performing?"
 *
 * No financial calculation in UI. All values from DTO.
 */

import type { ReactNode } from 'react'
import { KpiCard, MoneyValue, UnknownValue, DataTable, EmptyState } from '@/components/ds'
import type { DataTableColumn } from '@/components/ds'
import type { OwnerReservationSummaryDTO, ReservationRowDTO } from '@/lib/owners/ownerWorkspaceTypes'

export interface ReservationsTabProps {
  dto: OwnerReservationSummaryDTO
}

const STATUS_CONFIG = {
  confirmed: { label: 'Confirmed', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  checked_in: { label: 'Checked In', className: 'text-green-700 bg-green-50 border-green-200' },
  checked_out: { label: 'Checked Out', className: 'text-gray-600 bg-gray-50 border-gray-200' },
  cancelled: { label: 'Cancelled', className: 'text-red-700 bg-red-50 border-red-200' },
  no_show: { label: 'No Show', className: 'text-amber-700 bg-amber-50 border-amber-200' },
}

export function ReservationsTab({ dto }: ReservationsTabProps) {
  const { portfolio, channelMix, reservations } = dto

  const columns: DataTableColumn[] = [
    { key: 'property',  label: 'Property' },
    { key: 'checkIn',   label: 'Check-in',  dir: 'ltr' },
    { key: 'checkOut',  label: 'Check-out', dir: 'ltr' },
    { key: 'nights',    label: 'Nights',    align: 'right', dir: 'ltr' },
    { key: 'channel',   label: 'Channel' },
    { key: 'status',    label: 'Status' },
    { key: 'revenue',   label: 'Revenue',   align: 'right', dir: 'ltr' },
  ]

  const rows: Record<string, ReactNode>[] = reservations.map((r: ReservationRowDTO) => {
    const cfg = STATUS_CONFIG[r.status]
    return {
      property: <span className="text-sm font-medium text-gray-900">{r.propertyName}</span>,
      checkIn:  <time dateTime={r.checkIn}  dir="ltr" className="text-sm text-gray-600">{formatDate(r.checkIn)}</time>,
      checkOut: <time dateTime={r.checkOut} dir="ltr" className="text-sm text-gray-600">{formatDate(r.checkOut)}</time>,
      nights:   <span className="text-sm text-gray-700" dir="ltr">{r.nights}</span>,
      channel:  <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">{r.channel}</span>,
      status:   <span className={`text-xs border rounded px-2 py-0.5 font-medium ${cfg.className}`}>{cfg.label}</span>,
      revenue:  r.revenueEur != null
        ? <MoneyValue amount={parseFloat(r.revenueEur)} size="sm" />
        : <UnknownValue reason="Revenue unknown" />,
    }
  })

  return (
    <div className="space-y-6">

      {/* Portfolio KPIs */}
      <section aria-labelledby="res-kpi-heading">
        <h2 id="res-kpi-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Period Summary · {formatDate(dto.period.startDate)} – {formatDate(dto.period.endDate)}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Reservations" value={<span className="text-2xl font-bold text-gray-900" dir="ltr">{portfolio.totalReservations}</span>} />
          <KpiCard
            label="Occupancy"
            value={
              portfolio.occupancyPct != null
                ? <span className="text-2xl font-bold text-gray-900" dir="ltr">{portfolio.occupancyPct}%</span>
                : <UnknownValue reason="Occupancy not calculated" />
            }
          />
          <KpiCard
            label="Revenue"
            value={portfolio.revenueEur != null ? <MoneyValue amount={parseFloat(portfolio.revenueEur)} size="lg" /> : <UnknownValue reason="Revenue not available" />}
          />
          <KpiCard
            label="ADR"
            value={portfolio.adr != null ? <MoneyValue amount={parseFloat(portfolio.adr)} size="md" /> : <UnknownValue reason="ADR not calculated" />}
          />
          <KpiCard
            label="RevPAR"
            value={portfolio.revPar != null ? <MoneyValue amount={parseFloat(portfolio.revPar)} size="md" /> : <UnknownValue reason="RevPAR not calculated" />}
          />
          <KpiCard label="Cancellations" value={<span className="text-2xl font-bold text-gray-900" dir="ltr">{portfolio.cancellations}</span>} />
        </div>
      </section>

      {/* Channel mix */}
      {channelMix.length > 0 && (
        <section aria-labelledby="res-channels-heading">
          <h2 id="res-channels-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Channel Mix
          </h2>
          <div className="flex flex-wrap gap-3">
            {channelMix.map(ch => (
              <div key={ch.channel} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div className="text-xs text-gray-500 mb-1">{ch.channel}</div>
                <div className="text-lg font-bold text-gray-900" dir="ltr">{ch.count}</div>
                <div className="text-xs text-gray-400 mt-0.5" dir="ltr">{ch.pct}% · {ch.revenueEur != null ? `€${parseFloat(ch.revenueEur).toLocaleString()}` : '—'}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Reservations table */}
      <section aria-labelledby="res-table-heading">
        <h2 id="res-table-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Reservations
        </h2>
        {reservations.length === 0 ? (
          <EmptyState
            icon="🏠"
            title="No reservations in this period"
            description="Reservations will appear here once synced from Hostaway."
          />
        ) : (
          <DataTable columns={columns} rows={rows} />
        )}
      </section>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
