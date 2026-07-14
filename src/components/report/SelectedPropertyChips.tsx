'use client'
/**
 * SelectedPropertyChips — displays selected properties as removable chips.
 * M9-B: Report Scope Selector
 *
 * Pure display — no balance calculations. One × button per chip to remove.
 */
import type { Lang } from '@/lib/report/labels'

interface SelectedPropertyChipsProps {
  selected: string[]
  onRemove: (name: string) => void
  lang: Lang
}

export function SelectedPropertyChips({
  selected,
  onRemove,
  lang,
}: SelectedPropertyChipsProps) {
  if (selected.length === 0) return null

  return (
    <div
      className="flex flex-wrap gap-1.5 mt-2"
      aria-label={lang === 'he' ? 'נכסים נבחרים' : 'Selected properties'}
    >
      {selected.map(name => (
        <span
          key={name}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-full"
        >
          {name}
          <button
            type="button"
            onClick={() => onRemove(name)}
            aria-label={`${lang === 'he' ? 'הסר' : 'Remove'} ${name}`}
            className="ml-0.5 text-blue-400 hover:text-blue-800 focus:outline-none leading-none"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
