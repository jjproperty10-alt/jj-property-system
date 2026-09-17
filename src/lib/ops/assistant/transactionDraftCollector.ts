/**
 * Pure transaction-draft slot collector.
 * Proposed values are never financial truth. No I/O.
 */

import { CATEGORIES, CATEGORY_SUBCATEGORIES, KNOWN_PAYEES, type Category } from '@/types'
import {
  formatHebrewReviewDate,
  hasExplicitNumericDate,
  nicosiaToday,
  parseCyprusDate,
  stripDateSpans,
} from '@/lib/ops/assistant/cyprusDate'
import {
  CANCEL_HINT,
  classifyTransactionTurn,
  CORRECTION_HINT,
  EXPENSE_VERB,
  hasExpenseVerb,
  hasReceiptVerb,
  PAYMENT_VERB,
  SUBJECT_HINT,
} from '@/lib/ops/assistant/transactionTurn'

export { extractDate, nicosiaToday, nicosiaShift } from '@/lib/ops/assistant/cyprusDate'
export { classifyTransactionTurn } from '@/lib/ops/assistant/transactionTurn'

export const ASSISTANT_CAPABILITY_LABEL = 'הכנת טיוטת עסקה'
export const UNSUPPORTED_CAPABILITY_MESSAGE =
  'כרגע אני יודע להכין טיוטת עסקה. בהמשך אחבר מסמכים, מיילים ודוחות.'
export const NEW_TRANSACTION_NOTICE = 'הבנתי, מתחילים עסקה חדשה.'
export const UNSAVED_PREVIOUS_NOTICE = 'העסקה הקודמת לא נשמרה.'
export const INTENT_PROMPT = 'זו עסקה חדשה או תיקון לפרטים הקודמים?'

export interface PropertyCatalogEntry {
  readonly id: string
  readonly name: string
}

export type SlotStatus = 'unknown' | 'proposed' | 'confirmed'

export interface Slot<T> {
  readonly status: SlotStatus
  readonly value: T | undefined
}

export interface DraftSlots {
  readonly date: Slot<string>
  readonly propertyName: Slot<string | null>
  readonly category: Slot<string>
  readonly subcategory: Slot<string>
  readonly description: Slot<string>
  readonly payer: Slot<string>
  readonly payee: Slot<string>
  readonly amountEur: Slot<string>
  readonly clientCharge: Slot<string | null>
  readonly notes: Slot<string>
}

export interface NumberedChoice {
  readonly id: string
  readonly label: string
}

export type AssistantPrompt =
  | {
      readonly kind: 'unsupported'
      readonly message: string
    }
  | {
      readonly kind: 'question'
      readonly field: AssistantField
      readonly prompt: string
      readonly choices: readonly NumberedChoice[]
      readonly searchProperties: boolean
      readonly allowOther: boolean
      readonly allowUnknown: boolean
    }
  | {
      readonly kind: 'ready'
      readonly summary: DraftReview
    }

export type AssistantField =
  | 'date'
  | 'propertyName'
  | 'category'
  | 'subcategory'
  | 'description'
  | 'payer'
  | 'payee'
  | 'amountEur'
  | 'clientCharge'
  | 'notes'
  | 'intent'

export interface DraftReview {
  readonly date: string
  readonly property: string
  readonly category: string
  readonly subcategory: string
  readonly description: string
  readonly payer: string
  readonly payee: string
  readonly amount: string
  readonly clientCharge: string
  readonly notes: string
}

export interface CollectorContext {
  readonly catalog: readonly PropertyCatalogEntry[]
  readonly staffPayerName: string | null
  readonly now?: Date
  readonly freshIdempotencyKey?: string
}

export interface CollectorState {
  readonly slots: DraftSlots
  readonly lastPrompt: AssistantPrompt
  readonly draftIdempotencyKey: string
  readonly createdDraftId: string | null
  readonly reviewDismissed: boolean
  readonly hintText: string
  readonly preface: string
  readonly pendingMessage: string
}

const EMPTY_SLOT: Slot<never> = { status: 'unknown', value: undefined }

function unknownSlot<T>(): Slot<T> {
  return EMPTY_SLOT as Slot<T>
}

export function emptySlots(): DraftSlots {
  return {
    date: unknownSlot(),
    propertyName: unknownSlot(),
    category: unknownSlot(),
    subcategory: unknownSlot(),
    description: unknownSlot(),
    payer: unknownSlot(),
    payee: unknownSlot(),
    amountEur: unknownSlot(),
    clientCharge: unknownSlot(),
    notes: unknownSlot(),
  }
}

const PAYMENT_HINT =
  /שילמתי|שילמנו|קיבלתי|קיבלנו|שולם|העברתי|העביר|נכנס|התקבל|קניתי|הוצאה|הכנסה|טיוט|חשמל|מים|אינטרנט|שכירות|שכר\s*דירה|ניקיון|נקיון|אירו|יורו|\beuro\b|\beur\b|€|paid|received|draft/i
const UNSUPPORTED_HINT =
  /מייל|אימייל|e-mail|\bmail\b|וואטסאפ|מסמך|\bdocuments?\b|דוח|\breports?\b|חוזה|\bcontracts?\b|אחסון/i
