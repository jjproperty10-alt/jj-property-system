import React from 'react'
import { MoneyValue } from '@/components/ds'
import type { SettlementStatement } from '@/lib/lifecycle/partnerStatementTypes'

// ─── Locale strings ───────────────────────────────────────────────────────────

type SupportedLocale = 'en' | 'he'

const STRINGS: Record<SupportedLocale, {
  sectionLabel:    string
  pendingNote:     string
  receivable:      string
  payable:         string
  requestTransfer: string
  reviewDetails:   string
}> = {
  en: {
    sectionLabel:    'Settlement',
    pendingNote:     'Settlement results will be available after the next calculation.',
    receivable:      'Ready to transfer',
    payable:         'Outstanding balance',
    requestTransfer: 'Request Transfer',
    reviewDetails:   'Review Details',
  },
  he: {
    sectionLabel:    'הסדר',
    pendingNote:     'תוצאות ההסדר יהיו זמינות לאחר החישוב הבא.',
    receivable:      'מוכן להעברה',
    payable:         'יתרה לתשלום',
    requestTransfer: 'בקש העברה',
    reviewDetails:   'בדוק פרטים',
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SettlementCardProps {
  settlement: SettlementStatement
  /** Display locale. Defaults to 'en'. */
  locale?: SupportedLocale
  className?: string
}

/**
 * SettlementCard — Partner Report Story, Section 8
 *
 * Renders the current settlement position of the partner for one property.
 *
 * currentBalanceEur = null  → RC2 pending state (Settlement Engine not yet run).
 * currentBalanceEur = 0     → hidden entirely (silence over "€0.00").
 * currentBalanceEur > 0     → receivable: "Ready to transfer €X" + disabled CTA.
 * currentBalanceEur < 0     → payable: "Outstanding balance €X" + disabled CTA.
 *
 * CTA buttons are always disabled in RC1 — placeholder UI only.
 * Settlement Engine integration is RC2 scope.
 *
 * P-ARCH-1: null = pending state; never coerce to 0.
 * P-ARCH-6: no jj_* fields; all values from SettlementStatement only.
 */
export function SettlementCard({
  settlement,
  locale = 'en',
  className = '',
}: SettlementCardProps) {
  const s = STRINGS[locale]
  const { currentBalanceEur } = settlement

  // Zero → hidden (silence > "€0.00 pending")
  if (currentBalanceEur === 0) return null

  // null → Settlement Engine not yet run — RC2 pending state
  if (currentBalanceEur === null) {
    return (
      <div
        className={`space-y-1 ${className}`.trim()}
        data-testid="settlement-pending"
      >
        <p className="jj-label text-xs uppercase tracking-widest text-gray-400">
          {s.sectionLabel}
        </p>
        <p className="text-sm text-gray-400 italic">{s.pendingNote}</p>
      </div>
    )
  }

  const isReceivable = currentBalanceEur > 0
  const absAmount    = Math.abs(currentBalanceEur)

  return (
    <div
      className={`space-y-3 ${className}`.trim()}
      data-testid="settlement-card"
    >
      <p className="jj-label text-xs uppercase tracking-widest text-gray-400">
        {s.sectionLabel}
      </p>

      <div
        className={`rounded-xl border px-5 py-4 ${
          isReceivable
            ? 'border-blue-200 bg-blue-50'
            : 'border-amber-200 bg-amber-50'
        }`}
      >
        {/* Direction label */}
        <p className="text-sm text-gray-600">
          {isReceivable ? s.receivable : s.payable}
        </p>

        {/* Amount — absolute value; sign is conveyed by direction label above */}
        <p className="mt-1" data-testid="settlement-amount">
          <MoneyValue amount={absAmount} size="lg" />
        </p>

        {/* CTA — always disabled in RC1; Settlement Engine is RC2 scope */}
        <button
          className="mt-3 px-4 py-2 text-sm rounded border border-gray-300
            text-gray-600 bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          disabled
          title="Available after Settlement Engine (RC2)"
          data-testid="settlement-cta"
        >
          {isReceivable ? s.requestTransfer : s.reviewDetails}
        </button>
      </div>
    </div>
  )
}
