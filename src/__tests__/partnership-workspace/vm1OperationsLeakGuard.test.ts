/**
 * Leak / isolation guards for VM1 Property Operations.
 * Staff-only route. Share, PDF, print, and certified Avi surfaces stay unchanged.
 */
import * as fs from 'fs'
import * as path from 'path'

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
}

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const OPERATIONS_FILES = [
  'src/app/(app)/finance/external-partner/avi/operations/page.tsx',
  'src/app/(app)/finance/external-partner/avi/operations/loading.tsx',
  'src/components/finance/Vm1OperationsView.tsx',
  'src/lib/partnership-workspace/vm1OperationsService.ts',
  'src/lib/partnership-workspace/vm1OperationsPresentation.ts',
  'src/lib/partnership-workspace/vm1ForecastCalculator.ts',
  'src/lib/partnership-workspace/vm1ForecastPresentation.ts',
  'src/lib/partnership-workspace/aviCertifiedReservationIds.ts',
  'src/lib/partnership-workspace/vm1OperationsRoutes.ts',
]

const EXTERNAL_SURFACES = [
  'src/app/share/avi-external-partner/[token]/page.tsx',
  'src/app/(app)/finance/external-partner/avi/pdf/route.ts',
  'src/app/(app)/finance/external-partner/avi/print/page.tsx',
  'src/lib/pdf/renderAviPartnerReportPdf.ts',
  'src/lib/pdf/AviPartnerReportPdf.tsx',
  'src/components/finance/ExternalPartnerAviReportView.tsx',
  'src/components/finance/aviReportPrintCss.ts',
]

const CERTIFIED_FROZEN = [
  'src/lib/partner-settlement/external-partner/aviHostawayStays.ts',
  'src/lib/partner-settlement/external-partner/aviReportSections.ts',
  'src/lib/partner-settlement/external-partner/aviCertifiedIdentity.ts',
]

const PII_NEEDLES = [
  'guestName',
  'guest_name',
  'guestEmail',
  'phone',
  'mobile',
  'email',
  'pms_resolve_mapping',
  'property_name',
]

describe('VM1 operations leak guards', () => {
  it('operations sources use listing 412148 and never a property-name resolver', () => {
    const identity = read('src/lib/partnership-workspace/vm1Identity.ts')
    const adapter = read('src/lib/partnership-workspace/vm1IdentityAdapter.ts')
    const page = read('src/app/(app)/finance/external-partner/avi/operations/page.tsx')
    expect(identity).toContain("'412148'")
    expect(adapter).toContain('VM1_HOSTAWAY_LISTING_ID')
    expect(adapter).toContain('pms_reservations_for_property')
    expect(page).toContain('412148')
    const joined = OPERATIONS_FILES.map(read).join('\n')
    for (const needle of ['pms_resolve_mapping', 'property_name']) {
      expect(joined).not.toContain(needle)
    }
    expect(joined).not.toContain('guestName')
    expect(joined).not.toContain('Net Owner Payout')
    expect(joined).not.toContain('594.25')
    expect(joined).not.toContain('Internet')
    expect(joined).not.toContain('strStatementLine')
    expect(joined).not.toContain('applyAirbnbCyprusVat')
    expect(joined).not.toContain('buildOwnerStrStatement')
  })

  it('staff Avi report page links to operations inside the print-hidden chrome', () => {
    const page = read('src/app/(app)/finance/external-partner/avi/page.tsx')
    expect(page).toContain('VM1_OPERATIONS_ROUTE')
    expect(page).toContain('Property Operations / פעילות הנכס')
    expect(page).toContain('avi-staff-property-operations-link')
    expect(page).toContain('avi-print-hide')
    expect(page).toContain('print:hidden')
    expect(page).not.toContain('href="/finance"')
    expect(page.indexOf('avi-staff-property-operations-link')).toBeGreaterThan(
      page.indexOf('avi-print-hide'),
    )
  })

  it('share route, PDF, print, and certified view do not contain the operations link', () => {
    for (const rel of EXTERNAL_SURFACES) {
      const text = read(rel)
      expect(text).not.toContain('VM1_OPERATIONS_ROUTE')
      expect(text).not.toContain('/avi/operations')
      expect(text).not.toContain('Property Operations')
      expect(text).not.toContain('פעילות הנכס')
      expect(text).not.toContain('Financial Forecast')
      expect(text).not.toContain('תחזית כספית')
      expect(text).not.toContain('vm1Forecast')
    }
  })

  it('does not edit the frozen Avi stay module or certified identity', () => {
    for (const rel of CERTIFIED_FROZEN) {
      const text = read(rel)
      expect(text).not.toContain('vm1Operations')
      expect(text).not.toContain('Property Operations')
      expect(text).not.toContain('loadVm1Identity')
    }
  })

  it('operations files do not expose guest/contact fields or service-role secrets', () => {
    for (const rel of OPERATIONS_FILES) {
      const text = read(rel)
      for (const needle of PII_NEEDLES) {
        expect(text).not.toContain(needle)
      }
      expect(text).not.toContain('SUPABASE_SERVICE_KEY')
      expect(text).not.toContain('service_role')
    }
  })

  it('aviCertifiedReservationIds.ts imports server-only before AVI_HOSTAWAY_STAYS', () => {
    const src = read('src/lib/partnership-workspace/aviCertifiedReservationIds.ts')
    const imports = src.match(/^import .+$/gm) ?? []
    expect(imports[0]).toBe("import 'server-only'")
    expect(src).toContain("from '@/lib/partner-settlement/external-partner/aviHostawayStays'")
    expect(src.indexOf("import 'server-only'")).toBeLessThan(
      src.indexOf("import { AVI_HOSTAWAY_STAYS }"),
    )
  })

  it('no Client Component imports certified stays or the operations service', () => {
    const clientFiles = listTsFiles(path.join(process.cwd(), 'src')).filter((abs) =>
      /['"]use client['"]/.test(fs.readFileSync(abs, 'utf8')),
    )
    expect(clientFiles.length).toBeGreaterThan(0)
    for (const abs of clientFiles) {
      const text = fs.readFileSync(abs, 'utf8')
      expect(text).not.toContain('aviCertifiedReservationIds')
      expect(text).not.toContain('vm1OperationsService')
      expect(text).not.toMatch(/from ['"]@\/lib\/partnership-workspace/)
    }
  })

  it('only a derived Set of reservation IDs is passed to loadVm1Identity', () => {
    const ids = read('src/lib/partnership-workspace/aviCertifiedReservationIds.ts')
    const service = read('src/lib/partnership-workspace/vm1OperationsService.ts')
    const adapter = read('src/lib/partnership-workspace/vm1IdentityAdapter.ts')
    expect(ids).toContain('export function aviCertifiedReservationIdSet(): ReadonlySet<string>')
    expect(ids).toContain('new Set(AVI_HOSTAWAY_STAYS.map((stay) => stay.reservationId))')
    expect(service).toContain('certifiedReservationIds: aviCertifiedReservationIdSet()')
    expect(service).not.toContain('AVI_HOSTAWAY_STAYS')
    expect(adapter).not.toContain('from \'@/lib/partner-settlement/external-partner/aviHostawayStays\'')
    expect(adapter).not.toContain('AVI_HOSTAWAY_STAYS.map')
  })
})