const OTHER_CURRENCY =
  /\$|₪|ש["׳']?ח|dollar|usd|shekel|ils|lira|gbp|£/i

const PERSON_HINTS: readonly { readonly he: string; readonly en: string }[] = [
  { he: 'תמיר', en: 'tamir' },
  { he: 'לירון', en: 'liron' },
  { he: 'אלון', en: 'alon' },
  { he: 'אורן', en: 'oren' },
  { he: 'רוני', en: 'roni' },
  { he: 'יוסי', en: 'yossi' },
  { he: 'יעקב', en: 'jacob' },
]

const PROPERTY_ALIASES: readonly { readonly test: RegExp; readonly mustInclude: readonly string[] }[] = [
  { test: /לירון\s*ו?\s*אלון|liron\s+and\s+alon|liron\s+alon/i, mustInclude: ['liron', 'alon'] },
  { test: /רוני|\broni\b/i, mustInclude: ['roni'] },
]

const KEYWORD_SUBCATEGORIES: readonly { readonly re: RegExp; readonly names: readonly string[] }[] = [
  { re: /חשמל|electric/i, names: ['Electricity', 'Electricity Bill'] },
  { re: /מים|water/i, names: ['Water'] },
  { re: /אינטרנט|internet/i, names: ['Internet'] },
  { re: /שכירות|שכר\s*דירה|rent/i, names: ['Office Rent', 'Tenant Payment'] },
  { re: /ניקיון|נקיון|cleaning/i, names: ['Cleaning', 'Cleaning Supplies'] },
  { re: /ביטוח|insurance/i, names: ['Insurance', 'Property Insurance'] },
]

const CHOICE_OTHER = 'other'
const CHOICE_UNKNOWN = 'unknown'
const CHOICE_NONE = 'none'
const CHOICE_NO_PROPERTY = 'no_property'
const INTENT_NEW = 'intent:new'
const INTENT_FIX = 'intent:fix'
const INTENT_CANCEL = 'intent:cancel'

export function isUnsupportedCapability(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return UNSUPPORTED_HINT.test(t) && !PAYMENT_HINT.test(t)
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\sa-z0-9\u0590-\u05ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function personTokensFromText(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens: string[] = []
  const seen: Record<string, true> = {}
  for (let h = 0; h < PERSON_HINTS.length; h += 1) {
    const hint = PERSON_HINTS[h]
    if (text.indexOf(hint.he) >= 0 || lower.indexOf(hint.en) >= 0) {
      if (!seen[hint.en]) {
        seen[hint.en] = true
        tokens.push(hint.en)
      }
    }
  }
  return tokens
}

function catalogHitsForTokens(
  tokens: readonly string[],
  catalog: readonly PropertyCatalogEntry[],
): PropertyCatalogEntry[] {
  if (tokens.length === 0) return []
  return catalog.filter((p) => {
    const name = p.name.toLowerCase()
    for (let i = 0; i < tokens.length; i += 1) {
      if (name.indexOf(tokens[i]) < 0) return false
    }
    return true
  })
}

export type PropertyResolution =
  | { readonly kind: 'unique'; readonly entry: PropertyCatalogEntry }
  | { readonly kind: 'ambiguous'; readonly entries: readonly PropertyCatalogEntry[] }
  | { readonly kind: 'none' }

export function resolveProperty(
  text: string,
  catalog: readonly PropertyCatalogEntry[],
): PropertyResolution {
  const raw = text.trim()
  if (!raw || catalog.length === 0) return { kind: 'none' }
  const normalized = normalizeName(raw)

  const exact = catalog.filter((p) => normalizeName(p.name) === normalized)
  if (exact.length === 1) return { kind: 'unique', entry: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', entries: uniqueByName(exact) }

  for (let a = 0; a < PROPERTY_ALIASES.length; a += 1) {
    const alias = PROPERTY_ALIASES[a]
    if (!alias.test.test(raw)) continue
    const hits = uniqueByName(catalogHitsForTokens(alias.mustInclude, catalog))
    if (hits.length === 1) return { kind: 'unique', entry: hits[0] }
    if (hits.length > 1) return { kind: 'ambiguous', entries: hits }
  }

  const personTokens = personTokensFromText(raw)
  if (personTokens.length >= 2) {
    const both = uniqueByName(catalogHitsForTokens(personTokens, catalog))
    if (both.length === 1) return { kind: 'unique', entry: both[0] }
    if (both.length > 1) return { kind: 'ambiguous', entries: both }
  }

  const fuzzy = matchProperties(raw, catalog)
  if (fuzzy.length === 1 && personTokens.length >= 1) {
    const name = fuzzy[0].name.toLowerCase()
    let allPresent = true
    for (let i = 0; i < personTokens.length; i += 1) {
      if (name.indexOf(personTokens[i]) < 0) {
        allPresent = false
        break
      }
    }
    if (allPresent) return { kind: 'unique', entry: fuzzy[0] }
  }
  if (fuzzy.length === 1) {
    return { kind: 'ambiguous', entries: fuzzy }
  }
  if (fuzzy.length > 1) return { kind: 'ambiguous', entries: fuzzy }
  return { kind: 'none' }
}

export function matchProperties(
  text: string,
  catalog: readonly PropertyCatalogEntry[],
): PropertyCatalogEntry[] {
  const raw = text.trim()
  if (!raw || catalog.length === 0) return []
  const lower = raw.toLowerCase()

  const exact = catalog.filter((p) => p.name.toLowerCase() === lower)
  if (exact.length === 1) return exact

  const tokens: string[] = []
  const seen: Record<string, true> = {}
  const parts = lower.replace(/[^a-z0-9\u0370-\u03ff\u0590-\u05ff]+/g, ' ').split(' ')
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    if (part.length >= 3 && !seen[part]) {
      seen[part] = true
      tokens.push(part)
    }
  }
  for (let h = 0; h < PERSON_HINTS.length; h += 1) {
    const hint = PERSON_HINTS[h]
    if (raw.indexOf(hint.he) >= 0 || lower.indexOf(hint.en) >= 0) {
      if (!seen[hint.en]) {
        seen[hint.en] = true
        tokens.push(hint.en)
      }
    }
  }

  const hits = catalog.filter((p) => {
    const name = p.name.toLowerCase()
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]
      if (name.indexOf(token) >= 0 || token.indexOf(name) >= 0) return true
    }
    return false
  })
  return uniqueByName(hits)
}

function uniqueByName(rows: readonly PropertyCatalogEntry[]): PropertyCatalogEntry[] {
  const seen: Record<string, true> = {}
  const out: PropertyCatalogEntry[] = []
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const key = row.name.toLowerCase()
    if (seen[key]) continue
    seen[key] = true
    out.push(row)
  }
  return out
}

function categoriesForSubcategory(sub: string): Category[] {
  return CATEGORIES.filter((c) => (CATEGORY_SUBCATEGORIES[c] ?? []).includes(sub))
}

export function extractAmountEur(text: string): string | 'other_currency' | null {
  if (OTHER_CURRENCY.test(text) && !/(€|euro|eur|אירו|יורו)/i.test(text)) {
    return 'other_currency'
  }
  const labeled = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?|eur|אירו|יורו)(?=$|[\s,.]|[^0-9A-Za-z])/i)
  if (labeled) return normalizeAmount(labeled[1])
  const prefix = text.match(/€\s*(\d+(?:[.,]\d{1,2})?)/)
  if (prefix) return normalizeAmount(prefix[1])

  const forScan = stripDateSpans(text)
    .replace(/וללקוח\s+\d+(?:[.,]\d{1,2})?/g, ' ')
    .replace(/חייב(?:תי|ה)?\s+את\s+הלקוח\s+\d+(?:[.,]\d{1,2})?/g, ' ')

  const ala = forScan.match(/עלה\s+(\d+(?:[.,]\d{1,2})?)/)
  if (ala) return normalizeAmount(ala[1])

  const amountPhrase = forScan.match(/הסכום\s+(\d+(?:[.,]\d{1,2})?)/)
  if (amountPhrase) return normalizeAmount(amountPhrase[1])

  if (PAYMENT_VERB.test(text) || /הסכום/.test(text)) {
    const nums = forScan.match(/(\d+(?:[.,]\d{1,2})?)/g)
    if (nums && nums.length >= 1) return normalizeAmount(nums[0])
  }
  return null
}

