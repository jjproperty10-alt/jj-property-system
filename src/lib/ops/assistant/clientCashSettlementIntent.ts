/**
 * Hebrew client-cash settlement intent. Identity matching is entity_id only.
 * Never infers funding source from "אני", "שילמתי", or the logged-in user.
 * No I/O. Never executes payment.
 */

import { extractDate } from '@/lib/ops/assistant/cyprusDate'

export type CashSettlementDirection = 'JJ_TO_CLIENT' | 'CLIENT_TO_JJ'
export type SettlementFundingSource = 'UNKNOWN' | 'JJ' | 'PARTNER_PERSONAL'

export interface EntityChoice {
  readonly id: string
  readonly canonicalName: string
}

export interface ParsedCashSettlement {
  readonly direction: CashSettlementDirection
  readonly amount: number | null
  readonly nameQuery: string | null
  readonly needsDate: boolean
  readonly fundingSource: SettlementFundingSource
  readonly partnerNameQuery: string | null
}

const PAY_TO_CLIENT = /נתתי ל|שילמתי ל|שילם ל/
const JJ_CONTEXT = /על מה שהייתי חייב|על מה שהיינו חייבים|על החוב|על החשבון/
const THEY_PAID = /שילם לנו|ששילם לי|קיבלתי מ|על החוב שלו|על מה שהוא היה חייב/
const PERSONAL_FUNDS = /מהכסף הפרטי|מכסף פרטי|כסף פרטי/
const JJ_FUNDS = /מחשבון או מקופת|מקופת JJ|מחשבון JJ|מקופת החברה|מחשבון החברה/
const NAMED_PAYER = /(יוסי|יעקב|יעקוב|Jacob|Yossi)\s+שילם/

export function parseClientCashSettlementUtterance(text: string): ParsedCashSettlement | null {
  const raw = text.trim()
  if (!raw) return null
  const amountMatch = raw.match(/(\d+(?:\.\d{1,2})?)/)
  const amount = amountMatch ? Number(amountMatch[1]) : null
  let direction: CashSettlementDirection | null = null
  if (THEY_PAID.test(raw)) {
    direction = 'CLIENT_TO_JJ'
  } else if (PAY_TO_CLIENT.test(raw) || JJ_CONTEXT.test(raw) || PERSONAL_FUNDS.test(raw)) {
    direction = 'JJ_TO_CLIENT'
  }
  if (!direction) return null
  const nameMatch = raw.match(/(?:לתמיר|ל([^\s\d]{2,30})|מ([^\s\d]{2,30}))/)
  let nameQuery = nameMatch ? (nameMatch[1] || nameMatch[2] || 'תמיר') : null
  if (/תמיר/.test(raw)) nameQuery = 'תמיר'
  let fundingSource: SettlementFundingSource = 'UNKNOWN'
  if (PERSONAL_FUNDS.test(raw)) fundingSource = 'PARTNER_PERSONAL'
  else if (JJ_FUNDS.test(raw)) fundingSource = 'JJ'
  const named = raw.match(NAMED_PAYER)
  const partnerNameQuery = named ? named[1] : null
  const needsDate = extractDate(raw) == null
  return {
    direction,
    amount: amount && amount > 0 ? amount : null,
    nameQuery,
    needsDate,
    fundingSource,
    partnerNameQuery,
  }
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
export const PERSONAL_SUMMARY_TITLE = 'סיכום תשלום מכסף פרטי — עדיין לא נרשם'
export const FUNDING_QUESTION = 'מאיזה כסף בוצע התשלום?'
export const FUNDING_CHOICE_JJ = 'מחשבון או מקופת JJ'
export const FUNDING_CHOICE_PERSONAL = 'מכסף פרטי של שותף'
export const FUNDING_CHOICE_CANCEL = 'ביטול'
