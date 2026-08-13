'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors"
    >
      Print Statement
    </button>
  )
}
