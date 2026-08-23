/**
 * JJ Property 10 — Client Report server-boundary repair tests (Option A′).
 *
 * Proves the /client-report-rc3 server action:
 *  - authenticates + authorizes BEFORE fetching (fail closed),
 *  - validates input strictly,
 *  - returns ONLY the client-safe DTO (reports[]) — never raw RC3 rows /
 *    service credentials, and never a PDF payload (the PDF moved to a route),
 *  - preserves every financial figure (incl. Tamir Kiti €930.39),
 *  - and that fetchReport is server-only and unreachable from client code.
 *
 * And proves the auth-gated PDF route GET /client-report-rc3/pdf:
 *  - re-runs the SAME authorization chain (fail closed: 400/403),
 *  - renders the PDF server-side and returns application/pdf only when authorized.
 */
import fs from 'fs'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import { generateClientReport } from '@/lib/report/getClientReportAction'
import { GET as pdfRouteGET } from '@/app/client-report-rc3/pdf/route'
import { validateAuthorizedReportScope } from '@/lib/auth/reportAuthorization'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import { toClientReport, CLIENT_REPORT_FORBIDDEN_ROW_FIELDS } from '@/lib/report/clientReportDto'
import type {
  RC3PropertyReport, RC3AccountSection, RC3AccountRow, RC3AccountType,
  BalanceConvention, DisplayGroup,
} from '@/lib/report/types'

jest.mock('@/lib/auth/reportAuthorization', () => ({ validateAuthorizedReportScope: jest.fn() }))
jest.mock('@/lib/report/fetchReport', () => ({ fetchRC3Report: jest.fn() }))
jest.mock('@/lib/pdf/OwnerSettlementPdfV3', () => ({ OwnerSettlementPdfV3: () => null }))

const mockAuth = validateAuthorizedReportScope as jest.Mock
const mockFetch = fetchRC3Report as jest.Mock
const mockRender = renderToBuffer as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockRender.mockResolvedValue(Buffer.from('%PDF-1.4 boundary-test', 'utf8'))
})

// ── Fixtures (carry FORBIDDEN raw fields so we can prove they are stripped) ────
function mkRow(p: Partial<RC3AccountRow>): RC3AccountRow {
  return {
    id: p.id ?? 'row-' + Math.random().toString(36).slice(2),
    date: p.date ?? '2026-01-01',
    property_name: 'Tamir Kiti',
    reporting_name: 'Tamir Kiti',
    category: 'Management',
    subcategory: p.subcategory ?? 'Electricity bill',
    description: 'SECRET internal description',
    payer: 'Anastasia',
    payee: 'company',
    amount_eur: p.amount_eur ?? 999,               // JJ internal cost — must NOT leak
    client_charge: 888,                            // must NOT leak
    client_amount: p.client_amount ?? 100,
    notes: 'SECRET note',
    k_note: 'SECRET k_note',
    account_type: p.account_type ?? 'rental',
    is_contract_value: p.is_contract_value ?? false,
    is_platform_tracking: false,
    is_bpo: p.is_bpo ?? false,
    review_status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    balance_effect: p.balance_effect ?? 100,
    is_balance_affecting: p.is_balance_affecting ?? true,
    display_group: (p.display_group ?? 'expense') as DisplayGroup,
    display_label: p.display_label ?? 'Electricity',
  }
}
function mkSection(p: Partial<RC3AccountSection>): RC3AccountSection {
  return {
    account_type: (p.account_type ?? 'rental') as RC3AccountType,
    account_label: p.account_label ?? 'Property Management',
    account_label_he: 'ניהול',
    balance_convention: (p.balance_convention ?? 'owner_credit') as BalanceConvention,
    opening_balance: 0,
    rows: p.rows ?? [mkRow({})],
    contract_baseline: p.contract_baseline ?? 0,
    total_income: p.total_income ?? 0,
    total_expenses: p.total_expenses ?? 0,
    total_bpo: p.total_bpo ?? 0,
    closing_balance: p.closing_balance ?? 0,
  }
}
function mkReport(accounts: RC3AccountSection[]): RC3PropertyReport {
  return {
    reporting_name: 'Tamir Kiti', from_date: null, to_date: null,
    generated_at: '2026-08-23T10:00:00Z', accounts,
    has_purchase: false, has_sale: false, has_renovation: true, has_rental: true, has_airbnb: false,
  }
}