function extractClientCharge(text: string): string | null | undefined {
  if (extractExplicitNoneClientCharge(text)) return null
  const charged = text.match(/וללקוח\s+(\d+(?:[.,]\d{1,2})?)/)
    || text.match(/חייב(?:תי|ה)?\s+את\s+הלקוח\s+(\d+(?:[.,]\d{1,2})?)/)
  if (charged) return normalizeAmount(charged[1])
  return undefined
}

function normalizeAmount(raw: string): string {
  const n = Number(raw.replace(',', '.'))
  if (!Number.isFinite(n)) return raw
  return String(n)
}

function extractExplicitNoneClientCharge(text: string): boolean {
  return /אין חיוב|בלי חיוב|לא לחייב|client charge\s*(none|null|0)\b|no client charge/i.test(text)
}

function extractKnownPayee(text: string): string | null {
  if (/ל(?:-)?פאבי|ל(?:-)?פבי|\bfabi\b|פאבי|פבי/i.test(text)) return 'Fabi'
  const known = KNOWN_PAYEES
  for (let i = 0; i < known.length; i += 1) {
    const name = known[i]
    const re = new RegExp(`\\b${name}\\b`, 'i')
    if (re.test(text)) return name
  }
  if (/לחברת?\s*jj|ל־?jj\b/i.test(text)) return 'JJ'
  if (/ליוסי|זה יוסי|המקבל(?:\s+זה)?\s+יוסי/.test(text)) return 'Yossi'
  if (/ליעקב|זה יעקב/.test(text)) return 'Jacob'
  return null
}

function paidByStaff(text: string): boolean {
  return EXPENSE_VERB.test(text) || /\bi paid\b/i.test(text)
}

function tenantPaid(text: string): boolean {
  return /הדייר|דייר\s+שילם|שילם\s+לי/.test(text)
}

function isRentSubject(text: string): boolean {
  return /שכירות|שכר\s*דירה|rent/i.test(text)
}

function isUtility(text: string): 'Electricity' | 'Water' | 'Internet' | null {
  if (/חשמל|electric/i.test(text)) return 'Electricity'
  if (/מים|water/i.test(text)) return 'Water'
  if (/אינטרנט|internet/i.test(text)) return 'Internet'
  return null
}

function isCleaning(text: string): boolean {
  return /ניקיון|נקיון|cleaning/i.test(text)
}

function setSlot<T>(current: Slot<T>, value: T): Slot<T> {
  if (current.status === 'confirmed') return current
  return { status: 'proposed', value }
}

function overwriteSlot<T>(_current: Slot<T>, value: T): Slot<T> {
  return { status: 'proposed', value }
}

function confirm<T>(value: T): Slot<T> {
  return { status: 'confirmed', value }
}

function slotReady<T>(slot: Slot<T>): boolean {
  return slot.status !== 'unknown' && slot.value !== undefined
}

export function hasProposal(slots: DraftSlots): boolean {
  return (
    slots.date.status !== 'unknown'
    || slots.propertyName.status !== 'unknown'
    || slots.category.status !== 'unknown'
    || slots.subcategory.status !== 'unknown'
    || slots.description.status !== 'unknown'
    || slots.payer.status !== 'unknown'
    || slots.payee.status !== 'unknown'
    || slots.amountEur.status !== 'unknown'
    || slots.clientCharge.status !== 'unknown'
    || slots.notes.status !== 'unknown'
  )
}

export function reviewFromSlots(slots: DraftSlots): DraftReview {
  return {
    date: formatHebrewReviewDate(slots.date.value),
    property: slots.propertyName.value == null ? 'ללא נכס' : slots.propertyName.value,
    category: slots.category.value ?? '—',
    subcategory: slots.subcategory.value ?? '—',
    description: slots.description.value ?? '—',
    payer: slots.payer.value ?? '—',
    payee: slots.payee.value ?? '—',
    amount: formatEuro(slots.amountEur.value),
    clientCharge: slots.clientCharge.value == null ? 'ללא / NULL' : formatEuro(slots.clientCharge.value),
    notes: slots.notes.value ?? '—',
  }
}

function formatEuro(value: string | undefined): string {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return `\u20AC${n.toFixed(2)}`
}

export function isDraftComplete(slots: DraftSlots): boolean {
  return (
    slotReady(slots.date) &&
    slotReady(slots.propertyName) &&
    slotReady(slots.category) &&
    slotReady(slots.subcategory) &&
    slotReady(slots.description) &&
    slotReady(slots.payer) &&
    slotReady(slots.payee) &&
    slotReady(slots.amountEur) &&
    slotReady(slots.clientCharge)
  )
}

function applyClosedSemantics(slots: DraftSlots, text: string, ctx: CollectorContext, force = false): DraftSlots {
  let next = { ...slots }
  const assign = force ? overwriteSlot : setSlot

  if (hasReceiptVerb(text) && isRentSubject(text)) {
    next = {
      ...next,
      category: assign(next.category, 'Management'),
      subcategory: assign(next.subcategory, 'Tenant Payment'),
      payer: assign(next.payer, 'Tenant'),
    }
    if (next.clientCharge.status === 'unknown') {
      next = { ...next, clientCharge: assign(next.clientCharge, null) }
    }
    if (!next.description.value) {
      next = { ...next, description: assign(next.description, 'rent payment / שכירות') }
    }
  } else if (hasExpenseVerb(text) && isUtility(text)) {
    const sub = isUtility(text) as string
    next = {
      ...next,
      category: assign(next.category, 'Management'),
      subcategory: assign(next.subcategory, sub),
    }
    if (paidByStaff(text) && ctx.staffPayerName) {
      next = { ...next, payer: assign(next.payer, ctx.staffPayerName) }
    }
  } else if (hasExpenseVerb(text) && isCleaning(text)) {
    next = {
      ...next,
      category: assign(next.category, 'Management'),
      subcategory: assign(next.subcategory, 'Cleaning'),
    }
    if (paidByStaff(text) && ctx.staffPayerName) {
      next = { ...next, payer: assign(next.payer, ctx.staffPayerName) }
    }
  } else if (tenantPaid(text) && hasReceiptVerb(text)) {
    next = { ...next, payer: assign(next.payer, 'Tenant') }
  }

  const client = extractClientCharge(text)
  if (client !== undefined) {
    next = { ...next, clientCharge: assign(next.clientCharge, client) }
  }

  return next
}

