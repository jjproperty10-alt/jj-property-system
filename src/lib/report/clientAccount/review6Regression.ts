/**
 * REVIEW-6 regression for the offline Orit engine output.
 * The three entries in expectedDifferencesVsReview6 are whitelisted.
 * Production line inventory in that file is not re-rendered: the offline
 * fixture is the template fixture, not the production row set.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { clientAccountPlainText } from './gates'
import { heroDirectionText, periodHeaderText, propertyBridgeTitle, settlementClosingDisplay } from './presentation'
import { term } from './terminology'
import type { ClientAccountDocument, DisplayLine } from './types'
import { missingLines, normalizeReportText } from './verifyApprovedReports'

export const REVIEW6_WHITELISTED_DELTA_FIELDS = [
  'properties[0].lines[*].clientChargeDefaulted',
  'PDF page 1 and page 2 header',
  'PDF electricity row',
] as const

const EXPECT_PATH = join(process.cwd(), 'src/lib/report/clientAccount/__fixtures__/review6_regression_expect_2026-10-03.json')

interface ExpectDelta {
  readonly field: string
  readonly review6: string
  readonly engine: string
}

interface ExpectFile {
  readonly figures: {
    readonly openingDueToJj: number
    readonly closingDueToJj: number
    readonly closingDirection: string
    readonly propertyAmountDueToJj: number
    readonly creditsTotal: number
    readonly paymentsTotal: number
    readonly cashAllocationSignedTotal: number
    readonly strTotalOwnerNet: number
  }
  readonly settlementBridge: readonly { readonly kind: string; readonly label: string; readonly signedDueToJj: number }[]
  readonly propertyBridge: readonly { readonly label: string; readonly signedDueToJj: number; readonly directionText: string }[]
  readonly grouping: {
    readonly 'orit-preparation': { readonly clientText: string; readonly amount: number; readonly sourceIds: readonly string[] }
    readonly electricity_label: { readonly sourceId: string; readonly clientText: string; readonly amount: number; readonly clientChargeDefaulted: boolean }
  }
  readonly pdfKeyTextLines_REVIEW6: Readonly<Record<string, readonly string[]>>
  readonly expectedDifferencesVsReview6: readonly ExpectDelta[]
}

function sameMoney(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 0.001
}

function linesOf(doc: ClientAccountDocument): DisplayLine[] {
  const lines: DisplayLine[] = []
  for (let i = 0; i < doc.properties.length; i += 1) {
    const property = doc.properties[i]
    for (let j = 0; j < property.lines.length; j += 1) lines.push(property.lines[j])
    for (let u = 0; u < property.units.length; u += 1) {
      const unit = property.units[u]
      for (let j = 0; j < unit.lines.length; j += 1) lines.push(unit.lines[j])
    }
  }
  return lines
}

function dayLabel(iso: string): string {
  const parts = iso.split('-')
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function strNet(doc: ClientAccountDocument): number {
  let total = 0
  const lines = linesOf(doc)
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].countedIn === 'str-credit') total += lines[i].amount
  }
  return Math.round(total * 100) / 100
}

function pageText(doc: ClientAccountDocument): string {
  const propertyLine = propertyBridgeTitle(doc)
  const hero = heroDirectionText(doc.clientDisplayName, doc.closingDirection, doc.reportLanguage, doc.hebrewOwesForm)
  const bridge = settlementClosingDisplay(doc)
  return [clientAccountPlainText(doc), propertyLine, hero, ...bridge.map((row) => row.label)].join('\n')
}

export function review6Regression(document: ClientAccountDocument): string[] {
  const expectFile = JSON.parse(readFileSync(EXPECT_PATH, 'utf8')) as ExpectFile
  const mismatches: string[] = []
  const fields = expectFile.expectedDifferencesVsReview6.map((delta) => delta.field)
  if (fields.join('|') !== REVIEW6_WHITELISTED_DELTA_FIELDS.join('|')) {
    mismatches.push(`whitelist fields ${fields.join(' | ')}`)
  }
  const figures = expectFile.figures
  if (!sameMoney(document.openingDueToJj, figures.openingDueToJj)) mismatches.push('opening')
  if (!sameMoney(document.closingDueToJj, figures.closingDueToJj)) mismatches.push('closing')
  if (document.closingDirection !== figures.closingDirection) mismatches.push('direction')
  const property = document.properties[0]
  if (!property || !sameMoney(property.amountDueToJj, figures.propertyAmountDueToJj)) mismatches.push('property amount')
  const payments = document.settlementBridge.steps
    .filter((step) => step.kind === 'payment')
    .reduce((sum, step) => sum + Math.abs(step.signedDueToJj), 0)
  const credits = document.settlementBridge.steps
    .filter((step) => step.kind === 'credit')
    .reduce((sum, step) => sum + Math.abs(step.signedDueToJj), 0)
  if (!sameMoney(payments, figures.paymentsTotal)) mismatches.push('payments')
  if (!sameMoney(credits, figures.creditsTotal)) mismatches.push('credits')
  if (!sameMoney(document.settlementBridge.cashAllocationSignedTotal, figures.cashAllocationSignedTotal)) mismatches.push('cash')
  if (!sameMoney(strNet(document), figures.strTotalOwnerNet)) mismatches.push('str net')

  const steps = document.settlementBridge.steps
  if (steps.length !== expectFile.settlementBridge.length) mismatches.push('bridge length')
  else {
    for (let i = 0; i < steps.length; i += 1) {
      const actual = steps[i]
      const expected = expectFile.settlementBridge[i]
      if (actual.kind !== expected.kind || actual.label !== expected.label || !sameMoney(actual.signedDueToJj, expected.signedDueToJj)) {
        mismatches.push(`bridge ${i} ${actual.kind} ${actual.label} ${actual.signedDueToJj}`)
      }
    }
  }
  const propertyBridge = property?.bridge || []
  if (propertyBridge.length !== expectFile.propertyBridge.length) mismatches.push('property bridge length')
  else {
    for (let i = 0; i < propertyBridge.length; i += 1) {
      const actual = propertyBridge[i]
      const expected = expectFile.propertyBridge[i]
      if (actual.label !== expected.label || actual.directionText !== expected.directionText || !sameMoney(actual.signedDueToJj, expected.signedDueToJj)) {
        mismatches.push(`property bridge ${i} ${actual.label} ${actual.directionText} ${actual.signedDueToJj}`)
      }
    }
  }

  const lines = linesOf(document)
  const group = expectFile.grouping['orit-preparation']
  const preparation = lines.find((line) => group.sourceIds.every((id) => line.sourceIds.includes(id)))
  if (!preparation || preparation.clientText !== group.clientText || !sameMoney(preparation.amount, group.amount)) {
    mismatches.push('preparation grouping')
  }
  const electricityExpect = expectFile.grouping.electricity_label
  const electricity = lines.find((line) => line.sourceIds.includes(electricityExpect.sourceId))
  if (!electricity || electricity.clientText !== electricityExpect.clientText || !sameMoney(electricity.amount, electricityExpect.amount)) {
    mismatches.push('electricity label')
  }

  const headerDelta = expectFile.expectedDifferencesVsReview6.find((delta) => delta.field === REVIEW6_WHITELISTED_DELTA_FIELDS[1])
  const header = document.period
    ? periodHeaderText(dayLabel(document.asOf), dayLabel(document.period.start), document.reportLanguage)
    : periodHeaderText(dayLabel(document.asOf), null, document.reportLanguage)
  if (!headerDelta || header !== headerDelta.engine || normalizeReportText(header) === normalizeReportText(headerDelta.review6)) {
    mismatches.push('header start-date delta')
  }
  const caption = term('chargeDefaulted', document.reportLanguage)
  const captionDelta = expectFile.expectedDifferencesVsReview6.find((delta) => delta.field === REVIEW6_WHITELISTED_DELTA_FIELDS[2])
  const chargeDelta = expectFile.expectedDifferencesVsReview6.find((delta) => delta.field === REVIEW6_WHITELISTED_DELTA_FIELDS[0])
  if (!chargeDelta || !electricity || electricity.clientChargeDefaulted !== electricityExpect.clientChargeDefaulted) {
    mismatches.push('clientChargeDefaulted whitelist')
  }
  if (!captionDelta || !captionDelta.engine.includes(caption) || !electricity?.clientChargeDefaulted) {
    mismatches.push('charge defaulted caption delta')
  }
  if (!pageText(document).includes(caption)) mismatches.push('caption missing from engine text')

  const wording = missingLines(pageText(document), [
    propertyBridgeTitle(document),
    heroDirectionText(document.clientDisplayName, document.closingDirection, document.reportLanguage, document.hebrewOwesForm),
    ...settlementClosingDisplay(document).map((row) => row.label),
    group.clientText,
    electricityExpect.clientText,
  ])
  if (wording.length > 0) mismatches.push(`wording ${wording.join(' | ')}`)
  return mismatches
}
