/**
 * Offline check of the certified client-report engine.
 * Fixtures and approved figures only. This module does not open a database
 * connection and does not construct a service client.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { CertifiedClientSettlementAvailable } from '../../finance/certifiedClientSettlementTypes'
import { ADAPTER_REGISTRY } from './adapterRegistry'
import { oritRobAdapter } from './adapters/oritRob'
import { urielAdapter } from './adapters/uriel'
import { URIEL_GARDEN_2_LABEL, URIEL_SHARON_CREDIT_LABEL } from './presentationTags'
import { renderUrielFixture } from './urielFixtureReport'
import { urielEngineNotes, type UrielEngineNote } from './__fixtures__/urielOpenItems'
import {
  APPROVED_FIGURES,
  type ApprovedBridgeRow,
  type ApprovedFigures,
  type ApprovedPendingAdapterFigures,
  type ApprovedPendingDecisionFigures,
  type ApprovedRenderableFigures,
} from './__fixtures__/approvedFigures'
import { buildClientAccountReport, type ClientAccountReport } from './buildClientAccountReport'
import { compositionFromCertifiedSettlement, type RawTransactionRow } from './certifiedSource'
import { ClientAccountBlock } from './composeCertifiedAccount'
import { clientAccountPlainText } from './gates'
import { heroDirectionText, propertyBridgeTitle, settlementClosingDisplay } from './presentation'
import type { ClientAccountDocument, CompositionInput, LedgerRow } from './types'
import { oritReview6Fixture } from './__tests__/fixtures/review6TemplateFixture'

export interface FigureCheck {
  readonly expected: number | string
  readonly actual: number | string | null
}

export interface ClientVerifySummary {
  readonly clientSlug: string
  readonly contactName: string
  readonly rendered: boolean
  readonly match: boolean
  readonly status: ApprovedFigures['kind'] | 'not-rendered'
  readonly approvalRef?: string
  readonly note?: string
  readonly figures?: {
    readonly gross: FigureCheck
    readonly paid: FigureCheck
    readonly balance: FigureCheck
    readonly direction: FigureCheck
    readonly credit?: FigureCheck
    readonly certificationId?: FigureCheck
  }
  readonly properties?: readonly {
    readonly propertyName: string
    readonly amountDueToJj: FigureCheck
    readonly direction: FigureCheck
  }[]
  readonly gates?: { readonly status: string; readonly count: number }
  readonly openItems?: readonly UrielEngineNote[]
  readonly pendingDescriptions?: readonly UrielEngineNote[]
  readonly pendingWording?: readonly { readonly constant: string; readonly wording: string; readonly status: string }[]
  readonly neer?: string
  readonly text?: {
    readonly propertyLine: string
    readonly heroDirection: string
    readonly jjOwesDirection: string
    readonly bridge: readonly ApprovedBridgeRow[]
    readonly plainTextMissing: readonly string[]
  }
  readonly pdf?: {
    readonly missing: readonly string[]
  }
  readonly certs?: ApprovedPendingDecisionFigures['certs']
  readonly mismatches: readonly string[]
}

export interface VerifiedClient {
  readonly summary: ClientVerifySummary
  readonly document: ClientAccountDocument | null
  readonly pdfLines: readonly string[]
}

function sameMoney(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 0.001
}

/** Collapse PDF text runs. A maqaf before a Latin word is often split by a space. */
export function normalizeReportText(text: string): string {
  return text
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/־\s+/g, '־')
    .replace(/\s+־/g, '־')
}

export function missingLines(text: string, lines: readonly string[]): string[] {
  const normalized = normalizeReportText(text)
  return lines.filter((line) => !normalized.includes(normalizeReportText(line)))
}

function rawFrom(row: LedgerRow): RawTransactionRow {
  return {
    id: row.id,
    date: row.date,
    property_name: row.propertyName,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    payer: row.payer,
    payee: row.payee,
    amount_eur: row.amountEur,
    client_charge: row.clientCharge,
    review_status: row.reviewStatus,
    is_deleted: row.isDeleted,
  }
}

