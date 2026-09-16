import React from 'react'

export interface RegisterStatusFlags {
  readonly reviewStatus: string | null | undefined
  readonly isDeleted: boolean | null | undefined
  readonly hasActiveExclusion: boolean
  readonly hasCorrectionCase: boolean
  readonly correctionCaseCount?: number
}

function reviewLabel(reviewStatus: string | null | undefined): string {
  return reviewStatus?.trim() || '—'
}

function needsReview(reviewStatus: string | null | undefined): boolean {
  const status = reviewLabel(reviewStatus).toLowerCase()
  return status !== '—' && status !== 'active'
}

export function isRegisterStatusNormal(flags: RegisterStatusFlags): boolean {
  return (
    !flags.isDeleted &&
    !flags.hasActiveExclusion &&
    !flags.hasCorrectionCase &&
    !needsReview(flags.reviewStatus)
  )
}

export function buildRegisterStatusTitle(flags: RegisterStatusFlags): string {
  const correction =
    flags.hasCorrectionCase
      ? `yes${(flags.correctionCaseCount ?? 0) > 1 ? ` (${flags.correctionCaseCount})` : ''}`
      : '—'
  return [
    `Review: ${reviewLabel(flags.reviewStatus)}`,
    `Deleted: ${flags.isDeleted ? 'yes' : 'no'}`,
    `Exclusion: ${flags.hasActiveExclusion ? 'active' : '—'}`,
    `Correction: ${correction}`,
  ].join(' · ')
}

function StatusBadge({
  testId,
  className,
  children,
}: {
  testId: string
  className: string
  children: React.ReactNode
}) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight ${className}`}
    >
      {children}
    </span>
  )
}

/** Pure presentational status cell for the M1 register (SSR-testable). */
export function RegisterStatusBadges({
  reviewStatus,
  isDeleted,
  hasActiveExclusion,
  hasCorrectionCase,
  correctionCaseCount = 0,
}: RegisterStatusFlags) {
  const flags: RegisterStatusFlags = {
    reviewStatus,
    isDeleted,
    hasActiveExclusion,
    hasCorrectionCase,
    correctionCaseCount,
  }
  const review = reviewLabel(reviewStatus)
  const deletedText = isDeleted ? 'yes' : 'no'
  const exclusionText = hasActiveExclusion ? 'active' : '—'
  const correctionText = hasCorrectionCase
    ? `yes${correctionCaseCount > 1 ? ` (${correctionCaseCount})` : ''}`
    : '—'
  const title = buildRegisterStatusTitle(flags)
  const normal = isRegisterStatusNormal(flags)

  return (
    <td
      className="px-1.5 py-2 overflow-hidden"
      data-testid="col-status"
      title={title}
    >
      {normal ? (
        <span className="text-xs text-gray-500">
          Active
          <span data-testid="col-review-status" className="sr-only">
            {review}
          </span>
          <span data-testid="col-is-deleted" className="sr-only">
            {deletedText}
          </span>
          <span data-testid="col-exclusion" className="sr-only">
            {exclusionText}
          </span>
          <span data-testid="col-correction-case" className="sr-only">
            {correctionText}
          </span>
        </span>
      ) : (
        <span className="flex flex-wrap gap-0.5">
          {isDeleted ? (
            <StatusBadge testId="col-is-deleted" className="bg-red-50 text-red-700">
              Deleted
            </StatusBadge>
          ) : (
            <span data-testid="col-is-deleted" className="sr-only">
              {deletedText}
            </span>
          )}
          {hasActiveExclusion ? (
            <StatusBadge testId="col-exclusion" className="bg-amber-50 text-amber-800">
              Excluded
            </StatusBadge>
          ) : (
            <span data-testid="col-exclusion" className="sr-only">
              {exclusionText}
            </span>
          )}
          {needsReview(reviewStatus) ? (
            <StatusBadge testId="col-review-status" className="bg-orange-50 text-orange-800">
              {review.toLowerCase() === 'needs_review' ? 'Needs review' : review}
            </StatusBadge>
          ) : (
            <span data-testid="col-review-status" className="sr-only">
              {review}
            </span>
          )}
          {hasCorrectionCase ? (
            <StatusBadge testId="col-correction-case" className="bg-blue-50 text-blue-800">
              Corrected{correctionCaseCount > 1 ? ` (${correctionCaseCount})` : ''}
            </StatusBadge>
          ) : (
            <span data-testid="col-correction-case" className="sr-only">
              {correctionText}
            </span>
          )}
        </span>
      )}
    </td>
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
