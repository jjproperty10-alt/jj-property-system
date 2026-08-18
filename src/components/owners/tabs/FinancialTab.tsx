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
import type {
  OwnerFinancialDTO, OwnerFinancialRowDTO, OwnerOverallNetDTO,
  OccupancyPositionDTO, PropertyFinancialGroupDTO,
  JjInternalViewDTO, JjInternalSectionDTO, JjInternalRowDTO,
  // PR #166 Consolidation types
  FinancialAlertDTO, FinancialCorrectionCaseDTO,
  PaymentAllocationSummaryDTO, BillingStateDTO,
  ReportPresentationConfigDTO,
} from '@/lib/owners/ownerWorkspaceTypes'
import { DateRangePicker } from '@/components/owners/DateRangePicker'
import { BillingToggleButton } from '@/components/owners/BillingToggleButton'
import { ReportActionsBar } from '@/components/owners/ReportActionsBar'

export interface FinancialTabProps {
  dto: OwnerFinancialDTO
  periodLabel?: string
  ownerSlug: string
  fromDate: string | null
  toDate: string | null
}

export function FinancialTab({ dto, periodLabel, ownerSlug, fromDate, toDate }: FinancialTabProps) {
  const { position, overallNet, sections, propertyGroups, timeline, occupancyPosition, historicalSummary,
    alerts, reportConfig, paymentSummary, openCorrectionCases } = dto

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

      {/* PR #166 Gap I+M — Download PDF / Print buttons */}
      {/* Blocker 5: pass propertyName for multi-property owners.
          Single property → backward compatible (no param needed).
          Multi-property → each PropertyGroup gets its own download button below;
          top-level bar renders only for single-property owners. */}
      {(!hasPropertyGroups || propertyGroups!.length === 1) && (
        <div className="flex items-center justify-end">
          <ReportActionsBar
            ownerSlug={ownerSlug}
            lang={reportConfig?.language ?? 'en'}
            reportType="full"
            fromDate={fromDate}
            toDate={toDate}
            propertyName={hasPropertyGroups ? propertyGroups![0].propertyName : null}
          />
        </div>
      )}

      {/* PR #166 — Financial Alerts */}
      {alerts != null && alerts.length > 0 && <AlertsBanner alerts={alerts} />}

      {/* PR #166 — Report language indicator */}
      {reportConfig && reportConfig.language !== 'en' && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded px-3 py-1.5 border border-gray-200" dir={reportConfig.isRtl ? 'rtl' : 'ltr'}>
          <span>{reportConfig.language === 'he' ? '🇮🇱' : '🌍'}</span>
          <span>Report language: {reportConfig.language === 'he' ? 'Hebrew (RTL)' : String(reportConfig.language).toUpperCase()}</span>
        </div>
      )}

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
              <PropertyGroup
                key={group.propertyName}
                group={group}
                periodLabel={periodLabel}
                ownerSlug={ownerSlug}
                lang={reportConfig?.language ?? 'en'}
                reportType="full"
                fromDate={fromDate}
                toDate={toDate}
              />
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

      {/* PR #166 — Payment Allocations */}
      {paymentSummary && paymentSummary.totalAllocatedEur !== '0' && (
        <PaymentAllocationPanel summary={paymentSummary} />
      )}

      {/* PR #166 — Open Correction Cases */}
      {openCorrectionCases && openCorrectionCases.length > 0 && (
        <CorrectionCasesPanel cases={openCorrectionCases} />
      )}

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

      {/* JJ Internal — Margin Analysis (never owner-facing) */}
      {dto.jjInternalView && <JjInternalSection view={dto.jjInternalView} />}
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

/**
 * Presentation group ordering for rental sections.
 * Groups are displayed in this order; any group not listed sorts to the end.
 */