function settlementFrom(input: CompositionInput): CertifiedClientSettlementAvailable {
  const credits = input.credits.reduce((sum, credit) => sum + credit.amount, 0)
  return {
    unavailable: false,
    certificationId: '00000000-0000-4000-8000-0000000000bb',
    entityId: '92ed1f7e-f7df-4529-b118-4aa63b2b15b2',
    asOf: input.asOf,
    certificationAsOf: input.asOf,
    openingDueToJj: input.openingDueToJj,
    propertyLines: input.lines.map((line) => ({
      lineOrder: line.lineOrder,
      propertyKey: line.propertyKey,
      propertyName: line.propertyName,
      componentCode: 'opening_property_obligation',
      amountDueToJj: line.amountDueToJj,
      reason: 'fixture',
      evidenceRef: line.evidenceRef,
      metadata: line.metadata,
    })),
    fifoCredits: input.credits.map((credit) => ({
      eventId: credit.id,
      eventType: credit.eventType,
      settlementAmount: credit.amount,
      effectiveDate: credit.effectiveDate,
      sourceTransactionId: credit.sourceTransactionId ?? null,
      cash: credit.eventType === 'include_transaction_in_settlement',
    })),
    exclusions: [],
    fifoCreditsTotal: credits,
    overlayClosingDueToJj: input.closingDueToJj,
    cashAllocationSignedTotal: input.cashAllocationSignedTotal,
    remainingR: -input.closingDueToJj,
    remainingS: input.closingDueToJj,
    obligationSlices: [],
    unboundLines: [],
    cashExecutions: [],
    closingDueToJj: input.closingDueToJj,
    closingDirection: input.closingDueToJj > 0 ? 'client_owes_jj' : input.closingDueToJj < 0 ? 'jj_owes_client' : 'settled',
  }
}

function oritReport(): ClientAccountReport {
  const source = oritReview6Fixture({ group: false, electricityLabel: false })
  const rows = source.rows.map(rawFrom)
  const settlement = settlementFrom(source)
  if (!oritRobAdapter.evidence) {
    throw new ClientAccountBlock('BLOCKED_PRESENTATION', 'Orit adapter has no evidence function.')
  }
  const composition = compositionFromCertifiedSettlement({
    settlement,
    rows,
    clientSlug: oritRobAdapter.clientSlug,
    clientDisplayName: oritRobAdapter.clientDisplayName,
    reportTitle: oritRobAdapter.reportTitle,
    reportLanguage: oritRobAdapter.reportLanguage,
    reportType: oritRobAdapter.reportType,
    period: oritRobAdapter.period,
    evidence: oritRobAdapter.evidence({ settlement, rows, linkedRows: {} }),
  })
  if (composition.status !== 'ready') {
    throw new ClientAccountBlock(composition.code === 'BLOCKED_PRESENTATION' ? 'BLOCKED_PRESENTATION' : 'BLOCKED_ACCOUNTING', composition.reason)
  }
  return buildClientAccountReport(composition.input)
}

function paidOf(doc: ClientAccountDocument): number {
  return doc.settlementBridge.steps
    .filter((step) => step.kind === 'payment')
    .reduce((sum, step) => sum + Math.abs(step.signedDueToJj), 0)
}

function creditOf(doc: ClientAccountDocument): number {
  return doc.settlementBridge.steps
    .filter((step) => step.kind === 'credit')
    .reduce((sum, step) => sum + Math.abs(step.signedDueToJj), 0)
}

