'use client'

import { MoneyValue, StatusBadge, KpiCard, SectionHeader, DataTable } from '@/components/ds'
import type { DataTableColumn } from '@/components/ds'
import type {
  ExternalPartnerAviReport,
  AviReportPartnerSummary,
  AviReportLayerBreakdown,
  AviReportPartnerPayment,
  AviReportPartnerExpense,
  AviReportAcquisitionPresentation,
  AviReportVisibleExpenseTotals,
  AviReportSnapshotMeta,
  AviVisibleExpenseLayer,
  AviReportAirbnbCredits,
  AviReportExpenseCompleteness,
} from '@/lib/partner-settlement/external-partner/externalPartnerAviReportTypes'
import { AVI_REPORT_PRINT_CSS } from '@/components/finance/aviReportPrintCss'
import { useState } from 'react'

interface Props {
  report: ExternalPartnerAviReport
  /** staff = JJ internal chrome. partner = Avi-facing share/print. */
  audience?: 'staff' | 'partner'
}

function formatIsoDateEnGb(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!year || !month || !day) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function formatGeneratedEnGb(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function FailedView({ report }: { report: Extract<ExternalPartnerAviReport, { status: 'failed' }> }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status="critical" label="Report Failed" />
        </div>
        <p className="text-sm text-rose-800 font-medium mb-3">
          The report cannot be certified. No financial amounts are displayed.
        </p>
        <ul className="space-y-1.5">
          {report.failures.map((f, i) => (
            <li key={i} className="text-xs text-rose-700 font-mono bg-rose-100 rounded px-3 py-1.5">
              {f}
            </li>
          ))}
        </ul>
      </div>

      <ControlStatusSection controlStatus={report.controlStatus} />
    </div>
  )
}