// Tamir Kiti canonical fixture: renovation closing -850 (client_debt),
// rental closing -1780.39 (owner_credit) → canonical net -930.39.
function tamirReport(): RC3PropertyReport {
  return mkReport([
    mkSection({ account_type: 'renovation', balance_convention: 'client_debt', contract_baseline: 87000, total_income: 15442, total_expenses: 103292, closing_balance: -850 }),
    mkSection({ account_type: 'rental', balance_convention: 'owner_credit', total_income: 3565.69, total_expenses: 5346.08, closing_balance: -1780.39 }),
  ])
}
function canonicalNet(r: { accounts: ReadonlyArray<{ balance_convention: BalanceConvention; closing_balance: number }> }): number {
  let net = 0
  for (const a of r.accounts) net += a.balance_convention === 'owner_credit' ? a.closing_balance : -a.closing_balance
  return net
}

const VALID_INPUT = { scope: { type: 'single_property' as const, propertyName: 'Tamir Kiti' }, reportType: 'full' as const, lang: 'en' as const }

// ── 1. Unauthenticated → denied, no fetch ─────────────────────────────────────
it('1. unauthenticated request is denied (access_denied) and never fetches', async () => {
  mockAuth.mockResolvedValue({ ok: false, error: 'unauthenticated' })
  const res = await generateClientReport(VALID_INPUT)
  expect(res).toEqual({ ok: false, error: 'access_denied' })
  expect(mockFetch).not.toHaveBeenCalled()
})

// ── 2. Unauthorized role → denied ─────────────────────────────────────────────
it('2. unauthorized role is denied', async () => {
  mockAuth.mockResolvedValue({ ok: false, error: 'unknown_role' })
  const res = await generateClientReport(VALID_INPUT)
  expect(res).toEqual({ ok: false, error: 'access_denied' })
  expect(mockFetch).not.toHaveBeenCalled()
})

// ── 3. Unauthorized property → denied ─────────────────────────────────────────
it('3. requesting an unauthorized property is denied', async () => {
  mockAuth.mockResolvedValue({ ok: false, error: 'no_authorized_properties' })
  const res = await generateClientReport({ ...VALID_INPUT, scope: { type: 'single_property', propertyName: 'Someone Elses Villa' } })
  expect(res).toEqual({ ok: false, error: 'access_denied' })
  expect(mockFetch).not.toHaveBeenCalled()
})

// ── 4. Malformed / tampered input → denied, no auth call ──────────────────────
it('4. malformed/tampered input is denied before auth', async () => {
  expect(await generateClientReport({ scope: { type: 'bogus' }, reportType: 'full', lang: 'en' })).toEqual({ ok: false, error: 'invalid_input' })
  expect(await generateClientReport({ scope: { type: 'single_property', propertyName: '' }, reportType: 'full', lang: 'en' })).toEqual({ ok: false, error: 'invalid_input' })
  expect(await generateClientReport({ scope: { type: 'single_property', propertyName: 'X' }, reportType: 'weekly', lang: 'en' })).toEqual({ ok: false, error: 'invalid_input' })
  expect(await generateClientReport({ scope: { type: 'single_property', propertyName: 'X' }, reportType: 'full', lang: 'en', fromDate: '23/08/2026' })).toEqual({ ok: false, error: 'invalid_input' })
  expect(mockAuth).not.toHaveBeenCalled()
})

// ── 5. Authorized request succeeds ────────────────────────────────────────────
it('5. authorized request succeeds and returns the client-safe report (no PDF payload)', async () => {
  mockAuth.mockResolvedValue({ ok: true, resolvedProperties: ['Tamir Kiti'], role: 'superadmin' })
  mockFetch.mockResolvedValue(tamirReport())
  const res = await generateClientReport(VALID_INPUT)
  expect(res.ok).toBe(true)
  if (!res.ok) return
  expect(res.reports).toHaveLength(1)
  expect(res.reports[0].reporting_name).toBe('Tamir Kiti')
  // The action returns screen data only — no PDF bytes / base64 in the payload.
  const serialized = JSON.stringify(res)
  expect(serialized).not.toContain('pdfBase64')
  expect(serialized).not.toContain('%PDF')
  // The action never renders a PDF (that lives in the route handler).
  expect(mockRender).not.toHaveBeenCalled()
  expect(mockFetch).toHaveBeenCalledWith({ reportingName: 'Tamir Kiti', fromDate: undefined, toDate: undefined })
})

// ── 6. Restricted fields absent from the serialized client result ─────────────
it('6. the returned client DTO contains NONE of the forbidden fields', async () => {
  mockAuth.mockResolvedValue({ ok: true, resolvedProperties: ['Tamir Kiti'], role: 'superadmin' })
  mockFetch.mockResolvedValue(tamirReport())
  const res = await generateClientReport(VALID_INPUT)
  expect(res.ok).toBe(true)
  if (!res.ok) return
  const serialized = JSON.stringify(res.reports)
  for (const f of CLIENT_REPORT_FORBIDDEN_ROW_FIELDS) {
    expect(serialized).not.toContain(`"${f}"`)
  }
  // sentinel secret values never appear either
  expect(serialized).not.toContain('SECRET')
  // spot-check row keys directly
  for (const acc of res.reports[0].accounts) {
    for (const row of acc.rows) {
      for (const f of CLIENT_REPORT_FORBIDDEN_ROW_FIELDS) {
        expect(Object.prototype.hasOwnProperty.call(row, f)).toBe(false)
      }
    }
  }
})

