'use client'

import { useState } from 'react'
import Link from 'next/link'

/**
 * Phone-first entry points on Home.
 * Links only. No balances, no draft contents, no new agent capability.
 */
export function HomePhoneActions() {
  const [query, setQuery] = useState('')
  const q = query.trim()
  const ownersHref = q ? `/owners?q=${encodeURIComponent(q)}` : '/owners'
  const propertiesHref = q ? `/properties?q=${encodeURIComponent(q)}` : '/properties'

  return (
    <section className="space-y-3" aria-label="פעולות">
      <Link
        href="/assistant"
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-center text-base font-semibold text-white"
      >
        דבר עם סוכן JJ
      </Link>
      <Link
        href="/transactions/drafts"
        className="flex min-h-12 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-sm font-medium text-gray-900"
      >
        טיוטות שממתינות לאישור
      </Link>
      <form className="space-y-2" action={ownersHref} method="get">
        <label htmlFor="home-lookup" className="block text-xs text-gray-500">
          חיפוש לקוח או נכס
        </label>
        <input
          id="home-lookup"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="שם לקוח או נכס"
          autoComplete="off"
          className="input w-full min-w-0"
        />
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={ownersHref}
            className="flex min-h-11 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900"
          >
            לקוחות
          </Link>
          <Link
            href={propertiesHref}
            className="flex min-h-11 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900"
          >
            נכסים
          </Link>
        </div>
      </form>
    </section>
  )
}
