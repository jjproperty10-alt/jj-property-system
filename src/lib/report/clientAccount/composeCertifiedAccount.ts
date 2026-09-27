/**
 * Builds a client account from a certified opening and ledger rows.
 * Certified amounts and property names come from the input. A mismatch throws
 * BLOCKED_ACCOUNTING instead of plugging an unexplained figure.
 */

import { allocateRentReceipts, monthsAfterAllocatedSeries } from './longTermRent'
import {
  balanceDirectionText,
  clientDescription,
  completedTransferText,
  directionOf,
  monthFromIsoDate,
  monthLabelForRow,
  monthYearLabel,
  purchaseClosingExplanation,
  reducesBalanceText,
  rentStatusText,
  roundEur,
  sameMoney,
  takePresentationGaps,
  undatedLabel,
  type DescriptionRole,
  type ReportLanguage,
} from './presentation'
import { BRIDGE, REPAIR_SUBCATEGORIES, SECTION, STATUS_LABEL, TERMS, UNIT_TITLE_SUFFIX, term } from './terminology'
import type {
  AccountUnit,
  BridgeStep,
  CertifiedAccountLine,
  CertifiedCreditInput,
  ClientAccountDocument,
  ComponentSummary,
  CompositionInput,
  CreditPresentation,
  DisplayLine,
  LedgerRow,
  PropertyAccount,
  ReportPeriod,
  SettlementBridge,
  SettlementBridgeStep,
  StatusLine,
  StrMonthInput,
} from './types'

export class ClientAccountBlock extends Error {
  readonly code: 'BLOCKED_ACCOUNTING' | 'BLOCKED_PRESENTATION'
  constructor(code: 'BLOCKED_ACCOUNTING' | 'BLOCKED_PRESENTATION', detail: string) {
    super(`${code}: ${detail}`)
    this.code = code
  }
}

function num(meta: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = meta[key]
  if (typeof value === 'number' && Number.isFinite(value)) return roundEur(value)
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return roundEur(Number(value))
  return null
}

function text(meta: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = meta[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function face(row: LedgerRow): number {
  return roundEur(row.clientCharge == null ? row.amountEur : row.clientCharge)
}

function payerIs(row: LedgerRow, name: string): boolean {
  return (row.payer || '').trim().toLowerCase() === name
}

function inForce(row: LedgerRow, asOf: string, includeDeletedIds: ReadonlySet<string>, period?: ReportPeriod): boolean {
  if (row.date.slice(0, 10) > asOf) return false
  if (period && row.date.slice(0, 10) < period.start) return false
  if (row.reviewStatus != null && row.reviewStatus !== 'active') return false
  if (row.isDeleted && !includeDeletedIds.has(row.id)) return false
  return true
}

/** Period scope must be explicit and consistent with the cutoff; a full account carries none. */
function reportScope(input: CompositionInput): { reportType: 'full_account' | 'period_account'; period: ReportPeriod | null } {
  const reportType = input.reportType || 'full_account'
  if (reportType === 'period_account') {
    if (!input.period) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', 'A period account requires an explicit period.')
    if (input.period.start > input.period.end) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', 'Report period start is after its end.')
    if (input.period.end !== input.asOf) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', 'A period account cutoff must equal the period end.')
    return { reportType, period: input.period }
  }
  if (input.period) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', 'A full account does not take a period; use period_account.')
  return { reportType, period: null }
}

interface Chunk {
  readonly rows: readonly LedgerRow[]
  readonly amount: number
}

function collapse(rows: readonly LedgerRow[], omitted: string[]): Chunk[] {
  const groups = new Map<string, LedgerRow[]>()
  const order: string[] = []
  for (const row of rows) {
    const key = `${row.date.slice(0, 10)}|${row.subcategory || ''}|${Math.abs(face(row)).toFixed(2)}`
    const list = groups.get(key)
    if (list) list.push(row)
    else {
      groups.set(key, [row])
      order.push(key)
    }
  }
  const chunks: Chunk[] = []
  for (const key of order) {
    const group = groups.get(key) || []
    const amount = roundEur(group.reduce((sum, row) => sum + face(row), 0))
    if (sameMoney(amount, 0)) {
      if (group.length > 1) for (const row of group) omitted.push(row.id)
      continue
    }
    chunks.push({ rows: group, amount })
  }
  return chunks
}

function lineFrom(
  propertyName: string,
  section: string,
  chunk: Chunk,
  effect: DisplayLine['effect'],
  countedIn: string,
  language: ReportLanguage,
  clientName: string,
  evidence: DisplayLine['evidence'] = 'proven',
  monthOverride?: string,
  role: DescriptionRole = 'general',
): DisplayLine {
  const sample = chunk.rows[0]
  const described = clientDescription(sample.subcategory, sample.description, role)
  const range = described.match(/\d{1,2}\.\d{1,2}\.\d{2,4}\s*[–-]\s*\d{1,2}\.\d{1,2}\.\d{2,4}/)
  const description = range ? described.replace(range[0], '').replace(/\s+/g, ' ').trim() : described
  const directionText = role === 'owner-transfer'
    ? completedTransferText(language)
    : effect === 'credit'
      ? balanceDirectionText(clientName, 'jj_owes_client', language)
      : effect === 'reference'
        ? term('recorded', language)
        : balanceDirectionText(clientName, 'client_owes_jj', language)
  return {
    propertyName,
    section,
    clientText: description || described,
    monthLabel: monthOverride || (range ? range[0].replace(/\s+/g, '') : monthLabelForRow(sample.date, sample.description, language)),
    paymentMonthLabel: null,
    statusLabel: null,
    directionText,
    amount: roundEur(Math.abs(chunk.amount)),
    effect,
    sourceIds: chunk.rows.map((row) => row.id),
    traceSourceId: sample.id,
    evidence,
    countedIn,
  }
}

function sumAmount(lines: readonly DisplayLine[], effect: DisplayLine['effect']): number {
  return roundEur(lines.filter((line) => line.effect === effect).reduce((sum, line) => sum + line.amount, 0))
}

function pushStep(
  steps: BridgeStep[],
  label: string,
  signed: number,
  language: ReportLanguage,
  clientName: string,
  kind: 'balance' | 'transfer' = 'balance',
): void {
  if (sameMoney(signed, 0)) return
  const direction = directionOf(signed)
  steps.push({
    label,
    signedDueToJj: roundEur(signed),
    directionText: kind === 'transfer'
      ? reducesBalanceText(language)
      : balanceDirectionText(clientName, direction, language),
  })
}

function statusFor(label: string, amount: number): StatusLine {
  const direction = directionOf(amount)
  return {
    label,
    state: direction === 'settled' ? 'closed' : 'open',
    amount: roundEur(Math.abs(amount)),
    direction,
  }
}

function recurringDate(meta: Readonly<Record<string, unknown>>): string | null {
  const key = Object.keys(meta).find((name) => /^recurring_from_\d{4}_\d{2}_\d{2}$/.test(name))
  if (!key) return null
  return key.replace('recurring_from_', '').replace(/_/g, '-')
}

function isoDay(meta: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = text(meta, key)
  if (value == null) return null
  const day = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `certified line key ${key} is not an ISO day.`)
  }
  return day
}

