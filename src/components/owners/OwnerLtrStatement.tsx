'use client'

/**
 * OwnerLtrStatement — Printable Owner LTR Statement view.
 *
 * P8 LTR Operations — Owner LTR Statement Integration
 *
 * Renders OwnerLtrStatementDTO as a structured, print-friendly document.
 * Used by the Owner Workspace for on-screen viewing and browser print.
 *
 * Architecture:
 *   Page → fetchOwnerLtrStatementAction() → OwnerLtrStatementDTO → THIS component
 *
 * This component is a RENDERING LAYER only. It does not calculate, derive,
 * or infer any financial value. Every number displayed comes directly from
 * the DTO, which was computed by the adapter from P1–P7 + RC3 authorities.
 *
 * DS compliance:
 *   - MoneyValue for all monetary amounts
 *   - StatusBadge for balance direction + rent status
 *   - P-ARCH-1: null → em dash via MoneyValue
 *   - P-ARCH-6: no JJ margin, internal payer/payee, deposit custodian
 *   - P-LEDGER-6: expenses already use client_amount (adapter responsibility)
 *
 * Print: designed for @media print — compact layout, no interactive elements.
 */

import { MoneyValue, StatusBadge } from '@/components/ds'
import type {
  OwnerLtrStatementDTO,
  RentPeriodSummaryDTO,
  OwnerExpenseLineDTO,
  OwnerPaymentLineDTO,
  TenantChargeLineDTO,
  BalanceDirection,
} from '@/lib/owners/ownerWorkspaceTypes'
import type { StatusToken } from '@/lib/ds/tokens'

// ─── Display mappings ───────────────────────────────────────────────────────

const BALANCE_DIRECTION_MAP: Record<BalanceDirection, { token: StatusToken; label: string }> = {
  due_to_owner: { token: 'active', label: 'Due to Owner' },
  due_to_jj: { token: 'attention', label: 'Due to JJ' },
  balanced: { token: 'completed', label: 'Balanced' },
}