function applyUtterance(slots: DraftSlots, text: string, ctx: CollectorContext, force = false): DraftSlots {
  let next = { ...slots }
  const now = ctx.now ?? new Date()
  const assign = force ? overwriteSlot : setSlot

  const amount = extractAmountEur(text)
  if (amount && amount !== 'other_currency') {
    next = { ...next, amountEur: assign(next.amountEur, amount) }
  }

  const parsed = parseCyprusDate(text, now)
  if (parsed.ok) next = { ...next, date: assign(next.date, parsed.iso) }

  if (extractExplicitNoneClientCharge(text)) {
    next = { ...next, clientCharge: assign(next.clientCharge, null) }
  }

  const payee = extractKnownPayee(text)
  if (payee && (hasExpenseVerb(text) || /מקבל|קיבל|לפאבי|לפבי|ליוסי|ליעקב/.test(text))) {
    next = { ...next, payee: assign(next.payee, payee) }
  }

  if (paidByStaff(text) && ctx.staffPayerName) {
    next = { ...next, payer: assign(next.payer, ctx.staffPayerName) }
  }

  const resolved = resolveProperty(text, ctx.catalog)
  if (resolved.kind === 'unique') {
    next = { ...next, propertyName: assign(next.propertyName, resolved.entry.name) }
  }

  next = applyClosedSemantics(next, text, ctx, force)

  if (!next.description.value) {
    const trimmed = text.trim()
    if (trimmed.length >= 8 && PAYMENT_HINT.test(trimmed)) {
      next = { ...next, description: assign(next.description, trimmed.slice(0, 240)) }
    }
  }

  if (!next.notes.value && PAYMENT_HINT.test(text)) {
    next = { ...next, notes: assign(next.notes, text.trim().slice(0, 500)) }
  }

  return next
}

function propertyQuestion(candidates: readonly PropertyCatalogEntry[]): AssistantPrompt {
  if (candidates.length === 0) {
    return {
      kind: 'question',
      field: 'propertyName',
      prompt: 'לא מצאתי נכס תואם. לאיזה נכס התכוונת?',
      choices: [{ id: CHOICE_NO_PROPERTY, label: 'בלי נכס' }],
      searchProperties: true,
      allowOther: true,
      allowUnknown: true,
    }
  }
  if (candidates.length > 3) {
    return {
      kind: 'question',
      field: 'propertyName',
      prompt: `מצאתי ${candidates.length} נכסים. חפש ובחר מהרשימה.`,
      choices: [{ id: CHOICE_NO_PROPERTY, label: 'בלי נכס' }],
      searchProperties: true,
      allowOther: true,
      allowUnknown: true,
    }
  }
  return {
    kind: 'question',
    field: 'propertyName',
    prompt: candidates.length === 1
      ? 'האם זה הנכס הנכון?'
      : 'מצאתי כמה נכסים. לאיזה נכס התכוונת?',
    choices: candidates.map((p) => ({ id: `prop:${p.name}`, label: p.name })),
    searchProperties: candidates.length > 1,
    allowOther: true,
    allowUnknown: true,
  }
}

function intentQuestion(): AssistantPrompt {
  return {
    kind: 'question',
    field: 'intent',
    prompt: INTENT_PROMPT,
    choices: [
      { id: INTENT_NEW, label: 'עסקה חדשה' },
      { id: INTENT_FIX, label: 'תיקון הקודמת' },
      { id: INTENT_CANCEL, label: 'ביטול' },
    ],
    searchProperties: false,
    allowOther: false,
    allowUnknown: false,
  }
}

function keywordSubcategories(text: string): string[] {
  const found: string[] = []
  for (let i = 0; i < KEYWORD_SUBCATEGORIES.length; i += 1) {
    const row = KEYWORD_SUBCATEGORIES[i]
    if (row.re.test(text)) {
      for (let n = 0; n < row.names.length; n += 1) found.push(row.names[n])
    }
  }
  const unique: string[] = []
  const seenSub: Record<string, true> = {}
  for (let i = 0; i < found.length; i += 1) {
    const name = found[i]
    if (!seenSub[name]) {
      seenSub[name] = true
      unique.push(name)
    }
  }
  return unique
}

function incomingRent(slots: DraftSlots): boolean {
  return slots.subcategory.value === 'Tenant Payment' && slots.payer.value === 'Tenant'
}

