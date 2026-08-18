/**
 * GET /owners/[slug]/report/pdf — Owner Financial Report (PDF).
 *
 * PR #166 — Blocker 4 + Blocker 5 fix.
 *
 * Auth-gated (statement auth). Fetches RC3 data per property, applies
 * statement Include/Exclude decisions, then renders OwnerSettlementPdfV3
 * to a real PDF via server-side renderToBuffer. Read-only; no financial writes.
 *
 * Query params:
 *   ?lang=he       — Hebrew RTL layout (default: en)
 *   ?type=full     — Report type: full | periodic (default: full)
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD — optional date range
 *   ?property=PropertyName — required when owner has multiple properties (Blocker 5)
 *
 * Constitutional:
 *   P-LEDGER-6: Owner-facing amounts = COALESCE(client_charge, amount_eur)
 *   P-ARCH-1: NULL = Unknown, never 0
 *   fetchRC3Report is the canonical financial authority (monetary truth)
 *   Statement draft/snapshot decisions are the presentation authority (Include/Exclude)
 *   Client-facing report = RC3 financial truth + statement presentation decisions
 */
import React from 'react'
import fs from 'fs'
import path from 'path'
import { renderToBuffer, Font } from '@react-pdf/renderer'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { getOwnerWorkspace } from '@/lib/owners/ownerWorkspaceService'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import { createServiceClient } from '@/lib/supabase'
import { OwnerSettlementPdfV3 } from '@/lib/pdf/OwnerSettlementPdfV3'
import type { Lang } from '@/lib/report/labels'
import type { ReportType } from '@/lib/report/reportTypes'
import type { RC3PropertyReport, RC3AccountSection } from '@/lib/report/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/* ─── Font registration (serverless-compatible) ──────────────────────────── */
// Fonts are read from the filesystem at cold-start and embedded as data URIs.
// This avoids HTTP round-trips to the deployment origin, which would fail on
// auth-protected Vercel Preview deployments (the serverless function doesn't
// carry browser auth cookies). fs.readFileSync triggers @vercel/nft file
// tracing, so the font files are bundled into the serverless function.
let _fontsRegistered = false
function registerPdfFonts() {
  if (_fontsRegistered) return
  const fontDir = path.join(process.cwd(), 'public', 'fonts')
  const regularData = fs.readFileSync(path.join(fontDir, 'Heebo-Regular.ttf'))
  const boldData = fs.readFileSync(path.join(fontDir, 'Heebo-Bold.ttf'))
  Font.register({
    family: 'Heebo',
    fonts: [
      { src: `data:font/ttf;base64,${regularData.toString('base64')}` },
      { src: `data:font/ttf;base64,${boldData.toString('base64')}`, fontWeight: 'bold' },
    ],
  })
  _fontsRegistered = true
}

// ─── Blocker 4: Statement-aware report filtering ─────────────────────────────

/**
 * Resolve the set of transaction IDs that the owner has explicitly excluded
 * from the current statement draft. These rows must not appear in the
 * client-facing PDF (Blocker 4).
 *
 * Returns an empty Set if no statement series exists (= all rows included).
 */
async function resolveExcludedTransactionIds(
  ownerPartyId: string,
  allTransactionIds: string[],
): Promise<Set<string>> {
  if (allTransactionIds.length === 0) return new Set()

  const db = createServiceClient()

  // Step 1: Find the active statement series for this owner
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seriesRows } = await (db as any)
    .schema('statements')
    .from('statement_series')
    .select('series_id')
    .eq('owner_party_id', ownerPartyId)
    .eq('series_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)

  const seriesId = seriesRows?.[0]?.series_id
  if (!seriesId) return new Set() // No series → no exclusions → all rows included

  // Step 2: Query draft lines for these transactions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: draftLines } = await (db as any)
    .schema('statements')
    .rpc('get_draft_lines_for_transactions', {
      p_series_id: seriesId,
      p_transaction_ids: allTransactionIds,
    })

  // Step 3: Build excluded set — rows where include_in_statement = false
  const excluded = new Set<string>()
  for (const dl of (draftLines ?? [])) {
    if (dl.include_in_statement === false) {
      excluded.add(dl.source_transaction_id)
    }
  }

  return excluded
}

/**
 * Filter excluded transactions from an RC3 report and recompute section aggregates.
 * RC3 remains the monetary authority — we only remove rows the owner excluded.
 */