function idList(meta: Readonly<Record<string, unknown>>, key: string): string[] {
  const value = meta[key]
  if (value == null) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `certified line key ${key} is not a list of transaction ids.`)
  }
  return value as string[]
}

/** A client payment recorded in the ledger outside a purchase or renovation account. */
function isClientPaymentRow(row: LedgerRow): boolean {
  return row.subcategory === 'Client Payment' && row.category !== 'Sale' && row.category !== 'Renovation'
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function dayLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${day}.${month}.${year}`
}

interface SettlementEvents {
  /** Payment events keyed by their source transaction id. */
  readonly paymentsBySource: ReadonlyMap<string, CertifiedCreditInput>
  /** Ledger rows consumed at client level; they never enter a property account. */
  readonly consumedRowIds: ReadonlySet<string>
}

/**
 * Fail-closed admission of client-level settlement events. Every event needs a stable identity,
 * the report currency, certified evidence and an `included` status; a payment additionally must
 * not be consumed by another mechanism or folded into a certified opening line.
 */
function admitSettlementEvents(input: CompositionInput): SettlementEvents {
  const currency = input.currency || 'EUR'
  const eventIds = new Set<string>()
  const paymentsBySource = new Map<string, CertifiedCreditInput>()
  const consumedElsewhere = new Set(input.consumedSourceTransactionIds || [])
  const period = input.reportType === 'period_account' ? input.period : undefined
  for (const event of input.credits) {
    if (typeof event.id !== 'string' || event.id.trim() === '') {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', 'A settlement event has no identity.')
    }
    if (eventIds.has(event.id)) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Settlement event ${event.id} appears twice.`)
    eventIds.add(event.id)
    if (event.eventType !== 'noncash_settlement_credit' && event.eventType !== 'include_transaction_in_settlement') {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Settlement event ${event.id} has an unknown type.`)
    }
    if (typeof event.amount !== 'number' || !Number.isFinite(event.amount) || event.amount <= 0) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Settlement event ${event.id} has no positive amount.`)
    }
    if (typeof event.effectiveDate !== 'string' || !ISO_DAY_RE.test(event.effectiveDate.slice(0, 10))) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Settlement event ${event.id} has no effective date.`)
    }
    if ((event.currency || currency) !== currency) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Settlement event ${event.id} is not in ${currency}.`)
    }
    if ((event.evidenceStatus || 'certified') !== 'certified') {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Settlement event ${event.id} has evidence status ${event.evidenceStatus}; only certified events are admitted.`)
    }
    if ((event.inclusion || 'included') !== 'included') {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Settlement event ${event.id} is ${event.inclusion} and cannot be presented as a credit.`)
    }
    const day = event.effectiveDate.slice(0, 10)
    if (day > input.asOf) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Settlement event ${event.id} is dated after the cutoff.`)
    if (event.eventType === 'include_transaction_in_settlement') {
      if (period && (day < period.start || day > period.end)) {
        throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Payment ${event.id} is outside the report period.`)
      }
      const source = event.sourceTransactionId
      if (source != null && source !== '') {
        if (paymentsBySource.has(source)) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Payment transaction ${source} is presented by two events.`)
        if (consumedElsewhere.has(source)) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Payment transaction ${source} is already consumed by another settlement.`)
        paymentsBySource.set(source, event)
      }
    }
  }
  const hasPayments = input.credits.some((event) => event.eventType === 'include_transaction_in_settlement')
  for (const line of input.lines) {
    const folded = num(line.metadata, 'client_payments')
    const foldedIds = idList(line.metadata, 'client_payment_row_ids')
    if (hasPayments && ((folded != null && !sameMoney(folded, 0)) || foldedIds.length > 0)) {
      throw new ClientAccountBlock(
        'BLOCKED_ACCOUNTING',
        `${line.propertyName}: client payments are folded into the certified opening and also presented as settlement events.`,
      )
    }
    for (const id of foldedIds) {
      if (paymentsBySource.has(id)) {
        throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${line.propertyName}: payment transaction ${id} is inside the opening and also a settlement event.`)
      }
    }
  }
  return { paymentsBySource, consumedRowIds: new Set(paymentsBySource.keys()) }
}

function strCreditLines(
  language: ReportLanguage,
  clientName: string,
  propertyName: string,
  credit: number,
  months: readonly StrMonthInput[] | undefined,
  lumpDescription: string,
): DisplayLine[] {
  if (months && months.length > 0) {
    const total = roundEur(months.reduce((sum, month) => sum + month.amount, 0))
    if (!sameMoney(total, credit)) {
      throw new ClientAccountBlock(
        'BLOCKED_ACCOUNTING',
        `${propertyName}: STR months ${total} do not equal certified STR credit ${credit}.`,
      )
    }
    return months.map((month) => ({
      propertyName,
      section: SECTION.strIncome,
      clientText: term('ownerNet', language),
      monthLabel: monthFromIsoDate(`${month.year}-${String(month.month).padStart(2, '0')}-01`, language),
      paymentMonthLabel: null,
      statusLabel: null,
      directionText: balanceDirectionText(clientName, 'jj_owes_client', language),
      amount: roundEur(month.amount),
      effect: 'credit' as const,
      sourceIds: [],
      traceSourceId: null,
      evidence: 'owner-certified' as const,
      countedIn: 'str-credit',
    }))
  }
  return [{
    propertyName,
    section: SECTION.strIncome,
    clientText: lumpDescription,
    monthLabel: undatedLabel(language),
    paymentMonthLabel: null,
    statusLabel: null,
    directionText: balanceDirectionText(clientName, 'jj_owes_client', language),
    amount: credit,
    effect: 'credit',
    sourceIds: [],
    traceSourceId: null,
    evidence: 'owner-certified',
    countedIn: 'str-credit',
  }]
}

function composeProperty(
  input: CompositionInput,
  cert: CertifiedAccountLine,
  includeDeleted: ReadonlySet<string>,
  omitted: string[],
  period: ReportPeriod | null,
  events: SettlementEvents,
): PropertyAccount {
  const language = input.reportLanguage || 'he'
  const clientName = input.clientDisplayName
  const scope = period || undefined
  const show = (
    section: string,
    chunk: Chunk,
    effect: DisplayLine['effect'],
    countedIn: string,
    evidence: DisplayLine['evidence'] = 'proven',
    monthOverride?: string,
    role: DescriptionRole = 'general',
  ) => lineFrom(cert.propertyName, section, chunk, effect, countedIn, language, clientName, evidence, monthOverride, role)
  const meta = cert.metadata
  const rows = input.rows.filter((row) => row.propertyName === cert.propertyName && inForce(row, input.asOf, includeDeleted, scope))
  const linked = (input.linkedRowsByPropertyKey?.[cert.propertyKey] || []).filter((row) => inForce(row, input.asOf, includeDeleted, scope))
  const allowedSources = input.historicalSourceNamesByPropertyKey?.[cert.propertyKey]
  if (linked.length > 0) {
    if (!allowedSources || allowedSources.length === 0) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: historical rows require an explicit source-name decision.`)
    }
    const seen = new Set<string>()
    for (const row of linked) {
      if (!allowedSources.includes(row.propertyName || '')) {
        throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: historical row is not an approved source name.`)
      }
      if (seen.has(row.id) || rows.some((existing) => existing.id === row.id)) {
        throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: historical row ${row.id} would be counted twice.`)
      }
      seen.add(row.id)
    }
  }
  const internalId = text(meta, 'internal_jj_cost_id')
  // Client payments folded into this certified line (legacy shape) are part of its amount and are not
  // displayed; payments presented as settlement events are consumed at client level. Neither may be
  // counted again inside the property account.
  const foldedPaymentIds = new Set(idList(meta, 'client_payment_row_ids'))
  const visible = rows.filter((row) => (
    row.id !== internalId
    && row.category !== 'Purchase'
    && row.category !== 'JJ'
    && !events.consumedRowIds.has(row.id)
    && !foldedPaymentIds.has(row.id)
  ))
  const unadmittedPayments = visible.filter(isClientPaymentRow)
  if (unadmittedPayments.length > 0) {
    throw new ClientAccountBlock(
      'BLOCKED_ACCOUNTING',
      `${cert.propertyName}: client payment ${unadmittedPayments[0].id} is in the ledger but is not a certified settlement event.`,
    )
  }
  const saleContract = visible.filter((row) => row.category === 'Sale' && row.subcategory === 'Sale Contract')
  const purchasePayments = visible.filter((row) => (
    row.category === 'Sale'
    && (row.subcategory === 'Client Payment' || row.subcategory === 'Third-Party Payment')
    && payerIs(row, 'client')
  ))
  const closingCosts = visible.filter((row) => row.category === 'Sale' && row.subcategory === 'Client Sale Expenses')
  const renoContract = visible.filter((row) => row.category === 'Renovation' && row.subcategory === 'Renovation Contract')
  const renoPayments = visible.filter((row) => row.category === 'Renovation' && row.subcategory === 'Client Payment')
  const renoExtras = visible.filter((row) => (
    row.category === 'Renovation'
    && row.clientCharge != null
    && row.subcategory !== 'Renovation Contract'
    && row.subcategory !== 'Client Payment'
  ))
  const used = new Set<string>([
    ...saleContract, ...purchasePayments, ...closingCosts, ...renoContract, ...renoPayments, ...renoExtras,
  ].map((row) => row.id))

  const lines: DisplayLine[] = []
    const steps: BridgeStep[] = []
  const status: StatusLine[] = []
  const summaries: ComponentSummary[] = []
  let due = 0

  if (saleContract.length === 1) {
    const price = roundEur(saleContract[0].amountEur)
    lines.push(show(SECTION.purchase, { rows: saleContract, amount: price }, 'reference', 'purchase-price'))
    const payments = collapse(purchasePayments, omitted)
    for (const chunk of payments) lines.push(show(SECTION.purchase, chunk, 'credit', 'purchase-payment', 'proven', undefined, 'purchase-payment'))
    const costs = collapse(closingCosts, omitted)
    for (const chunk of costs) lines.push(show(SECTION.purchase, chunk, 'charge', 'purchase-cost'))
    const accepted = num(meta, 'accepted_purchase_payments')
    const paidRows = roundEur(purchasePayments.reduce((sum, row) => sum + face(row), 0))
    let paid = paidRows
    if (accepted != null) {
      const approved = roundEur(accepted - paidRows)
      if (approved < -0.001) {
        throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: client payments exceed accepted purchase payments.`)
      }
      if (!sameMoney(approved, 0)) {
        const supplements = input.purchaseSupplementsByPropertyKey?.[cert.propertyKey] || []
        const supplementSum = roundEur(supplements.reduce((sum, item) => sum + item.amount, 0))
        if (!sameMoney(supplementSum, approved)) {
          throw new ClientAccountBlock(
            'BLOCKED_ACCOUNTING',
            `${cert.propertyName}: purchase supplements ${supplementSum} do not equal the accepted gap ${approved}.`,
          )
        }
        for (const item of supplements) {
          lines.push({
            propertyName: cert.propertyName,
            section: SECTION.purchase,
            clientText: item.description,
            monthLabel: item.monthLabel,
            paymentMonthLabel: null,
            statusLabel: null,
            directionText: balanceDirectionText(clientName, 'jj_owes_client', language),
            amount: roundEur(item.amount),
            effect: 'credit',
            sourceIds: [],
            traceSourceId: null,
            evidence: 'owner-certified',
            countedIn: 'purchase-payment',
          })
        }
        paid = accepted
      }
    }
    const costSum = roundEur(closingCosts.reduce((sum, row) => sum + face(row), 0))
    const remaining = roundEur(price + costSum - paid)
    const pricePayments = costSum > 0 && sameMoney(remaining, 0) && sameMoney(paid, roundEur(price + costSum))
      ? price
      : paid
    if (sameMoney(pricePayments, price) && !sameMoney(pricePayments, paid)) {
      const paymentLines = lines.filter((line) => line.countedIn === 'purchase-payment')
      if (paymentLines.length === 1) {
        const index = lines.findIndex((line) => line.countedIn === 'purchase-payment')
        lines[index] = {
          ...paymentLines[0],
          amount: price,
          clientText: term('purchasePricePayments', language),
        }
      }
    }
    if (sameMoney(remaining, 0) && costSum > 0) {
      lines.forEach((line, index) => {
        if (line.countedIn !== 'purchase-cost') return
        lines[index] = {
          ...line,
          directionText: term('paidFromReceipts', language),
          statusLabel: term('paidStatus', language),
        }
      })
    }
    due = roundEur(due + remaining)
    pushStep(steps, BRIDGE.purchaseBalance, remaining, language, clientName)
    status.push(statusFor(STATUS_LABEL.purchase, remaining))
    summaries.push({
      kind: 'purchase',
      agreed: price,
      payments: pricePayments,
      ancillary: costSum,
      balance: remaining,
      receipts: !sameMoney(pricePayments, paid) ? paid : null,
      state: directionOf(remaining) === 'settled' ? 'closed' : 'open',
      explanation: purchaseClosingExplanation(language, price, pricePayments, costSum, remaining),
    })
    void payments
  } else if (saleContract.length > 1) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: more than one sale contract.`)
  }

  if (renoContract.length === 1) {
    const agreed = roundEur(renoContract[0].amountEur)
    lines.push(show(SECTION.renovation, { rows: renoContract, amount: agreed }, 'reference', 'renovation-contract'))
    for (const chunk of collapse(renoPayments, omitted)) lines.push(show(SECTION.renovation, chunk, 'credit', 'renovation-payment', 'proven', undefined, 'renovation-payment'))
    for (const chunk of collapse(renoExtras, omitted)) lines.push(show(SECTION.renovation, chunk, 'charge', 'renovation-extra'))
    const paid = roundEur(renoPayments.reduce((sum, row) => sum + face(row), 0))
    const extras = roundEur(renoExtras.reduce((sum, row) => sum + face(row), 0))
    const remaining = roundEur(agreed - paid + extras)
    due = roundEur(due + remaining)
    pushStep(steps, BRIDGE.renovationBalance, remaining, language, clientName)
    status.push(statusFor(STATUS_LABEL.renovation, remaining))
    summaries.push({
      kind: 'renovation',
      agreed,
      payments: paid,
      ancillary: extras,
      balance: remaining,
      receipts: null,
      state: directionOf(remaining) === 'settled' ? 'closed' : 'open',
      explanation: input.renovationNoteByPropertyKey?.[cert.propertyKey] || null,
    })
  } else if (renoContract.length > 1) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: more than one renovation contract.`)
  }

  const rentExpected = num(meta, 'rent_recognized')
  const ownerExpected = num(meta, 'owner_transfers')
  const chargeExpected = num(meta, 'owner_charges')
  const incomeRows = visible.filter((row) => row.subcategory === 'Tenant Payment')
  const ownerRows = visible.filter((row) => row.subcategory === 'Bank Payment to Owner')
  for (const row of [...incomeRows, ...ownerRows]) used.add(row.id)

  const operatingPool = visible.filter((row) => (
    !used.has(row.id)
    && row.category !== 'Sale'
    && row.category !== 'Renovation'
    && row.subcategory !== 'Deposit'
    && row.subcategory !== 'Platform Income'
    && !(row.subcategory === 'Management Fee' && payerIs(row, 'airbnb'))
    && row.subcategory !== 'Staff Accommodation Rent'
  ))

  const setupExpected = num(meta, 'setup_expenses')
  const fireKitId = text(meta, 'fire_kit_id')
  // `setup_through`: certified end of the preparation period — every operating row dated on or
  // before it is a setup charge (equipment, design, deep cleaning) and reconciles to `setup_expenses`.
  const setupThrough = isoDay(meta, 'setup_through')
  if (setupThrough != null && setupExpected == null) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: setup_through requires a certified setup_expenses total.`)
  }
  const setupRows = setupExpected == null ? [] : [
    ...linked,
    ...operatingPool.filter((row) => row.id === fireKitId || (setupThrough != null && row.date.slice(0, 10) <= setupThrough)),
  ]
  if (setupExpected != null) {
    const setupSum = roundEur(setupRows.reduce((sum, row) => sum + face(row), 0))
    if (!sameMoney(setupSum, setupExpected)) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: setup lines ${setupSum} do not equal certified ${setupExpected}.`)
    }
    for (const chunk of collapse(setupRows, omitted)) {
      lines.push(show(SECTION.setup, chunk, 'charge', 'setup'))
    }
    due = roundEur(due + setupSum)
    pushStep(steps, BRIDGE.setup, setupSum, language, clientName)
    for (const row of setupRows) used.add(row.id)
  }

  const from = recurringDate(meta)
  const recurringExpected = from ? num(meta, `recurring_from_${from.replace(/-/g, '_')}`) : null
  const strCredit = num(meta, 'str_credit')
  const strOpexExpected = num(meta, 'airbnb_opex_excluding_str_tracked_cleaning')
  const rentalCredit = num(meta, 'rental_credit')

  const staffRows = visible.filter((row) => row.subcategory === 'Staff Accommodation Rent')
  let ltrRows = incomeRows
  if (rentalCredit != null) {
    const tenantSum = roundEur(incomeRows.reduce((sum, row) => sum + face(row), 0))
    if (!sameMoney(tenantSum, rentalCredit)) {
      const withStaff = roundEur(tenantSum + staffRows.reduce((sum, row) => sum + face(row), 0))
      if (!sameMoney(withStaff, rentalCredit)) {
        throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: rental receipts ${withStaff} do not equal certified ${rentalCredit}.`)
      }
      ltrRows = [...incomeRows, ...staffRows]
    }
  }

  // Two certified shapes for Airbnb-category operating rows: cleaning tracked by the STR statement
  // (excluded here) or cleaning charged to the owner as an ordinary expense (included). Never both.
  const strOpexInclusiveExpected = num(meta, 'airbnb_opex_including_cleaning')
  if (strOpexExpected != null && strOpexInclusiveExpected != null) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: Airbnb expenses are certified both with and without cleaning.`)
  }
  const airbnbExpenses = operatingPool.filter((row) => row.category === 'Airbnb' && !used.has(row.id) && row.subcategory !== 'Cleaning')
  const airbnbCleaning = operatingPool.filter((row) => row.category === 'Airbnb' && row.subcategory === 'Cleaning')
  let strExpenseRows: LedgerRow[] = []
  if (strOpexExpected != null) {
    const opex = roundEur(airbnbExpenses.reduce((sum, row) => sum + face(row), 0))
    if (!sameMoney(opex, strOpexExpected)) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: STR expenses ${opex} do not equal certified ${strOpexExpected}.`)
    }
    strExpenseRows = airbnbExpenses
    for (const row of [...airbnbExpenses, ...airbnbCleaning]) used.add(row.id)
  } else if (strOpexInclusiveExpected != null) {
    const inclusive = [...airbnbExpenses, ...airbnbCleaning.filter((row) => !used.has(row.id))]
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    const opex = roundEur(inclusive.reduce((sum, row) => sum + face(row), 0))
    if (!sameMoney(opex, strOpexInclusiveExpected)) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: STR expenses ${opex} do not equal certified ${strOpexInclusiveExpected}.`)
    }
    strExpenseRows = inclusive
    for (const row of inclusive) used.add(row.id)
  }

  const recurringRows = from
    ? operatingPool.filter((row) => !used.has(row.id) && row.date.slice(0, 10) >= from)
    : []
  if (recurringExpected != null) {
    const recurringSum = roundEur(recurringRows.reduce((sum, row) => sum + face(row), 0))
    if (!sameMoney(recurringSum, recurringExpected)) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: recurring charges ${recurringSum} do not equal certified ${recurringExpected}.`)
    }
    for (const row of recurringRows) used.add(row.id)
  }

  const generalExpenses = operatingPool.filter((row) => !used.has(row.id) && !strExpenseRows.includes(row) && !recurringRows.includes(row) && row.category !== 'Airbnb')
  if (chargeExpected != null) {
    const chargeSum = roundEur(generalExpenses.reduce((sum, row) => sum + face(row), 0))
    if (!sameMoney(chargeSum, chargeExpected)) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: operating charges ${chargeSum} do not equal certified ${chargeExpected}.`)
    }
  }

  const ownerChunks = collapse(ownerRows, omitted)
  const expenseChunks = collapse(generalExpenses, omitted)
  const recurringChunks = collapse(recurringRows, omitted)
  const strExpenseChunks = collapse(strExpenseRows, omitted)
  collapse(airbnbCleaning, omitted)

  const rentDescriptions = new Map(ltrRows.map((row) => [row.id, row.subcategory === 'Staff Accommodation Rent'
    ? (language === 'en' ? `Credit to ${clientName} for JJ use of the apartment` : `זיכוי ל${clientName} בגין שימוש של JJ בדירה`)
    : clientDescription(row.subcategory, row.description)]))
  let rentViews
  try {
    const ownerMonths = new Map<string, readonly { year: number; month: number }[]>()
    const suppliedMonths = input.ownerRentMonthsByRowId || {}
    Object.keys(suppliedMonths).forEach((id) => ownerMonths.set(id, suppliedMonths[id]))
    rentViews = allocateRentReceipts(ltrRows, rentDescriptions, language, includeDeleted, ownerMonths)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', message.replace(/^BLOCKED_ACCOUNTING:\s*/, ''))
  }
  const rentSum = roundEur(rentViews.reduce((sum, view) => sum + view.amount, 0))
  const rentFace = roundEur(ltrRows.reduce((sum, row) => sum + Math.abs(face(row)), 0))
  if (!sameMoney(rentSum, rentFace)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: rent allocation ${rentSum} does not equal receipts ${rentFace}.`)
  }
  const incomeLines: DisplayLine[] = rentViews.map((view) => ({
    propertyName: cert.propertyName,
    section: SECTION.ltrIncome,
    clientText: view.description,
    monthLabel: view.rentalLabel,
    paymentMonthLabel: view.paymentLabel,
    statusLabel: rentStatusText(view.status, language),
    directionText: rentStatusText(view.status, language),
    amount: view.amount,
    effect: 'credit' as const,
    sourceIds: view.sourceIds,
    traceSourceId: view.traceSourceId,
    evidence: 'proven' as const,
    countedIn: 'rent-income',
    allocationRule: view.allocationRule,
  }))
  const ownerLines = ownerChunks.map((chunk) => show(SECTION.ownerTransfers, chunk, 'charge', 'owner-payment', 'proven', undefined, 'owner-transfer'))
  const expenseLines = [
    ...expenseChunks.map((chunk) => show(
      chunk.rows[0] && REPAIR_SUBCATEGORIES.has(chunk.rows[0].subcategory || '') ? SECTION.repairs : SECTION.propertyExpenses,
      chunk,
      'charge',
      'operating-charge',
    )),
    ...recurringChunks.map((chunk) => show(SECTION.recurring, chunk, 'charge', 'recurring-charge')),
  ]
  if (rentExpected != null && !sameMoney(sumAmount(incomeLines, 'credit'), rentExpected)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: rent income does not equal certified rent.`)
  }
  if (ownerExpected != null && !sameMoney(sumAmount(ownerLines, 'charge'), ownerExpected)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: owner transfers do not equal the certified amount.`)
  }

  const lumpLabel = input.strLumpDescription || term('strLumpDefault', language)
  // Cleaning tracked inside the STR statement is evidenced by the lump credit; cleaning already
  // displayed as a setup or STR expense charge is not.
  const strTrackedCleaning = airbnbCleaning.filter((row) => !setupRows.includes(row) && !strExpenseRows.includes(row))
  const strLines = strCredit == null ? [] : strCreditLines(language, clientName, cert.propertyName, strCredit, input.strMonthsByPropertyKey?.[cert.propertyKey], lumpLabel)
    .map((line, _index, all) => (
      all.length === 1 && line.monthLabel === undatedLabel(language)
        ? { ...line, sourceIds: strTrackedCleaning.map((row) => row.id) }
        : line
    ))
  const strExpenseLines = strExpenseChunks.map((chunk) => show(SECTION.strExpenses, chunk, 'charge', 'str-expense'))

  const useUnits = strCredit != null && rentalCredit != null
  const units: AccountUnit[] = []
  if (useUnits) {
    const strBalance = roundEur(sumAmount(strExpenseLines, 'charge') - (strCredit || 0))
    const ltrBalance = roundEur(-sumAmount(incomeLines, 'credit'))
    units.push({
      kind: 'str',
      title: `${cert.propertyName} — ${UNIT_TITLE_SUFFIX.str}`,
      lines: [...strLines, ...strExpenseLines],
      balanceDueToJj: strBalance,
      note: term('strLumpNote', language),
    })
    const separateSources = incomeLines.some((line) => line.allocationRule === 'stated-period')
      && incomeLines.some((line) => line.allocationRule === 'oldest-open-month')
    units.push({
      kind: 'ltr',
      title: `${cert.propertyName} — ${UNIT_TITLE_SUFFIX.ltr}`,
      lines: incomeLines,
      balanceDueToJj: ltrBalance,
      note: separateSources ? term('ltrSeparateSourcesNote', language) : null,
    })
    due = roundEur(due - sumAmount(incomeLines, 'credit') + sumAmount(strExpenseLines, 'charge') - (strCredit || 0))
    pushStep(steps, BRIDGE.ltrCredit, roundEur(-sumAmount(incomeLines, 'credit')), language, clientName)
    pushStep(steps, BRIDGE.strExpenses, sumAmount(strExpenseLines, 'charge'), language, clientName)
    pushStep(steps, BRIDGE.strCredit, roundEur(-(strCredit || 0)), language, clientName)
  } else {
    lines.push(...incomeLines, ...strLines, ...strExpenseLines)
    due = roundEur(due - sumAmount(incomeLines, 'credit') - sumAmount(strLines, 'credit') + sumAmount(strExpenseLines, 'charge'))
    pushStep(steps, BRIDGE.income, roundEur(-sumAmount(incomeLines, 'credit') - sumAmount(strLines, 'credit')), language, clientName)
    pushStep(steps, BRIDGE.strExpenses, sumAmount(strExpenseLines, 'charge'), language, clientName)
  }

  lines.push(...ownerLines, ...expenseLines)
  due = roundEur(due + sumAmount(ownerLines, 'charge') + sumAmount(expenseLines, 'charge'))
  pushStep(steps, BRIDGE.ownerTransfers, sumAmount(ownerLines, 'charge'), language, clientName, 'transfer')
  pushStep(steps, BRIDGE.propertyExpenses, sumAmount(expenseLines, 'charge'), language, clientName)

  const undatedChargeLabel = input.undatedChargeLabelByPropertyKey?.[cert.propertyKey]
  if (!sameMoney(due, cert.amountDueToJj)) {
    const residual = roundEur(cert.amountDueToJj - due)
    if (!undatedChargeLabel || residual < 0.001) {
      throw new ClientAccountBlock(
        'BLOCKED_ACCOUNTING',
        `${cert.propertyName}: composed ${due} does not equal certified ${cert.amountDueToJj}.`,
      )
    }
    lines.push({
      propertyName: cert.propertyName,
      section: SECTION.propertyExpenses,
      clientText: undatedChargeLabel,
      monthLabel: undatedLabel(language),
      paymentMonthLabel: null,
      statusLabel: null,
      directionText: balanceDirectionText(clientName, 'client_owes_jj', language),
      amount: residual,
      effect: 'charge',
      sourceIds: [],
      traceSourceId: null,
      evidence: 'owner-certified',
      countedIn: 'undated-certified-charge',
    })
    pushStep(steps, undatedChargeLabel, residual, language, clientName)
    due = roundEur(due + residual)
  }
  if (!sameMoney(due, cert.amountDueToJj)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: bridge ${due} does not equal certified ${cert.amountDueToJj}.`)
  }
  const stepSum = roundEur(steps.reduce((sum, step) => sum + step.signedDueToJj, 0))
  if (!sameMoney(stepSum, due)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: bridge steps ${stepSum} do not equal ${due}.`)
  }
  status.push(statusFor(STATUS_LABEL.propertyBalance, due))
  const unresolved = monthsAfterAllocatedSeries(rentViews, input.asOf)
  const unresolvedLabels = unresolved.map((month) => monthYearLabel(month.year, month.month - 1, language))
  const unresolvedText = unresolvedLabels.map((label) => `ל${label}`).join(' ו')
  const sourceNotes = unresolved.length === 0 ? [] : [{
    propertyName: cert.propertyName,
    topic: 'long-term-rent-obligation',
    text: language === 'en'
      ? `The rental obligation for ${unresolvedLabels.join(' and ')} was not decided from the data. There is no receipt and no certified credit for those months. They are not included in the balance and are not marked paid.`
      : `מעמד חובת השכירות ${unresolvedText} לא הוכרע מהנתונים. אין קבלה ואין זיכוי מאושר לחודשים האלה. הם לא נכללים ביתרה ולא מסומנים כשולם.`,
  }]
  return {
    propertyName: cert.propertyName,
    propertyKey: cert.propertyKey,
    lineOrder: cert.lineOrder,
    amountDueToJj: due,
    direction: directionOf(due),
    lines,
    units,
    summaries,
    bridge: steps,
    statusLines: status,
    sourceNotes,
    certifiedMonthlyStr: null,
  }
}

