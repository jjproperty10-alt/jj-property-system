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
import { KpiCard, MoneyValue, UnknownValue, EmptyState, DataTable, AttentionBanner } from '@/components/ds'
import type { DataTableColumn } from '@/components/ds'
import type { OwnerFinancialDTO, OwnerFinancialRowDTO, OwnerOverallNetDTO, OccupancyPositionDTO, PropertyFinancialGroupDTO } from '@/lib/owners/ownerWorkspaceTypes'
import { DateRangePicker } from '@/components/owners/DateRangePicker'

export interface FinancialTabProps {
  dto: OwnerFinancialDTO
  periodLabel?: string
  ownerSlug: string
  fromDate: string | null
  toDate: string | null
}

export function FinancialTab({ dto, periodLabel, ownerSlug, fromDate, toDate }: FinancialTabProps) {
  const { position, overallNet, sections, propertyGroups, timeline, occupancyPosition, historicalSummary } = dto

  // Three-state financial display:
  // A. No Data — overallNet null, no sections, no occupancy → Empty State only
  // B. Needs Review — overallNet.reviewStatus='needs_review' → warning banner
  // C. Valid Data — normal 6 KPI cards
  const hasPropertyGroups = propertyGroups != null && propertyGroups.length > 0
  const hasAnyFinancialContent = sections.length > 0 || occupancyPosition != null || hasPropertyGroups
  const noFinancialData = overallNet === null && !hasAnyFinancialContent
  const summaryUnderReview = overallNet?.reviewStatus === 'needs_review'
  const hasHistoricalOnly = noFinancialData && historicalSummary != null

  // Derive the authoritative closing balance from Overall Net (must reconcile)
  const closingBalanceFromNet = overallNet && overallNet.reviewStatus !== 'needs_review'
    ? overallNet.displayAmountEur
    : null

  return (
    <div className="space-y-6">

      {/* Date range picker */}
      <DateRangePicker
        ownerSlug={ownerSlug}
        fromDate={fromDate}
        toDate={toDate}
        periodLabel={periodLabel ?? 'All History'}
      />

      {/* Current financial position — only when overallNet provides computed values */}
      {overallNet != null && (
        <section aria-labelledby="fin-position-heading">
          <h2 id="fin-position-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {periodLabel === 'All History' ? 'All History - Financial Position' : 'Current Financial Position'}
          </h2>
          {summaryUnderReview ? (
            <AttentionBanner
              type="warning"
              title="Financial summary is pending review"
              description="The overall position for this owner includes items that are not yet fully reconciled. Category breakdowns are shown below for reference."
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <MoneyKpi label="Money Received" value={position.incomeEur} />
              <MoneyKpi label="Money Paid (Expenses)" value={position.expensesEur} />
              <MoneyKpi label="Paid to Owner" value={position.paidToOwnerEur} />
              <MoneyKpi label="Net" value={position.netEur} />
              <KpiCard
                label="Closing Balance"
                value={
                  closingBalanceFromNet != null
                    ? <MoneyValue amount={parseFloat(closingBalanceFromNet)} size="lg" />
                    : <UnknownValue reason="Settlement Engine (RC2) — not yet computed" />
                }
              />
            </div>
          )}
        </section>
      )}

      {/* Property-grouped breakdown (per-property with Property Net) */}
      {hasPropertyGroups && (
        <section aria-labelledby="fin-properties-heading">
          <h2 id="fin-properties-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Breakdown by Property
          </h2>
          <div className="space-y-6">
            {propertyGroups!.map(group => (
              <PropertyGroup key={group.propertyName} group={group} periodLabel={periodLabel} />
            ))}
          </div>
        </section>
      )}

      {/* Flat sections fallback (when propertyGroups not available) */}
      {!hasPropertyGroups && sections.length > 0 && (
        <section aria-labelledby="fin-sections-heading">
          <h2 id="fin-sections-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Breakdown by Category
          </h2>
          <div className="space-y-4">
            {sections.map(section => (
              <FinancialSection key={`${section.type}-${section.propertyName ?? 'na'}`} section={section} periodLabel={periodLabel} />
            ))}
          </div>
        </section>
      )}

      {noFinancialData && !hasHistoricalOnly && (
        <EmptyState
          icon="💶"
          title="No financial data available"
          description="Financial data will appear here once RC3 views are connected to this owner."
        />
      )}

      {hasHistoricalOnly && (
        <HistoricalAvailability summary={historicalSummary!} periodLabel={periodLabel ?? 'this period'} />
      )}

      {/* Owner Summary (property-grouped view with per-property nets) */}
      {overallNet && hasPropertyGroups && (
        <OwnerSummary overallNet={overallNet} propertyGroups={propertyGroups!} />
      )}

      {/* Legacy Overall Net (flat view fallback) */}
      {overallNet && !hasPropertyGroups && <OverallNetRelationship overallNet={overallNet} />}

      {/* Occupancy Position — personal occupancy obligations (Oshrit) */}
      {occupancyPosition && <OccupancySection position={occupancyPosition} />}

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

function FinancialSection({ section, periodLabel }: { section: OwnerFinancialDTO['sections'][number]; periodLabel?: string }) {
  const DIR: Record<'due_to_jj' | 'due_to_you' | 'settled' | 'internal', { label: string; cls: string }> = {
    due_to_jj:  { label: 'Due to JJ',  cls: 'text-red-700 bg-red-50 border-red-200' },
    due_to_you: { label: 'Due to You', cls: 'text-green-700 bg-green-50 border-green-200' },
    settled:    { label: 'Settled',    cls: 'text-gray-600 bg-gray-50 border-gray-200' },
    internal:   { label: 'JJ Internal', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  }
  const dir = section.ownerDirection ? DIR[section.ownerDirection] : null
  const columns: DataTableColumn[] = [
    { key: 'date',        label: 'Date',        dir: 'ltr' },
    { key: 'description', label: 'Description' },
    { key: 'amountEur',   label: 'Amount',      align: 'right', dir: 'ltr' },
    { key: 'evidenceRef', label: 'Evidence' },
  ]

  const rows: Record<string, ReactNode>[] = section.rows.map((row: OwnerFinancialRowDTO) => {
    const isRef = row.isReference === true
    const textCls = isRef ? 'text-sm text-gray-400 italic' : 'text-sm text-gray-900'
    const dateCls = isRef ? 'text-sm text-gray-400 italic' : 'text-sm text-gray-600'
    return {
      date: (
        <time dateTime={row.date} dir="ltr" className={dateCls}>
          {formatDate(row.date)}
        </time>
      ),
      description: <span className={textCls}>{row.description}{isRef ? ' (Reference)' : ''}</span>,
      amountEur: row.amountEur != null ? (
        <span className={isRef ? 'opacity-50' : ''}>
          <MoneyValue amount={parseFloat(row.amountEur)} size="sm" />
        </span>
      ) : (
        <UnknownValue reason="Amount unknown" />
      ),
      evidenceRef: row.evidenceRef ? (
        <a href={row.evidenceRef} className="text-xs text-blue-600 hover:underline">View →</a>
      ) : (
        <span className="text-xs text-gray-300">{'—'}</span>
      ),
    }
  })

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800 truncate min-w-0">
          {section.label}
          {section.propertyName ? <span className="text-gray-500 font-normal"> · {section.propertyName}</span> : null}
          {periodLabel ? <span className="text-gray-400 font-normal"> · {periodLabel}</span> : null}
        </h3>
        <div className="flex items-center gap-3 text-sm shrink-0">
          {dir && section.ownerDirectionAmountEur != null ? (
            <span className={`text-xs border rounded px-2 py-0.5 font-medium ${dir.cls}`}>
              {dir.label} <MoneyValue amount={parseFloat(section.ownerDirectionAmountEur)} size="sm" />
            </span>
          ) : null}
          {!dir && (section.type === 'sale' ? (
            <span className="text-gray-500">
              {section.closingBalanceEur != null && parseFloat(section.closingBalanceEur) === 0
                ? <span className="font-medium text-green-700">Settled · €0</span>
                : <>Balance: {section.closingBalanceEur != null
                    ? <MoneyValue amount={parseFloat(section.closingBalanceEur)} size="sm" />
                    : '—'}</>}
            </span>
          ) : (
            <span className="text-gray-500">
              Net: {section.netEur != null
                ? <MoneyValue amount={parseFloat(section.netEur)} size="sm" />
                : '—'}
            </span>
          ))}
        </div>
      </div>
      {/* Opening balance (visible only when custom date range produces non-zero OB) */}
      {section.openingBalanceEur != null && parseFloat(section.openingBalanceEur) !== 0 && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
          <span>Opening Balance</span>
          <MoneyValue amount={parseFloat(section.openingBalanceEur)} size="sm" />
        </div>
      )}
      {/* Display note (e.g. JJ Internal Acquisition for NEEDS_REVIEW purchase sections) */}
      {section.displayNote && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
          {section.displayNote}
        </div>
      )}

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

function OverallNetRelationship({ overallNet }: { overallNet: OwnerOverallNetDTO }) {
  const labelText: Record<OwnerOverallNetDTO['label'], string> = {
    due_to_jj:  'Due to JJ',
    due_to_you: 'Due to You',
    settled:    'Settled',
  }

  const labelColor: Record<OwnerOverallNetDTO['label'], string> = {
    due_to_jj:  'text-red-700 bg-red-50 border-red-200',
    due_to_you: 'text-green-700 bg-green-50 border-green-200',
    settled:    'text-gray-700 bg-gray-50 border-gray-200',
  }

  // Production guard: when reviewStatus is set, show a review banner
  // instead of potentially incorrect numeric values
  if (overallNet.reviewStatus === 'needs_review') {
    return (
      <section aria-labelledby="fin-net-heading">
        <h2 id="fin-net-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Overall Net Relationship
        </h2>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-600 text-lg flex-shrink-0">⚠</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">Needs Review</p>
              <p className="text-sm text-amber-700 mt-1">
                {overallNet.reviewReason ?? 'The amounts shown for this owner are incomplete and under review.'}
              </p>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="fin-net-heading">
      <h2 id="fin-net-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Overall Net Relationship
      </h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Department balances */}
        <div className="divide-y divide-gray-100">
          {overallNet.departments.map(dept => (
            <div key={dept.type} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-700">{dept.label}</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded border ${labelColor[dept.label_status]}`}>
                  {labelText[dept.label_status]}
                </span>
                <span className="text-sm font-medium text-gray-900 tabular-nums" dir="ltr">
                  {dept.label_status === 'settled'
                    ? '€0'
                    : <MoneyValue amount={parseFloat(dept.displayAmountEur)} size="sm" />}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Overall net summary */}
        <div className={`flex items-center justify-between px-4 py-4 border-t-2 border-gray-300 ${
          overallNet.label === 'due_to_jj' ? 'bg-red-50' :
          overallNet.label === 'due_to_you' ? 'bg-green-50' : 'bg-gray-50'
        }`}>
          <span className="text-sm font-semibold text-gray-900">Overall Net</span>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${labelColor[overallNet.label]}`}>
              {labelText[overallNet.label]}
            </span>
            <span className="text-lg font-bold text-gray-900 tabular-nums" dir="ltr">
              {overallNet.label === 'settled'
                ? '€0'
                : <MoneyValue amount={parseFloat(overallNet.displayAmountEur)} size="lg" />}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function PropertyGroup({ group, periodLabel }: { group: PropertyFinancialGroupDTO; periodLabel?: string }) {
  const DIR: Record<'due_to_jj' | 'due_to_you' | 'settled' | 'internal', { label: string; cls: string }> = {
    due_to_jj:  { label: 'Due to JJ',  cls: 'text-red-700 bg-red-50 border-red-200' },
    due_to_you: { label: 'Due to You', cls: 'text-green-700 bg-green-50 border-green-200' },
    settled:    { label: 'Settled',    cls: 'text-gray-600 bg-gray-50 border-gray-200' },
    internal:   { label: 'JJ Internal', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  }
  const dir = DIR[group.propertyNet.label] ?? DIR.settled

  return (
    <details open className="border border-gray-200 rounded-lg overflow-hidden group/prop">
      {/* Property heading — click to collapse/expand */}
      <summary className="px-4 py-3 bg-gray-100 border-b border-gray-200 cursor-pointer list-none flex items-center justify-between [&::-webkit-details-marker]:hidden">
        <h3 className="text-sm font-bold text-gray-900">{group.propertyName}</h3>
        <div className="flex items-center gap-3">
          <span className={`text-xs border rounded px-2 py-0.5 font-medium ${dir.cls}`}>
            {dir.label}
          </span>
          <span className="text-sm font-bold text-gray-900 tabular-nums" dir="ltr">
            {group.propertyNet.label === 'settled'
              ? '€0'
              : <MoneyValue amount={parseFloat(group.propertyNet.displayAmountEur)} size="sm" />}
          </span>
          <span className="text-gray-400 text-xs transition-transform group-open/prop:rotate-180">▼</span>
        </div>
      </summary>

      {/* Category sections within property */}
      <div className="space-y-0 divide-y divide-gray-100">
        {group.sections.map(section => (
          <FinancialSection
            key={`${section.type}-${group.propertyName}`}
            section={section}
            periodLabel={periodLabel}
          />
        ))}
      </div>

      {/* Property Net footer */}
      <div className={`flex items-center justify-between px-4 py-3 border-t-2 border-gray-300 ${
        group.propertyNet.label === 'due_to_jj' ? 'bg-red-50' :
        group.propertyNet.label === 'due_to_you' ? 'bg-green-50' : 'bg-gray-50'
      }`}>
        <span className="text-sm font-semibold text-gray-800">Property Net</span>
        <div className="flex items-center gap-3">
          {group.hasPurchaseExclusion && (
            <span className="text-xs text-gray-500 italic">Purchase excluded (JJ internal)</span>
          )}
          {group.hasNeedsReviewPurchase && (
            <span className="text-xs text-amber-700 font-medium">Needs Review</span>
          )}
          <span className={`text-xs border rounded px-2 py-0.5 font-medium ${dir.cls}`}>
            {dir.label}
          </span>
          <span className="text-sm font-bold text-gray-900 tabular-nums" dir="ltr">
            {group.propertyNet.label === 'settled'
              ? '€0'
              : <MoneyValue amount={parseFloat(group.propertyNet.displayAmountEur)} size="sm" />}
          </span>
        </div>
      </div>
    </details>
  )
}

function OwnerSummary({ overallNet, propertyGroups }: { overallNet: OwnerOverallNetDTO; propertyGroups: PropertyFinancialGroupDTO[] }) {
  const labelText: Record<OwnerOverallNetDTO['label'], string> = {
    due_to_jj:  'Due to JJ',
    due_to_you: 'Due to You',
    settled:    'Settled',
  }

  const labelColor: Record<OwnerOverallNetDTO['label'], string> = {
    due_to_jj:  'text-red-700 bg-red-50 border-red-200',
    due_to_you: 'text-green-700 bg-green-50 border-green-200',
    settled:    'text-gray-700 bg-gray-50 border-gray-200',
  }

  // Production guard: needs_review banner
  if (overallNet.reviewStatus === 'needs_review') {
    return (
      <section aria-labelledby="fin-summary-heading">
        <h2 id="fin-summary-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Owner Summary
        </h2>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-600 text-lg flex-shrink-0">{'⚠'} </span>
            <div>
              <p className="text-sm font-semibold text-amber-800">Needs Review</p>
              <p className="text-sm text-amber-700 mt-1">
                {overallNet.reviewReason ?? 'The amounts shown for this owner are incomplete and under review.'}
              </p>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="fin-summary-heading">
      <h2 id="fin-summary-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Owner Summary
      </h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Per-property net lines */}
        <div className="divide-y divide-gray-100">
          {propertyGroups.map(group => (
            <div key={group.propertyName} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-700">{group.propertyName}</span>
              <div className="flex items-center gap-2">
                {group.hasPurchaseExclusion && (
                  <span className="text-xs text-gray-400 italic">Purchase excl.</span>
                )}
                {group.hasNeedsReviewPurchase && (
                  <span className="text-xs text-amber-600 font-medium">Needs Review</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded border ${labelColor[group.propertyNet.label]}`}>
                  {labelText[group.propertyNet.label]}
                </span>
                <span className="text-sm font-medium text-gray-900 tabular-nums" dir="ltr">
                  {group.propertyNet.label === 'settled'
                    ? '€0'
                    : <MoneyValue amount={parseFloat(group.propertyNet.displayAmountEur)} size="sm" />}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Overall net summary */}
        <div className={`flex items-center justify-between px-4 py-4 border-t-2 border-gray-300 ${
          overallNet.label === 'due_to_jj' ? 'bg-red-50' :
          overallNet.label === 'due_to_you' ? 'bg-green-50' : 'bg-gray-50'
        }`}>
          <span className="text-sm font-semibold text-gray-900">Overall Net</span>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${labelColor[overallNet.label]}`}>
              {labelText[overallNet.label]}
            </span>
            <span className="text-lg font-bold text-gray-900 tabular-nums" dir="ltr">
              {overallNet.label === 'settled'
                ? '€0'
                : <MoneyValue amount={parseFloat(overallNet.displayAmountEur)} size="lg" />}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function OccupancySection({ position }: { position: OccupancyPositionDTO }) {
  const outstanding = parseFloat(position.outstandingEur)

  return (
    <section aria-labelledby="fin-occupancy-heading">
      <h2 id="fin-occupancy-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Personal Occupancy — {position.propertyName}
      </h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Summary header */}
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-blue-600 text-sm">🏠</span>
            <span className="text-sm font-semibold text-blue-900">
              €{position.monthlyAmountEur}/month since {formatDate(position.effectiveFrom)}
            </span>
          </div>
          <p className="text-xs text-blue-700">
            Economic bearer: Yossi (personal obligation — not JJ company expense)
          </p>
        </div>

        {/* Position KPIs */}
        <div className="grid grid-cols-3 gap-px bg-gray-100">
          <div className="bg-white px-4 py-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Total Obligated</div>
            <div className="text-sm font-semibold text-gray-900 tabular-nums" dir="ltr">
              <MoneyValue amount={parseFloat(position.totalObligatedEur)} size="sm" />
            </div>
            <div className="text-xs text-gray-400">{position.totalObligations} months</div>
          </div>
          <div className="bg-white px-4 py-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Settled</div>
            <div className="text-sm font-semibold text-green-700 tabular-nums" dir="ltr">
              <MoneyValue amount={parseFloat(position.totalSettledEur)} size="sm" />
            </div>
            <div className="text-xs text-gray-400">{position.settledCount} months</div>
          </div>
          <div className="bg-white px-4 py-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Outstanding</div>
            <div className={`text-sm font-semibold tabular-nums ${outstanding > 0 ? 'text-red-700' : 'text-gray-900'}`} dir="ltr">
              <MoneyValue amount={outstanding} size="sm" />
            </div>
            <div className="text-xs text-gray-400">{position.openCount} months</div>
          </div>
        </div>

        {/* Settlement breakdown by payer (P-ARCH-2: identity preservation) */}
        <div className="px-4 py-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-2">Settlement Breakdown by Payer</div>
          <div className="flex gap-4 text-sm">
            {parseFloat(position.settledByJjEur) > 0 && (
              <span className="text-gray-700">
                JJ: <span className="font-medium tabular-nums" dir="ltr">€{position.settledByJjEur}</span>
              </span>
            )}
            {parseFloat(position.settledByJacobEur) > 0 && (
              <span className="text-gray-700">
                Jacob: <span className="font-medium tabular-nums" dir="ltr">€{position.settledByJacobEur}</span>
              </span>
            )}
            {parseFloat(position.settledByYossiEur) > 0 && (
              <span className="text-gray-700">
                Yossi: <span className="font-medium tabular-nums" dir="ltr">€{position.settledByYossiEur}</span>
              </span>
            )}
          </div>
        </div>

        {/* Needs Review guard */}
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200">
          <div className="flex items-start gap-2">
            <span className="text-amber-600 text-sm flex-shrink-0">⚠</span>
            <p className="text-xs text-amber-700">
              Occupancy obligations are tracked but not yet integrated into the settlement engine.
              Outstanding amounts are not subtracted from the Overall Net until the partner
              current-account ledger is implemented.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function HistoricalAvailability({ summary, periodLabel }: { summary: NonNullable<OwnerFinancialDTO['historicalSummary']>; periodLabel: string }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="text-blue-600 text-lg flex-shrink-0">i</span>
        <div>
          <p className="text-sm font-semibold text-blue-800">No financial activity found for {periodLabel}</p>
          <p className="text-sm text-blue-700 mt-1">
            {summary.rowCount} historical transactions
            <br />Historical activity: {summary.earliestDate} - {summary.latestDate}
          </p>
          <a
            href="?tab=financial"
            className="inline-block mt-2 text-sm text-blue-700 font-medium hover:underline"
          >
            View all history
          </a>
        </div>
      </div>
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
