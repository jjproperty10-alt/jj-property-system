'use client'
/**
 * ReportScopeSelector — 3-mode scope picker for the client report.
 * M9-B: Report Scope Selector
 *
 * Modes:
 *   portfolio           — Entire Portfolio (all authorized properties)
 *   selected_properties — searchable multi-select with removable chips
 *   single_property     — the existing single-property dropdown (preserves current UX)
 *
 * Constraint: does not calculate or aggregate any balances.
 * The scope is passed to the reporting engine which does all arithmetic.
 */
import type { ReportScope } from '@/lib/report/reportScope'
import type { Lang } from '@/lib/report/labels'
import { PropertyMultiSelect } from './PropertyMultiSelect'

interface ReportScopeSelectorProps {
  scope:      ReportScope
  onChange:   (scope: ReportScope) => void
  properties: string[]   // all authorized property names (from fetchRC3PropertyList)
  lang:       Lang
}

type ScopeType = ReportScope['type']

const LABELS: Record<ScopeType, { en: string; he: string }> = {
  portfolio:           { en: 'Entire Portfolio',    he: 'כל התיק'       },
  selected_properties: { en: 'Select Properties',   he: 'נכסים נבחרים'  },
  single_property:     { en: 'Single Property',     he: 'נכס בודד'      },
}

const SCOPE_TITLE = { en: 'Report Scope', he: 'היקף הדוח' }
const PROP_LABEL  = { en: 'Property',     he: 'נכס'       }
const COUNT_LABEL = {
  en: (n: number) => `${n} ${n === 1 ? 'property' : 'properties'} included`,
  he: (n: number) => `${n} נכסים כלולים`,
}

function ml(map: { en: string; he: string }, lang: Lang): string {
  return map[lang] ?? map.en
}

const MODES: ScopeType[] = ['portfolio', 'selected_properties', 'single_property']

export function ReportScopeSelector({
  scope,
  onChange,
  properties,
  lang,
}: ReportScopeSelectorProps) {
  const isRTL = lang === 'he'

  function switchMode(mode: ScopeType) {
    if (mode === scope.type) return
    switch (mode) {
      case 'portfolio':
        onChange({ type: 'portfolio' })
        break
      case 'selected_properties':
        onChange({
          type: 'selected_properties',
          // Carry over any current single selection as a pre-check
          propertyNames:
            scope.type === 'single_property' && scope.propertyName
              ? [scope.propertyName]
              : [],
        })
        break
      case 'single_property':
        onChange({
          type: 'single_property',
          propertyName:
            scope.type === 'selected_properties' && scope.propertyNames.length === 1
              ? scope.propertyNames[0]
              : (properties[0] ?? ''),
        })
        break
    }
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="w-full">

      {/* ── Label ────────────────────────────────────────────────────────────── */}
      <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">
        {ml(SCOPE_TITLE, lang)}
      </label>

      {/* ── Mode tabs ────────────────────────────────────────────────────────── */}
      <div
        className="flex rounded-lg border border-gray-200 overflow-hidden mb-3"
        role="group"
        aria-label={ml(SCOPE_TITLE, lang)}
      >
        {MODES.map((mode, i) => (
          <button
            key={mode}
            type="button"
            onClick={() => switchMode(mode)}
            aria-pressed={scope.type === mode}
            className={[
              'flex-1 px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap',
              scope.type === mode
                ? 'bg-[#1e3a5f] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50',
              i > 0 ? (isRTL ? 'border-r border-gray-200' : 'border-l border-gray-200') : '',
            ].join(' ')}
          >
            {ml(LABELS[mode], lang)}
          </button>
        ))}
      </div>

      {/* ── Portfolio mode ───────────────────────────────────────────────────── */}
      {scope.type === 'portfolio' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <div className="text-sm font-medium text-slate-700">
            {ml(LABELS.portfolio, lang)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {COUNT_LABEL[lang](properties.length)}
          </div>
        </div>
      )}

      {/* ── Multi-select mode ────────────────────────────────────────────────── */}
      {scope.type === 'selected_properties' && (
        <PropertyMultiSelect
          properties={properties}
          selected={scope.propertyNames}
          onChange={names => onChange({ type: 'selected_properties', propertyNames: names })}
          lang={lang}
        />
      )}

      {/* ── Single-property mode (preserves existing UX) ─────────────────────── */}
      {scope.type === 'single_property' && (
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
            {ml(PROP_LABEL, lang)}
          </label>
          <select
            value={scope.propertyName}
            onChange={e => onChange({ type: 'single_property', propertyName: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {properties.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
