/**
 * Financial Tab — "Where is the owner's money?"
 *
 * Rules (OWNER_VERTICAL_SLICE_BRIEF Section 5.2):
 * - All values arrive via props/DTO — no client-side accounting
 * - Cashbox values do NOT appear here (Finance module only)
 * - Null values show UnknownValue, never 0
 * - RC3 engine is source of truth for all amounts
 */

import type { ReactNode } from 'react'
import { KpiCard, MoneyValue, UnknownValue, EmptyState, DataTable } from '@/components/ds'
import type { DataTableColumn } from '@/components/ds'
import type { OwnerFinancialDTO, OwnerFinancialRowDTO } from '@/lib/owners/ownerWorkspaceTypes'

export interface FinancialTabProps {
  dto: OwnerFinancialDTO
}

export function FinancialTab({ dto }: FinancialTabProps) {
  const { position, sections, timeline } = dto

  return (
    <div className="space-y-6">

      {/* Current financial position */}
      <section aria-labelledby="fin-position-heading">
        <h2 id="fin-position-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Current Financial Position
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MoneyKpi label="Money Received" value={position.incomeEur} />
          <MoneyKpi label="Money Paid (Expenses)" value={position.expensesEur} />
          <MoneyKpi label="Paid to Owner" value={position.paidToOwnerEur} />
          <MoneyKpi label="Net" value={position.netEur} />
          <MoneyKpi label="Pending" value={position.pendingEur} />
          <KpiCard
            label="Closing Balance"
            value={
              position.closingBalanceEur != null
                ? <MoneyValue amount={parseFloat(position.closingBalanceEur)} size="lg" />
                : <UnknownValue reason="Settlement Engine (RC2) — not yet computed" />
            }
          />
        </div>
      </section>

      {/* Sections breakdown */}
      {sections.length > 0 && (
        <section aria-labelledby="fin-sections-heading">
          <h2 id="fin-sections-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Breakdown by Category
          </h2>
          <div className="space-y-4">
            {sections.map(section => (
              <FinancialSection key={section.type} section={section} />
            ))}
          </div>
        </section>
      )}

      {sections.length === 0 && (
        <EmptyState
          icon="💶"
          title="No financial data available"
          description="Financial data will appear here once RC3 views are connected to this owner."
        />
      )}

      {/* Financial timeline */}
      {timeline.length > 0 && (
        <section aria-labelledby="fin-timeline-heading">
          <h2 id="fin-timeline-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Financial Timeline
          </h2>
          <div className="space-y-1">
            {timeline.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="text-sm text-gray-800">{item.label}</span>
                  <time className="ml-2 text-xs text-gray-400" dateTime={item.date} dir="ltr">
                    {formatDate(item.date)}
                  </time>
                </div>
                {item.amountEur != null ? (
                  <MoneyValue
                    amount={parseFloat(item.amountEur)}
                    size="sm"
                  />
                ) : (
                  <UnknownValue reason="Amount unknown" />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function MoneyKpi({ label, value }: { label: string; value: string | null }) {
  return (
    <KpiCard
      label={label}
      value={
        value != null
          ? <MoneyValue amount={parseFloat(value)} size="md" />
          : <UnknownValue reason="Not yet computed" />
      }
    />
  )
}

function FinancialSection({ section }: { section: OwnerFinancialDTO['sections'][number] }) {
  const columns: DataTableColumn[] = [
    { key: 'date',        label: 'Date',        dir: 'ltr' },
    { key: 'description', label: 'Description' },
    { key: 'amountEur',   label: 'Amount',      align: 'right', dir: 'ltr' },
    { key: 'evidenceRef', label: 'Evidence' },
  ]

  const rows: Record<string, ReactNode>[] = section.rows.map((row: OwnerFinancialRowDTO) => ({
    date: (
      <time dateTime={row.date} dir="ltr" className="text-sm text-gray-600">
        {formatDate(row.date)}
      </time>
    ),
    description: <span className="text-sm text-gray-900">{row.description}</span>,
    amountEur: row.amountEur != null ? (
      <MoneyValue amount={parseFloat(row.amountEur)} size="sm" />
    ) : (
      <UnknownValue reason="Amount unknown" />
    ),
    evidenceRef: row.evidenceRef ? (
      <a href={row.evidenceRef} className="text-xs text-blue-600 hover:underline">View →</a>
    ) : (
      <span className="text-xs text-gray-300">—</span>
    ),
  }))

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800 capitalize">{section.label}</h3>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            Net: {section.netEur != null
              ? <MoneyValue amount={parseFloat(section.netEur)} size="sm" />
              : '—'}
          </span>
        </div>
      </div>

      {/* Rows */}
      {section.rows.length > 0 ? (
        <DataTable columns={columns} rows={rows} />
      ) : (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          No transactions in this category
        </div>
      )}
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
