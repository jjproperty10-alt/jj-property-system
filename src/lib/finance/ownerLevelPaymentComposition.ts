/**
 * Pure owner-level payment composition.
 *
 * Property-linked BPOs continue to be counted by RC3 / property settlement.
 * Owner-level linked payments are added once at owner settlement.
 * A row with BOTH a property association AND an owner link is NEEDS REVIEW
 * and is not counted here (fail closed — no double count).
 */

import {
  DuplicateActiveOwnerLinkError,
  DuplicateIdempotencyError,
  OWNER_TRANSACTION_LINKS_ACCESS,
  UnauthorizedClientWriteError,
  type OwnerLevelCompositionInput,
  type OwnerLevelCompositionResult,
  type OwnerLevelPaymentCandidate,
  type OwnerLevelPaymentRow,
  type OwnerLinkReviewStatus,
} from './ownerLevelPaymentTypes'
import { assertOwnerLinkRpcAuthorized, type JwtDbRole } from './ownerLevelRpcAuth'

export function roundEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function canonicalPartnerPayer(payer: string): 'Jacob' | 'Yossi' | null {
  const p = payer.trim().toLowerCase()
  if (p === 'jacob' || p === 'yaacov' || p === 'yaakov') return 'Jacob'
  if (p === 'yossi') return 'Yossi'
  return null
}

export function isOwnerLevelBpoShape(c: Pick<OwnerLevelPaymentCandidate, 'category' | 'subcategory'>): boolean {
  return c.category === 'Management' && c.subcategory === 'Bank Payment to Owner'
}

export function hasPropertyAssociation(
  c: Pick<OwnerLevelPaymentCandidate, 'propertyId' | 'propertyName'>,
): boolean {
  return c.propertyId != null || (c.propertyName != null && c.propertyName !== '')
}

export function isCountableOwnerLevelPayment(
  c: OwnerLevelPaymentCandidate,
  opts: { ownerEntityId?: string; periodStart?: string | null; periodEnd?: string | null } = {},
): boolean {
  if (c.isDeletedLink) return false
  if (c.isDeletedTransaction) return false
  if (c.transactionReviewStatus != null && c.transactionReviewStatus !== 'active') return false
  if (c.linkRole !== 'owner_level_payment') return false
  if (c.reviewStatus !== 'approved') return false
  if (!isOwnerLevelBpoShape(c)) return false
  if (hasPropertyAssociation(c)) return false
  if (!c.ownerEntityId) return false
  if (c.amountEur <= 0) return false
  if (opts.ownerEntityId && c.ownerEntityId !== opts.ownerEntityId) return false
  if (c.transactionLinkedOwnerEntityId && c.transactionLinkedOwnerEntityId !== c.ownerEntityId) return false
  if (opts.periodStart && c.date < opts.periodStart) return false
  if (opts.periodEnd && c.date > opts.periodEnd) return false
  return true
}

export function isOwnerLevelConflict(c: OwnerLevelPaymentCandidate): boolean {
  return !c.isDeletedLink && c.linkRole === 'owner_level_payment' && hasPropertyAssociation(c)
}

export function isOwnerMismatch(c: OwnerLevelPaymentCandidate): boolean {
  return Boolean(
    !c.isDeletedLink &&
      c.transactionLinkedOwnerEntityId &&
      c.transactionLinkedOwnerEntityId !== c.ownerEntityId,
  )
}

export function isNonPositiveOwnerLevelAmount(c: OwnerLevelPaymentCandidate): boolean {
  return !c.isDeletedLink && c.linkRole === 'owner_level_payment' && c.amountEur <= 0
}

export function isExcludedFromStr(c: OwnerLevelPaymentCandidate): boolean {
  if (c.linkRole === 'owner_level_payment' && !c.isDeletedLink) return true
  if (!c.propertyName) return true
  if (c.category !== 'Airbnb') return true
  return false
}

export function isExcludedFromLtr(c: OwnerLevelPaymentCandidate): boolean {
  if (c.linkRole === 'owner_level_payment' && !c.isDeletedLink) return true
  if (!c.propertyName) return true
  return false
}

export function isExcludedFromPropertyPl(c: OwnerLevelPaymentCandidate): boolean {
  if (c.linkRole === 'owner_level_payment' && !c.isDeletedLink) return true
  return !hasPropertyAssociation(c)
}

/** RC3 owner_credit: positive = JJ owes owner. Owner-level BPO reduces that credit. */
export function applyOwnerLevelBpoToRc3Net(rc3NetEur: number, bpoAmountEur: number): number {
  return roundEur(rc3NetEur - bpoAmountEur)
}