function nextPrompt(
  slots: DraftSlots,
  ctx: CollectorContext,
  lastText: string,
  reviewDismissed = false,
): AssistantPrompt {
  const now = ctx.now ?? new Date()
  const parsedDate = parseCyprusDate(lastText, now)

  if (extractAmountEur(lastText) === 'other_currency' && !slotReady(slots.amountEur)) {
    return {
      kind: 'question',
      field: 'amountEur',
      prompt: 'אני לא ממיר מטבע. מה הסכום באירו?',
      choices: [],
      searchProperties: false,
      allowOther: true,
      allowUnknown: true,
    }
  }

  if (!slotReady(slots.amountEur)) {
    return {
      kind: 'question',
      field: 'amountEur',
      prompt: 'מה הסכום באירו?',
      choices: [],
      searchProperties: false,
      allowOther: true,
      allowUnknown: true,
    }
  }

  if (!slotReady(slots.propertyName)) {
    const resolved = resolveProperty(lastText, ctx.catalog)
    const candidates = resolved.kind === 'ambiguous'
      ? resolved.entries
      : matchProperties(lastText, ctx.catalog)
    return propertyQuestion(candidates)
  }

  if (!slotReady(slots.date)) {
    if (parsedDate.ok === false && parsedDate.reason === 'invalid') {
      return {
        kind: 'question',
        field: 'date',
        prompt: `התאריך ${parsedDate.raw} אינו קיים. מה התאריך המדויק?`,
        choices: [],
        searchProperties: false,
        allowOther: true,
        allowUnknown: true,
      }
    }
    if (parsedDate.ok === false && parsedDate.reason === 'ambiguous') {
      return {
        kind: 'question',
        field: 'date',
        prompt: parsedDate.prompt,
        choices: [],
        searchProperties: false,
        allowOther: true,
        allowUnknown: true,
      }
    }
    if (hasExplicitNumericDate(lastText) && parsedDate.ok === false) {
      return {
        kind: 'question',
        field: 'date',
        prompt: 'לא הצלחתי לקרוא את התאריך שציינת. מה התאריך המדויק?',
        choices: [],
        searchProperties: false,
        allowOther: true,
        allowUnknown: true,
      }
    }
    const today = nicosiaToday(now)
    return {
      kind: 'question',
      field: 'date',
      prompt: 'מה תאריך העסקה?',
      choices: [
        { id: `date:${today}`, label: `היום (${today})` },
      ],
      searchProperties: false,
      allowOther: true,
      allowUnknown: true,
    }
  }

  if (!slotReady(slots.category) || !slotReady(slots.subcategory)) {
    const subs = keywordSubcategories(lastText)
    const paired: NumberedChoice[] = []
    for (let s = 0; s < subs.length; s += 1) {
      const sub = subs[s]
      const cats = categoriesForSubcategory(sub)
      for (let c = 0; c < cats.length; c += 1) {
        paired.push({ id: `cat:${cats[c]}|${sub}`, label: `${cats[c]} / ${sub}` })
        if (paired.length === 3) break
      }
      if (paired.length === 3) break
    }
    if (paired.length > 0 && !slotReady(slots.category)) {
      return {
        kind: 'question',
        field: 'category',
        prompt: 'באיזו קטגוריה ותת־קטגוריה לשים את זה?',
        choices: paired,
        searchProperties: false,
        allowOther: true,
        allowUnknown: true,
      }
    }
    if (!slotReady(slots.category)) {
      return {
        kind: 'question',
        field: 'category',
        prompt: 'באיזו קטגוריה?',
        choices: CATEGORIES.slice(0, 3).map((c) => ({ id: `catonly:${c}`, label: c })),
        searchProperties: false,
        allowOther: true,
        allowUnknown: true,
      }
    }
    const cat = slots.category.value as Category
    const list = CATEGORY_SUBCATEGORIES[cat] ?? []
    return {
      kind: 'question',
      field: 'subcategory',
      prompt: `תת־קטגוריה ל־${cat}?`,
      choices: list.slice(0, 3).map((s) => ({ id: `sub:${s}`, label: s })),
      searchProperties: false,
      allowOther: true,
      allowUnknown: true,
    }
  }

  if (!slotReady(slots.payer)) {
    const staff = ctx.staffPayerName
    return {
      kind: 'question',
      field: 'payer',
      prompt: 'מי שילם?',
      choices: staff ? [{ id: `payer:${staff}`, label: staff }] : [],
      searchProperties: false,
      allowOther: true,
      allowUnknown: true,
    }
  }

  if (!slotReady(slots.payee)) {
    const receipt = incomingRent(slots) || hasReceiptVerb(lastText)
    const staff = ctx.staffPayerName
    const choices: NumberedChoice[] = []
    if (receipt) {
      if (staff) choices.push({ id: `payee:${staff}`, label: staff })
      const extras = ['JJ', 'Jacob', 'Owner']
      for (let i = 0; i < extras.length; i += 1) {
        if (choices.length >= 3) break
        if (staff && extras[i] === staff) continue
        choices.push({ id: `payee:${extras[i]}`, label: extras[i] })
      }
    } else {
      choices.push({ id: 'payee:JJ', label: 'JJ' })
      choices.push({ id: 'payee:Owner', label: 'Owner' })
      choices.push({ id: 'payee:Company', label: 'Company' })
    }
    return {
      kind: 'question',
      field: 'payee',
      prompt: receipt ? 'מי קיבל את הכסף?' : 'למי שולם? אני לא מניח מקבל.',
      choices,
      searchProperties: false,
      allowOther: true,
      allowUnknown: true,
    }
  }

  if (!slotReady(slots.clientCharge)) {
    return {
      kind: 'question',
      field: 'clientCharge',
      prompt: 'האם לחייב את הלקוח/הבעלים? אני לא מעתיק את הסכום אוטומטית.',
      choices: [{ id: CHOICE_NONE, label: 'אין חיוב (NULL)' }],
      searchProperties: false,
      allowOther: true,
      allowUnknown: true,
    }
  }

  if (!slotReady(slots.description)) {
    return {
      kind: 'question',
      field: 'description',
      prompt: 'מה התיאור הקצר?',
      choices: [],
      searchProperties: false,
      allowOther: true,
      allowUnknown: true,
    }
  }

  if (isDraftComplete(slots) && !reviewDismissed) {
    return { kind: 'ready', summary: reviewFromSlots(slots) }
  }

  return {
    kind: 'question',
    field: 'notes',
    prompt: 'האם להוסיף הערה?',
    choices: [{ id: CHOICE_NONE, label: 'בלי הערה' }],
    searchProperties: false,
    allowOther: true,
    allowUnknown: true,
  }
}

export function createCollectorState(idempotencyKey: string): CollectorState {
  const slots = emptySlots()
  return {
    slots,
    lastPrompt: {
      kind: 'question',
      field: 'amountEur',
      prompt: 'אפשר להתחיל. לדוגמה: שילמתי 120 אירו חשמל בדירה של תמיר',
      choices: [],
      searchProperties: false,
      allowOther: false,
      allowUnknown: false,
    },
    draftIdempotencyKey: idempotencyKey,
    createdDraftId: null,
    reviewDismissed: false,
    hintText: '',
    preface: '',
    pendingMessage: '',
  }
}

function nextIdempotencyKey(state: CollectorState, ctx: CollectorContext): string {
  return ctx.freshIdempotencyKey && ctx.freshIdempotencyKey !== state.draftIdempotencyKey
    ? ctx.freshIdempotencyKey
    : `${state.draftIdempotencyKey}:new`
}

function classifyMessage(state: CollectorState, text: string, ctx: CollectorContext) {
  const now = ctx.now ?? new Date()
  const amount = extractAmountEur(text)
  const parsed = parseCyprusDate(text, now)
  const resolved = resolveProperty(text, ctx.catalog)
  const hasPropertyOrSubject =
    SUBJECT_HINT.test(text)
    || resolved.kind !== 'none'
    || matchProperties(text, ctx.catalog).length > 0
  return classifyTransactionTurn({
    hasExistingProposal: hasProposal(state.slots),
    awaitingField: state.lastPrompt.kind === 'question' ? state.lastPrompt.field : null,
    message: text,
    hasAmount: Boolean(amount && amount !== 'other_currency'),
    hasDate: parsed.ok,
    hasPropertyOrSubject,
  })
}

