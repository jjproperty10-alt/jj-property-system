/**
 * JJ Property 10 - Report language toggle (G4)
 *
 * Visible "English | עברית" control. Presentation only: it emits the chosen
 * language via onChange and reflects the active one; it does not persist anything
 * and does not touch financial data. Callers feed the chosen value (as `override`)
 * into resolveReportLanguage so Workspace / Preview / PDF / Print stay in sync.
 *
 * Client-safe: renders only language names. Lives under client-report-rc3 so
 * check:whitelist confirms it reads no internal transaction fields.
 */
'use client'

import React from 'react'
import type { Lang } from '@/lib/report/languageResolution'
import { LANGS, LANGUAGE_NATIVE_LABEL, langDir } from '@/lib/report/languageResolution'

export interface LanguageToggleProps {
  /** Currently active (resolved) language. */
  value: Lang
  /** Called with the newly selected language. */
  onChange: (lang: Lang) => void
  /** Optional accessible group label. */
  ariaLabel?: string
}

export function LanguageToggle({ value, onChange, ariaLabel = 'Report language' }: LanguageToggleProps) {
  return (
    <div className="lang-toggle" role="group" aria-label={ariaLabel}>
      {LANGS.map(l => {
        const active = l === value
        return (
          <button
            key={l}
            type="button"
            lang={l}
            dir={langDir(l)}
            aria-pressed={active}
            className={active ? 'lang-toggle__btn lang-toggle__btn--on' : 'lang-toggle__btn'}
            onClick={() => { if (!active) onChange(l) }}
          >
            {LANGUAGE_NATIVE_LABEL[l]}
          </button>
        )
      })}
    </div>
  )
}

export default LanguageToggle
