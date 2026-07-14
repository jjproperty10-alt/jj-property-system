/**
 * InvestmentSummary — summary bar for the Investment Timeline.
 *
 * Displays: ownership %, agreed valuation, required capital,
 * capital paid, capital remaining, distributions.
 *
 * P-ARCH-1: null values rendered as "Unknown" — never as "€0".
 * P-ARCH-6: no JJ cost basis or margin shown here.
 *
 * Supports EN/HE/RTL via the `lang` prop.
 */

import type { InvestmentTimelineDTO } from '@/lib/lifecycle/timelineTypes'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

interface Props {
  summary: InvestmentTimelineDTO['summary']
  lang?: 'en' | 'he'
}

// Simple bilingual label helper (inline — avoids extra import coupling)
const L = {
  ownershipPct:    { en: 'Your Ownership',       he: 'אחזקתך'            },
  agreedValuation: { en: 'Agreed Entry Value',    he: 'שווי כניסה מוסכם'  },
  requiredCapital: { en: 'Required Capital',      he: 'הון נדרש'          },
  capitalPaid:     { en: 'Capital Paid',          he: 'הון ששולם'         },
  capitalRemaining:{ en: 'Capital Remaining',     he: 'הון שנותר'         },
  distributions:   { en: 'Distributions',         he: 'חלוקות'            },
  unknown:         { en: 'Unknown',               he: 'לא ידוע'           },
  fullyPaid:       { en: '✓ Fully Paid',          he: '✓ שולם במלואו'     },
}

const t = (key: keyof typeof L, lang: 'en' | 'he') => L[key][lang]

interface StatCardProps {
  label: string
  value: string
  highlight?: boolean
  dim?: boolean
  badge?: string
}

function StatCard({ label, value, highlight, dim, badge }: StatCardProps) {
  return (
    <div className={`rounded-xl p-4 flex flex-col gap-1 ${
      highlight ? 'bg-blue-900 border border-blue-600' :
      dim       ? 'bg-gray-800 border border-gray-700' :
                  'bg-gray-900 border border-gray-800'
    }`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">
        {label}
      </span>
      <span className={`text-xl font-semibold ${
        highlight ? 'text-blue-200' : dim ? 'text-gray-500 italic' : 'text-white'
      }`}>
        {value}
      </span>
      {badge && (
        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
          {badge}
        </span>
      )}
    </div>
  )
}

export function InvestmentSummary({ summary, lang = 'en' }: Props) {
  const isRTL = lang === 'he'
  const unknown = t('unknown', lang)

  const isFullyPaid =
    summary.capitalPaid !== null &&
    summary.capitalRemaining !== null &&
    summary.capitalRemaining <= 0

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {summary.currentOwnershipPct !== null && (
        <StatCard
          label={t('ownershipPct', lang)}
          value={`${summary.currentOwnershipPct}%`}
          highlight
        />
      )}

      <StatCard
        label={t('agreedValuation', lang)}
        value={summary.agreedEntryValuation !== null ? EUR(summary.agreedEntryValuation) : unknown}
        dim={summary.agreedEntryValuation === null}
      />

      <StatCard
        label={t('requiredCapital', lang)}
        value={summary.requiredCapital !== null ? EUR(summary.requiredCapital) : unknown}
        dim={summary.requiredCapital === null}
      />

      <StatCard
        label={t('capitalPaid', lang)}
        value={summary.capitalPaid !== null ? EUR(summary.capitalPaid) : unknown}
        dim={summary.capitalPaid === null}
        badge={isFullyPaid ? t('fullyPaid', lang) : undefined}
      />

      <StatCard
        label={t('capitalRemaining', lang)}
        value={
          summary.capitalRemaining === null
            ? unknown
            : summary.capitalRemaining <= 0
            ? '—'
            : EUR(summary.capitalRemaining)
        }
        dim={summary.capitalRemaining === null}
      />

      {summary.totalDistributionsPaid > 0 && (
        <StatCard
          label={t('distributions', lang)}
          value={EUR(summary.totalDistributionsPaid)}
        />
      )}
    </div>
  )
}
