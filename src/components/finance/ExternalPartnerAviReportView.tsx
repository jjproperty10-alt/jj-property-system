'use client'

import { MoneyValue, StatusBadge, SectionHeader, DataTable } from '@/components/ds'
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
import {
  AVI_REPORT_COPY,
  aviReportDir,
  formatAviFullDate,
  formatAviOwedCopy,
  formatAviStayNightLabel,
  type AviReportLang,
} from '@/components/finance/aviReportCopy'
import {
  aviPaymentPurpose,
  aviRenovationCategoryLabel,
  aviExpensePeriodKey,
  aviLayerLabel,
  aviPartnerDisplayName,
} from '@/components/finance/aviReportPresentation'
import {
  AviReportDate,
  HebrewCutoffSentence,
  HebrewFullDate,
  HebrewGeneratedSentence,
} from '@/components/finance/HebrewDate'
import { useEffect, useState } from 'react'
import { AviReportPrintButton } from '@/components/finance/AviReportPrintButton'
import type {
  AviAirbnbSection,
  AviFinalSummary,
  AviHostawayIncomeSection,
  AviMonthlySection,
  AviPurchaseExpensesSection,
  AviRenovationSection,
} from '@/lib/partner-settlement/external-partner/aviReportSections'
import { AVI_HOSTAWAY_LAST_CHECKOUT_DATE } from '@/lib/partner-settlement/external-partner/aviHostawayStays'