function fillFromText(
  state: CollectorState,
  text: string,
  ctx: CollectorContext,
  preface: string,
): CollectorState {
  const slots = applyUtterance(emptySlots(), text, ctx, true)
  return {
    ...state,
    slots,
    hintText: text,
    preface,
    pendingMessage: '',
    createdDraftId: null,
    reviewDismissed: false,
    lastPrompt: nextPrompt(slots, ctx, text, false),
  }
}

function applyCorrection(state: CollectorState, text: string, ctx: CollectorContext): CollectorState {
  let slots = { ...state.slots }
  const now = ctx.now ?? new Date()
  const parsed = parseCyprusDate(text, now)
  if (parsed.ok) slots = { ...slots, date: overwriteSlot(slots.date, parsed.iso) }

  const amount = extractAmountEur(text)
  if (amount && amount !== 'other_currency') slots = { ...slots, amountEur: overwriteSlot(slots.amountEur, amount) }

  const resolved = resolveProperty(text, ctx.catalog)
  if (resolved.kind === 'unique') {
    slots = { ...slots, propertyName: overwriteSlot(slots.propertyName, resolved.entry.name) }
  }

  if (/מי שקיבל|מקבל/.test(text)) {
    const payee = extractKnownPayee(text)
    if (payee) slots = { ...slots, payee: overwriteSlot(slots.payee, payee) }
  }

  if (hasExpenseVerb(text) && /לא\s+קיבלתי/.test(text)) {
    slots = {
      ...slots,
      payer: unknownSlot(),
      payee: unknownSlot(),
      category: unknownSlot(),
      subcategory: unknownSlot(),
    }
  }
  if (hasReceiptVerb(text) && /לא\s+שילמתי/.test(text)) {
    slots = {
      ...slots,
      payer: unknownSlot(),
      payee: unknownSlot(),
      category: unknownSlot(),
      subcategory: unknownSlot(),
    }
  }

  slots = applyUtterance(slots, text, ctx, true)
  const material =
    slots.date.value !== state.slots.date.value
    || slots.amountEur.value !== state.slots.amountEur.value
    || slots.propertyName.value !== state.slots.propertyName.value
    || slots.payer.value !== state.slots.payer.value
    || slots.payee.value !== state.slots.payee.value
    || slots.category.value !== state.slots.category.value
    || slots.subcategory.value !== state.slots.subcategory.value
    || slots.clientCharge.value !== state.slots.clientCharge.value
  return {
    ...state,
    slots,
    hintText: `${state.hintText} ${text}`.trim(),
    preface: '',
    pendingMessage: '',
    createdDraftId: null,
    reviewDismissed: false,
    draftIdempotencyKey: material ? nextIdempotencyKey(state, ctx) : state.draftIdempotencyKey,
    lastPrompt: nextPrompt(slots, ctx, `${state.hintText} ${text}`.trim(), false),
  }
}

export function applyUserText(
  state: CollectorState,
  text: string,
  ctx: CollectorContext,
): CollectorState {
  const trimmed = text.trim()
  if (!trimmed) return state
  if (state.createdDraftId) return state

  if (isUnsupportedCapability(trimmed) && !PAYMENT_HINT.test(trimmed)) {
    return {
      ...state,
      lastPrompt: { kind: 'unsupported', message: UNSUPPORTED_CAPABILITY_MESSAGE },
    }
  }

  if (state.lastPrompt.kind === 'question') {
    const prompt = state.lastPrompt
    const numbered = trimmed.match(/^([1-3])\s*[.)]?/)
    if (numbered) {
      const extra = [...prompt.choices]
      const idx = Number(numbered[1]) - 1
      if (extra[idx] && idx < 3) {
        return applyChoiceId(state, extra[idx].id, extra[idx].label, ctx)
      }
    }
    const byId = prompt.choices.find((c) => c.id === trimmed || c.label === trimmed)
    if (byId) return applyChoiceId(state, byId.id, byId.label, ctx)
    if (trimmed === 'משהו אחר' || trimmed.toLowerCase() === 'other') {
      return applyChoiceId(state, CHOICE_OTHER, trimmed, ctx)
    }
    if (trimmed === 'אני לא יודע' || trimmed.toLowerCase() === "i don't know") {
      return applyChoiceId(state, CHOICE_UNKNOWN, trimmed, ctx)
    }
  }

  const kind = classifyMessage(state, trimmed, ctx)
  if (kind === 'cancel' || CANCEL_HINT.test(trimmed)) {
    return {
      ...cancelCollector(nextIdempotencyKey(state, ctx)),
      preface: 'בוטל. לא נוצרה טיוטה.',
    }
  }
  if (kind === 'new_transaction') {
    const discarded = hasProposal(state.slots)
    const preface = discarded
      ? `${NEW_TRANSACTION_NOTICE} ${UNSAVED_PREVIOUS_NOTICE}`
      : NEW_TRANSACTION_NOTICE
    return fillFromText(
      { ...createCollectorState(nextIdempotencyKey(state, ctx)), preface },
      trimmed,
      ctx,
      preface,
    )
  }
  if (kind === 'unknown') {
    return {
      ...state,
      pendingMessage: trimmed,
      lastPrompt: intentQuestion(),
      preface: '',
    }
  }
  if (kind === 'correction' || CORRECTION_HINT.test(trimmed)) {
    return applyCorrection(state, trimmed, ctx)
  }

  const hintText = `${state.hintText} ${trimmed}`.trim()
  const slots = applyUtterance(state.slots, trimmed, ctx)
  if (
    state.lastPrompt.kind === 'question'
    && state.lastPrompt.field !== 'intent'
    && (state.lastPrompt.choices.length === 0 || state.lastPrompt.searchProperties)
    && looksLikeTypedValue(state.lastPrompt.field, trimmed)
  ) {
    return { ...applyTypedField({ ...state, slots, hintText }, state.lastPrompt.field, trimmed, ctx), reviewDismissed: false, hintText, preface: '' }
  }
  return {
    ...state,
    slots,
    hintText,
    preface: '',
    pendingMessage: '',
    lastPrompt: nextPrompt(slots, ctx, hintText, false),
    reviewDismissed: false,
  }
}