/**
 * v_contact_settlement_summary.net_jj_settlement:
 *   positive = owner owes JJ, negative = JJ owes owner.
 * Owner-level BPO reduces what JJ owes → net_jj moves toward zero from below.
 */
export function applyOwnerLevelBpoToNetJjSettlement(netJjSettlementEur: number, bpoAmountEur: number): number {
  return roundEur(netJjSettlementEur + bpoAmountEur)
}

export function jjPnLDeltaForOwnerLevelPayment(): 0 {
  return 0
}

function toRow(c: OwnerLevelPaymentCandidate): OwnerLevelPaymentRow {
  return {
    transactionId: c.transactionId,
    ownerEntityId: c.ownerEntityId,
    ownerCanonicalName: c.ownerCanonicalName,
    date: c.date,
    payer: c.payer,
    payee: c.payee,
    amountEur: c.amountEur,
    description: c.description,
    idempotencyKey: c.idempotencyKey,
    reviewStatus: c.reviewStatus,
  }
}

/**
 * Compose owner settlement with owner-level payments.
 * Countable payments are unique by transactionId (first wins; duplicates are not re-added).
 */
export function composeOwnerLevelSettlement(
  input: OwnerLevelCompositionInput,
): OwnerLevelCompositionResult {
  const scope = {
    ownerEntityId: input.ownerEntityId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  }
  const forOwner = input.candidates.filter(c => c.ownerEntityId === input.ownerEntityId)
  const needsReview = [
    ...forOwner.filter(isOwnerLevelConflict).map(c => ({
      transactionId: c.transactionId,
      reason: 'property_and_owner_link' as const,
    })),
    ...forOwner.filter(isOwnerMismatch).map(c => ({
      transactionId: c.transactionId,
      reason: 'owner_mismatch' as const,
    })),
    ...forOwner.filter(isNonPositiveOwnerLevelAmount).map(c => ({
      transactionId: c.transactionId,
      reason: 'non_positive_amount' as const,
    })),
  ]

  const seenTx = new Set<string>()
  const countable: OwnerLevelPaymentRow[] = []
  for (const c of forOwner) {
    if (!isCountableOwnerLevelPayment(c, scope)) continue
    if (seenTx.has(c.transactionId)) continue
    seenTx.add(c.transactionId)
    countable.push(toRow(c))
  }

  const countableTotalEur = roundEur(countable.reduce((s, r) => s + r.amountEur, 0))
  const dueToOwnerEur = applyOwnerLevelBpoToRc3Net(input.propertyLevelDueToOwnerEur, countableTotalEur)

  let jacobClearingDeltaEur = 0
  for (const row of countable) {
    if (canonicalPartnerPayer(row.payer) === 'Jacob') {
      jacobClearingDeltaEur = roundEur(jacobClearingDeltaEur + row.amountEur)
    }
  }

  return {
    ownerEntityId: input.ownerEntityId,
    ownerCanonicalName: countable[0]?.ownerCanonicalName ?? forOwner[0]?.ownerCanonicalName ?? null,
    countable,
    countableTotalEur,
    countedTransactionIds: countable.map(r => r.transactionId),
    dueToOwnerEur,
    dueToOwnerDeltaEur: roundEur(-countableTotalEur),
    jacobClearingEur: roundEur(input.jacobClearingEur + jacobClearingDeltaEur),
    jacobClearingDeltaEur,
    jjPnLDeltaEur: jjPnLDeltaForOwnerLevelPayment(),
    propertyDeltas: input.propertyBalances.map(p => ({ propertyName: p.propertyName, dueToOwnerEur: 0 })),
    needsReview,
    excludedFromStr: true,
    excludedFromLtr: true,
    excludedFromPropertyPl: true,
  }
}

/** Historical property-linked BPO still reduces that property — owner link is not required. */
export function applyPropertyLinkedBpo(
  propertyDueEur: number,
  bpoAmountEur: number,
): number {
  return roundEur(propertyDueEur - bpoAmountEur)
}

export interface FinancialPositionSlice {
  readonly paidToOwnerEur: string | null
  readonly netEur: string | null
  readonly closingBalanceEur: string | null
}

function addEur(base: string | null, delta: number): string | null {
  if (base == null) return delta === 0 ? null : String(roundEur(delta))
  const n = Number(base)
  if (!Number.isFinite(n)) return base
  return String(roundEur(n + delta))
}

