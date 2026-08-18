/**
 * Pure money aggregation + contract types (no DB, no server-only) → unit-testable.
 * The IO wrapper lives in moneyPositionService.ts.
 */

import { sumOpenEur } from './moneyMath'

export type MoneyDirection = 'RECEIVABLE_TO_JJ' | 'PAYABLE_BY_JJ' | 'SETTLED'
export type CounterpartyType =
  | 'CLIENT' | 'OWNER' | 'CASH_CUSTODIAN' | 'EMPLOYEE' | 'PARTNER' | 'SUPPLIER' | 'TENANT' | 'OTHER'

export interface MoneyPositionLineDTO {
  readonly moneyPositionId: string
  readonly direction: MoneyDirection
  readonly counterpartyCanonicalId: string | null
  readonly counterpartyName: string | null
  readonly counterpartyType: CounterpartyType
  readonly canonicalOwnerId: string | null
  readonly canonicalPropertyId: string | null
  readonly amountEur: string
  readonly originalAmountEur: string | null
  readonly settledAmountEur: string | null
  readonly openAmountEur: string
  readonly category: string
  readonly subcategory: string | null
  readonly businessReason: string | null
  readonly obligationDate: string | null
  readonly dueDate: string | null
  readonly agingDays: number | null
  readonly confidenceStatus: string | null
  readonly settlementStatus: string
  readonly sourceSystem: string
  readonly sourceReference: string
  readonly drillDownReference: unknown
  readonly asOfDate: string | null
}

export interface CounterpartyTypeBucketDTO {
  readonly counterpartyType: CounterpartyType
  readonly total: string
  readonly count: number
  readonly counterparties: number
}

export interface MoneyDirectionSummaryDTO {
  readonly total: string
  readonly count: number
  readonly counterparties: number
  readonly byCounterpartyType: readonly CounterpartyTypeBucketDTO[]
  readonly partialCertified: { readonly count: number; readonly amountEur: string }
  readonly lines: readonly MoneyPositionLineDTO[]
}

export interface UnsupportedCounterpartyTypeDTO {
  readonly counterpartyType: CounterpartyType
  readonly reason: string
}

/** Certified confidence states that are NOT "partial". */
const CONFIDENT = new Set(['OBSERVED', 'CERTIFIED'])

const KNOWN_TYPES: readonly string[] = ['CLIENT', 'OWNER', 'CASH_CUSTODIAN', 'EMPLOYEE', 'PARTNER', 'SUPPLIER', 'TENANT', 'OTHER']

export function normCounterpartyType(t: string | null | undefined): CounterpartyType {
  const u = (t ?? '').toUpperCase()
  return (KNOWN_TYPES.includes(u) ? u : 'OTHER') as CounterpartyType
}

/** Aggregate a direction's lines: total, per-type buckets, partial-certified transparency. */
export function summarizeDirection(lines: MoneyPositionLineDTO[]): MoneyDirectionSummaryDTO {
  const byType = new Map<CounterpartyType, MoneyPositionLineDTO[]>()
  for (const l of lines) {
    if (!byType.has(l.counterpartyType)) byType.set(l.counterpartyType, [])
    byType.get(l.counterpartyType)!.push(l)
  }
  const byCounterpartyType: CounterpartyTypeBucketDTO[] = Array.from(byType.entries()).map(
    ([counterpartyType, ls]) => ({
      counterpartyType,
      total: sumOpenEur(ls.map(l => l.openAmountEur)),
      count: ls.length,
      counterparties: new Set(ls.map(l => l.counterpartyCanonicalId ?? l.moneyPositionId)).size,
    }),
  )
  const partialLines = lines.filter(l => !CONFIDENT.has((l.confidenceStatus ?? '').toUpperCase()))
  return {
    total: sumOpenEur(lines.map(l => l.openAmountEur)),
    count: lines.length,
    counterparties: new Set(lines.map(l => l.counterpartyCanonicalId ?? l.moneyPositionId)).size,
    byCounterpartyType,
    partialCertified: {
      count: partialLines.length,
      amountEur: sumOpenEur(partialLines.map(l => l.openAmountEur)),
    },
    lines: Object.freeze(lines),
  }
}

export function emptyDirectionSummary(): MoneyDirectionSummaryDTO {
  return { total: '0.00', count: 0, counterparties: 0, byCounterpartyType: [], partialCertified: { count: 0, amountEur: '0.00' }, lines: [] }
}

/** Certified counterparty classes intentionally excluded from JJ receivable/payable (documented, never invented). */
export const UNSUPPORTED_COUNTERPARTY_TYPES: readonly UnsupportedCounterpartyTypeDTO[] = [
  { counterpartyType: 'PARTNER', reason: 'Partner positions are partner↔partner equity settlement (Jacob↔Yossi), not a JJ company receivable/payable. Certified partner-settlement sources disagree on amount (scope differences); requires a ratified single source.' },
  { counterpartyType: 'SUPPLIER', reason: 'No certified supplier/vendor payable source exists. Not implemented — not inferred from purchase orders/quotes.' },
  { counterpartyType: 'TENANT', reason: 'LTR obligations are empty; tenant debt economically belongs to the owner unless the certified settlement model designates JJ as creditor.' },
]