function ControlStatusSection({ controlStatus }: { controlStatus: ExternalPartnerAviReport['controlStatus'] }) {
  const allPassed = controlStatus.reconciliationPassed && controlStatus.settlementComputed && controlStatus.attributionOk
  return (
    <div className="jj-card p-4">
      <SectionHeader
        title="Control Status"
        badge={<StatusBadge status={allPassed ? 'confirmed' : 'critical'} label={allPassed ? 'All passed' : 'Failed'} />}
      />
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ControlCheck label="Reconciliation" passed={controlStatus.reconciliationPassed} />
        <ControlCheck label="Settlement" passed={controlStatus.settlementComputed} />
        <ControlCheck label="Attribution" passed={controlStatus.attributionOk} />
      </div>
      {controlStatus.failures.length > 0 && (
        <div className="mt-3 space-y-1">
          {controlStatus.failures.map((f, i) => (
            <div key={i} className="text-xs text-rose-600 font-mono">{f}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function ControlCheck({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 text-xs font-medium ${passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      <span className="mr-1.5">{passed ? '✓' : '✗'}</span>
      {label}
    </div>
  )
}

function PartnerSummarySection({ partners }: { partners: readonly AviReportPartnerSummary[] }) {
  const avi = partners.find((p) => p.partner === 'Avi')
  return (
    <div className="space-y-4 avi-print-keep">
      <SectionHeader title="Partner Summary" />

      {avi && avi.status === 'CERTIFIED' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Paid" value={<MoneyValue amount={avi.paidEur} />} />
          <KpiCard label="Credits" value={<MoneyValue amount={avi.creditsEur} />} />
          <KpiCard label="Obligation" value={<MoneyValue amount={avi.obligationEur} />} />
          <KpiCard
            label="Final Result"
            value={
              <span className={avi.direction === 'to_pay' ? 'text-rose-600' : avi.direction === 'to_refund' ? 'text-emerald-600' : ''}>
                {avi.semanticNet}
              </span>
            }
          />
        </div>
      )}
    </div>
  )
}

function OwnershipSection({ partners }: { partners: readonly AviReportPartnerSummary[] }) {
  return (
    <div className="jj-card p-4 avi-print-keep">
      <SectionHeader title="Ownership" />
      <div className="mt-3 divide-y divide-gray-100">
        {partners.map((p) => (
          <div key={p.partner} className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-medium text-gray-900">{p.partner}</span>
              <span className="text-xs text-gray-500">{p.ownershipPct}%</span>
            </div>
            <StatusBadge
              status={p.status === 'CERTIFIED' ? 'confirmed' : 'pending'}
              label={p.status}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function AcquisitionSection({ acquisition }: { acquisition: AviReportAcquisitionPresentation }) {
  return (
    <div className="jj-card p-4 avi-print-keep">
      <SectionHeader
        title="Acquisition"
        subtitle="50% partnership interest at the agreed Villa Mazotos transaction value"
      />
      <p className="mt-3 text-sm text-gray-800">{acquisition.presentationLine}</p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Agreed transaction value"
          value={<MoneyValue amount={acquisition.agreedTransactionValueEur} />}
        />
        <KpiCard
          label="Avi 50% obligation"
          value={<MoneyValue amount={acquisition.aviObligationEur} />}
        />
        <div data-testid="avi-acquisition-remaining">
          <KpiCard
            label="Remaining"
            value={<MoneyValue amount={acquisition.remainingEur} />}
          />
        </div>
      </div>
    </div>
  )
}

function LayerBreakdownSection({
  layers,
  postAcquisitionSemantic,
}: {
  layers: readonly AviReportLayerBreakdown[]
  postAcquisitionSemantic: string | null
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const operating = layers.filter((l) => {
    if (l.key === 'acquisition') return false
    if (l.key === 'management' && (l.totalChargeEur == null || l.totalChargeEur === 0)) return false
    return true
  })

  return (
    <div className="jj-card overflow-hidden print:hidden">
      <div className="p-4">
        <SectionHeader
          title="Layer Breakdown"
          subtitle="Avi post-acquisition balances. Acquisition is covered by certified paid and is not added again."
        />
      </div>
      <div className="divide-y divide-gray-100">
        {operating.map((layer) => {
          const isExpanded = expandedKey === layer.key
          return (
            <div key={layer.key}>
              <button
                type="button"
                onClick={() => setExpandedKey(isExpanded ? null : layer.key)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <span className="text-sm font-medium text-gray-800">{layer.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-rose-700 tabular-nums" dir="ltr">{layer.semanticNet}</span>
                  <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50/50">
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Total certified charge</div>
                    <MoneyValue amount={layer.totalChargeEur} size="sm" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Avi 50% obligation</div>
                    <MoneyValue amount={layer.aviShareEur} size="sm" />
                  </div>
                  {layer.aviFundingEur !== null && (
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Avi funding / credit</div>
                      <MoneyValue amount={layer.aviFundingEur} size="sm" />
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Layer net</div>
                    <span className="text-sm text-rose-700" dir="ltr">{layer.semanticNet}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 font-semibold">
        <span className="text-sm text-gray-900">Post-acquisition total</span>
        <span className="text-sm text-rose-700" dir="ltr">{postAcquisitionSemantic}</span>
      </div>
    </div>
  )
}

function PrintLayerSection({
  layers,
  postAcquisitionSemantic,
  visibleOnScreen = false,
}: {
  layers: readonly AviReportLayerBreakdown[]
  postAcquisitionSemantic: string | null
  visibleOnScreen?: boolean
}) {
  const operating = layers.filter((l) => {
    if (l.key === 'acquisition') return false
    if (l.key === 'management' && (l.totalChargeEur == null || l.totalChargeEur === 0)) return false
    return true
  })
  return (
    <section
      className={`${visibleOnScreen ? 'block' : 'hidden print:block'} avi-print-keep`}
      data-testid="avi-print-layers"
    >
      <SectionHeader
        title="Post-acquisition layers"
        subtitle="Certified Avi balances. Acquisition is covered by certified paid and is not added again."
        className="mb-3"
      />
      <div className="jj-card overflow-hidden">
        <table className="w-full text-sm" dir="ltr">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th scope="col" className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-gray-600">Layer</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-gray-600">Certified charge</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-gray-600">Avi share</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-gray-600">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {operating.map((layer) => (
              <tr key={layer.key}>
                <td className="px-4 py-2 text-gray-900">{layer.label}</td>
                <td className="px-4 py-2 text-right"><MoneyValue amount={layer.totalChargeEur} size="sm" /></td>
                <td className="px-4 py-2 text-right"><MoneyValue amount={layer.aviShareEur} size="sm" /></td>
                <td className="px-4 py-2 text-right text-rose-700" dir="ltr">{layer.semanticNet}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 font-semibold">
              <td className="px-4 py-2" colSpan={3}>Post-acquisition total</td>
              <td className="px-4 py-2 text-right text-rose-700" dir="ltr">{postAcquisitionSemantic}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function PrintExpenseReconciliation({
  totals,
  visibleOnScreen = false,
}: {
  totals: AviReportVisibleExpenseTotals
  visibleOnScreen?: boolean
}) {
  return (
    <section
      className={`${visibleOnScreen ? 'block' : 'hidden print:block'} avi-print-keep`}
      data-testid="avi-print-expense-recon"
    >
      <SectionHeader title="Certified expense reconciliation" className="mb-3" />
      <div className="jj-card p-4 grid grid-cols-3 gap-3">
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Certified expense rows</div>
          <div className="text-sm font-semibold tabular-nums" dir="ltr">{totals.rowCount}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Total charges</div>
          <MoneyValue amount={totals.totalChargeEur} size="sm" />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Avi 50% share</div>
          <MoneyValue amount={totals.aviShareEur} size="sm" />
        </div>
      </div>
    </section>
  )
}

const EXPENSE_COLUMNS: DataTableColumn[] = [
  { key: 'date', label: 'Date', dir: 'ltr' },
  { key: 'category', label: 'Category' },
  { key: 'subcategory', label: 'Subcategory' },
  { key: 'amount', label: 'Total certified charge', align: 'right', dir: 'ltr' },
  { key: 'aviPct', label: 'Avi ownership', align: 'right', dir: 'ltr' },
  { key: 'aviShare', label: 'Avi share', align: 'right', dir: 'ltr' },
]

const EXPENSE_DEPARTMENTS: readonly {
  layer: AviVisibleExpenseLayer
  title: string
  subtitle: string
}[] = [
  {
    layer: 'deal_expense',
    title: 'Acquisition / Deal expenses',
    subtitle: 'Purchase-side deal costs charged to the partnership.',
  },
  {
    layer: 'renovation',
    title: 'Renovation expenses',
    subtitle: 'Partner-chargeable renovation. Internal execution cash is not listed.',
  },
  {
    layer: 'airbnb',
    title: 'Airbnb expenses',
    subtitle:
      'Guest-operation charges, listed only in this department. Monthly Pool Service invoices are the partner charge; cash paid to the pool vendor for those invoices is not listed again.',
  },
  {
    layer: 'management',
    title: 'Management expenses',
    subtitle: 'Property management as its own department — never mixed into Airbnb.',
  },
]

function expensesForLayer(
  expenses: readonly AviReportPartnerExpense[],
  layer: AviVisibleExpenseLayer,
): AviReportPartnerExpense[] {
  return expenses.filter((e) => e.layer === layer)
}

function DepartmentExpenseTable({
  layer,
  title,
  subtitle,
  expenses,
  layerTotals,
}: {
  layer: AviVisibleExpenseLayer
  title: string
  subtitle: string
  expenses: readonly AviReportPartnerExpense[]
  layerTotals: AviReportLayerBreakdown | undefined
}) {
  const rows = expenses.map((e) => ({
    date: e.date,
    category: e.category ?? '—',
    subcategory: e.subcategory ?? '—',
    amount: <MoneyValue amount={e.amountEur} size="sm" />,
    aviPct: `${e.aviSharePct}%`,
    aviShare: <MoneyValue amount={e.aviShareEur} size="sm" />,
  }))
  return (
    <section
      className="space-y-3 avi-print-keep-header"
      data-testid={`avi-expense-department-${layer}`}
    >
      <SectionHeader title={title} subtitle={subtitle} className="print:hidden" />
      <div className="hidden print:block">
        <h3 className="jj-label">{title}</h3>
        <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">{subtitle}</p>
      </div>
      {layerTotals && layerTotals.totalChargeEur != null && layerTotals.aviShareEur != null && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Certified department charge</div>
            <MoneyValue amount={layerTotals.totalChargeEur} size="sm" />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Avi 50% share</div>
            <MoneyValue amount={layerTotals.aviShareEur} size="sm" />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Certified rows</div>
            <div className="text-sm font-semibold tabular-nums" dir="ltr">{expenses.length}</div>
          </div>
        </div>
      )}
      {expenses.length === 0 ? (
        <div className="jj-card px-4 py-8 text-center text-sm text-gray-500">
          No certified expenses in this department.
        </div>
      ) : (
        <DataTable columns={EXPENSE_COLUMNS} rows={rows} caption={title} />
      )}
    </section>
  )
}

function ExpenseTable({
  expenses,
  totals,
  layers,
  completeness,
}: {
  expenses: readonly AviReportPartnerExpense[]
  totals: AviReportVisibleExpenseTotals
  layers: readonly AviReportLayerBreakdown[]
  completeness: AviReportExpenseCompleteness
}) {
  const missingTitles = completeness.departmentsMissingDetailRows.map((layer) => {
    const dept = EXPENSE_DEPARTMENTS.find((d) => d.layer === layer)
    return dept?.title ?? layer
  })
  return (
    <div className="avi-print-expenses space-y-8" data-testid="avi-expense-table">
      <SectionHeader
        title="Certified Expenses"
        subtitle="Each department is listed separately. Avi 50% share. Payer is not shown."
        className="mb-0 print:hidden"
      />
      <div className="hidden print:block">
        <h3 className="jj-label">Certified Expenses</h3>
        <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
          {totals.rowCount} certified partner-chargeable rows, grouped by department. Avi share is the certified line amount.
        </p>
      </div>
      {!completeness.complete && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 avi-print-keep"
          data-testid="avi-expense-completeness"
        >
          <p className="text-sm font-semibold text-amber-800">Certified totals without detail rows</p>
          <p className="mt-1 text-xs text-amber-700 leading-relaxed">
            These departments have a certified total and no partner-visible line items.
            Empty tables are not shown. Rows are not invented.
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">
            {missingTitles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </div>
      )}
      {EXPENSE_DEPARTMENTS.map((dept) => {
        const rows = expensesForLayer(expenses, dept.layer)
        const layerTotals = layers.find((l) => l.key === dept.layer)
        if (
          dept.layer === 'management' &&
          (layerTotals?.totalChargeEur == null || layerTotals.totalChargeEur === 0)
        ) {
          return null
        }
        if (rows.length === 0) return null
        return (
        <DepartmentExpenseTable
          key={dept.layer}
          layer={dept.layer}
          title={dept.title}
          subtitle={dept.subtitle}
          expenses={rows}
          layerTotals={layerTotals}
        />
        )
      })}
    </div>
  )
}

const PAYMENT_COLUMNS: DataTableColumn[] = [
  { key: 'date', label: 'Date', dir: 'ltr' },
  { key: 'label', label: 'Label' },
  { key: 'payer', label: 'Payer' },
  { key: 'amount', label: 'Amount', align: 'right', dir: 'ltr' },
]

function AirbnbCreditsSection({ credits }: { credits: AviReportAirbnbCredits }) {
  const stay = credits.certifiedDirectStay
  return (
    <section className="space-y-3 avi-print-keep" data-testid="avi-airbnb-credits">
      <SectionHeader
        title="Airbnb income credits"
        subtitle="Private booking income and Hostaway rental income are separate. Hostaway uses the printed Net Owner Payout. Tax components that are not printed on the statement are not shown."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="jj-card p-4" data-testid="avi-private-booking-credit">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Private booking income</div>
          <p className="mt-1 text-sm text-gray-700">Already-net private stays on the JJ ledger. Avi credit is 50% of the certified total.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div data-testid="avi-private-booking-total">
              <div className="text-xs text-gray-500 mb-0.5">Total</div>
              <MoneyValue amount={credits.privateBookingTotalEur} size="sm" />
            </div>
            <div data-testid="avi-private-booking-avi">
              <div className="text-xs text-gray-500 mb-0.5">Avi 50% credit</div>
              <MoneyValue amount={credits.privateBookingAviEur} size="sm" />
            </div>
          </div>
        </div>
        <div className="jj-card p-4" data-testid="avi-hostaway-rental-credit">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hostaway rental income</div>
          <p className="mt-1 text-sm text-gray-700">50% of printed Net Owner Payout for completed, paid stays.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Printed NTO</div>
              <MoneyValue amount={credits.hostawayPrintedNtoTotalEur} size="sm" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Avi 50%</div>
              <MoneyValue amount={credits.hostawayAviEur} size="sm" />
            </div>
          </div>
        </div>
      </div>
      <div className="jj-card overflow-hidden">
        <table className="w-full text-sm" dir="ltr">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th scope="col" className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-gray-600">Stay</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-gray-600">Printed NTO</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-gray-600">Avi 50%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr data-testid="avi-hostaway-direct-stay">
              <td className="px-4 py-2 text-gray-900">
                <div>{stay.checkIn} · {stay.channel} · {stay.guestName}</div>
                <div className="text-xs text-gray-500">Reservation {stay.reservationId}</div>
              </td>
              <td className="px-4 py-2 text-right"><MoneyValue amount={stay.printedNtoEur} size="sm" /></td>
              <td className="px-4 py-2 text-right"><MoneyValue amount={stay.aviShareEur} size="sm" /></td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-gray-900">Other completed Hostaway stays</td>
              <td className="px-4 py-2 text-right"><MoneyValue amount={credits.otherHostawayPrintedNtoEur} size="sm" /></td>
              <td className="px-4 py-2 text-right"><MoneyValue amount={credits.otherHostawayAviEur} size="sm" /></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 font-semibold">
              <td className="px-4 py-2">Airbnb income credits total</td>
              <td className="px-4 py-2 text-right" />
              <td className="px-4 py-2 text-right"><MoneyValue amount={credits.totalAviEur} size="sm" /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function PaymentTable({ payments }: { payments: readonly AviReportPartnerPayment[] }) {
  const rows = payments.map((p) => ({
    date: p.date,
    label: p.label,
    payer: p.payer,
    amount: <MoneyValue amount={p.amountEur} size="sm" />,
  }))
  return (
    <div className="avi-print-payments" data-testid="avi-payment-table">
      <SectionHeader title="Avi Funding Payments" subtitle="Partner-visible verified funding from Avi" className="mb-3" />
      <DataTable columns={PAYMENT_COLUMNS} rows={rows} caption="Avi funding payments" />
    </div>
  )
}

function AuditWarning() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-amber-600 text-lg shrink-0">⚠</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">JJ Internal — Certified snapshot report</p>
          <p className="mt-1 text-xs text-amber-700 leading-relaxed">
            This JJ staff screen uses the approved certified snapshot. Partner-visible
            amounts are filtered. Internal acquisition structure, contract price,
            and reconciliation details are not displayed. For audit purposes only —
            not for external distribution.
          </p>
        </div>
      </div>
    </div>
  )
}

function PrintMasthead({ snapshot }: { snapshot: AviReportSnapshotMeta }) {
  return (
    <header className="hidden print:block mb-6 border-b border-gray-300 pb-4" data-testid="avi-print-masthead" dir="ltr">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">JJ Property</p>
      <h1 className="text-xl font-semibold text-gray-900 mt-1">
        External Partner Report — Avi
      </h1>
      <p className="text-sm text-gray-700 mt-2">Property: Villa Mazotos</p>
      <p className="text-sm text-gray-700">Status: Certified</p>
      <p className="text-sm text-gray-700">As of: {formatIsoDateEnGb(snapshot.cutoffDate)}</p>
      <p className="text-xs text-gray-500 mt-1">Generated: {formatGeneratedEnGb(new Date())}</p>
    </header>
  )
}

export function ExternalPartnerAviReportView({ report, audience = 'staff' }: Props) {
  const isPartner = audience === 'partner'

  if (report.status === 'failed') {
    return (
      <div className="space-y-6">
        <style>{AVI_REPORT_PRINT_CSS}</style>
        {!isPartner && (
          <div className="avi-print-hide">
            <ReportHeader status="failed" />
            <AuditWarning />
          </div>
        )}
        <FailedView report={report} />
      </div>
    )
  }

  const avi = report.partners.find((p) => p.partner === 'Avi')

  return (
    <div
      className="space-y-6"
      data-testid="avi-report-certified"
      data-avi-audience={audience}
      dir="ltr"
    >
      <style>{AVI_REPORT_PRINT_CSS}</style>
      <PrintMasthead snapshot={report.snapshot} />
      {!isPartner && (
        <>
          <div className="avi-print-hide print:hidden">
            <ReportHeader status="certified" snapshotVersion={report.snapshot.version} />
          </div>
          <div className="avi-print-hide print:hidden">
            <AuditWarning />
          </div>
          <div className="avi-print-hide print:hidden">
            <ControlStatusSection controlStatus={report.controlStatus} />
          </div>
        </>
      )}
      <PartnerSummarySection partners={report.partners} />
      <OwnershipSection partners={report.partners} />
      <AcquisitionSection acquisition={report.acquisition} />
      {!isPartner && (
        <LayerBreakdownSection
          layers={report.layers}
          postAcquisitionSemantic={avi?.semanticNet ?? null}
        />
      )}
      <PrintLayerSection
        layers={report.layers}
        postAcquisitionSemantic={avi?.semanticNet ?? null}
        visibleOnScreen={isPartner}
      />
      <PrintExpenseReconciliation
        totals={report.visibleExpenseTotals}
        visibleOnScreen={isPartner}
      />
      <AirbnbCreditsSection credits={report.airbnbCredits} />
      <ExpenseTable
        expenses={report.partnerExpenses}
        totals={report.visibleExpenseTotals}
        layers={report.layers}
        completeness={report.expenseCompleteness}
      />
      <PaymentTable payments={report.partnerPayments} />
    </div>
  )
}

function ReportHeader({ status, snapshotVersion }: { status: 'certified' | 'failed'; snapshotVersion?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">
          JJ Internal Staff Report
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          External Partner Report — Avi
        </h2>
        <p className="text-sm text-gray-500">Villa Mazotos</p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge
          status={status === 'certified' ? 'confirmed' : 'critical'}
          label={status === 'certified' ? 'Certified' : 'Failed'}
        />
        {snapshotVersion && (
          <span className="text-xs text-gray-400 font-mono">{snapshotVersion}</span>
        )}
      </div>
    </div>
  )
}
