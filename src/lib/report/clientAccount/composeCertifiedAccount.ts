/**
 * Builds a client account from a certified opening and ledger rows.
 * Certified amounts and property names come from the input. A mismatch throws
 * BLOCKED_ACCOUNTING instead of plugging an unexplained figure.
 */

import {
  clientDescription,
  directionOf,
  monthFromIsoDate,
  monthLabelForRow,
  roundEur,
  sameMoney,
  UNDATED_LABEL,
} from './presentation'
import type {
  AccountUnit,
  BridgeStep,
  CertifiedAccountLine,
  ClientAccountDocument,
  CompositionInput,
  DisplayLine,
  LedgerRow,
  PropertyAccount,
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

function inForce(row: LedgerRow, asOf: string, includeDeletedIds: ReadonlySet<string>): boolean {
  if (row.date.slice(0, 10) > asOf) return false
  if (row.reviewStatus != null && row.reviewStatus !== 'active') return false
  if (row.isDeleted && !includeDeletedIds.has(row.id)) return false
  return true
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
  evidence: DisplayLine['evidence'] = 'proven',
  monthOverride?: string,
): DisplayLine {
  const sample = chunk.rows[0]
  return {
    propertyName,
    section,
    description: clientDescription(sample.subcategory, sample.description),
    monthLabel: monthOverride || monthLabelForRow(sample.date, sample.description),
    amount: roundEur(Math.abs(chunk.amount)),
    effect,
    sourceIds: chunk.rows.map((row) => row.id),
    evidence,
    countedIn,
  }
}

function sumAmount(lines: readonly DisplayLine[], effect: DisplayLine['effect']): number {
  return roundEur(lines.filter((line) => line.effect === effect).reduce((sum, line) => sum + line.amount, 0))
}

function pushStep(steps: BridgeStep[], label: string, signed: number): void {
  if (sameMoney(signed, 0)) return
  steps.push({ label, signedDueToJj: roundEur(signed) })
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

function strCreditLines(
  propertyName: string,
  credit: number,
  months: readonly StrMonthInput[] | undefined,
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
      section: 'הכנסות משכירות קצרה',
      description: 'נטו לבעלים',
      monthLabel: monthFromIsoDate(`${month.year}-${String(month.month).padStart(2, '0')}-01`),
      amount: roundEur(month.amount),
      effect: 'credit' as const,
      sourceIds: [],
      evidence: 'owner-certified' as const,
      countedIn: 'str-credit',
    }))
  }
  return [{
    propertyName,
    section: 'הכנסות משכירות קצרה',
    description: 'נטו לבעלים',
    monthLabel: UNDATED_LABEL,
    amount: credit,
    effect: 'credit',
    sourceIds: [],
    evidence: 'owner-certified',
    countedIn: 'str-credit',
  }]
}

