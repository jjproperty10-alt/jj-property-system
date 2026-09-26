/**
 * Assertion register and reconciliation gates for a composed client account.
 * Forbidden phrases are supplied by the caller. This file stores none.
 */

import { fmt } from '../../pdf/formatters'
import { balanceDirectionText, heroDirectionText } from './presentation'
import type { ClientAccountDocument, DisplayLine } from './types'

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
      description: line.description,
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
      parts.push(line.section, line.description, line.monthLabel, line.paymentMonthLabel || '', line.directionText, fmt(line.amount))
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
      parts.push('זיכוי הכנסות מהשכרה קצרת טווח', 'סיכום חודשי מאושר — לפי חודש הצ׳ק־אין')
      for (const month of monthly.months) {
        parts.push(month.monthLabel, month.reservationCountLabel, month.nightsLabel, fmt(month.ownerNet))
      }
      parts.push('סה״כ נטו לבעלים', fmt(monthly.totalOwnerNet))
      parts.push('סה״כ', String(monthly.months.reduce((sum, month) => sum + (month.reservationCount || 0), 0)), String(monthly.months.reduce((sum, month) => sum + (month.nights || 0), 0)))
      parts.push('הפירוט מציג את הנטו המאושר לבעלים לפי חודש הצ׳ק־אין. פירוט ההזמנות המלא זמין כנספח נפרד.')
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