const RENTAL_GROUP_ORDER: string[] = [
  'Rent Income',
  'Owner Payments',
  'Management Fees',
  'Deposits',
  'Utilities',
  'Maintenance & Repairs',
  'Cleaning',
  'Furnishing & Equipment',
  'Property Costs',
  'Marketing',
  'Other',
]

function groupRentalRows(rows: OwnerFinancialRowDTO[]): { group: string; rows: OwnerFinancialRowDTO[]; subtotal: number }[] {
  const groups = new Map<string, OwnerFinancialRowDTO[]>()
  for (const row of rows) {
    const group = row.presentationGroup ?? 'Other'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(row)
  }

  const ordered = Array.from(groups.entries())
    .map(([group, groupRows]) => ({
      group,
      rows: groupRows,
      subtotal: groupRows.reduce((sum: number, r: OwnerFinancialRowDTO) => sum + (r.amountEur != null ? parseFloat(r.amountEur) : 0), 0),
    }))
    .sort((a, b) => {
      const ai = RENTAL_GROUP_ORDER.indexOf(a.group)
      const bi = RENTAL_GROUP_ORDER.indexOf(b.group)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })

  return ordered
}

function renderRowRecord(row: OwnerFinancialRowDTO): Record<string, ReactNode> {
  const isRef = row.isReference === true
  const textCls = isRef ? 'text-sm text-gray-400 italic' : 'text-sm text-gray-900'
  const dateCls = isRef ? 'text-sm text-gray-400 italic' : 'text-sm text-gray-600'
  return {
    date: (
      <time dateTime={row.date} dir="ltr" className={dateCls}>
        {formatDate(row.date)}
      </time>
    ),
    description: (
      <span className={textCls}>
        {row.description}
        {/* PR #166 — Margin cross-reference: links owner-facing row to JJ Internal analysis */}
        {row.marginEur != null && (
          <span
            className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-px cursor-help"
            title={`Actual cost: €${parseFloat(row.actualCostEur as string).toFixed(2)} · Margin: €${parseFloat(row.marginEur as string).toFixed(2)} — see JJ Internal section below`}
          >
            <span aria-hidden="true">△</span>Margin
          </span>
        )}
      </span>
    ),
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
    // PR #166 — Billing state badge + include/exclude toggle
    ...(row.billingState ? {
      billingState: (
        <span className="inline-flex items-center gap-1.5">
          <BillingStateBadge state={row.billingState} />
          {row.billingState.draftLineId && (
            <BillingToggleButton
              draftLineId={row.billingState.draftLineId}
              currentlyIncluded={row.billingState.billingState !== 'excluded'}
            />
          )}
        </span>
      ),
    } : {}),
  }
}