function applyStatementExclusions(
  report: RC3PropertyReport,
  excludedIds: Set<string>,
): RC3PropertyReport {
  if (excludedIds.size === 0) return report

  const filteredAccounts: RC3AccountSection[] = report.accounts.map(section => {
    const filteredRows = section.rows.filter(row => !excludedIds.has(row.id))

    // Recompute aggregates from remaining balance-affecting rows
    let totalIncome = 0
    let totalExpenses = 0
    let totalBpo = 0
    let sumBalanceEffect = 0

    for (const row of filteredRows) {
      if (!row.is_balance_affecting) continue
      sumBalanceEffect += row.balance_effect

      if (row.balance_effect > 0) {
        totalIncome += row.balance_effect
      }
      // BPO detection: display_group === 'payment_out' (negative balance_effect)
      if (row.display_group === 'payment_out') {
        totalBpo += Math.abs(row.balance_effect)
      } else if (row.balance_effect < 0) {
        totalExpenses += Math.abs(row.balance_effect)
      }
    }

    return {
      ...section,
      rows: filteredRows,
      total_income: totalIncome,
      total_expenses: totalExpenses,
      total_bpo: totalBpo,
      // closing_balance = contract_baseline + opening_balance + sum(balance_effect)
      closing_balance: section.contract_baseline + section.opening_balance + sumBalanceEffect,
    }
  }).filter(section => section.rows.length > 0) // Drop empty sections

  return { ...report, accounts: filteredAccounts }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return new Response('Unauthorized', { status: auth.error === 'NO_SESSION' ? 401 : 403 })
  }

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') === 'he' ? 'he' : 'en') as Lang
  const reportType = (url.searchParams.get('type') === 'periodic' ? 'periodic' : 'full') as ReportType
  const fromDate = url.searchParams.get('from') ?? null
  const toDate = url.searchParams.get('to') ?? null
  const propertyParam = url.searchParams.get('property') ?? null // Blocker 5

  // Validate date params if provided
  if (fromDate && !DATE_RE.test(fromDate)) {
    return new Response('Invalid from date (expected YYYY-MM-DD)', { status: 400 })
  }
  if (toDate && !DATE_RE.test(toDate)) {
    return new Response('Invalid to date (expected YYYY-MM-DD)', { status: 400 })
  }

  const workspace = await getOwnerWorkspace(params.slug)
  if (!workspace) return new Response('Owner not found', { status: 404 })

  const properties = workspace.identity.properties
  if (!properties || properties.length === 0) {
    return new Response('No properties found for this owner', { status: 404 })
  }

  // ── Blocker 5: Property selection ──────────────────────────────────────────
  // Determine which properties to fetch reports for
  let targetProperties: string[]
  if (propertyParam) {
    // Explicit property selection — verify it exists in the owner's property list
    if (!properties.includes(propertyParam)) {
      return new Response(JSON.stringify({
        error: 'Property not found for this owner',
        requested: propertyParam,
        available: properties,
      }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }
    targetProperties = [propertyParam]
  } else if (properties.length === 1) {
    // Single property — backward compatible, no param needed
    targetProperties = properties
  } else {
    // Multiple properties, no selection — return 400 listing available properties
    return new Response(JSON.stringify({
      error: 'Multiple properties found. Specify ?property=PropertyName to select one.',
      available: properties,
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  // Fetch RC3 report for the selected property
  const reportResults = await Promise.allSettled(
    targetProperties.map(reportingName =>
      fetchRC3Report({
        reportingName,
        fromDate: fromDate ?? undefined,
        toDate: toDate ?? undefined,
      }),
    ),
  )

  const reports = reportResults
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchRC3Report>>> =>
      r.status === 'fulfilled',
    )
    .map(r => r.value)
    .filter(r => r.accounts.length > 0)

  if (reports.length === 0) {
    return new Response('No financial data found for this owner', { status: 404 })
  }

  // At this point we have exactly one report (Blocker 5 guarantees single property)
  let report = reports[0]

  // ── Blocker 4: Apply statement Include/Exclude decisions ───────────────────
  // Collect all transaction IDs from the report
  const allTxIds: string[] = []
  for (const section of report.accounts) {
    for (const row of section.rows) {
      if (row.id) allTxIds.push(row.id)
    }
  }

  // Resolve exclusions using the canonical partyId (Blocker 2)
  const excludedIds = await resolveExcludedTransactionIds(
    workspace.identity.partyId,
    allTxIds,
  )

  // Apply exclusions — filter rows + recompute aggregates
  report = applyStatementExclusions(report, excludedIds)

  if (report.accounts.length === 0) {
    return new Response('All financial data for this property has been excluded from the statement', { status: 404 })
  }

  // ── Render PDF ─────────────────────────────────────────────────────────────
  registerPdfFonts()

  const element = React.createElement(OwnerSettlementPdfV3, {
    report,
    lang,
    reportType,
  }) as unknown as React.ReactElement

  const buffer = await renderToBuffer(element as any)

  const ownerName = (workspace.identity.name || 'Owner').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')
  const propSuffix = propertyParam ? `_${propertyParam.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}` : ''
  const dateSuffix = fromDate && toDate ? `_${fromDate}_to_${toDate}` : '_all_history'
  const filename = `${ownerName}${propSuffix}_Financial_Report${dateSuffix}.pdf`

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