// ── 7 & 8 (static): server-only + no client import of the server chain ─────────
const SRC = (rel: string) => fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf8')

it('7. the client page does not import the server-only report/service chain', () => {
  const page = SRC('app/client-report-rc3/page.tsx')
  expect(page).toContain("'use client'")
  expect(page).not.toMatch(/from '@\/lib\/report\/fetchReport'/)
  expect(page).not.toContain('createServiceClient')
  expect(page).not.toContain('SUPABASE_SERVICE_KEY')
  // it now goes through the server action for screen data …
  expect(page).toContain("from '@/lib/report/getClientReportAction'")
  // … and gets the PDF from the auth-gated route (no client-side react-pdf).
  expect(page).not.toContain('@react-pdf/renderer')
  expect(page).not.toContain('PDFDownloadLink')
  expect(page).toContain('/client-report-rc3/pdf?')
})

it('8. fetchReport is server-only and never imported by any \'use client\' module', () => {
  const fetchSrc = SRC('lib/report/fetchReport.ts')
  expect(fetchSrc).toMatch(/^import 'server-only'/m)

  // scan every .ts/.tsx under src for 'use client' files importing fetchReport
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) { if (name !== '__tests__') walk(full); continue }
      if (!/\.(ts|tsx)$/.test(name)) continue
      if (/\.test\.tsx?$/.test(name)) continue
      const txt = fs.readFileSync(full, 'utf8')
      if (txt.includes("'use client'") && /from ['"]@?\/?.*report\/fetchReport['"]/.test(txt)) {
        offenders.push(path.relative(process.cwd(), full))
      }
    }
  }
  walk(path.join(process.cwd(), 'src'))
  expect(offenders).toEqual([])
})

it('8b. the server action is a \'use server\' module (not \'use client\')', () => {
  const action = SRC('lib/report/getClientReportAction.tsx')
  expect(action).toMatch(/^'use server'/m)
  expect(action).not.toContain("'use client'")
})

// ── 9. Financial invariance: DTO preserves every figure ───────────────────────
it('9. toClientReport preserves all financial aggregates and row amounts', () => {
  const raw = tamirReport()
  const dto = toClientReport(raw)
  expect(dto.accounts).toHaveLength(raw.accounts.length)
  raw.accounts.forEach((a, i) => {
    const d = dto.accounts[i]
    expect(d.contract_baseline).toBe(a.contract_baseline)
    expect(d.total_income).toBe(a.total_income)
    expect(d.total_expenses).toBe(a.total_expenses)
    expect(d.total_bpo).toBe(a.total_bpo)
    expect(d.closing_balance).toBe(a.closing_balance)
    expect(d.balance_convention).toBe(a.balance_convention)
    a.rows.forEach((r, j) => {
      expect(d.rows[j].client_amount).toBe(r.client_amount)
      expect(d.rows[j].balance_effect).toBe(r.balance_effect)
      expect(d.rows[j].display_group).toBe(r.display_group)
    })
  })
  // canonical net is identical across the boundary
  expect(canonicalNet(dto)).toBeCloseTo(canonicalNet(raw), 2)
})

// ── 10. Tamir Kiti stays €930.39 across the boundary ──────────────────────────
it('10. Tamir Kiti canonical net stays -930.39 (payable by Tamir to JJ) after the DTO boundary', () => {
  const raw = tamirReport()
  expect(canonicalNet(raw)).toBeCloseTo(-930.39, 2)
  const dto = toClientReport(raw)
  expect(canonicalNet(dto)).toBeCloseTo(-930.39, 2)
  // renovation payable-to-owner 850, rental payable-by-owner 1780.39 preserved
  expect(dto.accounts.find(a => a.account_type === 'renovation')!.closing_balance).toBe(-850)
  expect(dto.accounts.find(a => a.account_type === 'rental')!.closing_balance).toBe(-1780.39)
})