function FinancialSection({ section, periodLabel }: { section: OwnerFinancialDTO['sections'][number]; periodLabel?: string }) {
  const DIR: Record<'due_to_jj' | 'due_to_you' | 'settled' | 'internal', { label: string; cls: string }> = {
    due_to_jj: { label: 'Due to JJ', cls: 'text-red-700 bg-red-50 border-red-200' },
    due_to_you: { label: 'Due to You', cls: 'text-green-700 bg-green-50 border-green-200' },
    settled: { label: 'Settled', cls: 'text-gray-600 bg-gray-50 border-gray-200' },
    internal: { label: 'JJ Internal', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  }
  const dir = section.ownerDirection ? DIR[section.ownerDirection] : null
  // Blocker 3: Include billingState column when any row has billing data
  const hasBilling = section.rows.some(r => r.billingState != null)
  const columns: DataTableColumn[] = [
    { key: 'date', label: 'Date', dir: 'ltr' },
    { key: 'description', label: 'Description' },
    { key: 'amountEur', label: 'Amount', align: 'right', dir: 'ltr' },
    ...(hasBilling ? [{ key: 'billingState', label: 'Status' }] : []),
    { key: 'evidenceRef', label: 'Evidence' },
  ]

  // Rental sections use presentation grouping; all others render flat
  const isRental = section.type === 'rental'
  const hasGroupedRows = isRental && section.rows.some(r => r.presentationGroup != null)

  return (
    <details className="bg-white border border-gray-200 rounded-lg overflow-hidden group/section">
      {/* Section header — summary-first: shows totals even when collapsed */}
      <summary className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
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
          <span className="text-gray-400 text-xs transition-transform group-open/section:rotate-180">▼</span>
        </div>
      </summary>
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

      {/* Rows — grouped for rental, flat for everything else */}
      {section.rows.length > 0 ? (
        hasGroupedRows ? (
          <RentalGroupedRows rows={section.rows} columns={columns} />
        ) : (
          <DataTable columns={columns} rows={section.rows.map(renderRowRecord)} />
        )
      ) : (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          No transactions in this category
        </div>
      )}
    </details>
  )
}

/**
 * Render rental rows grouped by presentation group with subgroup headers + subtotals.
 * Presentation only — the canonical section total is authoritative, not the sum of subgroups.
 */
function RentalGroupedRows({ rows, columns }: { rows: OwnerFinancialRowDTO[]; columns: DataTableColumn[] }) {
  const groups = groupRentalRows(rows)

  return (
    <div>
      {groups.map(({ group, rows: groupRows, subtotal }) => (
        <div key={group}>
          {/* Subgroup header */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50/60 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group}</span>
            <span className="text-xs font-medium text-gray-500 tabular-nums" dir="ltr">
              <MoneyValue amount={subtotal} size="sm" />
            </span>
          </div>
          {/* Subgroup rows */}
          <DataTable columns={columns} rows={groupRows.map(renderRowRecord)} />
        </div>
      ))}
    </div>
  )
}

function OverallNetRelationship({ overallNet }: { overallNet: OwnerOverallNetDTO }) {
  const labelText: Record<OwnerOverallNetDTO['label'], string> = {
    due_to_jj: 'Due to JJ',
    due_to_you: 'Due to You',
    settled: 'Settled',
  }

  const labelColor: Record<OwnerOverallNetDTO['label'], string> = {
    due_to_jj: 'text-red-700 bg-red-50 border-red-200',
    due_to_you: 'text-green-700 bg-green-50 border-green-200',
    settled: 'text-gray-700 bg-gray-50 border-gray-200',
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

function PropertyGroup({ group, periodLabel, ownerSlug, lang, reportType, fromDate, toDate }: {
  group: PropertyFinancialGroupDTO
  periodLabel?: string
  ownerSlug?: string
  lang?: string
  reportType?: string
  fromDate?: string | null
  toDate?: string | null
}) {
  const DIR: Record<'due_to_jj' | 'due_to_you' | 'settled' | 'internal', { label: string; cls: string }> = {
    due_to_jj: { label: 'Due to JJ', cls: 'text-red-700 bg-red-50 border-red-200' },
    due_to_you: { label: 'Due to You', cls: 'text-green-700 bg-green-50 border-green-200' },
    settled: { label: 'Settled', cls: 'text-gray-600 bg-gray-50 border-gray-200' },
    internal: { label: 'JJ Internal', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
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

      {/* Blocker 5: Per-property PDF download button for multi-property owners */}
      {ownerSlug && (
        <div className="flex items-center justify-end px-4 py-2 border-t border-gray-100 bg-white">
          <ReportActionsBar
            ownerSlug={ownerSlug}
            lang={lang}
            reportType={reportType}
            fromDate={fromDate}
            toDate={toDate}
            propertyName={group.propertyName}
          />
        </div>
      )}
    </details>
  )
}

function OwnerSummary({ overallNet, propertyGroups }: { overallNet: OwnerOverallNetDTO; propertyGroups: PropertyFinancialGroupDTO[] }) {
  const labelText: Record<OwnerOverallNetDTO['label'], string> = {
    due_to_jj: 'Due to JJ',
    due_to_you: 'Due to You',
    settled: 'Settled',
  }

  const labelColor: Record<OwnerOverallNetDTO['label'], string> = {
    due_to_jj: 'text-red-700 bg-red-50 border-red-200',
    due_to_you: 'text-green-700 bg-green-50 border-green-200',
    settled: 'text-gray-700 bg-gray-50 border-gray-200',
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

// ─────────────────────────────────────────────────────────────
// PR #166 — New sub-components
// ─────────────────────────────────────────────────────────────

function AlertsBanner({ alerts }: { alerts: readonly FinancialAlertDTO[] }) {
  const severityStyles: Record<string, string> = {
    critical: 'bg-red-50 border-red-300 text-red-800',
    warning: 'bg-amber-50 border-amber-300 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  const severityIcons: Record<string, string> = {
    critical: '🔴',
    warning: '⚠',
    info: 'ℹ',
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, idx) => (
        <div
          key={alert.id ?? idx}
          className={`flex items-start gap-2 px-3 py-2 border rounded text-xs ${
            severityStyles[alert.severity] ?? severityStyles.info
          }`}
        >
          <span className="flex-shrink-0">{severityIcons[alert.severity] ?? 'ℹ'}</span>
          <div>
            <span className="font-medium">{alert.message}</span>
            {alert.suggestedAction && <span className="ml-1 text-gray-600">— {alert.suggestedAction}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function BillingStateBadge({ state }: { state: BillingStateDTO }) {
  const billingStyles: Record<string, string> = {
    unbilled: 'bg-gray-100 text-gray-600',
    pending: 'bg-yellow-100 text-yellow-700',
    presented: 'bg-blue-100 text-blue-700',
    excluded: 'bg-red-100 text-red-600',
  }
  const billingLabels: Record<string, string> = {
    unbilled: 'Unbilled',
    pending: 'Pending',
    presented: 'Presented',
    excluded: 'Excluded',
  }
  const paymentStyles: Record<string, string> = {
    unpaid: 'bg-orange-100 text-orange-700',
    partially_paid: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
  }
  const paymentLabels: Record<string, string> = {
    unpaid: 'Unpaid',
    partially_paid: 'Partial',
    paid: 'Paid',
  }

  return (
    <span className="inline-flex gap-1">
      <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${
        billingStyles[state.billingState] ?? billingStyles.unbilled
      }`}>
        {billingLabels[state.billingState] ?? state.billingState}
      </span>
      {state.paymentState && (
        <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${
          paymentStyles[state.paymentState] ?? ''
        }`}>
          {paymentLabels[state.paymentState] ?? state.paymentState}
        </span>
      )}
    </span>
  )
}

function PaymentAllocationPanel({ summary }: { summary: PaymentAllocationSummaryDTO }) {
  return (
    <section aria-labelledby="fin-payments-heading">
      <h2 id="fin-payments-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Payment Allocations
      </h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-3 gap-px bg-gray-100">
          <div className="bg-white px-4 py-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Total Allocated</div>
            <div className="text-sm font-semibold text-gray-900 tabular-nums" dir="ltr">
              <MoneyValue amount={parseFloat(summary.totalAllocatedEur ?? '0')} size="sm" />
            </div>
          </div>
          <div className="bg-white px-4 py-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Unallocated</div>
            <div className="text-sm font-semibold text-amber-700 tabular-nums" dir="ltr">
              <MoneyValue amount={parseFloat(summary.remainingUnallocatedEur ?? '0')} size="sm" />
            </div>
          </div>
          <div className="bg-white px-4 py-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Fully Covered</div>
            <div className="text-sm font-semibold text-gray-900">{summary.fullyAllocatedCount ?? '—'}</div>
          </div>
        </div>
        {summary.allocations.length > 0 && (
          <details className="border-t border-gray-200">
            <summary className="px-4 py-2 text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
              View {summary.allocations.length} allocation{summary.allocations.length !== 1 ? 's' : ''}
            </summary>
            <div className="divide-y divide-gray-100">
              {summary.allocations.map(alloc => (
                <div key={alloc.id} className="flex items-center justify-between px-4 py-2 text-xs">
                  <div>
                    <span className="text-gray-600">{alloc.allocationMethod.toUpperCase()}</span>
                    {alloc.notes && <span className="ml-2 text-gray-400">{alloc.notes}</span>}
                  </div>
                  <span className="font-medium tabular-nums text-gray-900" dir="ltr">
                    <MoneyValue amount={parseFloat(alloc.allocatedAmountEur ?? '0')} size="sm" />
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  )
}

function CorrectionCasesPanel({ cases }: { cases: readonly FinancialCorrectionCaseDTO[] }) {
  const statusStyles: Record<string, string> = {
    open: 'bg-yellow-100 text-yellow-800',
    under_review: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    applied: 'bg-gray-100 text-gray-800',
    void: 'bg-gray-100 text-gray-500',
  }
  const priorityIcons: Record<string, string> = {
    urgent: '🔴',
    high: '🟠',
    normal: '🟡',
    low: '⚪',
  }

  return (
    <section aria-labelledby="fin-corrections-heading">
      <h2 id="fin-corrections-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Correction Cases ({cases.length} open)
      </h2>
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
        {cases.map(c => (
          <div key={c.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs">{priorityIcons[c.priority] ?? '🟡'}</span>
                <span className="text-sm font-medium text-gray-900">{c.description}</span>
              </div>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                statusStyles[c.status] ?? statusStyles.open
              }`}>
                {c.status.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>Type: {c.correctionType.replace(/_/g, ' ')}</span>
              {c.originalAmountEur != null && c.correctedAmountEur != null && (
                <span dir="ltr">
                  €{parseFloat(c.originalAmountEur).toFixed(2)} → €{parseFloat(c.correctedAmountEur).toFixed(2)}
                </span>
              )}
              <time dateTime={c.openedAt}>{formatDate(c.openedAt.slice(0, 10))}</time>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function JjInternalSection({ view }: { view: JjInternalViewDTO }) {
  return (
    <section aria-labelledby="jj-internal-heading" className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
      <h2 id="jj-internal-heading" className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
        JJ Internal — Margin Analysis
      </h2>
      <p className="text-xs text-amber-600 mb-3">
        {view.rowsWithMargin} of {view.totalRows} rows have a margin (client charge differs from actual cost).
        {' '}Rows with margins are tagged with a <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-px">△Margin</span> badge in the sections above.
      </p>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-sm text-amber-800 font-medium">Total Margin:</span>
        <MoneyValue amount={parseFloat(view.totalMarginEur as string)} size="md" />
      </div>
      {view.sections.map((section: JjInternalSectionDTO, idx: number) => (
        <details key={idx} className="mb-2 last:mb-0">
          <summary className="cursor-pointer text-sm font-medium text-amber-900 py-1 hover:text-amber-700">
            {section.propertyName} — {section.accountLabel} (margin: €{parseFloat(section.totalMarginEur as string).toFixed(2)})
          </summary>
          <div className="mt-1 ml-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-amber-600">
                  <th className="py-1">Date</th>
                  <th className="py-1">Description</th>
                  <th className="py-1 text-right">Actual Cost</th>
                  <th className="py-1 text-right">Client Charge</th>
                  <th className="py-1 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row: JjInternalRowDTO) => (
                  <tr key={row.id} className="border-t border-amber-100">
                    <td className="py-1" dir="ltr">{formatDate(row.date)}</td>
                    <td className="py-1">{row.description}</td>
                    <td className="py-1 text-right" dir="ltr">€{parseFloat(row.actualCostEur as string).toFixed(2)}</td>
                    <td className="py-1 text-right" dir="ltr">€{parseFloat(row.clientChargeEur as string).toFixed(2)}</td>
                    <td className="py-1 text-right font-medium" dir="ltr">€{parseFloat(row.marginEur as string).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
