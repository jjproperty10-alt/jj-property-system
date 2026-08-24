'use server'
/**
 * JJ Property 10 — Client Report Server Action (server-boundary repair, Option A′)
 * 2026-08-23.
 *
 * Atomic server action for the /client-report-rc3 SCREEN data. Runs on the server:
 *   1. Strictly validate the request schema (fail closed).
 *   2. Authenticate + authorize the requested scope via the canonical
 *      authorization infrastructure (validateAuthorizedReportScope — resolves the
 *      session cookie and the user_roles policy).
 *   3. ONLY after authorization, fetch RC3 server-side (fetchRC3Report →
 *      createServiceClient, server-only).
 *   4. Return ONLY the explicit client-safe DTO (toClientReport). Raw
 *      RC3PropertyReport / RC3Row never leave the server.
 *
 * The PDF itself is produced by the auth-gated route handler
 * `GET /client-report-rc3/pdf` (see route.ts). @react-pdf/renderer is a
 * top-level-await ESM module that a Server Action's module graph cannot host,
 * so PDF rendering lives in a route handler (the proven owner-route pattern),
 * which independently re-runs the SAME authorization chain.
 *
 * SECURITY:
 *   - Authorization + fetch happen in the SAME action (no browser fetch, no
 *     TOCTOU split).
 *   - SUPABASE_SERVICE_KEY stays server-only; never returned, logged, or in the DTO.
 *   - Errors returned to the browser are generic codes only.
 */
import { validateAuthorizedReportScope, type ReportScope } from '@/lib/auth/reportAuthorization'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import { toClientReport, type ClientReport } from '@/lib/report/clientReportDto'
import type { ReportType } from '@/lib/report/reportTypes'
import type { Lang } from '@/lib/report/labels'

export interface GenerateClientReportInput {
  scope:       ReportScope
  reportType:  ReportType
  fromDate?:   string
  toDate?:     string
  lang:        Lang
}

export type ClientReportErrorCode =
  | 'invalid_input'   // schema validation failed
  | 'access_denied'   // unauthenticated / no role / unauthorized property
  | 'not_found'       // authorized but no reportable data
  | 'server_error'    // unexpected server-side failure

export type GenerateClientReportResult =
  | { ok: true;  reports: ClientReport[] }
  | { ok: false; error: ClientReportErrorCode }

// ── Strict input validation (fail closed, no external schema lib) ────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

function parseScope(raw: unknown): ReportScope | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (s.type === 'portfolio') return { type: 'portfolio' }
  if (s.type === 'single_property') {
    return typeof s.propertyName === 'string' && s.propertyName.trim().length > 0
      ? { type: 'single_property', propertyName: s.propertyName.trim() }
      : null
  }
  if (s.type === 'selected_properties') {
    if (!Array.isArray(s.propertyNames)) return null
    const names = s.propertyNames
      .filter(n => typeof n === 'string' && n.trim().length > 0)
      .map(n => (n as string).trim())
    return names.length > 0 ? { type: 'selected_properties', propertyNames: names } : null
  }
  return null
}

function parseInput(raw: unknown): GenerateClientReportInput | null {
  if (!raw || typeof raw !== 'object') return null
  const i = raw as Record<string, unknown>
  const scope = parseScope(i.scope)
  if (!scope) return null
  if (i.reportType !== 'full' && i.reportType !== 'periodic') return null
  if (i.lang !== 'en' && i.lang !== 'he') return null
  if (i.fromDate !== undefined && i.fromDate !== null && i.fromDate !== '' && !isValidDate(i.fromDate)) return null
  if (i.toDate !== undefined && i.toDate !== null && i.toDate !== '' && !isValidDate(i.toDate)) return null
  return {
    scope,
    reportType: i.reportType,
    lang: i.lang,
    fromDate: isValidDate(i.fromDate) ? i.fromDate : undefined,
    toDate: isValidDate(i.toDate) ? i.toDate : undefined,
  }
}

// ── The atomic server action (screen data only; PDF via the route handler) ────

export async function generateClientReport(rawInput: unknown): Promise<GenerateClientReportResult> {
  // 1. Strict schema validation — fail closed.
  const input = parseInput(rawInput)
  if (!input) return { ok: false, error: 'invalid_input' }

  try {
    // 2 + 3. Authenticate + authorize in the SAME action (no browser fetch).
    const auth = await validateAuthorizedReportScope(input.scope)
    if (!auth.ok) {
      return { ok: false, error: 'access_denied' } // generic; no ownership leakage
    }

    const resolved = auth.resolvedProperties
    if (resolved.length === 0) return { ok: false, error: 'not_found' }

    // 4. Fetch server-side, reduce to the client-safe DTO. Raw rows never leave here.
    const reports: ClientReport[] = []
    for (const name of resolved) {
      const raw = await fetchRC3Report({
        reportingName: name,
        fromDate: input.fromDate,
        toDate: input.toDate,
      })
      reports.push(toClientReport(raw))
    }

    if (reports.length === 0) return { ok: false, error: 'not_found' }
    return { ok: true, reports }
  } catch {
    return { ok: false, error: 'server_error' }
  }
}