/**
 * Client-level bridge: property balance → credits → payments (one step each) → cash allocation → closing.
 * The steps must add up to the certified closing; otherwise the account blocks.
 */
function settlementBridgeOf(
  propertyBalance: number,
  credits: readonly CreditPresentation[],
  cashAllocationSignedTotal: number,
  closing: number,
  language: ReportLanguage,
): SettlementBridge {
  const steps: SettlementBridgeStep[] = [{
    kind: 'property-balance',
    label: term('balanceBeforePayments', language),
    signedDueToJj: roundEur(propertyBalance),
    eventId: null,
    sourceTransactionId: null,
    dateLabel: null,
  }]
  const ordered = [
    ...credits.filter((credit) => credit.dateRole === 'credit-event'),
    ...credits.filter((credit) => credit.dateRole === 'cash-receipt'),
  ]
  for (const credit of ordered) {
    steps.push({
      kind: credit.dateRole === 'cash-receipt' ? 'payment' : 'credit',
      label: credit.label,
      signedDueToJj: roundEur(-credit.amount),
      eventId: credit.eventId,
      sourceTransactionId: credit.sourceTransactionId,
      dateLabel: credit.dateLabel || credit.monthLabel,
    })
  }
  if (!sameMoney(cashAllocationSignedTotal, 0)) {
    steps.push({
      kind: 'cash-allocation',
      label: term('cashAllocation', language),
      signedDueToJj: roundEur(-cashAllocationSignedTotal),
      eventId: null,
      sourceTransactionId: null,
      dateLabel: null,
    })
  }
  const creditsTotal = roundEur(credits.filter((credit) => credit.dateRole === 'credit-event').reduce((sum, credit) => sum + credit.amount, 0))
  const paymentsTotal = roundEur(credits.filter((credit) => credit.dateRole === 'cash-receipt').reduce((sum, credit) => sum + credit.amount, 0))
  const composed = roundEur(steps.reduce((sum, step) => sum + step.signedDueToJj, 0))
  if (!sameMoney(composed, closing)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Settlement bridge ${composed} does not equal certified closing ${closing}.`)
  }
  steps.push({
    kind: 'closing',
    label: term('closingBalance', language),
    signedDueToJj: roundEur(closing),
    eventId: null,
    sourceTransactionId: null,
    dateLabel: null,
  })
  return {
    propertyBalanceDueToJj: roundEur(propertyBalance),
    creditsTotal,
    paymentsTotal,
    cashAllocationSignedTotal: roundEur(cashAllocationSignedTotal),
    closingDueToJj: roundEur(closing),
    steps,
  }
}

function withOwnerDescriptions(property: PropertyAccount, descriptions: CompositionInput['descriptionByRowId']): PropertyAccount {
  if (!descriptions) return property
  const apply = (line: DisplayLine): DisplayLine => {
    const text = line.traceSourceId ? descriptions[line.traceSourceId] : undefined
    return text ? { ...line, clientText: text } : line
  }
  return {
    ...property,
    lines: property.lines.map(apply),
    units: property.units.map((unit) => ({ ...unit, lines: unit.lines.map(apply) })),
  }
}

export function composeCertifiedClientAccount(input: CompositionInput): ClientAccountDocument {
  takePresentationGaps()
  const { reportType, period } = reportScope(input)
  if (input.currency && input.currency !== 'EUR') {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Unsupported report currency ${input.currency}.`)
  }
  const rows = [...input.rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const ordered: CompositionInput = { ...input, rows }
  const includeDeleted = new Set<string>()
  for (const line of input.lines) {
    const extra = text(line.metadata, 'additional_receipt_id')
    if (extra) includeDeleted.add(extra)
  }
  const omitted: string[] = []
  const events = admitSettlementEvents(ordered)
  const properties = [...input.lines]
    .sort((a, b) => a.lineOrder - b.lineOrder)
    .map((line) => withOwnerDescriptions(composeProperty(ordered, line, includeDeleted, omitted, period, events), input.descriptionByRowId))
  const opening = roundEur(properties.reduce((sum, property) => sum + property.amountDueToJj, 0))
  if (!sameMoney(opening, input.openingDueToJj)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Property balances ${opening} do not equal certified opening ${input.openingDueToJj}.`)
  }
  const creditLanguage = input.reportLanguage || 'he'
  const credits: CreditPresentation[] = input.credits.map((credit) => {
    const noncash = credit.eventType === 'noncash_settlement_credit'
    return {
      label: noncash
        ? (input.creditLabels?.noncash || term('creditNoncash', creditLanguage))
        : (input.creditLabels?.cash || term('creditCash', creditLanguage)),
      monthLabel: monthFromIsoDate(credit.effectiveDate, creditLanguage),
      dateLabel: noncash ? null : dayLabel(credit.effectiveDate),
      effectiveDate: credit.effectiveDate.slice(0, 10),
      dateCaption: noncash ? term('creditEventCaption', creditLanguage) : null,
      note: noncash ? term('creditEventNote', creditLanguage) : null,
      amount: roundEur(credit.amount),
      currency: 'EUR' as const,
      eventId: credit.id,
      sourceTransactionId: credit.sourceTransactionId || null,
      eventType: credit.eventType,
      dateRole: noncash ? 'credit-event' as const : 'cash-receipt' as const,
      evidence: 'owner-certified' as const,
      evidenceStatus: 'certified' as const,
      inclusion: 'included' as const,
    }
  })
  const creditTotal = roundEur(credits.reduce((sum, credit) => sum + credit.amount, 0))
  const closing = roundEur(opening - creditTotal - input.cashAllocationSignedTotal)
  if (!sameMoney(closing, input.closingDueToJj)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Closing ${closing} does not equal certified closing ${input.closingDueToJj}.`)
  }
  const settlementBridge = settlementBridgeOf(opening, credits, input.cashAllocationSignedTotal, closing, creditLanguage)
  const closingBeforeMonthlyStr = closing
  const propertiesWithMonthlyStr = properties.map((property) => {
    const admitted = input.certifiedStrMonthlyByPropertyKey?.[property.propertyKey]
    if (!admitted || admitted.unavailable) return property
    if (admitted.propertyId !== property.propertyKey || admitted.propertyName !== property.propertyName) return property
    if (admitted.arithmeticEffectOnCertifiedClosing !== 0) return property
    return {
      ...property,
      certifiedMonthlyStr: admitted,
      lines: property.lines.filter((line) => line.countedIn !== 'str-credit'),
      units: property.units.map((unit) => ({
        ...unit,
        lines: unit.lines.filter((line) => line.countedIn !== 'str-credit'),
      })),
    }
  })
  const closingAfterMonthlyStr = roundEur(
    propertiesWithMonthlyStr.reduce((sum, property) => sum + property.amountDueToJj, 0)
    - creditTotal
    - input.cashAllocationSignedTotal,
  )
  if (!sameMoney(closingBeforeMonthlyStr, closingAfterMonthlyStr) || !sameMoney(closingAfterMonthlyStr, closing)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', 'Certified monthly STR changed the certified closing.')
  }
  const gaps = takePresentationGaps()
  if (gaps.length > 0) {
    throw new ClientAccountBlock('BLOCKED_PRESENTATION', `no proven client wording for ${gaps.join(' | ')}`)
  }
  const seen = new Set<string>()
  for (const property of properties) {
    const displayed = [
      ...property.lines,
      ...property.units.flatMap((unit) => unit.lines),
    ]
    for (const line of displayed) {
      for (const id of line.sourceIds) {
        if (seen.has(id)) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Source ${id} is counted twice.`)
        seen.add(id)
      }
    }
  }
  for (const credit of credits) {
    if (credit.sourceTransactionId && seen.has(credit.sourceTransactionId)) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Payment transaction ${credit.sourceTransactionId} is counted in a property account and as a settlement event.`)
    }
    if (credit.sourceTransactionId) seen.add(credit.sourceTransactionId)
  }
  return {
    clientId: input.clientId || null,
    clientDisplayName: input.clientDisplayName,
    reportTitle: input.reportTitle,
    reportLanguage: input.reportLanguage || 'he',
    reportType,
    period,
    currency: 'EUR',
    evidenceStatus: 'certified',
    asOf: input.asOf,
    openingDueToJj: opening,
    closingDueToJj: closing,
    closingDirection: directionOf(closing),
    properties: propertiesWithMonthlyStr,
    credits,
    settlementBridge,
    sourceNotes: properties.flatMap((property) => property.sourceNotes),
    omittedNetZeroSourceIds: omitted,
  }
}

export function applicableSectionNames(property: PropertyAccount): string[] {
  const names: string[] = []
  const has = (section: string) => property.lines.some((line) => line.section === section)
  if (has(SECTION.purchase)) names.push(SECTION.purchase)
  if (has(SECTION.renovation)) names.push(SECTION.renovation)
  if (has(SECTION.setup)) names.push(SECTION.setup)
  if (has(SECTION.ltrIncome) || has(SECTION.strIncome)) names.push(TERMS.propertyIncome.he)
  if (has(SECTION.ownerTransfers)) names.push(SECTION.ownerTransfers)
  if (has(SECTION.propertyExpenses) || has(SECTION.recurring)) names.push(SECTION.propertyExpenses)
  if (has(SECTION.repairs)) names.push(SECTION.repairs)
  if (property.units.length > 0) names.push(TERMS.units.he)
  names.push(TERMS.closingBridge.he, TERMS.openClosed.he)
  return names
}
