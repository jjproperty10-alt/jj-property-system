/**
 * Deterministic classifier: continuation vs new transaction vs correction.
 * Pure. No I/O.
 */

export type TransactionTurnKind =
  | 'continuation'
  | 'correction'
  | 'new_transaction'
  | 'cancel'
  | 'unknown'

export const RECEIPT_VERB =
  /קיבלתי|קיבלנו|נכנס(?:\s+לי)?|שילם\s+לי|שילמו|התקבל|העביר(?:ה)?\s+לי|שולם|שכירות\s+התקבלה/i
export const EXPENSE_VERB =
  /שילמתי|שילמנו|העברתי|יצא|קניתי|שילמתי\s+עבור|שילמתי\s+ל/i
export const PAYMENT_VERB = new RegExp(
  `${RECEIPT_VERB.source}|${EXPENSE_VERB.source}|paid|received`,
  'i',
)
export const SUBJECT_HINT =
  /שכירות|שכר\s*דירה|חשמל|מים|אינטרנט|ניקיון|נקיון|שכר/i
export const CANCEL_HINT = /^(תבטל|בטל|ביטול|נתחיל מחדש|תתחיל מחדש)$/i
export const CORRECTION_HINT =
  /^(לא[,.]?\s*)?(התאריך|הסכום|זה\s+|מי שקיבל|בעצם|תבטל|נתחיל)|ולא\s+\d|לא\s+קיבלתי|לא\s+שילמתי/i

export function hasPaymentVerb(text: string): boolean {
  return PAYMENT_VERB.test(text)
}

export function hasReceiptVerb(text: string): boolean {
  return RECEIPT_VERB.test(text) && !EXPENSE_VERB.test(text)
}

export function hasExpenseVerb(text: string): boolean {
  return EXPENSE_VERB.test(text)
}

export function isStrongNewTransaction(text: string, hasAmount: boolean, hasDate: boolean, hasPropertyOrSubject: boolean): boolean {
  if (!hasPaymentVerb(text)) return false
  if (!hasAmount) return false
  return hasDate || hasPropertyOrSubject
}

export function classifyTransactionTurn(input: {
  readonly hasExistingProposal: boolean
  readonly awaitingField: string | null
  readonly message: string
  readonly hasAmount: boolean
  readonly hasDate: boolean
  readonly hasPropertyOrSubject: boolean
}): TransactionTurnKind {
  const trimmed = input.message.trim()
  if (!trimmed) return 'continuation'
  if (CANCEL_HINT.test(trimmed) || trimmed === 'נתחיל מחדש') return 'cancel'
  if (isStrongNewTransaction(trimmed, input.hasAmount, input.hasDate, input.hasPropertyOrSubject)) {
    if (input.hasExistingProposal) return 'new_transaction'
    return 'continuation'
  }
  if (input.hasExistingProposal && CORRECTION_HINT.test(trimmed)) return 'correction'
  if (!input.hasExistingProposal) return 'continuation'
  if (looksLikeDirectAnswer(input.awaitingField, trimmed)) return 'continuation'
  if (hasPaymentVerb(trimmed) && input.hasExistingProposal) return 'unknown'
  return 'continuation'
}

function looksLikeDirectAnswer(field: string | null, text: string): boolean {
  if (!field) return false
  if (/^[1-3]([.)]|$)/.test(text)) return true
  if (text === 'משהו אחר' || text === 'אני לא יודע' || text === 'בלי נכס') return true
  if (field === 'intent') return /עסקה חדשה|תיקון|ביטול/.test(text)
  if (field === 'date' && text.length <= 24 && !hasPaymentVerb(text)) return true
  if (field === 'amountEur' && /^\d+(?:[.,]\d{1,2})?$/.test(text)) return true
  if (text.length <= 40 && !hasPaymentVerb(text) && !SUBJECT_HINT.test(text)) return true
  return false
}
