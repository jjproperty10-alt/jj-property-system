/**
 * Generic certified property-bridge DTO and fail-closed compose.
 * Presentation only. Does not read RC3, cashbox, P&L, or mutate settlement data.
 * Packs are keyed by evidence_ref from the live certified reader — never by entity id.
 */

import {
  certifiedCents,
  composeCertifiedClosingDueToJj,
  roundCertifiedEur,
} from './certifiedClientSettlementPresentation'
import type { CertifiedClientSettlementAvailable } from './certifiedClientSettlementTypes'

export type CertifiedBridgeCategory =
  | 'purchase'
  | 'renovation'
  | 'setup'
  | 'recurring'
  | 'repairs'
  | 'rental'
  | 'str'
  | 'owner_payment'
  | 'adjustment'

export type CertifiedBridgeSourceStatus = 'system_verified' | 'approved_adjustment'

export interface CertifiedBridgeComponent {
  readonly category: CertifiedBridgeCategory
  readonly labelEn: string
  readonly labelHe: string
  readonly chargesDueToJj: number
  readonly creditsDueToClient: number
  readonly effectDueToJj: number
  readonly sourceStatus: CertifiedBridgeSourceStatus
  readonly detailEn?: string
  readonly detailHe?: string
}

export interface CertifiedStrMonthRow {
  readonly month: string
  readonly bookings: number | null
  readonly nights: number | null
  readonly gross: number | null
  readonly platformFees: number | null
  readonly cleaning: number | null
  readonly tax: number | null
  readonly management: number | null
  readonly ownerNet: number
}

export interface CertifiedFormulaStep {
  readonly op: 'start' | 'add' | 'subtract' | 'equals'
  readonly labelEn: string
  readonly labelHe: string
  readonly amount: number
}

export interface CertifiedPropertyBridgePack {
  readonly evidenceRef: string
  readonly displayNameHe: string
  readonly formula: readonly CertifiedFormulaStep[]
  readonly formulaResultDirection: 'due_to_jj' | 'due_to_client'
  readonly components: readonly CertifiedBridgeComponent[]
  readonly strMonths?: readonly CertifiedStrMonthRow[]
  readonly notesEn?: readonly string[]
  readonly notesHe?: readonly string[]
}

export interface CertifiedPropertyBridgePage {
  readonly propertyKey: string
  readonly propertyName: string
  readonly displayNameHe: string
  readonly certifiedBalanceDueToJj: number
  readonly formula: readonly CertifiedFormulaStep[]
  readonly components: readonly CertifiedBridgeComponent[]
  readonly strMonths: readonly CertifiedStrMonthRow[]
  readonly notesEn: readonly string[]
  readonly notesHe: readonly string[]
}

export interface CertifiedOwnerStatement {
  readonly certified: CertifiedClientSettlementAvailable
  readonly properties: readonly CertifiedPropertyBridgePage[]
}

export type CertifiedOwnerStatementCompose =
  | { readonly status: 'ready'; readonly statement: CertifiedOwnerStatement }
  | { readonly status: 'unavailable'; readonly reason: 'no_pack' }
  | { readonly status: 'blocked'; readonly reason: 'incomplete' | 'mismatch' | 'formula' | 'str' }

function centsOrNull(n: number): number | null {
  return certifiedCents(n)
}

function componentEffect(c: CertifiedBridgeComponent): number | null {
  const charges = centsOrNull(c.chargesDueToJj)
  const credits = centsOrNull(c.creditsDueToClient)
  const effect = centsOrNull(c.effectDueToJj)
  if (charges == null || credits == null || effect == null) return null
  if (charges < 0 || credits < 0) return null
  if (effect !== charges - credits) return null
  return effect
}

function formulaResultDueToJj(steps: readonly CertifiedFormulaStep[]): number | null {
  if (steps.length < 2) return null
  const last = steps[steps.length - 1]
  if (last.op !== 'equals') return null
  let running: number | null = null
  for (const step of steps) {
    const amount = centsOrNull(step.amount)
    if (amount == null) return null
    if (step.op === 'start') {
      if (running != null) return null
      running = amount
      continue
    }
    if (running == null) return null
    if (step.op === 'add') running += amount
    else if (step.op === 'subtract') running -= amount
    else if (step.op === 'equals') {
      if (running !== amount) return null
    } else {
      return null
    }
  }
  return last.amount
}