// ── 11. Existing owner PDF route pattern is intact / PDF template untouched ────
it('11. the existing server-side owner PDF route still uses the server pattern', () => {
  const route = SRC('app/(app)/owners/[slug]/report/pdf/route.ts')
  expect(route).toContain("from '@/lib/report/fetchReport'")
  expect(route).toContain('renderToBuffer')
  expect(route).toContain('OwnerSettlementPdfV3')
  // PR #184 PDF template remains typed to the raw report (not modified by this repair)
  const pdf = SRC('lib/pdf/OwnerSettlementPdfV3.tsx')
  expect(pdf).toContain('RC3PropertyReport')
  expect(pdf).not.toContain("from '@/lib/report/clientReportDto'")
  expect(pdf).not.toContain('getClientReportAction')
})

// ── (guard) server_error surfaces as a generic code, never internal detail ────
it('12. an unexpected server failure returns a generic server_error', async () => {
  mockAuth.mockResolvedValue({ ok: true, resolvedProperties: ['Tamir Kiti'], role: 'superadmin' })
  mockFetch.mockRejectedValue(new Error('DB exploded: secret connection string'))
  const res = await generateClientReport(VALID_INPUT)
  expect(res).toEqual({ ok: false, error: 'server_error' })
})

// ── Auth-gated PDF route: GET /client-report-rc3/pdf ──────────────────────────
const pdfReq = (qs: string) => new Request(`http://localhost/client-report-rc3/pdf?${qs}`)

it('13. PDF route rejects a missing property (400) before any auth/fetch', async () => {
  const res = await pdfRouteGET(pdfReq(''))
  expect(res.status).toBe(400)
  expect(mockAuth).not.toHaveBeenCalled()
  expect(mockFetch).not.toHaveBeenCalled()
  expect(mockRender).not.toHaveBeenCalled()
})

it('14. PDF route rejects a malformed date (400) before any auth/fetch', async () => {
  const res = await pdfRouteGET(pdfReq('property=Tamir%20Kiti&from=23/08/2026'))
  expect(res.status).toBe(400)
  expect(mockAuth).not.toHaveBeenCalled()
  expect(mockFetch).not.toHaveBeenCalled()
})

it('15. PDF route rejects an unauthenticated caller (403) and never fetches', async () => {
  mockAuth.mockResolvedValue({ ok: false, error: 'unauthenticated' })
  const res = await pdfRouteGET(pdfReq('property=Tamir%20Kiti'))
  expect(res.status).toBe(403)
  expect(mockFetch).not.toHaveBeenCalled()
  expect(mockRender).not.toHaveBeenCalled()
})

it('16. PDF route rejects an unauthorized property (403) even if auth resolves other properties', async () => {
  mockAuth.mockResolvedValue({ ok: true, resolvedProperties: ['Someone Elses Villa'], role: 'partner' })
  const res = await pdfRouteGET(pdfReq('property=Tamir%20Kiti'))
  expect(res.status).toBe(403)
  expect(mockFetch).not.toHaveBeenCalled()
  expect(mockRender).not.toHaveBeenCalled()
})

it('17. PDF route renders server-side and returns application/pdf when authorized', async () => {
  mockAuth.mockResolvedValue({ ok: true, resolvedProperties: ['Tamir Kiti'], role: 'superadmin' })
  mockFetch.mockResolvedValue(tamirReport())
  const res = await pdfRouteGET(pdfReq('property=Tamir%20Kiti&type=full&lang=en'))
  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Type')).toBe('application/pdf')
  expect(res.headers.get('Cache-Control')).toBe('no-store')
  expect(res.headers.get('Content-Disposition')).toContain('attachment')
  expect(mockFetch).toHaveBeenCalledWith({ reportingName: 'Tamir Kiti', fromDate: undefined, toDate: undefined })
  expect(mockRender).toHaveBeenCalledTimes(1)
})

it('18. PDF route never surfaces internal error detail (generic 500)', async () => {
  mockAuth.mockResolvedValue({ ok: true, resolvedProperties: ['Tamir Kiti'], role: 'superadmin' })
  mockFetch.mockRejectedValue(new Error('DB exploded: secret connection string'))
  const res = await pdfRouteGET(pdfReq('property=Tamir%20Kiti'))
  expect(res.status).toBe(500)
  const body = await res.text()
  expect(body).not.toContain('secret')
  expect(body).not.toContain('DB exploded')
})

it('19. the PDF route module is server-side (nodejs runtime, force-dynamic, no \'use client\')', () => {
  const route = SRC('app/client-report-rc3/pdf/route.ts')
  expect(route).not.toContain("'use client'")
  expect(route).toMatch(/export const runtime = 'nodejs'/)
  expect(route).toMatch(/export const dynamic = 'force-dynamic'/)
  // it re-runs the canonical authorization chain server-side
  expect(route).toContain('validateAuthorizedReportScope')
  expect(route).toContain("from '@/lib/report/fetchReport'")
})