const RENT_STATUS_MAP: Record<string, { token: StatusToken; label: string }> = {
  paid: { token: 'completed', label: 'Paid' },
  partial: { token: 'pending', label: 'Partial' },
  overdue: { token: 'attention', label: 'Overdue' },
  pending: { token: 'pending', label: 'Pending' },
  waived: { token: 'unknown', label: 'Waived' },
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseAmount(s: string | null | undefined): number | null {
  if (s == null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function formatPeriod(start: string, end: string): string {
  try {
    const s = new Date(start + 'T00:00:00')
    const e = new Date(end + 'T00:00:00')
    const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' })
    return `${fmt.format(s)} — ${fmt.format(e)}`
  } catch {
    return `${start} — ${end}`
  }
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).format(new Date(d + 'T00:00:00'))
  } catch {
    return d
  }
}

function formatMonth(m: string): string {
  try {
    const [y, mo] = m.split('-')
    const d = new Date(Number(y), Number(mo) - 1, 1)
    return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(d)
  } catch {
    return m
  }
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface OwnerLtrStatementProps {
  statement: OwnerLtrStatementDTO
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-1 mb-3 mt-6 print:mt-4 print:mb-2">
      {title}
    </h3>
  )
}

function SummaryRow({
  label, amount, bold,
}: {
  label: string; amount: number | null; bold?: boolean
}) {
  return (
    <div className={`flex justify-between items-center py-1 ${bold ? 'font-semibold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <MoneyValue amount={amount} size={bold ? 'lg' : 'md'} />
    </div>
  )
}

// ─── Rental Income Section ──────────────────────────────────────────────────

function RentalIncomeSection({
  rentalIncome,
}: {
  rentalIncome: OwnerLtrStatementDTO['rentalIncome']
}) {
  return (
    <div>
      <SectionHeader title="Rental Income" />

      <div className="space-y-1 mb-3">
        <SummaryRow label="Expected" amount={parseAmount(rentalIncome.expected)} />
        <SummaryRow label="Received" amount={parseAmount(rentalIncome.received)} />
        <SummaryRow label="Outstanding" amount={parseAmount(rentalIncome.outstanding)} bold />
      </div>

      {rentalIncome.periods.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-500 text-xs uppercase">
              <th className="py-1 pr-2">Month</th>
              <th className="py-1 pr-2 text-right">Expected</th>
              <th className="py-1 pr-2 text-right">Received</th>
              <th className="py-1 pr-2 text-right">Payment Date</th>
              <th className="py-1 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rentalIncome.periods.map((p: RentPeriodSummaryDTO) => {
              const statusInfo = RENT_STATUS_MAP[p.status] ?? {
                token: 'unknown' as StatusToken, label: p.status,
              }
              return (
                <tr key={p.month} className="border-t border-gray-100">
                  <td className="py-1.5 pr-2">{formatMonth(p.month)}</td>
                  <td className="py-1.5 pr-2 text-right">
                    <MoneyValue amount={parseAmount(p.expected)} size="sm" />
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    <MoneyValue amount={parseAmount(p.received)} size="sm" />
                  </td>
                  <td className="py-1.5 pr-2 text-right text-gray-500">
                    {formatDate(p.paymentDate)}
                  </td>
                  <td className="py-1.5 text-right">
                    <StatusBadge status={statusInfo.token} label={statusInfo.label} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Management Fee Section ─────────────────────────────────────────────────

function ManagementFeeSection({
  managementFee,
}: {
  managementFee: OwnerLtrStatementDTO['managementFee']
}) {
  if (!managementFee) return null

  return (
    <div>
      <SectionHeader title="Management Fee" />
      <div className="text-xs text-gray-500 mb-2">
        {managementFee.feeType} {managementFee.periodLabel ? `· ${managementFee.periodLabel}` : ''}
      </div>
      <div className="space-y-1">
        <SummaryRow label="Due" amount={parseAmount(managementFee.due)} />
        <SummaryRow label="Settled" amount={parseAmount(managementFee.settled)} />
        <SummaryRow label="Outstanding" amount={parseAmount(managementFee.outstanding)} bold />
      </div>
    </div>
  )
}

// ─── Owner Expenses Section ─────────────────────────────────────────────────

function OwnerExpensesSection({
  expenses, total,
}: {
  expenses: readonly OwnerExpenseLineDTO[]; total: string | null
}) {
  if (expenses.length === 0) {
    return (
      <div>
        <SectionHeader title="Owner Expenses" />
        <p className="text-sm text-gray-400 italic">No expenses in this period.</p>
      </div>
    )
  }

  return (
    <div>
      <SectionHeader title="Owner Expenses" />
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 text-xs uppercase">
            <th className="py-1 pr-2">Date</th>
            <th className="py-1 pr-2">Description</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((exp: OwnerExpenseLineDTO, i: number) => (
            <tr key={`exp-${i}`} className="border-t border-gray-100">
              <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">
                {formatDate(exp.date)}
              </td>
              <td className="py-1.5 pr-2">{exp.description}</td>
              <td className="py-1.5 text-right">
                <MoneyValue amount={parseAmount(exp.chargeAmount)} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 font-semibold">
            <td colSpan={2} className="py-1.5 pr-2">Total Expenses</td>
            <td className="py-1.5 text-right">
              <MoneyValue amount={parseAmount(total)} size="md" />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Owner Payments Section ─────────────────────────────────────────────────

function OwnerPaymentsSection({
  payments, total,
}: {
  payments: readonly OwnerPaymentLineDTO[]; total: string | null
}) {
  if (payments.length === 0) {
    return (
      <div>
        <SectionHeader title="Payments to Owner" />
        <p className="text-sm text-gray-400 italic">No payments in this period.</p>
      </div>
    )
  }

  return (
    <div>
      <SectionHeader title="Payments to Owner" />
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 text-xs uppercase">
            <th className="py-1 pr-2">Date</th>
            <th className="py-1 pr-2">Description</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((pmt: OwnerPaymentLineDTO, i: number) => (
            <tr key={`pmt-${i}`} className="border-t border-gray-100">
              <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">
                {formatDate(pmt.date)}
              </td>
              <td className="py-1.5 pr-2">{pmt.description}</td>
              <td className="py-1.5 text-right">
                <MoneyValue amount={parseAmount(pmt.amount)} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 font-semibold">
            <td colSpan={2} className="py-1.5 pr-2">Total Payments</td>
            <td className="py-1.5 text-right">
              <MoneyValue amount={parseAmount(total)} size="md" />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Tenant Charges Section ─────────────────────────────────────────────────

function TenantChargesSection({
  charges,
}: {
  charges: readonly TenantChargeLineDTO[]
}) {
  if (charges.length === 0) return null

  return (
    <div>
      <SectionHeader title="Tenant Charges (Relevant to Owner)" />
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 text-xs uppercase">
            <th className="py-1 pr-2">Type</th>
            <th className="py-1 pr-2">Description</th>
            <th className="py-1 pr-2 text-right">Amount</th>
            <th className="py-1 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {charges.map((ch: TenantChargeLineDTO, i: number) => (
            <tr key={`ch-${i}`} className="border-t border-gray-100">
              <td className="py-1.5 pr-2 capitalize">{ch.chargeType}</td>
              <td className="py-1.5 pr-2">{ch.description}</td>
              <td className="py-1.5 pr-2 text-right">
                <MoneyValue amount={parseAmount(ch.chargeAmountEur)} size="sm" />
              </td>
              <td className="py-1.5 text-right capitalize text-gray-500">
                {ch.status}
                {ch.deductibleFromDeposit && (
                  <span className="ml-1 text-xs text-amber-600">(from deposit)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Deposit Section ────────────────────────────────────────────────────────

function DepositSection({
  depositHeld,
}: {
  depositHeld: OwnerLtrStatementDTO['depositHeld']
}) {
  if (!depositHeld) return null

  return (
    <div>
      <SectionHeader title="Deposit Held" />
      <div className="flex justify-between items-center py-1">
        <span className="text-gray-600">
          Security deposit
          <span className="ml-2 text-xs text-gray-400 capitalize">({depositHeld.status})</span>
        </span>
        <MoneyValue amount={parseAmount(depositHeld.amount)} />
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Deposit is informational — not income.
      </p>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function OwnerLtrStatement({ statement }: OwnerLtrStatementProps) {
  const directionInfo = BALANCE_DIRECTION_MAP[statement.balanceDirection]
  const closingAmount = parseAmount(statement.closingBalance)
  const openingAmount = parseAmount(statement.openingBalance)

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 print:shadow-none print:border-none print:max-w-none">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-gray-200 print:py-3">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Owner Statement
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {statement.propertyName}
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p className="font-medium text-gray-700">{statement.ownerName}</p>
            <p>{formatPeriod(statement.statementPeriod.start, statement.statementPeriod.end)}</p>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="px-6 py-4 space-y-2 print:py-2">

        {/* Opening Balance */}
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">Opening Balance</span>
          <MoneyValue amount={openingAmount} size="md" />
        </div>

        {/* Sections */}
        <RentalIncomeSection rentalIncome={statement.rentalIncome} />
        <ManagementFeeSection managementFee={statement.managementFee} />
        <OwnerExpensesSection
          expenses={statement.ownerExpenses}
          total={statement.totalOwnerExpenses}
        />
        <OwnerPaymentsSection
          payments={statement.ownerPayments}
          total={statement.totalOwnerPayments}
        />
        <TenantChargesSection charges={statement.tenantChargesRelevantToOwner} />
        <DepositSection depositHeld={statement.depositHeld} />
      </div>

      {/* ── Closing Balance ────────────────────────────────────── */}
      <div className="px-6 py-4 border-t-2 border-gray-300 bg-gray-50 rounded-b-lg print:bg-white">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-sm font-semibold text-gray-900">Closing Balance</span>
            <span className="ml-2">
              <StatusBadge status={directionInfo.token} label={directionInfo.label} />
            </span>
          </div>
          <MoneyValue amount={closingAmount} size="lg" />
        </div>

        {/* Balance equation footnote */}
        <p className="text-xs text-gray-400 mt-2 print:mt-1">
          Opening + Rent Received − Management Fee − Expenses − Payments = Closing
        </p>
      </div>
    </div>
  )
}