function strMonthsTotal(rows: readonly CertifiedStrMonthRow[]): number | null {
  let sum = 0
  for (const row of rows) {
    const net = centsOrNull(row.ownerNet)
    if (net == null) return null
    sum += net
  }
  return sum
}

export function sumBridgeEffects(components: readonly CertifiedBridgeComponent[]): number | null {
  let sum = 0
  for (const component of components) {
    const effect = componentEffect(component)
    if (effect == null) return null
    sum += effect
  }
  return sum
}

/**
 * Attach explicit property-bridge packs to a live certified DTO.
 * Fail closed when any matched certification cannot be proven.
 * If no certified line has a pack, other-client behaviour remains available.
 */
export function composeCertifiedOwnerStatement(
  certified: CertifiedClientSettlementAvailable,
  packsByEvidenceRef: ReadonlyMap<string, CertifiedPropertyBridgePack>,
): CertifiedOwnerStatementCompose {
  const hits = certified.propertyLines.filter((line) => packsByEvidenceRef.has(line.evidenceRef))
  if (hits.length === 0) return { status: 'unavailable', reason: 'no_pack' }
  if (hits.length !== certified.propertyLines.length) {
    return { status: 'blocked', reason: 'incomplete' }
  }

  const openingCents = centsOrNull(certified.openingDueToJj)
  const overlayClosing = centsOrNull(certified.overlayClosingDueToJj ?? certified.closingDueToJj)
  const fifoCents = centsOrNull(certified.fifoCreditsTotal)
  const displayedClosing = centsOrNull(certified.closingDueToJj)
  if (openingCents == null || fifoCents == null || overlayClosing == null || displayedClosing == null) {
    return { status: 'blocked', reason: 'mismatch' }
  }
  const composedClosing = composeCertifiedClosingDueToJj(
    certified.openingDueToJj,
    certified.fifoCreditsTotal,
  )
  if (centsOrNull(composedClosing) !== overlayClosing) {
    return { status: 'blocked', reason: 'mismatch' }
  }
  if (displayedClosing !== overlayClosing) {
    return { status: 'blocked', reason: 'mismatch' }
  }

  const properties: CertifiedPropertyBridgePage[] = []
  let lineSum = 0
  for (const line of certified.propertyLines) {
    const pack = packsByEvidenceRef.get(line.evidenceRef)
    if (!pack) return { status: 'blocked', reason: 'incomplete' }
    const effectSum = sumBridgeEffects(pack.components)
    const lineCents = centsOrNull(line.amountDueToJj)
    if (effectSum == null || lineCents == null || effectSum !== lineCents) {
      return { status: 'blocked', reason: 'mismatch' }
    }

    const formulaAmount = formulaResultDueToJj(pack.formula)
    const formulaCents = formulaAmount == null ? null : centsOrNull(formulaAmount)
    const signedFormula =
      formulaCents == null
        ? null
        : pack.formulaResultDirection === 'due_to_client'
          ? -formulaCents
          : formulaCents
    if (signedFormula == null || signedFormula !== lineCents) {
      return { status: 'blocked', reason: 'formula' }
    }

    const strCredit = pack.components.find((c) => c.category === 'str')
    if (pack.strMonths && pack.strMonths.length > 0) {
      const strTotal = strMonthsTotal(pack.strMonths)
      const expectedCredit = strCredit ? centsOrNull(strCredit.creditsDueToClient) : null
      if (strTotal == null || expectedCredit == null || strTotal !== expectedCredit) {
        return { status: 'blocked', reason: 'str' }
      }
    }

    lineSum += lineCents
    properties.push({
      propertyKey: line.propertyKey,
      propertyName: line.propertyName,
      displayNameHe: pack.displayNameHe,
      certifiedBalanceDueToJj: line.amountDueToJj,
      formula: pack.formula,
      components: pack.components,
      strMonths: pack.strMonths ?? [],
      notesEn: pack.notesEn ?? [],
      notesHe: pack.notesHe ?? [],
    })
  }

  if (lineSum !== openingCents) return { status: 'blocked', reason: 'mismatch' }

  return {
    status: 'ready',
    statement: { certified, properties },
  }
}

export function propertyBalanceDirection(
  amountDueToJj: number,
): 'client_owes_jj' | 'jj_owes_client' | 'settled' {
  if (Math.abs(amountDueToJj) < 0.005) return 'settled'
  return amountDueToJj > 0 ? 'client_owes_jj' : 'jj_owes_client'
}

export function roundBridgeEur(n: number): number {
  return roundCertifiedEur(n)
}
