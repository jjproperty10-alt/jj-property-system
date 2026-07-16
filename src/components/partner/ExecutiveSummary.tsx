import React from 'react'
import { MoneyValue, HealthSignal } from '@/components/ds'
import type { BusinessHealthStatus } from '@/components/ds'

interface ExecutiveSummaryProps {
  /** Total income for the period. null if unknown. */
  income: number | null
  /** Total expenses for the period (positive number). null if unknown. */
  expenses: number | null
  /** Net result (income − expenses). null if either is unknown. */
  netResult: number | null
  /**
   * Business health status for this property.
   * Replaces the old "Balance" tile — balance belongs in Section 8 (Settlement).
   * null → status tile is hidden.
   */
  status: BusinessHealthStatus | null
  className?: string
}

interface KpiTileProps {
  emoji: string
  label: string
  amount: number | null
  amountColor?: string
}

function KpiTile({ emoji, label, amount, amountColor = 'text-gray-900' }: KpiTileProps) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm"
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <span className="text-lg" aria-hidden="true">{emoji}</span>
      <p className="jj-label text-gray-400">{label}</p>
      <MoneyValue amount={amount} size="lg" className={`font-bold ${amountColor}`} />
    </div>
  )
}

function buildNarrative(income: number | null, netResult: number | null): string | null {
  if (income === null) return null
  const incomeStr = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(income)

  if (netResult === null) {
    return `This month your property generated ${incomeStr} in income.`
  }

  const netStr = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.abs(netResult))

  const netLabel = netResult >= 0 ? `net result was ${netStr}` : `net result was −${netStr}`

  return `This month your property generated ${incomeStr} in income. After expenses, your ${netLabel}.`
}

/**
 * ExecutiveSummary — Section 2 of the Partner Report Story.
 *
 * Answers four questions. Visible without scrolling.
 *   💰 How much did I earn?
 *   💸 How much did I spend?
 *   📈 What's left?
 *   🟢 Is everything okay?
 *
 * The 4th question is Business Status (HealthSignal) — NOT balance.
 * Balance belongs in Section 8 (Settlement), after the detail report.
 *
 * Rule: if any value is null → em dash (P-ARCH-1). Never show €0 for unknown.
 * Rule: narrative sentence is deterministic (not AI). AI Business Story is Section 4.
 *
 * Partner Report Story — PR-R1
 */
export function ExecutiveSummary({
  income,
  expenses,
  netResult,
  status,
  className = '',
}: ExecutiveSummaryProps) {
  const narrative = buildNarrative(income, netResult)

  const netColor =
    netResult === null ? 'text-gray-900' : netResult >= 0 ? 'text-green-700' : 'text-red-600'

  return (
    <div className={`space-y-4 ${className}`} data-testid="executive-summary">
      {/* 4 tiles — 2×2 on mobile, 4-col on md+ */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile emoji="💰" label="Income" amount={income} />
        <KpiTile emoji="💸" label="Expenses" amount={expenses} amountColor="text-gray-700" />
        <KpiTile emoji="📈" label="Net Result" amount={netResult} amountColor={netColor} />

        {/* 4th tile: Business Status — answers "is everything okay?" */}
        {status && (
          <div
            className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm"
            data-testid="kpi-business-status"
          >
            <span className="text-lg" aria-hidden="true">🏢</span>
            <p className="jj-label text-gray-400">Business Status</p>
            <HealthSignal status={status} className="mt-1" />
          </div>
        )}
      </div>

      {/* Narrative sentence — eliminates the need for mental math */}
      {narrative && (
        <p className="text-sm text-gray-600 leading-relaxed" data-testid="narrative-sentence">
          {narrative}
        </p>
      )}
    </div>
  )
}

/**
 * computeExecutiveKpis — derive KPI values from PartnerFinancialSection rows.
 *
 * Positive client_amount → income.
 * Negative client_amount → expense.
 * Returns null for each metric if no rows available.
 *
 * Usage: call from page.tsx or PartnerReport.tsx with the financial section data.
 */
export function computeExecutiveKpis(rows: Array<{ client_amount: number | null }>) {
  if (!rows.length) {
    return { income: null, expenses: null, netResult: null }
  }

  let income = 0
  let expenses = 0

  for (const row of rows) {
    const amt = row.client_amount ?? 0
    if (amt > 0) income += amt
    else expenses += Math.abs(amt)
  }

  return {
    income,
    expenses,
    netResult: income - expenses,
  }
}
