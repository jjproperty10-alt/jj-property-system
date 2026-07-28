import React from 'react'
import type { HomeBriefAttentionItem } from '@/lib/home/homeBriefTypes'

interface NeedsAttentionSectionProps {
  items: readonly HomeBriefAttentionItem[]
  className?: string
}

/**
 * NeedsAttentionSection — Position 3 on the Home screen when allClear === false.
 *
 * Renders the list of items that need the owner's attention.
 * Items arrive pre-sorted by the Chief of Staff's priority.
 * This component ONLY renders — no re-sorting, no filtering, no calculations.
 *
 * When items is empty, renders nothing (should not be called with empty items).
 *
 * E3 Experience Layer — PR #79
 */
export function NeedsAttentionSection({
  items,
  className = '',
}: NeedsAttentionSectionProps) {
  if (items.length === 0) return null

  return (
    <div
      className={`space-y-3 ${className}`}
      data-testid="needs-attention-section"
      role="region"
      aria-label="Items needing your attention"
    >
      <p className="jj-label text-xs uppercase tracking-widest text-gray-400">
        Needs your attention
      </p>

      <ul className="space-y-2">
        {items.map(item => (
          <li
            key={item.id}
            className={`rounded-lg border px-4 py-3 ${
              item.severity === 'urgent'
                ? 'border-red-200 bg-red-50'
                : 'border-gray-200 bg-white'
            }`}
            data-testid="attention-item"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    item.severity === 'urgent' ? 'text-red-800' : 'text-gray-900'
                  }`}
                >
                  {item.title}
                </p>
                <p className="mt-0.5 text-sm text-gray-500 line-clamp-2">
                  {item.explanation}
                </p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {item.executiveOwner}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