function applyChoiceOrFieldText(
  state: CollectorState,
  text: string,
  ctx: CollectorContext,
): CollectorState | null {
  const prompt = state.lastPrompt
  if (prompt.kind !== 'question') return null
  const field = prompt.field
  const numbered = text.match(/^([123])\s*[.)]?\s*(.*)$/)
  let chosen = text
  if (numbered) {
    const idx = Number(numbered[1]) - 1
    const extra = prompt.allowOther ? [...prompt.choices, { id: CHOICE_OTHER, label: 'משהו אחר' }] : [...prompt.choices]
    if (prompt.allowUnknown) extra.push({ id: CHOICE_UNKNOWN, label: 'אני לא יודע' })
    if (extra[idx]) chosen = extra[idx].id === extra[idx].label ? extra[idx].label : extra[idx].id
    if (extra[idx]) {
      return applyChoiceId(state, extra[idx].id, extra[idx].label, ctx)
    }
  }

  const byId = prompt.choices.find((c) => c.id === text || c.label === text)
  if (byId) return applyChoiceId(state, byId.id, byId.label, ctx)

  if (text === 'משהו אחר' || text.toLowerCase() === 'other') {
    return {
      ...state,
      lastPrompt: {
        ...prompt,
        choices: [],
        searchProperties: field === 'propertyName',
        prompt: field === 'propertyName' ? 'כתוב או חפש את שם הנכס המדויק.' : 'כתוב את הערך.',
        allowOther: false,
      },
    }
  }
  if (text === 'אני לא יודע' || text.toLowerCase() === "i don't know") {
    return applyChoiceId(state, CHOICE_UNKNOWN, text, ctx)
  }

  if (prompt.choices.length > 0 && prompt.searchProperties === false && !looksLikeTypedValue(field, text)) {
    return null
  }

  return applyTypedField(state, field, chosen, ctx)
}

function looksLikeTypedValue(field: AssistantField, text: string): boolean {
  if (field === 'intent') return false
  if (field === 'amountEur') return /^\d+(?:[.,]\d{1,2})?$/.test(text.trim())
  if (field === 'date') {
    const parsed = parseCyprusDate(text)
    return parsed.ok || /^\d{4}-\d{2}-\d{2}$/.test(text.trim()) || /היום|אתמול|שלשום|מחר|today|yesterday/i.test(text)
  }
  return text.trim().length > 0
}

export function applyChoiceId(
  state: CollectorState,
  id: string,
  label: string,
  ctx: CollectorContext,
): CollectorState {
  const field = state.lastPrompt.kind === 'question' ? state.lastPrompt.field : 'description'
  if (id === INTENT_NEW) {
    const message = state.pendingMessage
    const discarded = hasProposal(state.slots)
    const preface = discarded
      ? `${NEW_TRANSACTION_NOTICE} ${UNSAVED_PREVIOUS_NOTICE}`
      : NEW_TRANSACTION_NOTICE
    const fresh = createCollectorState(nextIdempotencyKey(state, ctx))
    if (!message) return { ...fresh, preface }
    return fillFromText({ ...fresh, preface }, message, ctx, preface)
  }
  if (id === INTENT_FIX) {
    const message = state.pendingMessage
    if (!message) return { ...state, pendingMessage: '', lastPrompt: nextPrompt(state.slots, ctx, state.hintText, false) }
    return applyCorrection({ ...state, pendingMessage: '' }, message, ctx)
  }
  if (id === INTENT_CANCEL) {
    return {
      ...cancelCollector(nextIdempotencyKey(state, ctx)),
      preface: 'בוטל. לא נוצרה טיוטה.',
    }
  }
  if (id === CHOICE_OTHER) {
    return applyChoiceOrFieldText(state, 'משהו אחר', ctx) ?? state
  }
  if (id === CHOICE_UNKNOWN) {
    if (field === 'propertyName') {
      const slots = { ...state.slots, propertyName: confirm<string | null>(null) }
      return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
    }
    if (field === 'clientCharge') {
      return {
        ...state,
        lastPrompt: {
          kind: 'question',
          field: 'clientCharge',
          prompt: 'צריך החלטה מפורשת: אין חיוב, או סכום באירו.',
          choices: [{ id: CHOICE_NONE, label: 'אין חיוב (NULL)' }],
          searchProperties: false,
          allowOther: true,
          allowUnknown: false,
        },
      }
    }
    if (field === 'notes') {
      const slots = { ...state.slots, notes: confirm('') }
      return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
    }
    return state
  }
  if (id === CHOICE_NONE) {
    if (field === 'clientCharge') {
      const slots = { ...state.slots, clientCharge: confirm<string | null>(null) }
      return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
    }
    if (field === 'notes') {
      const slots = { ...state.slots, notes: confirm('') }
      return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
    }
  }
  if (id === CHOICE_NO_PROPERTY) {
    const slots = { ...state.slots, propertyName: confirm<string | null>(null) }
    return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
  }
  if (id.startsWith('prop:')) {
    const slots = { ...state.slots, propertyName: confirm(id.slice(5)) }
    return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
  }
  if (id.startsWith('cat:')) {
    const [cat, sub] = id.slice(4).split('|')
    const slots = {
      ...state.slots,
      category: confirm(cat),
      subcategory: confirm(sub),
    }
    return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
  }
  if (id.startsWith('catonly:')) {
    const slots = { ...state.slots, category: confirm(id.slice(8)), subcategory: unknownSlot<string>() }
    return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
  }
  if (id.startsWith('sub:')) {
    const slots = { ...state.slots, subcategory: confirm(id.slice(4)) }
    return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
  }
  if (id.startsWith('date:')) {
    const slots = { ...state.slots, date: confirm(id.slice(5)) }
    return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
  }
  if (id.startsWith('payer:')) {
    const slots = { ...state.slots, payer: confirm(id.slice(6)) }
    return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
  }
  if (id.startsWith('payee:')) {
    const slots = { ...state.slots, payee: confirm(id.slice(6)) }
    return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false), reviewDismissed: false }
  }
  if (id === 'change:property') {
    const slots = { ...state.slots, propertyName: unknownSlot<string | null>() }
    return { ...state, slots, reviewDismissed: false, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
  }
  if (id === 'change:amount') {
    const slots = { ...state.slots, amountEur: unknownSlot<string>() }
    return { ...state, slots, reviewDismissed: false, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
  }
  if (id === 'change:category') {
    const slots = { ...state.slots, category: unknownSlot<string>(), subcategory: unknownSlot<string>() }
    return { ...state, slots, reviewDismissed: false, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
  }
  return applyTypedField(state, field, label, ctx)
}

function applyTypedField(
  state: CollectorState,
  field: AssistantField,
  text: string,
  ctx: CollectorContext,
): CollectorState {
  const raw = text.trim()
  let slots = { ...state.slots }
  if (field === 'intent') {
    return state
  }
  if (field === 'amountEur') {
    const amount = extractAmountEur(raw) ?? (/^\d+(?:[.,]\d{1,2})?$/.test(raw) ? normalizeAmount(raw) : null)
    if (amount && amount !== 'other_currency') slots = { ...slots, amountEur: confirm(amount) }
    else return state
  } else if (field === 'date') {
    const parsed = parseCyprusDate(raw, ctx.now)
    if (parsed.ok) {
      slots = { ...slots, date: confirm(parsed.iso) }
    } else if (parsed.reason === 'invalid') {
      return {
        ...state,
        lastPrompt: {
          kind: 'question',
          field: 'date',
          prompt: `התאריך ${parsed.raw} אינו קיים. מה התאריך המדויק?`,
          choices: [],
          searchProperties: false,
          allowOther: true,
          allowUnknown: true,
        },
      }
    } else if (parsed.reason === 'ambiguous') {
      return {
        ...state,
        lastPrompt: {
          kind: 'question',
          field: 'date',
          prompt: parsed.prompt,
          choices: [],
          searchProperties: false,
          allowOther: true,
          allowUnknown: true,
        },
      }
    } else {
      return state
    }
  } else if (field === 'propertyName') {
    const hits = matchProperties(raw, ctx.catalog)
    const exact = ctx.catalog.filter((p) => p.name.toLowerCase() === raw.toLowerCase())
    const resolved = resolveProperty(raw, ctx.catalog)
    if (exact.length === 1) {
      slots = { ...slots, propertyName: confirm(exact[0].name) }
    } else if (resolved.kind === 'unique') {
      slots = { ...slots, propertyName: confirm(resolved.entry.name) }
    } else if (hits.length === 1) {
      return { ...state, lastPrompt: propertyQuestion(hits) }
    } else if (hits.length > 1) {
      return { ...state, lastPrompt: propertyQuestion(hits) }
    } else if (raw === '' || /בלי נכס|no property/i.test(raw)) {
      slots = { ...slots, propertyName: confirm<string | null>(null) }
    } else {
      return { ...state, lastPrompt: propertyQuestion([]) }
    }
  } else if (field === 'category') {
    const cat = CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase())
    if (!cat) return state
    slots = { ...slots, category: confirm(cat), subcategory: unknownSlot() }
  } else if (field === 'subcategory') {
    const cat = slots.category.value as Category | undefined
    const list = cat ? CATEGORY_SUBCATEGORIES[cat] ?? [] : Object.values(CATEGORY_SUBCATEGORIES).flat()
    const hit = list.find((s) => s.toLowerCase() === raw.toLowerCase())
    if (!hit) return { ...state, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
    slots = { ...slots, subcategory: confirm(hit) }
  } else if (field === 'payer') {
    slots = { ...slots, payer: confirm(raw) }
  } else if (field === 'payee') {
    slots = { ...slots, payee: confirm(raw) }
  } else if (field === 'description') {
    slots = { ...slots, description: confirm(raw) }
  } else if (field === 'notes') {
    slots = { ...slots, notes: confirm(raw) }
  } else if (field === 'clientCharge') {
    if (extractExplicitNoneClientCharge(raw) || raw === '' || raw.toLowerCase() === 'null') {
      slots = { ...slots, clientCharge: confirm<string | null>(null) }
    } else {
      const amount = extractAmountEur(raw) ?? (/^\d+(?:[.,]\d{1,2})?$/.test(raw) ? normalizeAmount(raw) : null)
      if (!amount || amount === 'other_currency') return state
      slots = { ...slots, clientCharge: confirm(amount) }
    }
  }
  return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, `${state.hintText} ${raw}`.trim(), false), preface: '' }
}

