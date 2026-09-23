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
  readonly sourceIds: readonly string[]
  readonly amount: number
  readonly effect: string
  readonly evidence: string
  readonly countedIn: string
  readonly countedElsewhere: false
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
      sourceIds: line.sourceIds,
      amount: line.amount,
      effect: line.effect,
      evidence: line.evidence,
      countedIn: line.countedIn,
      countedElsewhere: false,
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
    for (const line of [...property.lines, ...property.units.flatMap((unit) => unit.lines)]) {
      parts.push(line.section, line.description, line.monthLabel, fmt(line.amount))
    }
    for (const step of property.bridge) parts.push(step.label, fmt(step.signedDueToJj))
  }
  for (const credit of doc.credits) parts.push(credit.label, credit.monthLabel, fmt(credit.amount))
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
