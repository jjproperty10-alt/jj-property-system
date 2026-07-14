'use client'
/**
 * PropertyMultiSelect — searchable multi-select for property names.
 * M9-B: Report Scope Selector
 *
 * Features: text search, checkboxes, Select All / Clear All, keyboard nav,
 *           selected-count badge, max-height scroll, EN/HE RTL support.
 *
 * Does not compute or aggregate any financial data.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import type { Lang } from '@/lib/report/labels'
import { SelectedPropertyChips } from './SelectedPropertyChips'

interface PropertyMultiSelectProps {
  properties: string[]      // full authorized list
  selected: string[]        // currently selected names
  onChange: (names: string[]) => void
  lang: Lang
}

const UI = {
  searchPlaceholder: { en: 'Search properties…', he: 'חיפוש נכסים…'   },
  selectAll:         { en: 'Select All',         he: 'בחר הכל'          },
  clearAll:          { en: 'Clear All',          he: 'נקה הכל'          },
  noMatch:           { en: 'No properties match.', he: 'לא נמצאו נכסים.' },
  placeholder:       { en: 'Select properties…', he: 'בחר נכסים…'       },
  nSelected:         { en: (n: number) => `${n} selected`,  he: (n: number) => `${n} נבחרו` },
}

function lbl(key: keyof typeof UI, lang: Lang, n?: number): string {
  const entry = UI[key]
  const val = (entry as Record<string, unknown>)[lang] ?? (entry as Record<string, unknown>)['en']
  if (typeof val === 'function') return (val as (n: number) => string)(n ?? 0)
  return val as string
}

export function PropertyMultiSelect({
  properties,
  selected,
  onChange,
  lang,
}: PropertyMultiSelectProps) {
  const [open, setOpen]           = useState(false)
  const [query, setQuery]         = useState('')
  const [highlighted, setHigh]    = useState(-1)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  const filtered = properties.filter(p =>
    p.toLowerCase().includes(query.toLowerCase()),
  )
  const selectedSet = new Set(selected)

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40)
  }, [open])

  const toggle = useCallback((name: string) => {
    onChange(
      selectedSet.has(name)
        ? selected.filter(s => s !== name)
        : [...selected, name],
    )
  }, [selected, selectedSet, onChange])

  const selectAll = useCallback(() => {
    const combined = Array.from(new Set([...selected, ...filtered]))
    onChange(combined)
  }, [selected, filtered, onChange])

  const clearAll = useCallback(() => {
    onChange([])
    setQuery('')
  }, [onChange])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHigh(h => Math.min(h + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHigh(h => Math.max(h - 1, 0)) }
    if (e.key === 'Enter' && highlighted >= 0 && filtered[highlighted]) toggle(filtered[highlighted])
  }

  const isRTL = lang === 'he'

  return (
    <div ref={wrapRef} className="relative w-full" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2.5 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <span className="text-gray-700 truncate">
          {selected.length === 0
            ? lbl('placeholder', lang)
            : lbl('nSelected', lang, selected.length)}
        </span>
        <span className="text-gray-400 ml-2 flex-none">{open ? '▲' : '▼'}</span>
      </button>

      {/* ── Dropdown ────────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          onKeyDown={onKey}
        >
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setHigh(-1) }}
              placeholder={lbl('searchPlaceholder', lang)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:ring-2 focus:ring-blue-400 focus:outline-none"
            />
          </div>

          {/* Select All / Clear All */}
          <div className="flex gap-3 px-3 py-1.5 border-b border-gray-100 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {lbl('selectAll', lang)}
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-gray-500 hover:text-gray-800"
            >
              {lbl('clearAll', lang)}
            </button>
          </div>

          {/* List */}
          <div role="listbox" aria-multiselectable="true" className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs text-gray-400 text-center">
                {lbl('noMatch', lang)}
              </div>
            ) : (
              filtered.map((name, idx) => {
                const checked = selectedSet.has(name)
                return (
                  <div
                    key={name}
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(name)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer text-sm transition-colors ${
                      highlighted === idx
                        ? 'bg-blue-50'
                        : checked
                          ? 'bg-blue-50/40'
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Checkbox */}
                    <span
                      className={`w-4 h-4 flex-none border rounded flex items-center justify-center ${
                        checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 12 10" className="w-2.5 h-2.5" fill="none">
                          <path d="M1 5l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      )}
                    </span>
                    <span className={checked ? 'font-medium text-gray-900' : 'text-gray-700'}>
                      {name}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── Chips ───────────────────────────────────────────────────────────── */}
      <SelectedPropertyChips
        selected={selected}
        onRemove={name => onChange(selected.filter(s => s !== name))}
        lang={lang}
      />
    </div>
  )
}
