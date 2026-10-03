/**
 * Offline Uriel composition. Fixtures only. Does not open a database connection.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { parseCertifiedReaderPayload } from '../../finance/certifiedClientSettlementParse'
import type { CertifiedClientSettlementAvailable } from '../../finance/certifiedClientSettlementTypes'
import { urielAdapter } from './adapters/uriel'
import { buildClientAccountReport, type ClientAccountReport } from './buildClientAccountReport'
import { admitCertifiedStrMonthly } from './certifiedStrMonthly'
import {
  certifiedPropertyNames,
  compositionFromCertifiedSettlement,
  type RawTransactionRow,
} from './certifiedSource'
import { ClientAccountBlock } from './composeCertifiedAccount'
import type { CertifiedStrMonthlySection, CertifiedStrMonthlyUnavailable } from './types'

interface UrielReaderFile {
  readonly settlement: unknown
  readonly str: Readonly<Record<string, unknown>>
}

interface UrielEntity {
  readonly id: string
}

function fixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'src/lib/report/clientAccount/__fixtures__/uriel', name), 'utf8'))
}

function withoutGarden2(settlement: CertifiedClientSettlementAvailable): CertifiedClientSettlementAvailable {
  return {
    ...settlement,
    propertyLines: settlement.propertyLines.map((line) => {
      if (typeof line.metadata.garden_2 !== 'string') return line
      const metadata: Record<string, unknown> = {}
      const keys = Object.keys(line.metadata)
      for (let i = 0; i < keys.length; i += 1) {
        if (keys[i] !== 'garden_2') metadata[keys[i]] = line.metadata[keys[i]]
      }
      return { ...line, metadata }
    }),
  }
}

export interface UrielFixtureReport {
  readonly report: ClientAccountReport
  readonly certificationId: string
}

export function renderUrielFixture(options?: { readonly omitGarden2?: boolean }): UrielFixtureReport {
  const reader = fixtureJson('reader.json') as UrielReaderFile
  const entities = fixtureJson('entities.json') as UrielEntity[]
  const rows = fixtureJson('rows.json') as RawTransactionRow[]
  const entityId = entities[0]?.id
  if (!entityId || !urielAdapter.evidence || urielAdapter.identity.kind !== 'entity') {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', 'Uriel fixture is incomplete.')
  }
  const parsed = parseCertifiedReaderPayload(reader.settlement, entityId, urielAdapter.asOf)
  if (parsed.unavailable) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', parsed.reason)
  }
  const settlement = options?.omitGarden2 ? withoutGarden2(parsed) : parsed
  const names = certifiedPropertyNames(settlement)
  const linkedRows: Record<string, RawTransactionRow[]> = {}
  const linkedNames = urielAdapter.linkedRowPropertyNames || []
  for (let i = 0; i < linkedNames.length; i += 1) {
    const name = linkedNames[i]
    if (names.includes(name)) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `linked evidence property ${name} is also a certified account`)
    }
    linkedRows[name] = rows.filter((row) => row.property_name === name)
  }
  const monthly: Record<string, CertifiedStrMonthlySection | CertifiedStrMonthlyUnavailable> = {}
  const period = urielAdapter.strMonthly
  if (period) {
    for (let i = 0; i < settlement.propertyLines.length; i += 1) {
      const line = settlement.propertyLines[i]
      monthly[line.propertyKey] = admitCertifiedStrMonthly(reader.str[line.propertyKey] ?? null, {
        entityId,
        propertyId: line.propertyKey,
        propertyName: line.propertyName,
        periodStart: period.start,
        periodEnd: period.end,
      })
    }
  }
  const composition = compositionFromCertifiedSettlement({
    settlement,
    rows,
    clientSlug: urielAdapter.clientSlug,
    clientDisplayName: urielAdapter.clientDisplayName,
    reportTitle: urielAdapter.reportTitle,
    reportLanguage: urielAdapter.reportLanguage,
    reportType: urielAdapter.reportType,
    certifiedStrMonthlyByPropertyKey: monthly,
    evidence: urielAdapter.evidence({ settlement, rows, linkedRows }),
  })
  if (composition.status !== 'ready') {
    throw new ClientAccountBlock(
      composition.code === 'BLOCKED_PRESENTATION' ? 'BLOCKED_PRESENTATION' : 'BLOCKED_ACCOUNTING',
      composition.reason,
    )
  }
  return { report: buildClientAccountReport(composition.input), certificationId: settlement.certificationId }
}