interface Props {
  report: ExternalPartnerAviReport
  /** staff = JJ internal chrome. partner = Avi-facing share/print. */
  audience?: 'staff' | 'partner'
  /** Test / compose helper — defaults to English. */
  initialLang?: AviReportLang
  /**
   * Base path for partner-sendable PDF export (no Chrome headers/footers).
   * Example: `/preview/avi-certified-compose/pdf` — lang query is appended.
   */
  sendablePdfPath?: string | null
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

function LanguageToggle({
  lang,
  onChange,
  sendablePdfHref = null,
}: {
  lang: AviReportLang
  onChange: (next: AviReportLang) => void
  sendablePdfHref?: string | null
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <div
      className="avi-print-hide print:hidden flex flex-wrap items-center justify-between gap-3"
      data-testid="avi-language-toggle"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange('en')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${lang === 'en' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          {copy.toggleEn}
        </button>
        <button
          type="button"
          onClick={() => onChange('he')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${lang === 'he' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          {copy.toggleHe}
        </button>
      </div>
      <AviReportPrintButton lang={lang} sendablePdfHref={sendablePdfHref} />
    </div>
  )
}

function PartnerSummarySection({
  partners,
  lang,
}: {
  partners: readonly AviReportPartnerSummary[]
  lang: AviReportLang
}) {
  const avi = partners.find((p) => p.partner === 'Avi')
  const copy = AVI_REPORT_COPY[lang]
  return (
    <div className="avi-print-keep" data-testid="avi-summary">
      {avi && avi.status === 'CERTIFIED' && (
        <div className="avi-fin-summary" data-testid="avi-final-hero">
          <div className="avi-fin-summary-top">
            <span className="avi-fin-summary-kicker">
              {lang === 'he' ? 'סיכום פיננסי' : 'Financial Summary'}
            </span>
            <span className="avi-fin-summary-badge">{copy.confidentiality.split('—')[0]?.trim() || 'Confidential'}</span>
          </div>
          <p className="avi-fin-summary-title">{lang === 'he' ? 'אבי' : 'Avi'}</p>
          <p className="avi-fin-summary-sub">{copy.propertyName}</p>

          <div className="avi-fin-balance">
            <div className="avi-fin-balance-label">{copy.finalNet}</div>
            <div>
              <div className="avi-fin-balance-value" dir="ltr">
                {formatAviOwedCopy(lang, avi.semanticNet, avi.direction)}
              </div>
              <div className="avi-fin-balance-hint" dir="ltr">
                {copy.formula}
              </div>
            </div>
          </div>

          <div className="avi-fin-ops" aria-label={copy.summary}>
            <div className="avi-fin-ops-cell">
              <div className="avi-fin-ops-label">{copy.paid}</div>
              <div className="avi-fin-ops-value">
                <MoneyValue amount={avi.paidEur} />
              </div>
            </div>
            <div className="avi-fin-ops-cell">
              <div className="avi-fin-ops-label">{copy.credits}</div>
              <div className="avi-fin-ops-value">
                <MoneyValue amount={avi.creditsEur} />
              </div>
            </div>
            <div className="avi-fin-ops-cell">
              <div className="avi-fin-ops-label">{copy.obligation}</div>
              <div className="avi-fin-ops-value">
                <MoneyValue amount={avi.obligationEur} />
              </div>
            </div>
          </div>

          <p className="avi-fin-formula" dir="ltr">
            {copy.paid} + {copy.credits} − {copy.obligation} = {copy.finalNet}
            {' · '}
            <MoneyValue amount={avi.paidEur} size="sm" /> + <MoneyValue amount={avi.creditsEur} size="sm" /> −{' '}
            <MoneyValue amount={avi.obligationEur} size="sm" /> = <MoneyValue amount={avi.netEur} size="sm" />
          </p>
        </div>
      )}
    </div>
  )
}

function OwnershipSection({
  partners,
  lang,
}: {
  partners: readonly AviReportPartnerSummary[]
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <div className="avi-section avi-print-keep">
      <div className="avi-account-bar" data-tone="navy">
        <div>
          <h2 className="avi-account-bar-title">{copy.ownership}</h2>
        </div>
      </div>
      <div className="avi-ownership-list">
        {partners.map((p) => (
          <div key={p.partner} className="avi-ownership-row">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-medium text-slate-900">{aviPartnerDisplayName(p.partner, lang)}</span>
              <span className="text-xs text-slate-500">{p.ownershipPct}%</span>
            </div>
            <StatusBadge
              status={p.status === 'CERTIFIED' ? 'confirmed' : 'pending'}
              label={p.status === 'CERTIFIED' ? copy.certified : copy.provisional}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function AcquisitionSection({
  acquisition,
  lang,
}: {
  acquisition: AviReportAcquisitionPresentation
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <div className="avi-section avi-print-keep">
      <div className="avi-account-bar" data-tone="navy">
        <div>
          <h2 className="avi-account-bar-title">{copy.acquisition}</h2>
          <p className="avi-account-bar-sub">{copy.acquisitionSubtitle}</p>
        </div>
        <div className="avi-account-bar-right">
          <div className="avi-account-bar-amount"><MoneyValue amount={acquisition.aviObligationEur} /></div>
          <div className="avi-account-bar-amount-hint">{copy.aviObligation}</div>
        </div>
      </div>
      {lang === 'en' && <p className="avi-section-sub">{acquisition.presentationLine}</p>}
      <div className="avi-kpi-strip">
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.agreedValue}</div>
          <div className="avi-kpi-value">
            <MoneyValue amount={acquisition.agreedTransactionValueEur} />
          </div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.aviObligation}</div>
          <div className="avi-kpi-value">
            <MoneyValue amount={acquisition.aviObligationEur} />
          </div>
        </div>
        <div className="avi-kpi-tile" data-testid="avi-acquisition-remaining">
          <div className="avi-kpi-label">{copy.remaining}</div>
          <div className="avi-kpi-value">
            <MoneyValue amount={acquisition.remainingEur} />
          </div>
        </div>
      </div>
    </div>
  )
}

function LayerBreakdownSection({
  layers,
  postAcquisitionSemantic,
  lang,
}: {
  layers: readonly AviReportLayerBreakdown[]
  postAcquisitionSemantic: string | null
  lang: AviReportLang
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
                  <span className="text-sm text-rose-700 tabular-nums" dir="ltr">{formatAviOwedCopy(lang, layer.semanticNet, null)}</span>
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
                    <span className="text-sm text-rose-700" dir="ltr">{formatAviOwedCopy(lang, layer.semanticNet, null)}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 font-semibold">
        <span className="text-sm text-gray-900">{AVI_REPORT_COPY[lang].postAcquisitionTotal}</span>
        <span className="text-sm text-rose-700" dir="ltr">{postAcquisitionSemantic}</span>
      </div>
    </div>
  )
}

function PrintLayerSection({
  layers,
  postAcquisitionSemantic,
  visibleOnScreen = false,
  lang,
}: {
  layers: readonly AviReportLayerBreakdown[]
  postAcquisitionSemantic: string | null
  visibleOnScreen?: boolean
  lang: AviReportLang
}) {
  const operating = layers.filter((l) => {
    if (l.key === 'acquisition') return false
    if (l.key === 'management' && (l.totalChargeEur == null || l.totalChargeEur === 0)) return false
    return true
  })
  const copy = AVI_REPORT_COPY[lang]
  return (
    <section
      className={`${visibleOnScreen ? 'block' : 'hidden print:block'} avi-section avi-print-keep`}
      data-testid="avi-print-layers"
    >
      <div className="avi-account-bar" data-tone="navy">
        <div>
          <h2 className="avi-account-bar-title">{copy.postAcquisitionLayers}</h2>
          <p className="avi-account-bar-sub">{copy.postAcquisitionSubtitle}</p>
        </div>
      </div>
      <table className="w-full text-sm avi-table" dir="ltr">
        <thead>
          <tr>
            <th scope="col">{copy.layer}</th>
            <th scope="col" className="text-right">{copy.certifiedCharge}</th>
            <th scope="col" className="text-right">{copy.aviShare}</th>
            <th scope="col" className="text-right">{copy.result}</th>
          </tr>
        </thead>
        <tbody>
          {operating.map((layer) => (
            <tr key={layer.key}>
              <td>{aviLayerLabel(layer.key, layer.label, lang)}</td>
              <td className="text-right"><MoneyValue amount={layer.totalChargeEur} size="sm" /></td>
              <td className="text-right"><MoneyValue amount={layer.aviShareEur} size="sm" /></td>
              <td className="text-right text-rose-700" dir="ltr">{formatAviOwedCopy(lang, layer.semanticNet, null)}</td>
            </tr>
          ))}
          <tr className="avi-total-row">
            <td colSpan={3}>{copy.postAcquisitionTotal}</td>
            <td className="text-right text-rose-700" dir="ltr">{postAcquisitionSemantic}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function PrintExpenseReconciliation({
  totals,
  visibleOnScreen = false,
  lang,
}: {
  totals: AviReportVisibleExpenseTotals
  visibleOnScreen?: boolean
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <section
      className={`${visibleOnScreen ? 'block' : 'hidden print:block'} avi-section avi-print-keep`}
      data-testid="avi-print-expense-recon"
    >
      <div className="avi-account-bar" data-tone="blue">
        <div>
          <h2 className="avi-account-bar-title">{copy.expenseReconciliation}</h2>
          <p className="avi-account-bar-sub">{copy.expenseReconciliationNote}</p>
        </div>
        <div className="avi-account-bar-right">
          <div className="avi-account-bar-amount"><MoneyValue amount={totals.aviShareEur} /></div>
          <div className="avi-account-bar-amount-hint">{copy.aviExpenseShare}</div>
        </div>
      </div>
      <div className="avi-kpi-strip">
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.certifiedExpenseRows}</div>
          <div className="avi-kpi-value" dir="ltr">{totals.rowCount}</div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.totalCharges}</div>
          <div className="avi-kpi-value"><MoneyValue amount={totals.totalChargeEur} size="sm" /></div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.aviExpenseShare}</div>
          <div className="avi-kpi-value"><MoneyValue amount={totals.aviShareEur} size="sm" /></div>
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
  lang,
}: {
  layer: AviVisibleExpenseLayer
  title: string
  subtitle: string
  expenses: readonly AviReportPartnerExpense[]
  layerTotals: AviReportLayerBreakdown | undefined
  lang: AviReportLang
}) {
  const rows = expenses.map((e) => ({
    date: <AviReportDate iso={aviExpensePeriodKey(e.date)} lang={lang} mode="month" />,
    category: e.category ?? '—',
    subcategory: e.subcategory ?? '—',
    amount: <MoneyValue amount={e.amountEur} size="sm" />,
    aviPct: `${e.aviSharePct}%`,
    aviShare: <MoneyValue amount={e.aviShareEur} size="sm" />,
  }))
  const tone =
    layer === 'renovation' ? 'purple' :
    layer === 'airbnb' ? 'orange' :
    layer === 'deal_expense' ? 'navy' : 'blue'
  return (
    <section
      className="avi-section avi-print-keep-header"
      data-testid={`avi-expense-department-${layer}`}
    >
      <div className="avi-account-bar" data-tone={tone}>
        <div>
          <h2 className="avi-account-bar-title">{title}</h2>
          <p className="avi-account-bar-sub">{subtitle}</p>
        </div>
        {layerTotals?.aviShareEur != null && (
          <div className="avi-account-bar-right">
            <div className="avi-account-bar-amount"><MoneyValue amount={layerTotals.aviShareEur} /></div>
            <div className="avi-account-bar-amount-hint">Avi 50%</div>
          </div>
        )}
      </div>
      {layerTotals && layerTotals.totalChargeEur != null && layerTotals.aviShareEur != null && (
        <div className="avi-kpi-strip">
          <div className="avi-kpi-tile">
            <div className="avi-kpi-label">Certified charge</div>
            <div className="avi-kpi-value"><MoneyValue amount={layerTotals.totalChargeEur} size="sm" /></div>
          </div>
          <div className="avi-kpi-tile">
            <div className="avi-kpi-label">Avi 50% share</div>
            <div className="avi-kpi-value"><MoneyValue amount={layerTotals.aviShareEur} size="sm" /></div>
          </div>
          <div className="avi-kpi-tile">
            <div className="avi-kpi-label">Certified rows</div>
            <div className="avi-kpi-value" dir="ltr">{expenses.length}</div>
          </div>
        </div>
      )}
      {expenses.length === 0 ? (
        <p className="avi-note-plain">No certified expenses in this department.</p>
      ) : (
        <DataTable columns={EXPENSE_COLUMNS} rows={rows} caption={title} />
      )}
    </section>
  )
}

export function AviCertifiedExpenseAppendix({
  expenses,
  totals,
  layers,
  completeness,
  lang = 'en',
}: {
  expenses: readonly AviReportPartnerExpense[]
  totals: AviReportVisibleExpenseTotals
  layers: readonly AviReportLayerBreakdown[]
  completeness: AviReportExpenseCompleteness
  lang?: AviReportLang
}) {
  const missingTitles = completeness.departmentsMissingDetailRows.map((layer) => {
    const dept = EXPENSE_DEPARTMENTS.find((d) => d.layer === layer)
    return dept?.title ?? layer
  })
  return (
    <div className="avi-print-expenses space-y-6" data-testid="avi-expense-table">
      <div className="avi-account-bar" data-tone="navy">
        <div>
          <h2 className="avi-account-bar-title">Certified Expenses</h2>
          <p className="avi-account-bar-sub">
            Each department is listed separately. Avi 50% share. Payer is not shown.
          </p>
        </div>
        <div className="avi-account-bar-right">
          <div className="avi-account-bar-amount" dir="ltr">{totals.rowCount}</div>
          <div className="avi-account-bar-amount-hint">certified rows</div>
        </div>
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
            lang={lang}
          />
        )
      })}
    </div>
  )
}

function paymentColumns(lang: AviReportLang): DataTableColumn[] {
  const copy = AVI_REPORT_COPY[lang]
  return [
    { key: 'date', label: copy.date, dir: lang === 'he' ? 'rtl' : undefined },
    { key: 'label', label: copy.label },
    { key: 'amount', label: copy.amount, align: 'right', dir: 'ltr' },
  ]
}

function AirbnbCreditsSection({
  credits,
  lang,
}: {
  credits: AviReportAirbnbCredits
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <section className="avi-section avi-print-keep" data-testid="avi-airbnb-credits">
      <div className="avi-account-bar" data-tone="orange">
        <div>
          <h2 className="avi-account-bar-title">{copy.airbnbIncome}</h2>
          <p className="avi-account-bar-sub">{copy.airbnbIncomeSubtitle}</p>
        </div>
        <div className="avi-account-bar-right">
          <div className="avi-account-bar-amount"><MoneyValue amount={credits.totalAviEur} /></div>
          <div className="avi-account-bar-amount-hint">{copy.aviShareCredit}</div>
        </div>
      </div>
      <div className="avi-kpi-strip">
        <div className="avi-kpi-tile" data-testid="avi-private-booking-credit">
          <div className="avi-kpi-label">{copy.privateIncome}</div>
          <div className="avi-kpi-value" data-testid="avi-private-booking-total">
            <MoneyValue amount={credits.privateBookingTotalEur} size="sm" />
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5" data-testid="avi-private-booking-avi">
            {copy.aviShareCredit}: <MoneyValue amount={credits.privateBookingAviEur} size="sm" />
          </div>
        </div>
        <div className="avi-kpi-tile" data-testid="avi-hostaway-rental-credit">
          <div className="avi-kpi-label">{copy.hostawayIncome}</div>
          <div className="avi-kpi-value">
            <MoneyValue amount={credits.hostawayPrintedNtoTotalEur} size="sm" />
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {copy.aviShare}: <MoneyValue amount={credits.hostawayAviEur} size="sm" />
          </div>
        </div>
      </div>
      <table className="w-full text-sm avi-table" dir="ltr">
        <thead>
          <tr>
            <th scope="col">{copy.incomeSource}</th>
            <th scope="col" className="text-right">{copy.printedNto}</th>
            <th scope="col" className="text-right">{copy.aviShare}</th>
          </tr>
        </thead>
        <tbody>
          <tr data-testid="avi-hostaway-aggregated-stays">
            <td>
              {copy.completedHostawayStays}
              <span className="mt-0.5 block text-xs font-normal text-slate-500" dir="ltr">
                {formatAviStayNightLabel(lang, credits.completedStayCount, credits.completedNights)}
              </span>
            </td>
            <td className="text-right"><MoneyValue amount={credits.hostawayPrintedNtoTotalEur} size="sm" /></td>
            <td className="text-right"><MoneyValue amount={credits.hostawayAviEur} size="sm" /></td>
          </tr>
          <tr data-testid="avi-private-booking-row">
            <td>{copy.privateIncome}</td>
            <td className="text-right"><MoneyValue amount={credits.privateBookingTotalEur} size="sm" /></td>
            <td className="text-right"><MoneyValue amount={credits.privateBookingAviEur} size="sm" /></td>
          </tr>
          <tr className="avi-total-row">
            <td>{copy.airbnbCreditsTotal}</td>
            <td className="text-right" />
            <td className="text-right"><MoneyValue amount={credits.totalAviEur} size="sm" /></td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function PaymentTable({
  payments,
  lang,
}: {
  payments: readonly AviReportPartnerPayment[]
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  const rows = payments.map((p) => ({
    date: <AviReportDate iso={p.date} lang={lang} mode="full" />,
    label: aviPaymentPurpose(p.id, lang, p.label),
    amount: <MoneyValue amount={p.amountEur} size="sm" />,
  }))
  const total = payments.reduce((s, p) => s + (p.amountEur ?? 0), 0)
  return (
    <div className="avi-section avi-print-payments" data-testid="avi-payment-table" data-avi-payments-lang={lang}>
      <div className="avi-account-bar" data-tone="navy">
        <div>
          <h2 className="avi-account-bar-title">{copy.payments}</h2>
          <p className="avi-account-bar-sub">{copy.paymentsSubtitle}</p>
        </div>
        <div className="avi-account-bar-right">
          <div className="avi-account-bar-amount"><MoneyValue amount={total} /></div>
          <div className="avi-account-bar-amount-hint">{copy.paid}</div>
        </div>
      </div>
      <DataTable columns={paymentColumns(lang)} rows={rows} caption={copy.payments} />
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

function PrintMasthead({
  snapshot,
  lang,
}: {
  snapshot: AviReportSnapshotMeta
  lang: AviReportLang
}) {
  const [generatedIso, setGeneratedIso] = useState<string | null>(null)
  useEffect(() => {
    setGeneratedIso(new Date().toISOString().slice(0, 10))
  }, [])
  const copy = AVI_REPORT_COPY[lang]
  const dir = aviReportDir(lang)
  return (
    <header
      className="avi-print-only avi-print-masthead avi-doc-masthead"
      data-testid="avi-print-masthead"
      dir={dir}
    >
      <div className="avi-doc-brand-block">
        <p className="avi-doc-brand">JJ Property 10</p>
        <p className="avi-doc-title">{copy.reportTitle}</p>
        <p className="avi-doc-property">{lang === 'he' ? 'אבי' : 'Avi'} · {copy.propertyName}</p>
      </div>
      <div className="avi-doc-meta">
        <p className="avi-doc-meta-line" data-testid="avi-print-generated">
          {lang === 'he' ? (
            generatedIso ? <HebrewGeneratedSentence iso={generatedIso} /> : <span>—</span>
          ) : (
            <>
              {copy.generatedOn}{' '}
              {generatedIso ? formatAviFullDate(generatedIso, 'en') : '—'}
            </>
          )}
        </p>
        <p className="avi-doc-meta-confidential">{copy.certified}</p>
        <p className="avi-doc-meta-line avi-doc-meta-note">{copy.confidentiality}</p>
      </div>
    </header>
  )
}

function ScreenMasthead({
  snapshot,
  lang,
}: {
  snapshot: AviReportSnapshotMeta
  lang: AviReportLang
}) {
  const [generatedIso, setGeneratedIso] = useState<string | null>(null)
  useEffect(() => {
    setGeneratedIso(new Date().toISOString().slice(0, 10))
  }, [])
  const copy = AVI_REPORT_COPY[lang]
  return (
    <>
      <header
        className="avi-screen-only avi-doc-masthead avi-print-hide"
        data-testid="avi-screen-masthead"
        dir={aviReportDir(lang)}
      >
        <div className="avi-doc-brand-block">
          <p className="avi-doc-brand">JJ Property 10</p>
          <p className="avi-doc-title">{copy.reportTitle}</p>
          <p className="avi-doc-property">{lang === 'he' ? 'אבי' : 'Avi'} · {copy.propertyName}</p>
        </div>
        <div className="avi-doc-meta">
          <span className="avi-certified-pill">{copy.certified}</span>
          <p className="avi-doc-meta-line">
            {lang === 'he' ? (
              generatedIso ? <HebrewGeneratedSentence iso={generatedIso} /> : <span>—</span>
            ) : (
              <>
                {copy.generatedOn}{' '}
                {generatedIso ? formatAviFullDate(generatedIso, 'en') : '—'}
              </>
            )}
          </p>
          <p className="avi-doc-meta-confidential">{copy.confidentiality}</p>
        </div>
      </header>
      <div className="avi-meta-block avi-print-keep" dir={aviReportDir(lang)}>
        <div className="avi-meta-row">
          <span className="avi-meta-label">{lang === 'he' ? 'נכס' : 'Property'}</span>
          <span className="avi-meta-value">{copy.propertyName}</span>
        </div>
        <div className="avi-meta-row" data-testid="avi-print-cutoff">
          <span className="avi-meta-label">{lang === 'he' ? 'תקופה' : 'Period'}</span>
          <span className="avi-meta-value">
            {lang === 'he' ? (
              <HebrewCutoffSentence iso={snapshot.cutoffDate} />
            ) : (
              <>
                {copy.transactionsThrough} {formatAviFullDate(snapshot.cutoffDate, 'en')}
              </>
            )}
          </span>
        </div>
        <div className="avi-meta-row" data-testid="avi-hostaway-period">
          <span className="avi-meta-label">{copy.hostawayIncome}</span>
          <span className="avi-meta-value">
            {lang === 'he' ? (
              <>
                {copy.hostawayIncomeThrough}{' '}
                <HebrewFullDate iso={AVI_HOSTAWAY_LAST_CHECKOUT_DATE} />
              </>
            ) : (
              <>
                {copy.hostawayIncomeThrough}{' '}
                {formatAviFullDate(AVI_HOSTAWAY_LAST_CHECKOUT_DATE, 'en')}
              </>
            )}
          </span>
        </div>
        <div className="avi-meta-row">
          <span className="avi-meta-label">{copy.generatedLabel}</span>
          <span className="avi-meta-value">
            {lang === 'he' ? (
              generatedIso ? <HebrewFullDate iso={generatedIso} /> : <span>—</span>
            ) : (
              generatedIso ? formatAviFullDate(generatedIso, 'en') : '—'
            )}
          </span>
        </div>
        <p className="avi-note-plain">{copy.approvedChargesNote}</p>
      </div>
    </>
  )
}

function PrintFooter({ lang }: { lang: AviReportLang }) {
  const [generatedIso, setGeneratedIso] = useState<string | null>(null)
  useEffect(() => {
    setGeneratedIso(new Date().toISOString().slice(0, 10))
  }, [])
  const copy = AVI_REPORT_COPY[lang]
  const dateLabel =
    generatedIso == null ? '—' : formatAviFullDate(generatedIso, lang)
  return (
    <footer
      className="avi-print-hide print:hidden avi-print-footer"
      data-testid="avi-print-footer"
      data-avi-footer-copy={`${copy.footerConfidential} · ${copy.propertyName} · ${copy.footerPartnerReport}`}
      dir={aviReportDir(lang)}
    >
      <div className="avi-print-footer-inner">
        <span>
          {copy.footerConfidential} · {copy.propertyName} · {copy.footerPartnerReport} · {dateLabel}
        </span>
        <span className="avi-print-page-num" data-testid="avi-print-page-num">
          {copy.pageLabel} <span className="avi-page-number" /> {copy.pageOf}{' '}
          <span className="avi-page-count" />
        </span>
      </div>
    </footer>
  )
}

function PurchaseExpensesSection({
  purchase,
  lang,
}: {
  purchase: AviPurchaseExpensesSection
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <section className="avi-section avi-print-keep" data-testid="avi-purchase-expenses">
      <div className="avi-account-bar" data-tone="navy">
        <div>
          <h2 className="avi-account-bar-title">{copy.purchaseExpenses}</h2>
          <p className="avi-account-bar-sub">{copy.purchaseSubtitle}</p>
        </div>
        <div className="avi-account-bar-right">
          <div className="avi-account-bar-amount"><MoneyValue amount={purchase.aviRemainingEur} /></div>
          <div className="avi-account-bar-amount-hint">{copy.aviRemaining}</div>
        </div>
      </div>
      <div className="avi-kpi-strip">
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.propertyTotal}</div>
          <div className="avi-kpi-value"><MoneyValue amount={purchase.totalEur} /></div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.aviShare}</div>
          <div className="avi-kpi-value"><MoneyValue amount={purchase.aviShareEur} /></div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.aviPaid}</div>
          <div className="avi-kpi-value"><MoneyValue amount={purchase.aviPaidEur} /></div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.aviRemaining}</div>
          <div className="avi-kpi-value"><MoneyValue amount={purchase.aviRemainingEur} /></div>
        </div>
      </div>
      <p className="avi-group-label">{copy.purchaseExpenses}</p>
      <table className="w-full text-sm avi-table" dir="ltr">
        <thead>
          <tr>
            <th scope="col">{copy.month}</th>
            <th scope="col">{copy.purchaseExpenses}</th>
            <th scope="col" className="text-right">{copy.propertyTotal}</th>
            <th scope="col" className="text-right">{copy.aviShare}</th>
          </tr>
        </thead>
        <tbody>
          {purchase.lines.map((line, i) => (
            <tr key={`${line.month}-${line.labelEn}-${i}`}>
              <td><AviReportDate iso={line.month} lang={lang} mode="month" /></td>
              <td>{lang === 'he' ? line.labelHe : line.labelEn}</td>
              <td className="text-right"><MoneyValue amount={line.amountEur} size="sm" /></td>
              <td className="text-right"><MoneyValue amount={line.aviShareEur} size="sm" /></td>
            </tr>
          ))}
          <tr className="avi-total-row">
            <td colSpan={2}>{lang === 'he' ? 'סה״כ' : 'Total'}</td>
            <td className="text-right"><MoneyValue amount={purchase.totalEur} size="sm" /></td>
            <td className="text-right"><MoneyValue amount={purchase.aviShareEur} size="sm" /></td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function RenovationWorkSection({
  renovation,
  lang,
}: {
  renovation: AviRenovationSection
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <section className="avi-section avi-print-keep" data-testid="avi-renovation">
      <div className="avi-account-bar" data-tone="purple">
        <div>
          <h2 className="avi-account-bar-title">{copy.renovation}</h2>
          <p className="avi-account-bar-sub">{copy.renovationSubtitle}</p>
        </div>
        <div className="avi-account-bar-right">
          <div className="avi-account-bar-amount"><MoneyValue amount={renovation.aviRemainingEur} /></div>
          <div className="avi-account-bar-amount-hint">{copy.aviRemaining}</div>
        </div>
      </div>
      <div className="avi-kpi-strip">
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.propertyTotal}</div>
          <div className="avi-kpi-value"><MoneyValue amount={renovation.certifiedChargeEur} /></div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.aviShare}</div>
          <div className="avi-kpi-value"><MoneyValue amount={renovation.aviShareEur} /></div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.aviPaid}</div>
          <div className="avi-kpi-value"><MoneyValue amount={renovation.aviPaidEur} /></div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.aviRemaining}</div>
          <div className="avi-kpi-value"><MoneyValue amount={renovation.aviRemainingEur} /></div>
        </div>
      </div>
      {renovation.groups.length > 0 && (
        <>
          <p className="avi-group-label">{copy.renovation}</p>
          <table className="w-full text-sm avi-table" dir="ltr">
            <thead>
              <tr>
                <th scope="col">{copy.renovation}</th>
                <th scope="col" className="text-right">{copy.rows}</th>
                <th scope="col" className="text-right">{copy.propertyTotal}</th>
                <th scope="col" className="text-right">{copy.aviShare}</th>
              </tr>
            </thead>
            <tbody>
              {renovation.groups.map((g) => (
                <tr key={g.subcategory}>
                  <td>{aviRenovationCategoryLabel(g.subcategory, lang)}</td>
                  <td className="text-right tabular-nums">{g.rowCount}</td>
                  <td className="text-right"><MoneyValue amount={g.totalEur} size="sm" /></td>
                  <td className="text-right"><MoneyValue amount={g.aviShareEur} size="sm" /></td>
                </tr>
              ))}
              <tr className="avi-total-row">
                <td colSpan={2}>{lang === 'he' ? 'סה״כ' : 'Total'}</td>
                <td className="text-right"><MoneyValue amount={renovation.certifiedChargeEur} size="sm" /></td>
                <td className="text-right"><MoneyValue amount={renovation.aviShareEur} size="sm" /></td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

function HostawayIncomeSection({
  income,
  lang,
}: {
  income: AviHostawayIncomeSection
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <section className="avi-section avi-print-keep" data-testid="avi-hostaway-income">
      <div className="avi-account-bar" data-tone="blue">
        <div>
          <h2 className="avi-account-bar-title">{copy.hostawayIncome}</h2>
        </div>
        <div className="avi-account-bar-right">
          <div className="avi-account-bar-amount"><MoneyValue amount={income.printedNtoTotalEur} /></div>
          <div className="avi-account-bar-amount-hint">{copy.printedNto}</div>
        </div>
      </div>
      <div className="avi-kpi-strip">
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.stays}</div>
          <div className="avi-kpi-value" dir="ltr">{income.stayCount}</div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.nights}</div>
          <div className="avi-kpi-value" dir="ltr">{income.nights}</div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.income}</div>
          <div className="avi-kpi-value"><MoneyValue amount={income.printedNtoTotalEur} /></div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.aviShare}</div>
          <div className="avi-kpi-value"><MoneyValue amount={income.aviShareEur} /></div>
        </div>
      </div>
    </section>
  )
}

function AirbnbDepartmentSection({
  department,
  lang,
}: {
  department: AviAirbnbSection['setup'] | AviAirbnbSection['operations']
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  const title = lang === 'he' ? department.labelHe : department.labelEn
  const description = lang === 'he' ? department.descriptionHe : department.descriptionEn
  const isOperations = department.key === 'operations'
  return (
    <section
      className={`avi-section ${isOperations ? 'avi-print-ops' : 'avi-print-keep'}`}
      data-testid={`avi-airbnb-${department.key}`}
    >
      <div className="avi-account-bar avi-print-section-title" data-tone="orange">
        <div>
          <h2 className="avi-account-bar-title">{title}</h2>
          <p className="avi-account-bar-sub">{description}</p>
        </div>
        <div className="avi-account-bar-right">
          <div className="avi-account-bar-amount"><MoneyValue amount={department.totalEur} /></div>
          <div className="avi-account-bar-amount-hint">{copy.propertyTotal}</div>
        </div>
      </div>
      <div className="avi-kpi-strip avi-print-keep">
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.propertyTotal}</div>
          <div className="avi-kpi-value"><MoneyValue amount={department.totalEur} /></div>
        </div>
        <div className="avi-kpi-tile">
          <div className="avi-kpi-label">{copy.aviShare}</div>
          <div className="avi-kpi-value"><MoneyValue amount={department.aviShareEur} /></div>
        </div>
      </div>
      <table className="w-full text-sm avi-table avi-ops-table" dir={lang === 'he' ? 'rtl' : 'ltr'}>
        <thead>
          {isOperations && (
            <tr className="avi-ops-continued-banner avi-print-only">
              <th colSpan={3} scope="colgroup">
                {copy.operationsContinued}
              </th>
            </tr>
          )}
          <tr>
            <th scope="col">{copy.month}</th>
            <th scope="col">{title}</th>
            <th scope="col" className="text-end">{copy.propertyTotal}</th>
          </tr>
        </thead>
        <tbody>
          {department.lines.map((line, i) => (
            <tr key={`${line.month}-${line.labelEn}-${i}`}>
              <td><AviReportDate iso={line.month} lang={lang} mode="month" /></td>
              <td>{lang === 'he' ? line.labelHe : line.labelEn}</td>
              <td className="text-end"><MoneyValue amount={line.amountEur} size="sm" /></td>
            </tr>
          ))}
          <tr className="avi-total-row">
            <td colSpan={2}>{lang === 'he' ? 'סה״כ' : 'Total'}</td>
            <td className="text-end"><MoneyValue amount={department.totalEur} size="sm" /></td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function MonthlySection({
  monthly,
  lang,
}: {
  monthly: AviMonthlySection
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const incomeRows = monthly.rows.filter((row) => row.incomeEur !== 0 || row.stayCount > 0)
  return (
    <section className="avi-section avi-print-keep-header" data-testid="avi-monthly">
      <div className="avi-account-bar" data-tone="blue">
        <div>
          <h2 className="avi-account-bar-title">{copy.monthly}</h2>
          <p className="avi-account-bar-sub">{copy.monthlySubtitle}</p>
        </div>
        <div className="avi-account-bar-right">
          <div className="avi-account-bar-amount"><MoneyValue amount={monthly.totals.incomeEur} /></div>
          <div className="avi-account-bar-amount-hint">{copy.monthlyGrandTotal}</div>
        </div>
      </div>
      <table className="w-full text-sm avi-table" dir="ltr">
        <thead>
          <tr>
            <th scope="col">{copy.month}</th>
            <th scope="col" className="text-right">{copy.income}</th>
            <th scope="col" className="text-right">{copy.aviIncomeShare}</th>
          </tr>
        </thead>
        <tbody>
          {incomeRows.map((row) => {
            const open = openMonth === row.month
            return (
              <tr key={row.month}>
                <td>
                  <div className="text-sm font-medium text-slate-900" data-avi-month-label>
                    <AviReportDate iso={row.month} lang={lang} mode="month" />
                  </div>
                  {row.stayCount > 0 && (
                    <div className="mt-0.5 text-xs text-slate-500" dir="ltr">
                      {formatAviStayNightLabel(lang, row.stayCount, row.nights)}
                      <button
                        type="button"
                        className="avi-print-hide ms-2 underline"
                        onClick={() => setOpenMonth(open ? null : row.month)}
                      >
                        {open ? copy.collapse : copy.expand}
                      </button>
                    </div>
                  )}
                  {open && row.stays.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-slate-600 avi-print-hide">
                      {row.stays.map((stay) => (
                        <li key={stay.reservationId}>
                          {stay.checkIn} · {stay.channel} · <MoneyValue amount={stay.printedNtoEur} size="sm" />
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="text-right"><MoneyValue amount={row.incomeEur} size="sm" /></td>
                <td className="text-right"><MoneyValue amount={row.aviIncomeShareEur} size="sm" /></td>
              </tr>
            )
          })}
          {monthly.incomeShareRoundingAdjustmentEur !== 0 && (
            <tr data-testid="avi-monthly-rounding-adjustment">
              <td colSpan={2}>{copy.roundingAdjustment}</td>
              <td className="text-right">
                <MoneyValue amount={monthly.incomeShareRoundingAdjustmentEur} size="sm" />
              </td>
            </tr>
          )}
          <tr className="avi-total-row" data-testid="avi-monthly-totals">
            <td>{copy.monthlyGrandTotal}</td>
            <td className="text-right"><MoneyValue amount={monthly.totals.incomeEur} size="sm" /></td>
            <td className="text-right"><MoneyValue amount={monthly.totals.aviIncomeShareEur} size="sm" /></td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function FinalSettlementSection({
  summary,
  lang,
}: {
  summary: AviFinalSummary
  lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <section className="avi-print-keep" data-testid="avi-final-summary">
      <div className="avi-settlement-box">
        <div className="avi-settlement-kicker">{copy.settlementKicker}</div>
        <p className="avi-fin-summary-sub" style={{ marginBottom: '0.45rem' }}>{copy.finalSettlement}</p>
        <table dir="ltr">
          <thead>
            <tr>
              <th scope="col">{copy.settlementItem}</th>
              <th scope="col" className="text-right">{copy.obligation}</th>
              <th scope="col" className="text-right">{copy.paid}</th>
              <th scope="col" className="text-right">{copy.credits}</th>
              <th scope="col" className="text-right">{copy.remaining}</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.key}>
                <td>{lang === 'he' ? row.labelHe : row.labelEn}</td>
                <td className="text-right"><MoneyValue amount={row.obligationEur} size="sm" /></td>
                <td className="text-right"><MoneyValue amount={row.paidEur} size="sm" /></td>
                <td className="text-right"><MoneyValue amount={row.creditEur} size="sm" /></td>
                <td className="text-right"><MoneyValue amount={row.remainingEur} size="sm" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="avi-fin-ops" style={{ marginTop: '0.55rem' }}>
          <div className="avi-fin-ops-cell">
            <div className="avi-fin-ops-value"><MoneyValue amount={summary.obligationTotalEur} /></div>
            <div className="avi-fin-ops-label">{copy.obligation}</div>
          </div>
          <div className="avi-fin-ops-cell">
            <div className="avi-fin-ops-value"><MoneyValue amount={summary.paidTotalEur} /></div>
            <div className="avi-fin-ops-label">{copy.paid}</div>
          </div>
          <div className="avi-fin-ops-cell" data-tone="summary">
            <div className="avi-fin-ops-value"><MoneyValue amount={summary.netEur} /></div>
            <div className="avi-fin-ops-label">{copy.summary}</div>
          </div>
        </div>
        <p className="avi-fin-formula" data-testid="avi-settlement-formula">
          {copy.formula}
        </p>
        <p className="avi-settlement-narrative" data-testid="avi-closing-narrative">
          {copy.closingNarrative}
        </p>
      </div>
    </section>
  )
}

export function ExternalPartnerAviReportView({
  report,
  audience = 'staff',
  initialLang = 'en',
  sendablePdfPath = null,
}: Props) {
  const isPartner = audience === 'partner'
  const [lang, setLang] = useState<AviReportLang>(initialLang)
  const dir = aviReportDir(lang)
  const sendablePdfHref = sendablePdfPath
    ? `${sendablePdfPath}?lang=${lang}`
    : null

  if (report.status === 'failed') {
    return (
      <div className="space-y-6">
        <style dangerouslySetInnerHTML={{ __html: AVI_REPORT_PRINT_CSS }} />
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
  const postAcquisitionSemantic = formatAviOwedCopy(lang, avi?.semanticNet ?? null, avi?.direction ?? null)

  return (
    <div
      className="space-y-6"
      data-testid="avi-report-certified"
      data-avi-print-root
      data-avi-audience={audience}
      data-avi-lang={lang}
      dir={dir}
    >
      {/* dangerouslySetInnerHTML avoids SSR/client quote-escaping mismatch inside <style>,
          which previously caused a React hydration error and the Next.js “1 error” print overlay. */}
      <style dangerouslySetInnerHTML={{ __html: AVI_REPORT_PRINT_CSS }} />
      <PrintMasthead snapshot={report.snapshot} lang={lang} />
      <ScreenMasthead snapshot={report.snapshot} lang={lang} />
      <LanguageToggle lang={lang} onChange={setLang} sendablePdfHref={sendablePdfHref} />
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
      <PartnerSummarySection partners={report.partners} lang={lang} />
      <OwnershipSection partners={report.partners} lang={lang} />
      <AcquisitionSection acquisition={report.acquisition} lang={lang} />
      <PurchaseExpensesSection purchase={report.purchaseExpenses} lang={lang} />
      <RenovationWorkSection renovation={report.renovation} lang={lang} />
      {!isPartner && (
        <LayerBreakdownSection
          layers={report.layers}
          postAcquisitionSemantic={postAcquisitionSemantic}
          lang={lang}
        />
      )}
      <PrintLayerSection
        layers={report.layers}
        postAcquisitionSemantic={postAcquisitionSemantic}
        visibleOnScreen={isPartner}
        lang={lang}
      />
      <PrintExpenseReconciliation
        totals={report.visibleExpenseTotals}
        visibleOnScreen={isPartner}
        lang={lang}
      />
      <AirbnbCreditsSection credits={report.airbnbCredits} lang={lang} />
      <HostawayIncomeSection income={report.hostawayIncome} lang={lang} />
      <AirbnbDepartmentSection department={report.airbnb.setup} lang={lang} />
      <AirbnbDepartmentSection department={report.airbnb.operations} lang={lang} />
      <p className="avi-note-plain avi-print-keep" data-testid="avi-internet-split-note">
        {AVI_REPORT_COPY[lang].internetSplitNote}
      </p>
      <MonthlySection monthly={report.monthly} lang={lang} />
      <div
        className="avi-print-hide print:hidden rounded-xl border border-gray-200 bg-white p-4"
        data-testid="avi-expense-appendix-link"
      >
        <p className="text-sm font-medium text-gray-900">{AVI_REPORT_COPY[lang].appendixTitle}</p>
        <p className="mt-1 text-xs text-gray-600">{AVI_REPORT_COPY[lang].appendixSubtitle}</p>
        <a
          href="/preview/avi-certified-compose/appendix"
          className="mt-3 inline-flex text-sm font-semibold text-gray-900 underline"
        >
          {AVI_REPORT_COPY[lang].appendixButton}
        </a>
      </div>
      <PaymentTable payments={report.partnerPayments} lang={lang} />
      <FinalSettlementSection summary={report.finalSummary} lang={lang} />
      <PrintFooter lang={lang} />
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
