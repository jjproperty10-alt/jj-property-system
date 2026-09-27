/**
 * Assertion register and reconciliation gates for a composed client account.
 * Forbidden phrases are supplied by the caller. This file stores none.
 */

import { fmt } from '../../pdf/formatters'
import { ClientAccountBlock } from './composeCertifiedAccount'
import { balanceDirectionText, directionOf, heroDirectionText, propertyLayerSummaries, roundEur, sameMoney } from './presentation'
import { BRIDGE, INTERNAL_IDENTITY_WORD, SECTION, displayWhitelistViolations, term } from './terminology'
import type { ClientAccountDocument, CompositionInput, DisplayLine, LedgerRow, PropertyAccount } from './types'

export interface AccountAssertion {
  readonly property: string
  readonly section: string
  readonly description: string
  readonly monthLabel: string
  readonly paymentMonthLabel: string | null
  readonly directionText: string
  readonly traceSourceId: string | null
  readonly sourceIds: readonly string[]
  readonly amount: number
  readonly effect: string
  readonly evidence: string
  readonly countedIn: string
  readonly countedElsewhere: false
  readonly allocationRule: string | null
  readonly actionType: string | null
  readonly dateRole: string | null
}

function displayedLines(doc: ClientAccountDocument): DisplayLine[] {
  return doc.properties.flatMap((property) => [
    ...property.lines,
    ...property.units.flatMap((unit) => unit.lines),
  ])
}

export function buildAssertionRegister(doc: ClientAccountDocument): AccountAssertion[] {
  const seen = new Map<string, string>()
  const assertions: AccountAssertion[] = []
  for (const line of displayedLines(doc)) {
    for (const id of line.sourceIds) {
      const prior = seen.get(id)
      if (prior) {
        throw new Error(`BLOCKED_ACCOUNTING: source ${id} is in ${prior} and ${line.countedIn}.`)
      }
      seen.set(id, line.countedIn)
    }
    assertions.push({
      property: line.propertyName,
      section: line.section,
      description: line.clientText,
      monthLabel: line.monthLabel,
      paymentMonthLabel: line.paymentMonthLabel,
      directionText: line.directionText,
      traceSourceId: line.traceSourceId,
      sourceIds: line.sourceIds,
      amount: line.amount,
      effect: line.effect,
      evidence: line.evidence,
      countedIn: line.countedIn,
      countedElsewhere: false,
      allocationRule: line.allocationRule || null,
      actionType: null,
      dateRole: null,
    })
  }
  for (const property of doc.properties) {
    for (const summary of property.summaries) {
      assertions.push({
        property: property.propertyName,
        section: summary.kind === 'purchase' ? 'סיכום קנייה' : 'סיכום שיפוץ',
        description: summary.explanation || 'סיכום רכיבים',
        monthLabel: summary.state,
        paymentMonthLabel: null,
        directionText: summary.state === 'closed' ? 'נסגר' : 'פתוח',
        traceSourceId: null,
        sourceIds: [],
        amount: summary.balance,
        effect: 'summary',
        evidence: 'proven',
        countedIn: 'component-summary',
        countedElsewhere: false,
        allocationRule: null,
        actionType: null,
        dateRole: summary.state,
      })
    }
  }
  for (const credit of doc.credits) {
    assertions.push({
      property: doc.clientDisplayName,
      section: 'זיכוי לקוח',
      description: credit.note ? `${credit.label}. ${credit.note}` : credit.label,
      monthLabel: credit.monthLabel,
      paymentMonthLabel: null,
      directionText: credit.dateCaption || credit.label,
      traceSourceId: credit.eventId,
      sourceIds: credit.sourceTransactionId ? [credit.sourceTransactionId] : [],
      amount: credit.amount,
      effect: 'credit',
      evidence: credit.evidence,
      countedIn: 'client-credit',
      countedElsewhere: false,
      allocationRule: null,
      actionType: credit.eventType,
      dateRole: credit.dateRole,
    })
  }
  for (const note of doc.sourceNotes) {
    assertions.push({
      property: note.propertyName,
      section: 'בדיקת מקור',
      description: note.text,
      monthLabel: '',
      paymentMonthLabel: null,
      directionText: 'לא נכלל ביתרה',
      traceSourceId: null,
      sourceIds: [],
      amount: 0,
      effect: 'unresolved',
      evidence: 'proven',
      countedIn: 'not-in-balance',
      countedElsewhere: false,
      allocationRule: null,
      actionType: note.topic,
      dateRole: null,
    })
  }
  return assertions
}

