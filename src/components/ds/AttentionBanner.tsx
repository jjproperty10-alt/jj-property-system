import type { BannerType } from '@/lib/ds/tokens'
import { BANNER_CLASSES } from '@/lib/ds/tokens'

interface AttentionBannerProps {
  /** Semantic type controls color scheme. */
  type: BannerType
  /** Bold title line. */
  title: string
  /** Optional supporting description. */
  description?: string
  /** Additional CSS classes for the wrapper. */
  className?: string
}

/** Icon glyphs per banner type (Unicode — no external icon dependency). */
const BANNER_ICONS: Record<BannerType, string> = {
  info:    'ℹ',  // ℹ
  warning: '⚠',  // ⚠
  error:   '✕',  // ✕
  success: '✓',  // ✓
}

/**
 * AttentionBanner — Design System 2035
 *
 * Stateless attention banner for alerts, verification tasks, and pending items.
 * Not dismissible (stateless component — caller controls visibility).
 *
 * ARIA: role="alert" for error/warning (live region); role="status" for info/success.
 * Icon is decorative (aria-hidden); title and description convey the message.
 *
 * Usage:
 *   <AttentionBanner
 *     type="warning"
 *     title="3 dates require confirmation"
 *     description="These dates affect the Investment Timeline. Provide source documents to confirm."
 *   />
 */
export function AttentionBanner({ type, title, description, className = '' }: AttentionBannerProps) {
  const { wrapper, icon, title: titleClass, desc } = BANNER_CLASSES[type]
  const role = type === 'error' || type === 'warning' ? 'alert' : 'status'
  const iconGlyph = BANNER_ICONS[type]

  return (
    <div
      role={role}
      className={`flex gap-3 rounded-xl px-4 py-3 ${wrapper} ${className}`.trim()}
    >
      {/* Icon */}
      <span className={`shrink-0 mt-0.5 font-bold ${icon}`} aria-hidden="true">
        {iconGlyph}
      </span>

      {/* Content */}
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${titleClass}`}>{title}</p>
        {description && (
          <p className={`mt-0.5 text-xs leading-relaxed ${desc}`}>{description}</p>
        )}
      </div>
    </div>
  )
}
