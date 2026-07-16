import type { ReactNode } from 'react'

export interface DataTableColumn {
  /** Unique key — must match a key in each row object. */
  key: string
  /** Header label. */
  label: string
  /** Text alignment for this column. Defaults to 'left'. */
  align?: 'left' | 'right' | 'center'
  /**
   * Direction for cell content.
   * Set to 'ltr' for financial amounts, dates, IDs.
   * Defaults to undefined (inherits document direction).
   */
  dir?: 'ltr' | 'rtl'
}

interface DataTableProps {
  /** Column definitions in display order. */
  columns: DataTableColumn[]
  /** Row data — each row is a Record of column key → ReactNode. */
  rows: Record<string, ReactNode>[]
  /** Optional caption for the table (also used as aria-label on mobile cards). */
  caption?: string
  /** Additional CSS classes for the wrapper. */
  className?: string
}

/**
 * DataTable — Design System 2035
 *
 * Accessible, responsive data table.
 *
 * Desktop (>= 640px): standard <table> with proper thead/tbody/th scope.
 * Mobile (< 640px): stacks to a card-per-row layout. No horizontal overflow.
 *
 * Financial columns: pass dir="ltr" in the column definition to isolate
 * LTR-only values (amounts, dates, IDs) from RTL page contexts.
 *
 * Accessibility:
 *   - <th scope="col"> on all headers
 *   - Optional <caption> visible to screen readers
 *   - Mobile cards use data-label for context
 *
 * Note: This component renders the DATA. It does not handle sorting,
 * pagination, or filtering — those are application-layer concerns.
 */
export function DataTable({ columns, rows, caption, className = '' }: DataTableProps) {
  const alignClass = (align?: 'left' | 'right' | 'center') => {
    if (align === 'right') return 'text-right'
    if (align === 'center') return 'text-center'
    return 'text-left'
  }

  return (
    <div className={`jj-card overflow-hidden ${className}`.trim()}>

      {/* ── Desktop table (sm+) ──────────────────────────────── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          {caption && (
            <caption className="sr-only">{caption}</caption>
          )}
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-600 ${alignClass(col.align)}`}
                  dir={col.dir}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-gray-400 italic"
                >
                  No data
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="hover:bg-gray-50/60 transition-colors motion-reduce:transition-none"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-gray-700 ${alignClass(col.align)}`}
                      dir={col.dir}
                    >
                      {row[col.key] ?? null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card stack (< sm) ─────────────────────────── */}
      <div className="sm:hidden">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400 italic">No data</div>
        ) : (
          <ul className="divide-y divide-gray-100" role="list" aria-label={caption}>
            {rows.map((row, rowIdx) => (
              <li key={rowIdx} className="px-4 py-4 space-y-2">
                {columns.map((col) => (
                  <div key={col.key} className="flex justify-between items-start gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 shrink-0">
                      {col.label}
                    </span>
                    <span
                      className={`text-sm text-gray-800 ${alignClass(col.align)}`}
                      dir={col.dir}
                    >
                      {row[col.key] ?? null}
                    </span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  )
}