export function clientAccountPlainText(doc: ClientAccountDocument): string {
  const parts: string[] = [
    doc.clientDisplayName,
    doc.reportTitle,
    doc.asOf,
    heroDirectionText(doc.clientDisplayName, doc.closingDirection),
    fmt(doc.closingDueToJj),
    fmt(doc.openingDueToJj),
  ]
  for (const property of doc.properties) {
    parts.push(property.propertyName, balanceDirectionText(doc.clientDisplayName, property.direction), fmt(property.amountDueToJj))
    for (const unit of property.units) {
      if (unit.note) parts.push(unit.title, unit.note)
    }
    for (const line of [...property.lines, ...property.units.flatMap((unit) => unit.lines)]) {
      parts.push(line.section, line.clientText, line.monthLabel, line.paymentMonthLabel || '', line.directionText, fmt(line.amount))
    }
    for (const summary of property.summaries) {
      parts.push(
        summary.kind,
        fmt(summary.agreed),
        fmt(summary.payments),
        fmt(summary.ancillary),
        fmt(summary.balance),
        summary.state,
        summary.explanation || '',
      )
    }
    for (const step of property.bridge) parts.push(step.label, step.directionText, fmt(step.signedDueToJj))
    const monthly = property.certifiedMonthlyStr
    if (monthly) {
      const language = doc.reportLanguage
      parts.push(term('strOwnerNet', language), term('strMonthlyNote', language))
      for (const month of monthly.months) {
        parts.push(month.monthLabel, month.reservationCountLabel, month.nightsLabel, fmt(month.ownerNet))
      }
      parts.push(term('totalOwnerNet', language), fmt(monthly.totalOwnerNet))
      parts.push(term('total', language), String(monthly.months.reduce((sum, month) => sum + (month.reservationCount || 0), 0)), String(monthly.months.reduce((sum, month) => sum + (month.nights || 0), 0)))
      parts.push(term('strMonthlyFootnote', language))
    }
  }
  for (const credit of doc.credits) parts.push(credit.label, credit.monthLabel, credit.dateCaption || '', credit.note || '', credit.dateRole, fmt(credit.amount))
  for (const note of doc.sourceNotes) parts.push(note.propertyName, note.text)
  return parts.join('\n')
}

export function forbiddenHits(text: string, phrases: readonly string[]): string[] {
  const lower = text.toLowerCase()
  return phrases.filter((phrase) => lower.includes(phrase.toLowerCase()))
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function internalLeakHits(text: string): string[] {
  const hits: string[] = []
  if (UUID_RE.test(text)) hits.push('uuid')
  for (const phrase of ['RC3', 'FIFO', 'Overall Net', 'Current Balance', 'certification']) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) hits.push(phrase)
  }
  return hits
}

// ---------- Accounting gates (run before any rendering) ----------

export const ACCOUNTING_GATE_IDS = [
  'rows-equal-category-totals',
  'categories-equal-property-balance',
  'properties-equal-client-total',
  'total-and-credits-equal-closing',
  'direction-agrees-with-sign',
  'counted-once',
  'no-deleted-or-rejected-row',
  'no-raw-internal-field',
  'no-missing-numeric-as-zero',
  'no-unapproved-allocation',
  'period-scope-only',
  'explicit-report-scope',
  'bridge-within-tolerance',
  'display-whitelist',
] as const

export type AccountingGateId = (typeof ACCOUNTING_GATE_IDS)[number]

export interface GateResult {
  readonly id: AccountingGateId
  readonly checks: number
}

export interface GateReport {
  readonly status: 'pass'
  readonly gates: readonly GateResult[]
}

/** Bridge and category tolerances are the renderer's tolerance; everything else is exact to the cent. */
export const BRIDGE_TOLERANCE_EUR = 0.02

