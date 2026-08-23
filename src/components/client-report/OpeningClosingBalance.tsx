/**
 * OpeningClosingBalance — presentation-only.
 *
 * Displays opening, optional period activity, and closing balances that were
 * ALL computed upstream and passed in as props. It performs NO arithmetic:
 * it does not derive period activity from opening/closing, and it never
 * fabricates an opening balance. When `opening` is null (e.g. an all-time
 * report where no opening applies) only the closing balance is shown.
 */
import React from 'react'
import { formatEur } from './formatEur'

export interface OpeningClosingBalanceProps {
  /** null = not applicable (all-time report). A real 0 must be passed as 0, not null. */
  opening: number | null
  /** Optional, pre-computed period movement. Never derived inside this component. */
  periodActivity?: number | null
  closing: number
  lang?: 'en' | 'he'
}

const LABELS = {
  en: { opening: 'Opening balance', activity: 'Period activity', closing: 'Closing balance', allTime: 'All-time balance' },
  he: { opening: 'יתרת פתיחה', activity: 'תנועת התקופה', closing: 'יתרת סגירה', allTime: 'יתרה כוללת' },
} as const

export function OpeningClosingBalance({ opening, periodActivity, closing, lang = 'en' }: OpeningClosingBalanceProps) {
  const t = LABELS[lang] ?? LABELS.en
  const showOpening = opening !== null && opening !== undefined
  const showActivity = periodActivity !== null && periodActivity !== undefined

  return (
    <div data-testid="opening-closing-balance" className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-wrap items-stretch gap-3">
      {showOpening && (
        <div className="flex-1 min-w-[130px]">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{t.opening}</div>
          <div data-testid="ocb-opening" className="text-base font-bold font-mono text-gray-800">{formatEur(opening as number)}</div>
        </div>
      )}
      {showActivity && (
        <div className="flex-1 min-w-[130px]">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{t.activity}</div>
          <div data-testid="ocb-activity" className="text-base font-bold font-mono text-gray-800">{formatEur(periodActivity as number)}</div>
        </div>
      )}
      <div className="flex-1 min-w-[130px]">
        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{showOpening ? t.closing : t.allTime}</div>
        <div data-testid="ocb-closing" className="text-base font-bold font-mono text-gray-900">{formatEur(closing)}</div>
      </div>
    </div>
  )
}

export default OpeningClosingBalance
