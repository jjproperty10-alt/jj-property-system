/**
 * Hebrew client-cash settlement intent. Identity matching is entity_id only.
 * No I/O. Never executes payment.
 */

import { extractDate } from '@/lib/ops/assistant/cyprusDate'

export type CashSettlementDirection = 'JJ_TO_CLIENT' | 'CLIENT_TO_JJ'

export interface EntityChoice {
  readonly id: string
  readonly canonicalName: string
}

export interface ParsedCashSettlement {
  readonly direction: CashSettlementDirection
  readonly amount: number | null
  readonly nameQuery: string | null
  readonly needsDate: boolean
}

const JJ_PAID = /נתתי ל|שילמתי ל/
const JJ_CONTEXT = /על מה שהייתי חייב|על החוב|על החשבון/
const THEY_PAID = /שילם לנו|ששילם לי|קיבלתי מ|על החוב שלו|על מה שהוא היה חייב/

export function parseClientCashSettlementUtterance(text: string): ParsedCashSettlement | null {
  const raw = text.trim()
  if (!raw) return null
  const amountMatch = raw.match(/(\d+(?:\.\d{1,2})?)/)
  const amount = amountMatch ? Number(amountMatch[1]) : null
  let direction: CashSettlementDirection | null = null
  if (JJ_PAID.test(raw) && JJ_CONTEXT.test(raw)) {
    direction = 'JJ_TO_CLIENT'
  } else if (THEY_PAID.test(raw)) {
    direction = 'CLIENT_TO_JJ'
  }
  if (!direction) return null
  const nameMatch = raw.match(/(?:לתמיר|ל([^\s\d]{2,30})|מ([^\s\d]{2,30}))/)
  let nameQuery = nameMatch ? (nameMatch[1] || nameMatch[2] || 'תמיר') : null
  if (/תמיר/.test(raw)) nameQuery = 'תמיר'
  const needsDate = extractDate(raw) == null
  return { direction, amount: amount && amount > 0 ? amount : null, nameQuery, needsDate }
}

export function matchEntitiesByCanonicalName(
  query: string,
  entities: readonly EntityChoice[],
): EntityChoice[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return entities
    .filter((e) => e.canonicalName.toLowerCase().includes(q))
    .slice(0, 3)
}

export const CASH_SUMMARY_TITLE = 'סיכום תשלום לקוח — עדיין לא נרשם'