const APPROVED_ALLOCATION_RULES: ReadonlySet<string> = new Set(['stated-period', 'named-month', 'oldest-open-month'])
const CERTIFIED_ONLY_COUNTED_IN: ReadonlySet<string> = new Set(['str-credit', 'purchase-payment', 'undated-certified-charge'])

function block(gate: AccountingGateId, detail: string, code: 'BLOCKED_ACCOUNTING' | 'BLOCKED_PRESENTATION' = 'BLOCKED_ACCOUNTING'): never {
  throw new ClientAccountBlock(code, `gate ${gate}: ${detail}`)
}

function propertyLines(property: PropertyAccount): DisplayLine[] {
  return [...property.lines, ...property.units.flatMap((unit) => unit.lines)]
}

function finiteMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Layer summaries fail closed inside presentation; surface that as the category gate. */
function layersOf(property: PropertyAccount, language: ClientAccountDocument['reportLanguage']) {
  try {
    return propertyLayerSummaries(property, language)
  } catch (err) {
    return block('categories-equal-property-balance', err instanceof Error ? err.message : String(err))
  }
}

function clientStrings(doc: ClientAccountDocument): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = []
  out.push({ where: 'clientDisplayName', text: doc.clientDisplayName }, { where: 'reportTitle', text: doc.reportTitle })
  for (const property of doc.properties) {
    out.push({ where: `${property.propertyName}/name`, text: property.propertyName })
    for (const line of propertyLines(property)) {
      out.push(
        { where: `${property.propertyName}/line/${line.countedIn}`, text: line.clientText },
        { where: `${property.propertyName}/month/${line.countedIn}`, text: line.monthLabel },
        { where: `${property.propertyName}/direction/${line.countedIn}`, text: line.directionText },
      )
      if (line.paymentMonthLabel) out.push({ where: `${property.propertyName}/payment-month`, text: line.paymentMonthLabel })
      if (line.statusLabel) out.push({ where: `${property.propertyName}/status`, text: line.statusLabel })
    }
    for (const unit of property.units) {
      out.push({ where: `${property.propertyName}/unit`, text: unit.title })
      if (unit.note) out.push({ where: `${property.propertyName}/unit-note`, text: unit.note })
    }
    for (const summary of property.summaries) if (summary.explanation) out.push({ where: `${property.propertyName}/summary`, text: summary.explanation })
    for (const step of property.bridge) out.push({ where: `${property.propertyName}/bridge`, text: step.label }, { where: `${property.propertyName}/bridge-direction`, text: step.directionText })
    for (const status of property.statusLines) out.push({ where: `${property.propertyName}/status-line`, text: status.label })
    if (property.certifiedMonthlyStr) {
      for (const month of property.certifiedMonthlyStr.months) {
        out.push({ where: `${property.propertyName}/str-month`, text: `${month.monthLabel} ${month.reservationCountLabel} ${month.nightsLabel}` })
      }
    }
  }
  for (const credit of doc.credits) {
    out.push({ where: `credit/${credit.eventType}`, text: credit.label }, { where: 'credit/month', text: credit.monthLabel })
    if (credit.note) out.push({ where: 'credit/note', text: credit.note })
    if (credit.dateCaption) out.push({ where: 'credit/caption', text: credit.dateCaption })
  }
  for (const note of doc.sourceNotes) out.push({ where: `${note.propertyName}/source-note`, text: note.text })
  return out
}

/**
 * Fourteen fail-closed gates over a composed document and the input it came from.
 * Any failure throws ClientAccountBlock; nothing is corrected, rounded away or defaulted.
 */
