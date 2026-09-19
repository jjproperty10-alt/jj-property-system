/**
 * Certified settlement section — presentation only.
 * Receives the client-safe DTO. Does not fetch, does not recompute RC3 totals.
 */

import type { CertifiedClientSettlementAvailable } from '@/lib/finance/certifiedClientSettlementTypes'
import {
  certifiedHeroLabelKey,
  fifoCreditDisplayAmount,
  fifoCreditLabelKey,
} from '@/lib/finance/certifiedClientSettlementPresentation'
import { t, type Lang } from '@/lib/report/labels'

function eur(n: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n)
}

function fmtSignedEur(n: number): string {
  if (Math.abs(n) < 0.005) return eur(0)
  return n > 0 ? `+${eur(n)}` : `-${eur(Math.abs(n))}`
}

export function CertifiedSettlementSection({
  dto,
  lang,
}: {
  dto: CertifiedClientSettlementAvailable
  lang: Lang
}) {
  const closingKey = certifiedHeroLabelKey(dto.closingDirection)
  const closingColor =
    dto.closingDirection === 'settled'
      ? 'text-gray-700'
      : dto.closingDirection === 'client_owes_jj'
        ? 'text-red-800'
        : 'text-green-800'

  return (
    <section
      aria-label={t('certSectionTitle', lang)}
      className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm"
      data-certified-settlement="true"
      data-certified-closing={String(dto.closingDueToJj)}
    >
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
        {t('certSectionTitle', lang)}
      </h2>

      <div className="flex items-center justify-between py-2 border-b border-slate-100">
        <span className="text-sm text-slate-700">{t('certOpeningBalance', lang)}</span>
        <span className="font-mono text-sm font-semibold">{eur(dto.openingDueToJj)}</span>
      </div>

      {dto.propertyLines.map((line) => (
        <div
          key={`${line.lineOrder}-${line.propertyKey}`}
          className="flex items-center justify-between py-1.5 text-xs text-slate-500"
        >
          <span>{line.propertyName}</span>
          <span className="font-mono">{eur(line.amountDueToJj)}</span>
        </div>
      ))}

      {dto.fifoCredits.map((credit) => (
        <div
          key={credit.eventId}
          className="flex items-center justify-between py-2 border-t border-slate-100"
          data-fifo-cash={String(credit.cash)}
        >
          <span className="text-sm text-slate-700">
            {t(fifoCreditLabelKey(credit), lang)}
            {!credit.cash && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                {t('certNoncash', lang)}
              </span>
            )}
          </span>
          <span className="font-mono text-sm">{fmtSignedEur(fifoCreditDisplayAmount(credit))}</span>
        </div>
      ))}

      {dto.exclusions.map((exclusion) => (
        <div
          key={exclusion.eventId}
          className="py-2 border-t border-dashed border-slate-200"
          data-exclusion-effect="0"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{t('certExclusionDoubleCount', lang)}</span>
            <span className="font-mono text-sm text-slate-400">{eur(exclusion.settlementAmount)}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{t('certExclusionNote', lang)}</p>
        </div>
      ))}

      <div className={`flex items-center justify-between py-3 mt-2 border-t-2 border-slate-300 ${closingColor}`}>
        <span className="text-sm font-bold">{t(closingKey, lang)}</span>
        <span className="font-mono text-lg font-bold">{eur(Math.abs(dto.closingDueToJj))}</span>
      </div>
    </section>
  )
}