/**
 * Overlay countable owner-level BPOs onto an already-composed owner position.
 * `settlement` convention = v_contact_settlement_summary.net_jj_settlement.
 * `rc3` convention = computeNetOwnerBalance (positive = JJ owes owner).
 */
export function applyOwnerLevelToPosition(
  position: FinancialPositionSlice,
  composed: OwnerLevelCompositionResult,
  closingConvention: 'rc3' | 'settlement',
): FinancialPositionSlice {
  const paid = addEur(position.paidToOwnerEur, composed.countableTotalEur)
  if (composed.countableTotalEur === 0 && composed.needsReview.length === 0) {
    return { ...position, paidToOwnerEur: paid }
  }
  if (closingConvention === 'settlement') {
    const closing = position.closingBalanceEur == null
      ? null
      : String(applyOwnerLevelBpoToNetJjSettlement(Number(position.closingBalanceEur), composed.countableTotalEur))
    return { ...position, paidToOwnerEur: paid, closingBalanceEur: closing }
  }
  const net = position.netEur == null
    ? null
    : String(applyOwnerLevelBpoToRc3Net(Number(position.netEur), composed.countableTotalEur))
  const closing = position.closingBalanceEur == null
    ? net
    : String(applyOwnerLevelBpoToRc3Net(Number(position.closingBalanceEur), composed.countableTotalEur))
  return { ...position, paidToOwnerEur: paid, netEur: net, closingBalanceEur: closing }
}

export function canRoleWriteOwnerLinks(role: 'anon' | 'authenticated' | 'service_role'): boolean {
  const access = OWNER_TRANSACTION_LINKS_ACCESS[role]
  return access.insert || access.execute_write_rpc
}

export function canRoleReadOwnerLinks(role: 'anon' | 'authenticated' | 'service_role'): boolean {
  const access = OWNER_TRANSACTION_LINKS_ACCESS[role]
  return access.select || access.execute_read_rpc
}

export function assertClientWriteAllowed(role: 'anon' | 'authenticated' | 'service_role'): void {
  if (!canRoleWriteOwnerLinks(role)) {
    throw new UnauthorizedClientWriteError(role)
  }
}

interface StoredLink {
  id: string
  transactionId: string
  ownerEntityId: string
  idempotencyKey: string
  isDeleted: boolean
  reviewStatus: OwnerLinkReviewStatus
  propertyId: string | null
  propertyName: string | null
}

/**
 * In-memory mirror of finance.owner_transaction_links constraints.
 * Used by unit tests; never talks to Production.
 */
export class OwnerTransactionLinkStore {
  private readonly byId = new Map<string, StoredLink>()
  private seq = 0

  insert(input: {
    transactionId: string
    ownerEntityId: string
    idempotencyKey: string
    propertyId?: string | null
    propertyName?: string | null
    jwtRole?: JwtDbRole
    staffRole?: string | null
    spoofedRoleParam?: string | null
    createdBy?: string | null
    role?: 'anon' | 'authenticated' | 'service_role'
  }): StoredLink {
    assertOwnerLinkRpcAuthorized({
      jwtRole: input.jwtRole ?? input.role ?? 'service_role',
      staffRole: input.staffRole,
      spoofedRoleParam: input.spoofedRoleParam,
      createdBy: input.createdBy,
    })

    for (const existing of Array.from(this.byId.values())) {
      if (existing.idempotencyKey === input.idempotencyKey) {
        throw new DuplicateIdempotencyError(input.idempotencyKey)
      }
      if (!existing.isDeleted && existing.transactionId === input.transactionId) {
        throw new DuplicateActiveOwnerLinkError(input.transactionId)
      }
    }

    const propertyId = input.propertyId ?? null
    const propertyName = input.propertyName ?? null
    const reviewStatus: OwnerLinkReviewStatus =
      propertyId != null || (propertyName != null && propertyName !== '')
        ? 'needs_review'
        : 'approved'

    this.seq += 1
    const row: StoredLink = {
      id: `link-${this.seq}`,
      transactionId: input.transactionId,
      ownerEntityId: input.ownerEntityId,
      idempotencyKey: input.idempotencyKey,
      isDeleted: false,
      reviewStatus,
      propertyId,
      propertyName,
    }
    this.byId.set(row.id, row)
    return row
  }

  softDelete(id: string): void {
    const row = this.byId.get(id)
    if (!row || row.isDeleted) return
    this.byId.set(id, { ...row, isDeleted: true })
  }

  active(): StoredLink[] {
    return Array.from(this.byId.values()).filter(r => !r.isDeleted)
  }
}
