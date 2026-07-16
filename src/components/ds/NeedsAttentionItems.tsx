import React from 'react'

// ─── Locale strings ───────────────────────────────────────────────────────────

type SupportedLocale = 'en' | 'he'

const STRINGS: Record<SupportedLocale, {
  sectionLabel: string
}> = {
  en: { sectionLabel: "What's Next" },
  he: { sectionLabel: 'מה הלאה'     },
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum action items shown. Only the most critical reach the partner's attention. */
const MAX_ITEMS = 3

// ─── Component ────────────────────────────────────────────────────────────────

interface NeedsAttentionItemsProps {
  /**
   * Action items for the partner, pre-ordered by consequence severity.
   * Max 3 items shown — excess are silently dropped.
   * Ordering by severity is the caller's responsibility.
   */
  items: readonly string[]
  /** Display locale. Defaults to 'en'. */
  locale?: SupportedLocale
  className?: string
}

/**
 * NeedsAttentionItems — Design System 2035 / E3 Experience Layer
 *
 * Renders when the partner has open action items (Section 9 of Partner Report).
 * When items is empty, the caller renders AllClearCard instead — the two components
 * are siblings in the "What's Next" slot, never rendered together.
 *
 * Design: amber bullet, warm text. Never clinical or alarming.
 * Max 3 items — same rule as Home screen Needs Attention slot (E3 spec).
 */
export function NeedsAttentionItems({
  items,
  locale = 'en',
  className = '',
}: NeedsAttentionItemsProps) {
  const s       = STRINGS[locale]
  const visible = items.slice(0, MAX_ITEMS)

  return (
    <div
      className={`space-y-2 ${className}`.trim()}
      data-testid="needs-attention-items"
    >
      <p className="jj-label text-xs uppercase tracking-widest text-gray-400">
        {s.sectionLabel}
      </p>

      <ul className="space-y-2" aria-label={s.sectionLabel}>
        {visible.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-gray-700"
            data-testid="attention-item"
          >
            <span
              className="mt-0.5 text-amber-500 select-none"
              aria-hidden="true"
            >
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
