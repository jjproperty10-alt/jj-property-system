import type { CapitalStatement } from '@/lib/lifecycle/partnerStatementTypes'
import { MoneyValue, SectionHeader } from '@/components/ds'

interface Props {
  capital: CapitalStatement
}

/**
 * PartnerCapitalSection
 *
 * Renders capital events, status badge, and payment history.
 * No business logic — all values come pre-computed from the DTO.
 *
 * Handles all CapitalStatus values including deprecated `not_applicable`
 * (retained in v1.0 for source compatibility; never emitted by the service).
 * P-ARCH-1: NULL rendered as em-dash (MoneyValue) or "—", never coerced to 0.
 *
 * E2: Migrated to MoneyValue (null → em-dash + dir="ltr") and SectionHeader.
 * AmountRow inline component removed — replaced by jj-label + MoneyValue.
 */
export function PartnerCapitalSection({ capital }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <SectionHeader
        title="Capital"
        action={<CapitalStatusBadge status={capital.capitalStatus} />}
        className="mb-4"
      />

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-4">
        {capital.agreedEntryValuationEur !== null && (
          <div>
            <div className="jj-label mb-0.5">Agreed Valuation</div>
            <MoneyValue amount={capital.agreedEntryValuationEur} size="sm" />
          </div>
        )}
        {capital.requiredCapitalEur !== null && (
          <div>
            <div className="jj-label mb-0.5">Required Capital</div>
            <MoneyValue amount={capital.requiredCapitalEur} size="sm" />
          </div>
        )}
        <div>
          <div className="jj-label mb-0.5">Capital Paid</div>
          <MoneyValue
            amount={capital.capitalPaidEur}
            size="sm"
            className={capital.capitalPaidEur !== null ? 'text-green-700 font-semibold' : ''}
          />
        </div>
        {capital.capitalRemainingEur !== null && (
          <div>
            <div className="jj-label mb-0.5">Remaining</div>
            <MoneyValue
              amount={capital.capitalRemainingEur}
              size="sm"
              className={capital.capitalRemainingEur > 0 ? 'text-amber-700 font-semibold' : 'text-green-700 font-semibold'}
            />
          </div>
        )}
      </div>

      {capital.payments.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Payment History
          </p>
          <ul className="space-y-1.5">
            {capital.payments.map((p) => (
              <li key={p.eventId} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-500 shrink-0" dir="ltr">
                    {p.effectiveDate
                      ? new Date(p.effectiveDate).toLocaleDateString('en-IE')
                      : '\u2014'}
                  </span>
                  {p.payerName && (
                    <span className="text-xs text-gray-400 truncate">via {p.payerName}</span>
                  )}
                  {p.effectiveDateConfidence === 'pending_verification' && (
                    <span className="text-[10px] text-amber-500 shrink-0">date unconfirmed</span>
                  )}
                </div>
                <MoneyValue
                  amount={p.amountEur}
                  size="sm"
                  className="font-semibold text-gray-900 shrink-0 ml-4"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {capital.capitalStatus === 'capital_unknown' && capital.payments.length === 0 && (
        <p className="text-xs text-gray-400 italic mt-2">
          Capital details pending confirmation.
        </p>
      )}
    </div>
  )
}

type CapStatus = CapitalStatement['capitalStatus']

/**
 * Handles all 5 CapitalStatus values.
 * not_applicable: @deprecated in v1.0 — never emitted by service, but UI must handle it safely.
 */
function CapitalStatusBadge({ status }: { status: CapStatus }) {
  const map: Record<CapStatus, { label: string; className: string }> = {
    no_capital_event: { label: 'No Capital Events', className: 'bg-gray-50 text-gray-400 border border-gray-200' },
    fully_paid:       { label: 'Fully Paid',        className: 'bg-green-100 text-green-700' },
    partially_paid:   { label: 'Partially Paid',    className: 'bg-amber-100 text-amber-700' },
    capital_unknown:  { label: 'Capital Pending',   className: 'bg-gray-100 text-gray-600' },
    not_applicable:   { label: 'N/A',               className: 'bg-gray-50 text-gray-400 border border-gray-200' },
  }
  const { label, className } = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${className}`}>
      {label}
    </span>
  )
}