export function applyPropertyPick(
  state: CollectorState,
  propertyName: string,
  ctx: CollectorContext,
): CollectorState {
  const exact = ctx.catalog.find((p) => p.name === propertyName)
  if (!exact) return { ...state, lastPrompt: propertyQuestion([]) }
  const slots = { ...state.slots, propertyName: confirm(exact.name) }
  return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, state.hintText, false) }
}

export function resetForChangeDetails(state: CollectorState, ctx: CollectorContext): CollectorState {
  return {
    ...state,
    createdDraftId: null,
    reviewDismissed: true,
    preface: '',
    lastPrompt: {
      kind: 'question',
      field: 'description',
      prompt: 'מה לשנות? אפשר לכתוב שדה או ערך חדש.',
      choices: [
        { id: 'change:property', label: 'נכס' },
        { id: 'change:amount', label: 'סכום' },
        { id: 'change:category', label: 'קטגוריה' },
      ],
      searchProperties: false,
      allowOther: true,
      allowUnknown: false,
    },
  }
}

export function resetForNewProposal(state: CollectorState, idempotencyKey: string): CollectorState {
  const discarded = hasProposal(state.slots)
  const next = createCollectorState(idempotencyKey)
  return {
    ...next,
    preface: discarded
      ? `${NEW_TRANSACTION_NOTICE} ${UNSAVED_PREVIOUS_NOTICE}`
      : NEW_TRANSACTION_NOTICE,
  }
}

export function cancelCollector(idempotencyKey: string): CollectorState {
  return createCollectorState(idempotencyKey)
}

export function markDraftCreated(state: CollectorState, draftId: string): CollectorState {
  return { ...state, createdDraftId: draftId }
}

export function visibleChoices(prompt: AssistantPrompt): NumberedChoice[] {
  if (prompt.kind !== 'question') return []
  const out = [...prompt.choices]
  if (prompt.allowOther) out.push({ id: CHOICE_OTHER, label: 'משהו אחר' })
  if (prompt.allowUnknown) out.push({ id: CHOICE_UNKNOWN, label: 'אני לא יודע' })
  return out.slice(0, 5)
}

export function numberedDirectChoices(prompt: AssistantPrompt): NumberedChoice[] {
  if (prompt.kind !== 'question') return []
  return prompt.choices.slice(0, 3)
}

export function replayUtterances(
  texts: readonly string[],
  ctx: CollectorContext,
  idempotencyKey: string,
): CollectorState {
  let state = createCollectorState(idempotencyKey)
  for (let i = 0; i < texts.length; i += 1) {
    state = applyUserText(state, texts[i], {
      ...ctx,
      freshIdempotencyKey: `${idempotencyKey}:replay:${i}`,
    })
  }
  return state
}