function renderableSummary(approved: ApprovedRenderableFigures): VerifiedClient {
  const mismatches: string[] = []
  const registry = ADAPTER_REGISTRY.find((entry) => entry.clientSlug === approved.clientSlug)
  if (!registry || registry.status !== 'adapter-present') {
    mismatches.push(`${approved.clientSlug} is approved to render but the registry has no adapter.`)
  }
  if (!approved.jjOwesDirection.startsWith('JJ חייבת')) {
    mismatches.push('Approved JJ-owes wording is not the feminine JJ חייבת.')
  }
  if (approved.gender === 'feminine' && !approved.heroDirection.includes('חייבת')) {
    mismatches.push('Approved client direction is not the feminine form.')
  }
  if (approved.gender === 'masculine' && !approved.heroDirection.includes('חייב ל־JJ')) {
    mismatches.push('Approved client direction is not the masculine form.')
  }

  let report: ClientAccountReport | null = null
  let certificationId: string | null = null
  try {
    if (approved.clientSlug === oritRobAdapter.clientSlug) {
      report = oritReport()
    } else if (approved.clientSlug === urielAdapter.clientSlug) {
      const rendered = renderUrielFixture()
      report = rendered.report
      certificationId = rendered.certificationId
    } else {
      throw new ClientAccountBlock('BLOCKED_PRESENTATION', `No fixture adapter for ${approved.clientSlug}.`)
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    mismatches.push(reason)
  }
  const document = report ? report.document : null

  if (!document) {
    return {
      document: null,
      pdfLines: [],
      summary: {
        clientSlug: approved.clientSlug,
        contactName: approved.contactName,
        rendered: false,
        match: false,
        status: approved.kind,
        approvalRef: approved.approvalRef,
        mismatches,
      },
    }
  }

  const gross = document.openingDueToJj
  const paid = paidOf(document)
  const credit = creditOf(document)
  const balance = document.closingDueToJj
  const direction = document.closingDirection
  if (!sameMoney(gross, approved.gross)) mismatches.push(`gross ${gross} != ${approved.gross}`)
  if (!sameMoney(paid, approved.paid)) mismatches.push(`paid ${paid} != ${approved.paid}`)
  if (approved.credit != null && !sameMoney(credit, approved.credit)) mismatches.push(`credit ${credit} != ${approved.credit}`)
  if (!sameMoney(balance, approved.balance)) mismatches.push(`balance ${balance} != ${approved.balance}`)
  if (direction !== approved.direction) mismatches.push(`direction ${direction} != ${approved.direction}`)
  if (approved.certPrefix && (certificationId == null || !certificationId.startsWith(approved.certPrefix))) {
    mismatches.push(`certification ${certificationId ?? 'missing'} != ${approved.certPrefix}`)
  }
  if (report && report.gates.status !== 'pass') mismatches.push(`gates ${report.gates.status}`)
  if (report && report.gates.gates.length === 0) mismatches.push('gates did not run')
  const propertyChecks = approved.properties?.map((expected, index) => {
    const actual = document.properties[index]
    const amount = actual ? actual.amountDueToJj : null
    const actualDirection = actual ? actual.direction : null
    if (!actual || actual.propertyName !== expected.propertyName || amount == null || !sameMoney(amount, expected.amountDueToJj) || actualDirection !== expected.direction) {
      mismatches.push(`property ${expected.propertyName} ${amount} ${actualDirection}`)
    }
    return {
      propertyName: expected.propertyName,
      amountDueToJj: { expected: expected.amountDueToJj, actual: amount },
      direction: { expected: expected.direction, actual: actualDirection },
    }
  })
  if (approved.monthlyStrProperty) {
    for (let i = 0; i < document.properties.length; i += 1) {
      const property = document.properties[i]
      const admitted = property.certifiedMonthlyStr != null
      const expected = property.propertyName === approved.monthlyStrProperty
      if (admitted !== expected) mismatches.push(`monthly STR ${property.propertyName} admitted ${admitted}`)
    }
  }

  const propertyLine = propertyBridgeTitle(document)
  if (propertyLine !== approved.propertyLine) mismatches.push(`property line ${propertyLine}`)
  const hero = heroDirectionText(document.clientDisplayName, document.closingDirection, document.reportLanguage, document.hebrewOwesForm)
  if (hero !== approved.heroDirection) mismatches.push(`hero ${hero}`)
  const jjOwes = heroDirectionText(document.clientDisplayName, 'jj_owes_client', document.reportLanguage, approved.gender)
  if (jjOwes !== approved.jjOwesDirection) mismatches.push(`JJ owes form ${jjOwes}`)

  const bridge = settlementClosingDisplay(document).map((row) => ({ label: row.label, signedDueToJj: row.signedDueToJj }))
  if (bridge.length !== approved.bridge.length) {
    mismatches.push(`bridge length ${bridge.length} != ${approved.bridge.length}`)
  } else {
    approved.bridge.forEach((expected, index) => {
      const actual = bridge[index]
      if (actual.label !== expected.label || !sameMoney(actual.signedDueToJj, expected.signedDueToJj)) {
        mismatches.push(`bridge ${index} ${actual.label} ${actual.signedDueToJj}`)
      }
    })
  }

  const pdfLines = [
    approved.propertyLine,
    approved.heroDirection,
    ...approved.bridge.map((row) => row.label),
    ...(approved.keyLines || []),
  ]
  const pageText = [
    clientAccountPlainText(document),
    propertyLine,
    hero,
    jjOwes,
    ...bridge.map((row) => row.label),
  ].join('\n')
  const plainTextMissing = missingLines(pageText, [...pdfLines, approved.jjOwesDirection])
  if (plainTextMissing.length > 0) mismatches.push(`plain text missing ${plainTextMissing.join(' | ')}`)

  return {
    document,
    pdfLines,
    summary: {
      clientSlug: approved.clientSlug,
      contactName: approved.contactName,
      rendered: true,
      match: mismatches.length === 0,
      status: approved.kind,
      approvalRef: approved.approvalRef,
      figures: {
        gross: { expected: approved.gross, actual: gross },
        paid: { expected: approved.paid, actual: paid },
        balance: { expected: approved.balance, actual: balance },
        direction: { expected: approved.direction, actual: direction },
        ...(approved.credit != null ? { credit: { expected: approved.credit, actual: credit } } : {}),
        ...(approved.certPrefix ? { certificationId: { expected: approved.certPrefix, actual: certificationId } } : {}),
      },
      ...(propertyChecks ? { properties: propertyChecks } : {}),
      ...(report ? { gates: { status: report.gates.status, count: report.gates.gates.length } } : {}),
      ...(approved.clientSlug === urielAdapter.clientSlug ? urielNotes(document) : {}),
      text: {
        propertyLine,
        heroDirection: hero,
        jjOwesDirection: jjOwes,
        bridge,
        plainTextMissing,
      },
      mismatches,
    },
  }
}

function urielNotes(document: ClientAccountDocument): Pick<ClientVerifySummary, 'openItems' | 'pendingDescriptions' | 'pendingWording' | 'neer'> {
  const notes = urielEngineNotes(document)
  return {
    neer: notes.neer,
    openItems: notes.openItems,
    pendingDescriptions: notes.pendingDescriptions,
    pendingWording: [
      { constant: 'URIEL_GARDEN_2_LABEL', wording: URIEL_GARDEN_2_LABEL, status: 'PENDING Yossi. Default is the 15:38 label.' },
      { constant: 'URIEL_SHARON_CREDIT_LABEL', wording: URIEL_SHARON_CREDIT_LABEL, status: 'PENDING Yossi. Default is the 15:38 label.' },
    ],
  }
}

function pendingAdapterSummary(approved: ApprovedPendingAdapterFigures): VerifiedClient {
  return {
    document: null,
    pdfLines: [],
    summary: {
      clientSlug: approved.clientSlug,
      contactName: approved.contactName,
      rendered: false,
      match: true,
      status: approved.kind,
      approvalRef: approved.approvalRef,
      note: approved.note,
      figures: {
        gross: { expected: approved.gross, actual: null },
        paid: { expected: approved.paid, actual: null },
        balance: { expected: approved.balance, actual: null },
        direction: { expected: approved.direction, actual: null },
      },
      mismatches: [],
    },
  }
}

function pendingDecisionSummary(approved: ApprovedPendingDecisionFigures): VerifiedClient {
  return {
    document: null,
    pdfLines: [],
    summary: {
      clientSlug: approved.clientSlug,
      contactName: approved.contactName,
      rendered: false,
      match: true,
      status: approved.kind,
      note: approved.note,
      certs: approved.certs,
      mismatches: [],
    },
  }
}

/** Compose every client that has an adapter. Pending clients are recorded and not rendered. */
export function verifyApprovedReports(): VerifiedClient[] {
  return APPROVED_FIGURES.map((approved) => {
    if (approved.kind === 'renderable') return renderableSummary(approved)
    if (approved.kind === 'pending-adapter') return pendingAdapterSummary(approved)
    return pendingDecisionSummary(approved)
  })
}

export function applyPdfText(client: VerifiedClient, pdfText: string): VerifiedClient {
  if (!client.document || client.pdfLines.length === 0) return client
  const missing = missingLines(pdfText, client.pdfLines.filter((line) => line !== client.summary.text?.jjOwesDirection))
  const mismatches = missing.length > 0
    ? [...client.summary.mismatches, `pdf missing ${missing.join(' | ')}`]
    : client.summary.mismatches
  return {
    ...client,
    summary: {
      ...client.summary,
      match: mismatches.length === 0,
      pdf: { missing },
      mismatches,
    },
  }
}

function money(value: number | string | null): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value
  return value.toFixed(2)
}