function composeProperty(
  input: CompositionInput,
  cert: CertifiedAccountLine,
  includeDeleted: ReadonlySet<string>,
  omitted: string[],
): PropertyAccount {
  const meta = cert.metadata
  const rows = input.rows.filter((row) => row.propertyName === cert.propertyName && inForce(row, input.asOf, includeDeleted))
  const linked = (input.linkedRowsByPropertyKey?.[cert.propertyKey] || []).filter((row) => inForce(row, input.asOf, includeDeleted))
  const internalId = text(meta, 'internal_jj_cost_id')
  const visible = rows.filter((row) => row.id !== internalId && row.category !== 'Purchase' && row.category !== 'JJ')
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
  let due = 0

  if (saleContract.length === 1) {
    const price = roundEur(saleContract[0].amountEur)
    lines.push(lineFrom(cert.propertyName, 'קניית הנכס', { rows: saleContract, amount: price }, 'reference', 'purchase-price'))
    const payments = collapse(purchasePayments, omitted)
    for (const chunk of payments) lines.push(lineFrom(cert.propertyName, 'קניית הנכס', chunk, 'credit', 'purchase-payment'))
    const costs = collapse(closingCosts, omitted)
    for (const chunk of costs) lines.push(lineFrom(cert.propertyName, 'קניית הנכס', chunk, 'charge', 'purchase-cost'))
    const accepted = num(meta, 'accepted_purchase_payments')
    const paidRows = roundEur(purchasePayments.reduce((sum, row) => sum + face(row), 0))
    let paid = paidRows
    if (accepted != null) {
      const approved = roundEur(accepted - paidRows)
      if (approved < -0.001) {
        throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: client payments exceed accepted purchase payments.`)
      }
      if (!sameMoney(approved, 0)) {
        lines.push({
          propertyName: cert.propertyName,
          section: 'קניית הנכס',
          description: 'תשלום מאושר',
          monthLabel: UNDATED_LABEL,
          amount: approved,
          effect: 'credit',
          sourceIds: [],
          evidence: 'owner-certified',
          countedIn: 'purchase-payment',
        })
        paid = accepted
      }
    }
    const costSum = roundEur(closingCosts.reduce((sum, row) => sum + face(row), 0))
    const remaining = roundEur(price + costSum - paid)
    due = roundEur(due + remaining)
    pushStep(steps, 'יתרת קניית הנכס', remaining)
    status.push(statusFor('קניית הנכס', remaining))
    void payments
  } else if (saleContract.length > 1) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: more than one sale contract.`)
  }

  if (renoContract.length === 1) {
    const agreed = roundEur(renoContract[0].amountEur)
    lines.push(lineFrom(cert.propertyName, 'שיפוץ', { rows: renoContract, amount: agreed }, 'reference', 'renovation-contract'))
    for (const chunk of collapse(renoPayments, omitted)) lines.push(lineFrom(cert.propertyName, 'שיפוץ', chunk, 'credit', 'renovation-payment'))
    for (const chunk of collapse(renoExtras, omitted)) lines.push(lineFrom(cert.propertyName, 'שיפוץ', chunk, 'charge', 'renovation-extra'))
    const paid = roundEur(renoPayments.reduce((sum, row) => sum + face(row), 0))
    const extras = roundEur(renoExtras.reduce((sum, row) => sum + face(row), 0))
    const remaining = roundEur(agreed - paid + extras)
    due = roundEur(due + remaining)
    pushStep(steps, 'יתרת שיפוץ', remaining)
    status.push(statusFor('שיפוץ', remaining))
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
  const setupRows = setupExpected == null ? [] : [
    ...linked,
    ...operatingPool.filter((row) => row.id === fireKitId),
  ]
  if (setupExpected != null) {
    const setupSum = roundEur(setupRows.reduce((sum, row) => sum + face(row), 0))
    if (!sameMoney(setupSum, setupExpected)) {
      throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: setup lines ${setupSum} do not equal certified ${setupExpected}.`)
    }
    for (const chunk of collapse(setupRows, omitted)) {
      lines.push(lineFrom(cert.propertyName, 'ציוד והכנת הנכס להשכרה קצרה', chunk, 'charge', 'setup'))
    }
    due = roundEur(due + setupSum)
    pushStep(steps, 'ציוד והכנת הנכס להשכרה קצרה', setupSum)
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

  const incomeChunks = collapse(ltrRows, omitted)
  const ownerChunks = collapse(ownerRows, omitted)
  const expenseChunks = collapse(generalExpenses, omitted)
  const recurringChunks = collapse(recurringRows, omitted)
  const strExpenseChunks = collapse(strExpenseRows, omitted)
  collapse(airbnbCleaning, omitted)

  const incomeLines = incomeChunks.map((chunk) => lineFrom(cert.propertyName, 'הכנסות משכירות ארוכה', chunk, 'credit', 'rent-income'))
  const ownerLines = ownerChunks.map((chunk) => lineFrom(cert.propertyName, 'תשלומים שהועברו לבעלים', chunk, 'charge', 'owner-payment'))
  const expenseLines = [
    ...expenseChunks.map((chunk) => lineFrom(cert.propertyName, 'הוצאות הנכס', chunk, 'charge', 'operating-charge')),
    ...recurringChunks.map((chunk) => lineFrom(cert.propertyName, 'הוצאות שוטפות', chunk, 'charge', 'recurring-charge')),
  ]
  if (rentExpected != null && !sameMoney(sumAmount(incomeLines, 'credit'), rentExpected)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: rent income does not equal certified rent.`)
  }
  if (ownerExpected != null && !sameMoney(sumAmount(ownerLines, 'charge'), ownerExpected)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: owner transfers do not equal the certified amount.`)
  }

  const strLines = strCredit == null ? [] : strCreditLines(cert.propertyName, strCredit, input.strMonthsByPropertyKey?.[cert.propertyKey])
    .map((line, _index, all) => (
      all.length === 1 && line.monthLabel === UNDATED_LABEL
        ? { ...line, sourceIds: airbnbCleaning.map((row) => row.id) }
        : line
    ))
  const strExpenseLines = strExpenseChunks.map((chunk) => lineFrom(cert.propertyName, 'הוצאות השכרה קצרה', chunk, 'charge', 'str-expense'))

  const useUnits = strCredit != null && rentalCredit != null
  const units: AccountUnit[] = []
  if (useUnits) {
    const strBalance = roundEur(sumAmount(strExpenseLines, 'charge') - (strCredit || 0))
    const ltrBalance = roundEur(-sumAmount(incomeLines, 'credit'))
    units.push({
      title: `${cert.propertyName} — Short-Term Rental`,
      lines: [...strLines, ...strExpenseLines],
      balanceDueToJj: strBalance,
    })
    units.push({
      title: `${cert.propertyName} — Long-Term Rental`,
      lines: incomeLines,
      balanceDueToJj: ltrBalance,
    })
    due = roundEur(due - sumAmount(incomeLines, 'credit') + sumAmount(strExpenseLines, 'charge') - (strCredit || 0))
    pushStep(steps, 'זיכוי שכירות ארוכה', roundEur(-sumAmount(incomeLines, 'credit')))
    pushStep(steps, 'הוצאות שכירות קצרה', sumAmount(strExpenseLines, 'charge'))
    pushStep(steps, 'זיכוי שכירות קצרה', roundEur(-(strCredit || 0)))
  } else {
    lines.push(...incomeLines, ...strLines, ...strExpenseLines)
    due = roundEur(due - sumAmount(incomeLines, 'credit') - sumAmount(strLines, 'credit') + sumAmount(strExpenseLines, 'charge'))
    pushStep(steps, 'הכנסות', roundEur(-sumAmount(incomeLines, 'credit') - sumAmount(strLines, 'credit')))
    pushStep(steps, 'הוצאות שכירות קצרה', sumAmount(strExpenseLines, 'charge'))
  }

  lines.push(...ownerLines, ...expenseLines)
  due = roundEur(due + sumAmount(ownerLines, 'charge') + sumAmount(expenseLines, 'charge'))
  pushStep(steps, 'תשלומים שהועברו לבעלים', sumAmount(ownerLines, 'charge'))
  pushStep(steps, 'הוצאות הנכס', sumAmount(expenseLines, 'charge'))

  const undatedLabel = input.undatedChargeLabelByPropertyKey?.[cert.propertyKey]
  if (!sameMoney(due, cert.amountDueToJj)) {
    const residual = roundEur(cert.amountDueToJj - due)
    if (!undatedLabel || residual < 0.001) {
      throw new ClientAccountBlock(
        'BLOCKED_ACCOUNTING',
        `${cert.propertyName}: composed ${due} does not equal certified ${cert.amountDueToJj}.`,
      )
    }
    lines.push({
      propertyName: cert.propertyName,
      section: 'הוצאות הנכס',
      description: undatedLabel,
      monthLabel: UNDATED_LABEL,
      amount: residual,
      effect: 'charge',
      sourceIds: [],
      evidence: 'owner-certified',
      countedIn: 'undated-certified-charge',
    })
    pushStep(steps, undatedLabel, residual)
    due = roundEur(due + residual)
  }
  if (!sameMoney(due, cert.amountDueToJj)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: bridge ${due} does not equal certified ${cert.amountDueToJj}.`)
  }
  const stepSum = roundEur(steps.reduce((sum, step) => sum + step.signedDueToJj, 0))
  if (!sameMoney(stepSum, due)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `${cert.propertyName}: bridge steps ${stepSum} do not equal ${due}.`)
  }
  status.push(statusFor('יתרת הנכס', due))
  return {
    propertyName: cert.propertyName,
    propertyKey: cert.propertyKey,
    lineOrder: cert.lineOrder,
    amountDueToJj: due,
    direction: directionOf(due),
    lines,
    units,
    bridge: steps,
    statusLines: status,
  }
}

