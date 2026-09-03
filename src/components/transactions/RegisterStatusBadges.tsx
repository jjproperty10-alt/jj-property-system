import React from 'react'

export interface RegisterStatusFlags {
  readonly reviewStatus: string | null | undefined
  readonly isDeleted: boolean | null | undefined
  readonly hasActiveExclusion: boolean
  readonly hasCorrectionCase: boolean
  readonly correctionCaseCount?: number
}

/** Pure presentational cells for M1 register status columns (SSR-testable). */
export function RegisterStatusBadges({
  reviewStatus,
  isDeleted,
  hasActiveExclusion,
  hasCorrectionCase,
  correctionCaseCount = 0,
}: RegisterStatusFlags) {
  const status = reviewStatus?.trim() || '—'
  return (
    <>
      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap" data-testid="col-review-status">
        {status}
      </td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap" data-testid="col-is-deleted">
        {isDeleted ? (
          <span className="text-red-600 font-medium">yes</span>
        ) : (
          <span className="text-gray-400">no</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap" data-testid="col-exclusion">
        {hasActiveExclusion ? (
          <span className="text-amber-700 font-medium">active</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap" data-testid="col-correction-case">
        {hasCorrectionCase ? (
          <span className="text-blue-700 font-medium">
            yes{correctionCaseCount > 1 ? ` (${correctionCaseCount})` : ''}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
    </>
  )
}

export function ReviewCorrectButton({
  onClick,
  disabled,
}: {
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="review-correct-btn"
      className="text-xs font-medium text-brand-600 hover:text-brand-800 disabled:opacity-40 whitespace-nowrap"
    >
      Review / Correct
      <span className="block text-[10px] font-normal text-gray-500">בדיקה / תיקון</span>
    </button>
  )
}
