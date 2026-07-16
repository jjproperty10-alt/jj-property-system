interface UnknownValueProps {
  /**
   * Optional human-readable reason why the value is unknown.
   * Exposed via title attribute (tooltip) and aria-label.
   * Example: "Pending Settlement Engine (RC2)"
   */
  reason?: string
  /** Additional CSS classes. */
  className?: string
}

/**
 * UnknownValue — Design System 2035
 *
 * Renders an em dash (—) for any value that is null / unavailable.
 * NEVER renders the string "0", "null", or "undefined" — always em dash.
 *
 * Constitutional principle P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * This component enforces that principle at the UI layer.
 *
 * Accessibility:
 *   - aria-label is always present (default: "Value unknown")
 *   - title provides a tooltip with the reason when supplied
 *   - role="text" for screen reader disambiguation
 */
export function UnknownValue({ reason, className = '' }: UnknownValueProps) {
  const ariaLabel = reason ? `Value unknown: ${reason}` : 'Value unknown'

  return (
    <span
      className={`text-gray-400 italic select-none ${className}`.trim()}
      aria-label={ariaLabel}
      title={reason}
      role="text"
    >
      &#8212;
    </span>
  )
}