export function composeCertifiedClientAccount(input: CompositionInput): ClientAccountDocument {
  const rows = [...input.rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const ordered: CompositionInput = { ...input, rows }
  const includeDeleted = new Set<string>()
  for (const line of input.lines) {
    const extra = text(line.metadata, 'additional_receipt_id')
    if (extra) includeDeleted.add(extra)
  }
  const omitted: string[] = []
  const properties = [...input.lines]
    .sort((a, b) => a.lineOrder - b.lineOrder)
    .map((line) => composeProperty(ordered, line, includeDeleted, omitted))
  const opening = roundEur(properties.reduce((sum, property) => sum + property.amountDueToJj, 0))
  if (!sameMoney(opening, input.openingDueToJj)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Property balances ${opening} do not equal certified opening ${input.openingDueToJj}.`)
  }
  const credits = input.credits.map((credit) => ({
    label: credit.eventType === 'noncash_settlement_credit'
      ? (input.creditLabels?.noncash || 'זיכוי ללא מזומן')
      : (input.creditLabels?.cash || 'תשלום כללי'),
    monthLabel: monthFromIsoDate(credit.effectiveDate),
    amount: roundEur(credit.amount),
    sourceId: credit.id,
    evidence: 'owner-certified' as const,
  }))
  const creditTotal = roundEur(credits.reduce((sum, credit) => sum + credit.amount, 0))
  const closing = roundEur(opening - creditTotal - input.cashAllocationSignedTotal)
  if (!sameMoney(closing, input.closingDueToJj)) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `Closing ${closing} does not equal certified closing ${input.closingDueToJj}.`)
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
  return {
    clientDisplayName: input.clientDisplayName,
    reportTitle: input.reportTitle,
    asOf: input.asOf,
    openingDueToJj: opening,
    closingDueToJj: closing,
    closingDirection: directionOf(closing),
    properties,
    credits,
    omittedNetZeroSourceIds: omitted,
  }
}

export function applicableSectionNames(property: PropertyAccount): string[] {
  const names: string[] = []
  const has = (section: string) => property.lines.some((line) => line.section === section)
  if (has('קניית הנכס')) names.push('קניית הנכס')
  if (has('שיפוץ')) names.push('שיפוץ')
  if (has('ציוד והכנת הנכס להשכרה קצרה')) names.push('ציוד והכנת הנכס להשכרה קצרה')
  if (has('הכנסות משכירות ארוכה') || has('הכנסות משכירות קצרה')) names.push('הכנסות מהנכס')
  if (has('תשלומים שהועברו לבעלים')) names.push('תשלומים שהועברו לבעלים')
  if (has('הוצאות הנכס') || has('הוצאות שוטפות')) names.push('הוצאות הנכס')
  if (property.units.length > 0) names.push('יחידות')
  names.push('גשר סגירה', 'מה נסגר ומה נשאר פתוח')
  return names
}