export function runAccountingGates(doc: ClientAccountDocument, input: CompositionInput): GateReport {
  const results: GateResult[] = []
  const rowsById = new Map<string, LedgerRow>()
  for (const row of input.rows) rowsById.set(row.id, row)
  for (const list of Object.values(input.linkedRowsByPropertyKey || {})) for (const row of list) rowsById.set(row.id, row)
  const certifiedIncludes = new Set<string>()
  for (const line of input.lines) {
    const extra = line.metadata.additional_receipt_id
    if (typeof extra === 'string' && extra) certifiedIncludes.add(extra)
  }

  // 1. Sum of detailed rows equals category totals (layer charges/credits are sums of displayed lines).
  let checks = 0
  for (const property of doc.properties) {
    for (const line of propertyLines(property)) {
      if (!finiteMoney(line.amount)) block('rows-equal-category-totals', `${property.propertyName}/${line.countedIn}: non-numeric row amount.`)
    }
    for (const unit of property.units) {
      const charges = roundEur(unit.lines.filter((line) => line.effect === 'charge').reduce((sum, line) => sum + line.amount, 0))
      const credits = roundEur(unit.lines.filter((line) => line.effect === 'credit').reduce((sum, line) => sum + line.amount, 0))
      const shown = unit.kind === 'str' && property.certifiedMonthlyStr ? roundEur(charges - credits - property.certifiedMonthlyStr.totalOwnerNet) : roundEur(charges - credits)
      if (!sameMoney(shown, unit.balanceDueToJj)) {
        block('rows-equal-category-totals', `${unit.title}: rows ${shown} do not equal unit balance ${unit.balanceDueToJj}.`)
      }
      checks++
    }
    // Line-derived bridge steps must equal the displayed rows of their category.
    const all = propertyLines(property)
    const sumBy = (effect: DisplayLine['effect'], predicate: (line: DisplayLine) => boolean) =>
      roundEur(all.filter((line) => line.effect === effect && predicate(line)).reduce((sum, line) => sum + line.amount, 0))
    const step = (label: string) => roundEur(property.bridge.filter((item) => item.label === label).reduce((sum, item) => sum + item.signedDueToJj, 0))
    const monthlyCredit = property.certifiedMonthlyStr ? property.certifiedMonthlyStr.totalOwnerNet : 0
    const strCredit = roundEur(sumBy('credit', (line) => line.countedIn === 'str-credit') + monthlyCredit)
    const ltrCredit = sumBy('credit', (line) => line.section === SECTION.ltrIncome)
    const expectedSteps: [string, number][] = [
      [BRIDGE.setup, roundEur(sumBy('charge', (line) => line.section === SECTION.setup) - sumBy('credit', (line) => line.section === SECTION.setup))],
      [BRIDGE.ownerTransfers, sumBy('charge', (line) => line.section === SECTION.ownerTransfers)],
      [BRIDGE.propertyExpenses, sumBy('charge', (line) => (
        (line.section === SECTION.propertyExpenses || line.section === SECTION.recurring || line.section === SECTION.repairs)
        && line.countedIn !== 'undated-certified-charge'
      ))],
      [BRIDGE.strExpenses, sumBy('charge', (line) => line.section === SECTION.strExpenses)],
    ]
    if (property.units.length > 0) expectedSteps.push([BRIDGE.ltrCredit, -ltrCredit], [BRIDGE.strCredit, -strCredit])
    else expectedSteps.push([BRIDGE.income, roundEur(-(ltrCredit + strCredit))])
    for (const [label, expected] of expectedSteps) {
      if (!sameMoney(step(label), expected)) {
        block('rows-equal-category-totals', `${property.propertyName}/${label}: rows ${expected} do not equal the category total ${step(label)}.`)
      }
      checks++
    }
    for (const summary of property.summaries) {
      const receipts = summary.kind === 'purchase' && summary.receipts != null ? summary.receipts : summary.payments
      const balance = roundEur(summary.agreed + summary.ancillary - receipts)
      const label = summary.kind === 'purchase' ? BRIDGE.purchaseBalance : BRIDGE.renovationBalance
      if (!sameMoney(balance, summary.balance) || !sameMoney(step(label), summary.balance)) {
        block('rows-equal-category-totals', `${property.propertyName}/${summary.kind}: component summary ${balance} does not equal its balance ${summary.balance} / bridge ${step(label)}.`)
      }
      checks++
    }
  }
  results.push({ id: 'rows-equal-category-totals', checks })

  // 2. Sum of category totals equals the property balance.
  checks = 0
  for (const property of doc.properties) {
    const layers = layersOf(property, doc.reportLanguage).filter((layer) => layer.key !== 'closing')
    for (const layer of layers) {
      if (!finiteMoney(layer.charges) || !finiteMoney(layer.credits) || !finiteMoney(layer.balance)) {
        block('categories-equal-property-balance', `${property.propertyName}/${layer.key}: non-numeric layer total.`)
      }
    }
    const total = roundEur(layers.reduce((sum, layer) => sum + layer.balance, 0))
    if (Math.abs(total - property.amountDueToJj) > BRIDGE_TOLERANCE_EUR) {
      block('categories-equal-property-balance', `${property.propertyName}: categories ${total} do not equal ${property.amountDueToJj}.`)
    }
    checks++
  }
  results.push({ id: 'categories-equal-property-balance', checks })

  // 3. Sum of property balances equals the client property total.
  const propertyTotal = roundEur(doc.properties.reduce((sum, property) => sum + property.amountDueToJj, 0))
  if (!sameMoney(propertyTotal, doc.openingDueToJj) || !sameMoney(propertyTotal, input.openingDueToJj)) {
    block('properties-equal-client-total', `properties ${propertyTotal} do not equal client total ${doc.openingDueToJj}.`)
  }
  results.push({ id: 'properties-equal-client-total', checks: 1 })

  // 4. Property total less client-level credits equals the final closing.
  const creditTotal = roundEur(doc.credits.reduce((sum, credit) => sum + credit.amount, 0))
  const expectedClosing = roundEur(doc.openingDueToJj - creditTotal - input.cashAllocationSignedTotal)
  if (!sameMoney(expectedClosing, doc.closingDueToJj) || !sameMoney(doc.closingDueToJj, input.closingDueToJj)) {
    block('total-and-credits-equal-closing', `total ${doc.openingDueToJj} − credits ${creditTotal} ≠ closing ${doc.closingDueToJj}.`)
  }
  results.push({ id: 'total-and-credits-equal-closing', checks: 1 })

  // 5. Direction agrees with the sign everywhere it is shown.
  checks = 0
  if (doc.closingDirection !== directionOf(doc.closingDueToJj)) block('direction-agrees-with-sign', 'closing direction does not match the closing sign.')
  checks++
  for (const property of doc.properties) {
    if (property.direction !== directionOf(property.amountDueToJj)) block('direction-agrees-with-sign', `${property.propertyName}: direction does not match the balance sign.`)
    checks++
    for (const status of property.statusLines) {
      const expected = status.state === 'closed' ? 'settled' : status.direction
      if (status.direction !== expected || status.amount < 0) block('direction-agrees-with-sign', `${property.propertyName}/${status.label}: status direction is inconsistent.`)
      checks++
    }
    for (const layer of layersOf(property, doc.reportLanguage)) {
      if (layer.direction !== directionOf(layer.balance)) block('direction-agrees-with-sign', `${property.propertyName}/${layer.key}: layer direction does not match its balance.`)
      checks++
    }
  }
  results.push({ id: 'direction-agrees-with-sign', checks })

  // 6. No transaction or economic event is counted twice.
  const seen = new Map<string, string>()
  checks = 0
  for (const property of doc.properties) {
    for (const line of propertyLines(property)) {
      for (const id of line.sourceIds) {
        const prior = seen.get(id)
        if (prior) block('counted-once', `source ${id} appears in ${prior} and ${line.countedIn}.`)
        seen.set(id, `${property.propertyName}/${line.countedIn}`)
        checks++
      }
    }
  }
  for (const credit of doc.credits) {
    if (credit.sourceTransactionId && seen.has(credit.sourceTransactionId)) {
      block('counted-once', `credit source ${credit.sourceTransactionId} is also a property line.`)
    }
    if (credit.sourceTransactionId) seen.set(credit.sourceTransactionId, 'client-credit')
    checks++
  }
  results.push({ id: 'counted-once', checks })

  // 7. No deleted or rejected duplicate row is displayed.
  checks = 0
  for (const id of Array.from(seen.keys())) {
    const row = rowsById.get(id)
    if (!row) continue
    if (row.reviewStatus != null && row.reviewStatus !== 'active') block('no-deleted-or-rejected-row', `row ${id} has review status ${row.reviewStatus}.`)
    if (row.isDeleted && !certifiedIncludes.has(id)) block('no-deleted-or-rejected-row', `row ${id} is deleted and not certified for inclusion.`)
    if (row.date.slice(0, 10) > doc.asOf) block('no-deleted-or-rejected-row', `row ${id} is dated after the cutoff.`)
    checks++
  }
  results.push({ id: 'no-deleted-or-rejected-row', checks })

  // 8. No raw internal field reaches the client display layer.
  checks = 0
  for (const property of doc.properties) {
    for (const line of propertyLines(property)) {
      for (const id of line.sourceIds) {
        const row = rowsById.get(id)
        if (!row) continue
        const shown = `${line.clientText} ${line.directionText}`.toLowerCase()
        const identities = [row.payer, row.payee].filter((value): value is string => Boolean(value && INTERNAL_IDENTITY_WORD.test(value)))
        for (const value of [...identities, row.id, row.reviewStatus || '']) {
          if (value.length > 2 && shown.includes(value.toLowerCase())) {
            block('no-raw-internal-field', `${property.propertyName}/${line.countedIn}: raw field value reaches the client text.`, 'BLOCKED_PRESENTATION')
          }
        }
        const rawDescription = (row.description || '').trim()
        if (rawDescription && line.clientText === rawDescription && displayWhitelistViolations(rawDescription).length > 0) {
          block('no-raw-internal-field', `${property.propertyName}/${line.countedIn}: raw description reaches the client text.`, 'BLOCKED_PRESENTATION')
        }
        checks++
      }
      if (line.clientText.startsWith('UNPROVEN')) block('no-raw-internal-field', `${property.propertyName}: unproven wording.`, 'BLOCKED_PRESENTATION')
    }
  }
  results.push({ id: 'no-raw-internal-field', checks })

  // 9. No missing numeric value is converted to zero.
  checks = 0
  const money: { where: string; value: unknown }[] = [
    { where: 'opening', value: doc.openingDueToJj },
    { where: 'closing', value: doc.closingDueToJj },
  ]
  for (const property of doc.properties) {
    money.push({ where: `${property.propertyName}/balance`, value: property.amountDueToJj })
    for (const line of propertyLines(property)) {
      money.push({ where: `${property.propertyName}/${line.countedIn}`, value: line.amount })
      if (line.amount <= 0 && line.effect !== 'reference') block('no-missing-numeric-as-zero', `${property.propertyName}/${line.countedIn}: a displayed line has no positive amount.`)
    }
    for (const step of property.bridge) {
      money.push({ where: `${property.propertyName}/bridge/${step.label}`, value: step.signedDueToJj })
      if (sameMoney(step.signedDueToJj, 0)) block('no-missing-numeric-as-zero', `${property.propertyName}: a zero bridge step is displayed.`)
    }
    const monthly = property.certifiedMonthlyStr
    if (monthly) {
      money.push({ where: `${property.propertyName}/str-total`, value: monthly.totalOwnerNet })
      for (const month of monthly.months) {
        money.push({ where: `${property.propertyName}/str/${month.monthStart}`, value: month.ownerNet })
        if ((month.reservationCount == null && month.reservationCountLabel === '0') || (month.nights == null && month.nightsLabel === '0')) {
          block('no-missing-numeric-as-zero', `${property.propertyName}/${month.monthStart}: a missing count is shown as zero.`)
        }
      }
    }
  }
  for (const credit of doc.credits) {
    money.push({ where: `credit/${credit.eventId}`, value: credit.amount })
    if (credit.amount <= 0) block('no-missing-numeric-as-zero', `credit ${credit.eventId} has no positive amount.`)
  }
  for (const item of money) {
    if (!finiteMoney(item.value)) block('no-missing-numeric-as-zero', `${item.where}: amount is not a finite number.`)
    checks++
  }
  results.push({ id: 'no-missing-numeric-as-zero', checks })

  // 10. No unapproved per-property allocation is displayed.
  checks = 0
  for (const property of doc.properties) {
    for (const line of propertyLines(property)) {
      if (line.allocationRule && !APPROVED_ALLOCATION_RULES.has(line.allocationRule)) {
        block('no-unapproved-allocation', `${property.propertyName}/${line.countedIn}: allocation rule ${line.allocationRule} is not approved.`)
      }
      // A slice of a traced receipt (approved allocation rule) carries the cash line once, on its first slice.
      const tracedSlice = line.traceSourceId != null && line.allocationRule != null && APPROVED_ALLOCATION_RULES.has(line.allocationRule)
      if (line.sourceIds.length === 0 && !tracedSlice) {
        if (!CERTIFIED_ONLY_COUNTED_IN.has(line.countedIn)) {
          block('no-unapproved-allocation', `${property.propertyName}/${line.countedIn}: a line without a source is not a certified allocation.`)
        }
        if (line.evidence !== 'owner-certified') {
          block('no-unapproved-allocation', `${property.propertyName}/${line.countedIn}: a sourceless line must be owner-certified.`)
        }
      }
      if (tracedSlice && line.sourceIds.length === 0 && !rowsById.has(line.traceSourceId as string)) {
        block('no-unapproved-allocation', `${property.propertyName}/${line.countedIn}: an allocated slice has no traced receipt.`)
      }
      checks++
    }
    const strCredits = property.lines.filter((line) => line.countedIn === 'str-credit')
    if (strCredits.length > 1 && !input.strMonthsByPropertyKey?.[property.propertyKey]) {
      block('no-unapproved-allocation', `${property.propertyName}: STR credit split without an approved monthly split.`)
    }
  }
  results.push({ id: 'no-unapproved-allocation', checks })

  // 11. A period report includes only admitted report-period activity.
  checks = 0
  if (doc.reportType === 'period_account') {
    const period = doc.period
    if (!period) block('period-scope-only', 'period account without a period.')
    for (const property of doc.properties) {
      for (const line of propertyLines(property)) {
        for (const id of line.sourceIds) {
          const row = rowsById.get(id)
          if (!row) continue
          const day = row.date.slice(0, 10)
          if (day < period.start || day > period.end) block('period-scope-only', `${property.propertyName}: row ${id} dated ${day} is outside the report period.`)
          checks++
        }
      }
      const monthly = property.certifiedMonthlyStr
      if (monthly && (monthly.periodStart < period.start || monthly.periodEnd > period.end)) {
        block('period-scope-only', `${property.propertyName}: monthly STR period is outside the report period.`)
      }
    }
    for (const credit of doc.credits) {
      if (credit.dateRole === 'cash-receipt' && credit.sourceTransactionId) {
        const row = rowsById.get(credit.sourceTransactionId)
        if (row && (row.date.slice(0, 10) < period.start || row.date.slice(0, 10) > period.end)) {
          block('period-scope-only', `credit ${credit.eventId} is outside the report period.`)
        }
      }
      checks++
    }
  }
  results.push({ id: 'period-scope-only', checks })

  // 12. Full and period reports use explicit, different scopes.
  if (doc.reportType === 'full_account' && doc.period != null) block('explicit-report-scope', 'a full account carries a period.')
  if (doc.reportType === 'period_account' && (!doc.period || doc.period.end !== doc.asOf)) block('explicit-report-scope', 'a period account must end at the cutoff.')
  if ((input.reportType || 'full_account') !== doc.reportType) block('explicit-report-scope', 'document scope differs from the requested scope.')
  results.push({ id: 'explicit-report-scope', checks: 1 })

  // 13. Bridge within the renderer tolerance.
  checks = 0
  for (const property of doc.properties) {
    const sum = roundEur(property.bridge.reduce((total, step) => total + step.signedDueToJj, 0))
    if (Math.abs(sum - property.amountDueToJj) > BRIDGE_TOLERANCE_EUR) {
      block('bridge-within-tolerance', `${property.propertyName}: bridge ${sum} does not equal ${property.amountDueToJj}.`)
    }
    checks++
  }
  results.push({ id: 'bridge-within-tolerance', checks })

  // 14. Every client-facing string passes the display whitelist.
  checks = 0
  for (const item of clientStrings(doc)) {
    const hits = displayWhitelistViolations(item.text)
    if (hits.length > 0) block('display-whitelist', `${item.where}: ${hits.join(', ')}.`, 'BLOCKED_PRESENTATION')
    checks++
  }
  results.push({ id: 'display-whitelist', checks })

  return { status: 'pass', gates: results }
}
