/**
 * Offline harness. The document check runs in process.
 * The npm script renders the PDF outside Jest, because Jest stubs react-pdf.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'

import { ADAPTER_REGISTRY } from '../adapterRegistry'
import { oritRobAdapter } from '../adapters/oritRob'
import { urielAdapter } from '../adapters/uriel'
import { ORIT_APPROVED, TAMIR_APPROVED, URIEL_APPROVED } from '../__fixtures__/approvedFigures'
import { verifyApprovedReports } from '../verifyApprovedReports'

describe('approved client-report figures', () => {
  test('the registry lists the 16 settlement contacts and does not invent adapters', () => {
    expect(ADAPTER_REGISTRY).toHaveLength(16)
    expect(new Set(ADAPTER_REGISTRY.map((entry) => entry.contactId)).size).toBe(16)
    expect(ADAPTER_REGISTRY.filter((entry) => entry.status === 'adapter-present')).toEqual([
      expect.objectContaining({ contactName: 'Orit Rob', clientSlug: oritRobAdapter.clientSlug }),
      expect.objectContaining({ contactName: 'Uriel', clientSlug: urielAdapter.clientSlug }),
    ])
    expect(ADAPTER_REGISTRY.find((entry) => entry.contactName === 'Uriel')?.status).toBe('adapter-present')
    expect(ADAPTER_REGISTRY.find((entry) => entry.contactName === 'Tamir')?.status).toBe('pending-adapter')
    expect(ADAPTER_REGISTRY.filter((entry) => entry.status === 'no-cert')).toHaveLength(13)
    expect(ADAPTER_REGISTRY.some((entry) => entry.status === 'not-in-scope')).toBe(false)
  })

  test('Orit matches REVIEW-6 and Uriel matches the certified figures', () => {
    const clients = verifyApprovedReports()
    const orit = clients.find((client) => client.summary.clientSlug === 'orit-rob')
    expect(orit?.summary.match).toBe(true)
    expect(orit?.summary.rendered).toBe(true)
    expect(orit?.summary.figures).toEqual({
      gross: { expected: ORIT_APPROVED.gross, actual: ORIT_APPROVED.gross },
      paid: { expected: ORIT_APPROVED.paid, actual: ORIT_APPROVED.paid },
      balance: { expected: ORIT_APPROVED.balance, actual: ORIT_APPROVED.balance },
      direction: { expected: 'client_owes_jj', actual: 'client_owes_jj' },
    })
    expect(orit?.summary.text?.propertyLine).toBe('יתרת הנכס לפני תשלומים כלליים')
    expect(orit?.summary.text?.heroDirection).toBe('אורית רוב חייבת ל־JJ.')
    expect(orit?.summary.text?.jjOwesDirection.startsWith('JJ חייבת')).toBe(true)
    expect(orit?.summary.text?.bridge.map((row) => row.label)).toEqual([
      'יתרת הנכס לפני תשלומים כלליים',
      'תשלום אפריל 2026',
      'תשלום מאי 2026',
      'יתרה לתשלום ל־JJ',
    ])
    expect(orit?.summary.mismatches).toEqual([])

    const uriel = clients.find((client) => client.summary.clientSlug === 'uriel')
    expect(uriel?.summary.rendered).toBe(true)
    expect(uriel?.summary.match).toBe(true)
    expect(uriel?.summary.figures).toMatchObject({
      gross: { expected: URIEL_APPROVED.gross, actual: URIEL_APPROVED.gross },
      paid: { expected: URIEL_APPROVED.paid, actual: URIEL_APPROVED.paid },
      credit: { expected: URIEL_APPROVED.credit, actual: URIEL_APPROVED.credit },
      balance: { expected: URIEL_APPROVED.balance, actual: URIEL_APPROVED.balance },
      direction: { expected: 'client_owes_jj', actual: 'client_owes_jj' },
    })
    expect(uriel?.summary.figures?.certificationId?.actual).toEqual(expect.stringContaining('ad2ba8fd'))
    expect(uriel?.summary.properties).toHaveLength(8)
    expect(uriel?.summary.gates).toEqual({ status: 'pass', count: 15 })
    expect(uriel?.summary.openItems?.map((item) => item.id)).toEqual([
      'charge-defaulted-caption',
      'd3d31222-a746-4b3e-af22-40db870bb5d6',
      '3d7fdff5-9ec6-4a26-b2f8-00cdef0c2c6b',
      'ba646d2d-9122-4909-ae02-8a67739a0172',
    ])
    expect(uriel?.summary.pendingWording?.map((item) => item.wording)).toEqual([
      'עבודת גינה נוספת',
      'זיכוי שרון — ללא מזומן',
    ])
    expect(uriel?.summary.pendingDescriptions).toHaveLength(4)
    expect(uriel?.summary.mismatches).toEqual([])

    const tamir = clients.find((client) => client.summary.clientSlug === 'tamir')
    expect(tamir?.summary.rendered).toBe(false)
    expect(tamir?.summary.status).toBe('pending-decision')
    expect(tamir?.summary.certs).toEqual(TAMIR_APPROVED.certs)
    expect(tamir?.document).toBeNull()
  })

  test('the harness source does not open a service client', () => {
    const files = [
      'src/lib/report/clientAccount/verifyApprovedReports.ts',
      'src/lib/report/clientAccount/adapterRegistry.ts',
      'src/lib/report/clientAccount/__fixtures__/approvedFigures.ts',
      'src/lib/pdf/renderClientAccountFixturePdf.ts',
      'src/lib/report/clientAccount/urielFixtureReport.ts',
      'scripts/report-verify.ts',
      'scripts/pdfPlainText.ts',
    ]
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source.includes('createServiceClient')).toBe(false)
      expect(source.includes("from '@/lib/supabase'")).toBe(false)
    }
    const engine = readFileSync(join(process.cwd(), 'src/lib/report/clientAccount/verifyApprovedReports.ts'), 'utf8')
    expect(engine.includes('20261002150000')).toBe(false)
  })
})

describe('report:verify', () => {
  test('renders Orit and Uriel from fixtures and writes matching summaries', () => {
    const result = spawnSync('npx', ['tsx', 'scripts/report-verify.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 180000,
    })
    if (result.status !== 0) {
      throw new Error(`${result.stdout}\n${result.stderr}`)
    }
    const orit = JSON.parse(readFileSync(join(process.cwd(), 'docs', 'planning', 'client-report-verify', 'orit-rob.json'), 'utf8'))
    expect(orit.match).toBe(true)
    expect(orit.pdf.missing).toEqual([])
    expect(orit.figures.direction.actual).toBe('client_owes_jj')
    const uriel = JSON.parse(readFileSync(join(process.cwd(), 'docs', 'planning', 'client-report-verify', 'uriel.json'), 'utf8'))
    expect(uriel.match).toBe(true)
    expect(uriel.pdf.missing).toEqual([])
    expect(uriel.figures.balance.actual).toBe(URIEL_APPROVED.balance)
    expect(uriel.openItems.length).toBe(4)
  }, 180000)
})
