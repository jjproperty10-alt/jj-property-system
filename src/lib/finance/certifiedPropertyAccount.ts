/**
 * Client property-account statement DTO and fail-closed compose.
 * Presentation only. Does not read mixed monthly activity or mutate settlement data.
 * Packs are keyed by evidence_ref from the live certified reader — never by entity id.
 */

import {
  certifiedCents,
  composeCertifiedClosingDueToJj,
} from './certifiedClientSettlementPresentation'
import type { CertifiedClientSettlementAvailable } from './certifiedClientSettlementTypes'
import type { CertifiedStrMonthRow } from './certifiedPropertyBridge'

export type ContractLayerKind = 'purchase' | 'sale' | 'renovation'
export type ContractLayerStatus = 'closed' | 'partially_paid' | 'open'
export type PropertyOverallState = 'closed' | 'partially_closed' | 'open'
export type OperatingCategory = 'setup' | 'recurring' | 'repairs' | 'ltr' | 'str'
export type PaymentKind = 'cash' | 'noncash' | 'not_applicable'
export type ClosingBridgeOp = 'start' | 'add' | 'subtract' | 'equals'

export interface ContractLayer {
  readonly layer: ContractLayerKind
  readonly agreedAmount: number
  readonly paidCredited: number
  readonly remainingDueToJj: number
  readonly status: ContractLayerStatus
  readonly noteEn?: string
  readonly noteHe?: string
}

export interface OperatingAccountRow {
  readonly category: OperatingCategory
  readonly labelEn: string
  readonly labelHe: string
  readonly chargesToOwner: number
  readonly ownerCredits: number
  readonly netEffectDueToJj: number
}

export interface ClosingBridgeLine {
  readonly op: ClosingBridgeOp
  readonly labelEn: string
  readonly labelHe: string
  readonly amountDueToJj: number
}

export interface PropertySpecificPayment {
  readonly labelEn: string
  readonly labelHe: string
  readonly amount: number
  readonly kind: PaymentKind
  readonly reducesDueToJj: boolean
}

export interface CertifiedPropertyAccountPack {
  readonly evidenceRef: string
  readonly displayNameHe: string
  readonly overallState: PropertyOverallState
  readonly contracts: readonly ContractLayer[]
  readonly operating: readonly OperatingAccountRow[]
  readonly closingBridge: readonly ClosingBridgeLine[]
  readonly propertyPayments: readonly PropertySpecificPayment[]
  readonly explanationEn: string
  readonly explanationHe: string
  readonly strMonths?: readonly CertifiedStrMonthRow[]
}

export interface CertifiedPropertyAccountPage {
  readonly propertyKey: string
  readonly propertyName: string
  readonly displayNameHe: string
  readonly closingDueToJj: number
  readonly overallState: PropertyOverallState
  readonly contracts: readonly ContractLayer[]
  readonly operating: readonly OperatingAccountRow[]
  readonly closingBridge: readonly ClosingBridgeLine[]
  readonly propertyPayments: readonly PropertySpecificPayment[]
  readonly explanationEn: string
  readonly explanationHe: string
  readonly strMonths: readonly CertifiedStrMonthRow[]
}

export interface CertifiedPropertyAccountStatement {
  readonly certified: CertifiedClientSettlementAvailable
  readonly properties: readonly CertifiedPropertyAccountPage[]
}

export type CertifiedPropertyAccountCompose =
  | { readonly status: 'ready'; readonly statement: CertifiedPropertyAccountStatement }
  | { readonly status: 'unavailable'; readonly reason: 'no_pack' }
  | { readonly status: 'blocked'; readonly reason: 'incomplete' | 'mismatch' | 'formula' | 'str' | 'layer' }

function centsOrNull(n: number): number | null {
  return certifiedCents(n)
}

function contractRemainingCents(layer: ContractLayer): number | null {
  const agreed = centsOrNull(layer.agreedAmount)
  const paid = centsOrNull(layer.paidCredited)
  const remaining = centsOrNull(layer.remainingDueToJj)
  if (agreed == null || paid == null || remaining == null) return null
  if (agreed < 0 || paid < 0 || remaining < 0) return null
  if (agreed - paid !== remaining) return null
  if (layer.status === 'closed' && remaining !== 0) return null
  if (layer.status === 'open' && remaining === 0) return null
  if (layer.status === 'partially_paid' && (remaining === 0 || paid === 0)) return null
  return remaining
}