export function summaryMarkdown(summary: ClientVerifySummary): string {
  const lines = [
    `# ${summary.contactName} (${summary.clientSlug})`,
    '',
    summary.match ? 'Match.' : 'Mismatch.',
    '',
    `Rendered: ${summary.rendered ? 'yes' : 'no'}`,
    `Status: ${summary.status}`,
  ]
  if (summary.approvalRef) lines.push(`Approval: ${summary.approvalRef}`)
  if (summary.note) lines.push('', summary.note)
  if (summary.figures) {
    lines.push(
      '',
      '| Figure | Approved | Rendered |',
      '| --- | --- | --- |',
      `| Gross | ${money(summary.figures.gross.expected)} | ${money(summary.figures.gross.actual)} |`,
      `| Paid | ${money(summary.figures.paid.expected)} | ${money(summary.figures.paid.actual)} |`,
      `| Balance | ${money(summary.figures.balance.expected)} | ${money(summary.figures.balance.actual)} |`,
      `| Direction | ${summary.figures.direction.expected} | ${summary.figures.direction.actual ?? '—'} |`,
    )
    if (summary.figures.credit) lines.push(`| Sharon credit | ${money(summary.figures.credit.expected)} | ${money(summary.figures.credit.actual)} |`)
    if (summary.figures.certificationId) {
      lines.push(`| Certification | ${summary.figures.certificationId.expected} | ${summary.figures.certificationId.actual ?? '—'} |`)
    }
  }
  if (summary.properties) {
    lines.push('', '| Property | Approved | Rendered | Direction |', '| --- | --- | --- | --- |')
    for (const property of summary.properties) {
      lines.push(`| ${property.propertyName} | ${money(property.amountDueToJj.expected)} | ${money(property.amountDueToJj.actual)} | ${property.direction.actual ?? '—'} |`)
    }
  }
  if (summary.gates) lines.push('', `Gates: ${summary.gates.status} (${summary.gates.count}).`)
  if (summary.neer) lines.push('', summary.neer)
  if (summary.pendingWording) {
    lines.push('', 'Pending wording (Yossi):')
    for (const item of summary.pendingWording) lines.push(`- ${item.constant} = ${item.wording}. ${item.status}`)
  }
  if (summary.pendingDescriptions) {
    lines.push('', 'Pending descriptions (no approval on record; raw or default labels):')
    for (const item of summary.pendingDescriptions) lines.push(`- ${item.id}: ${item.engineToday}`)
  }
  if (summary.openItems) {
    lines.push('', 'Open items (engine behaviour is unchanged):')
    for (const item of summary.openItems) lines.push(`- ${item.title} (${item.id}): ${item.engineToday}`)
  }
  if (summary.certs) {
    lines.push('', '| Cert | As of | Balance |', '| --- | --- | --- |')
    for (const cert of summary.certs) lines.push(`| ${cert.certPrefix} | ${cert.asOf} | ${cert.balance.toFixed(2)} |`)
  }
  if (summary.text) {
    lines.push(
      '',
      `Property line: ${summary.text.propertyLine}`,
      `Hero: ${summary.text.heroDirection}`,
      `JJ owes form: ${summary.text.jjOwesDirection}`,
      '',
      'Payment bridge:',
    )
    for (const row of summary.text.bridge) lines.push(`- ${row.label}: ${row.signedDueToJj.toFixed(2)}`)
    if (summary.text.plainTextMissing.length > 0) lines.push('', `Plain text missing: ${summary.text.plainTextMissing.join(' | ')}`)
  }
  if (summary.pdf) {
    lines.push('', summary.pdf.missing.length === 0 ? 'PDF text: every key line is present.' : `PDF missing: ${summary.pdf.missing.join(' | ')}`)
  }
  if (summary.mismatches.length > 0) {
    lines.push('', 'Mismatches:')
    for (const item of summary.mismatches) lines.push(`- ${item}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function writeVerifySummaries(clients: readonly VerifiedClient[], directory: string): void {
  mkdirSync(directory, { recursive: true })
  const registryLines = [
    '# Client-report adapter registry',
    '',
    'Contacts are the distinct rows of `v_contact_settlement`. Unknown certification is `no-cert`.',
    '',
    '| Contact | Status | Adapter |',
    '| --- | --- | --- |',
    ...ADAPTER_REGISTRY.map((entry) => `| ${entry.contactName} | ${entry.status} | ${entry.clientSlug ?? ''} |`),
    '',
  ]
  writeFileSync(join(directory, 'registry.md'), registryLines.join('\n'), 'utf8')
  writeFileSync(join(directory, 'registry.json'), `${JSON.stringify(ADAPTER_REGISTRY, null, 2)}\n`, 'utf8')
  for (const client of clients) {
    writeFileSync(join(directory, `${client.summary.clientSlug}.json`), `${JSON.stringify(client.summary, null, 2)}\n`, 'utf8')
    writeFileSync(join(directory, `${client.summary.clientSlug}.md`), summaryMarkdown(client.summary), 'utf8')
  }
}