function operatingNetCents(row: OperatingAccountRow): number | null {
  const charges = centsOrNull(row.chargesToOwner)
  const credits = centsOrNull(row.ownerCredits)
  const net = centsOrNull(row.netEffectDueToJj)
  if (charges == null || credits == null || net == null) return null
  if (charges < 0 || credits < 0) return null
  if (charges === 0 && credits === 0) return null
  if (net !== charges - credits) return null
  return net
}

function closingBridgeResult(lines: readonly ClosingBridgeLine[]): number | null {
  if (lines.length < 2) return null
  const last = lines[lines.length - 1]
  if (last.op !== 'equals') return null
  let running: number | null = null
  for (const line of lines) {
    const amount = centsOrNull(line.amountDueToJj)
    if (amount == null) return null
    if (line.op === 'start') {
      if (running != null) return null
      running = amount
      continue
    }
    if (running == null) return null
    if (line.op === 'add') running += amount
    else if (line.op === 'subtract') running -= amount
    else if (line.op === 'equals') {
      if (running !== amount) return null
    } else {
      return null
    }
  }
  return last.amountDueToJj
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

export function composeCertifiedPropertyAccount(
  certified: CertifiedClientSettlementAvailable,
  packsByEvidenceRef: ReadonlyMap<string, CertifiedPropertyAccountPack>,
): CertifiedPropertyAccountCompose {
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

  const properties: CertifiedPropertyAccountPage[] = []
  let lineSum = 0
  for (const line of certified.propertyLines) {
    const pack = packsByEvidenceRef.get(line.evidenceRef)
    if (!pack) return { status: 'blocked', reason: 'incomplete' }

    for (const layer of pack.contracts) {
      if (contractRemainingCents(layer) == null) {
        return { status: 'blocked', reason: 'layer' }
      }
    }
    for (const row of pack.operating) {
      if (operatingNetCents(row) == null) {
        return { status: 'blocked', reason: 'layer' }
      }
    }

    const bridgeAmount = closingBridgeResult(pack.closingBridge)
    const bridgeCents = bridgeAmount == null ? null : centsOrNull(bridgeAmount)
    const lineCents = centsOrNull(line.amountDueToJj)
    if (bridgeCents == null || lineCents == null || bridgeCents !== lineCents) {
      return { status: 'blocked', reason: 'formula' }
    }

    const strCreditRow = pack.operating.find((row) => row.category === 'str')
    if (pack.strMonths && pack.strMonths.length > 0) {
      const strTotal = strMonthsTotal(pack.strMonths)
      const expected = strCreditRow ? centsOrNull(strCreditRow.ownerCredits) : null
      if (strTotal == null || expected == null || strTotal !== expected) {
        return { status: 'blocked', reason: 'str' }
      }
    }

    lineSum += lineCents
    properties.push({
      propertyKey: line.propertyKey,
      propertyName: line.propertyName,
      displayNameHe: pack.displayNameHe,
      closingDueToJj: line.amountDueToJj,
      overallState: pack.overallState,
      contracts: pack.contracts,
      operating: pack.operating,
      closingBridge: pack.closingBridge,
      propertyPayments: pack.propertyPayments,
      explanationEn: pack.explanationEn,
      explanationHe: pack.explanationHe,
      strMonths: pack.strMonths ?? [],
    })
  }

  if (lineSum !== openingCents) return { status: 'blocked', reason: 'mismatch' }

  return {
    status: 'ready',
    statement: { certified, properties },
  }
}

export function propertyAccountDirection(
  amountDueToJj: number,
): 'client_owes_jj' | 'jj_owes_client' | 'settled' {
  if (Math.abs(amountDueToJj) < 0.005) return 'settled'
  return amountDueToJj > 0 ? 'client_owes_jj' : 'jj_owes_client'
}
