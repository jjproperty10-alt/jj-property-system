/**
 * Pure transaction-draft slot collector for Phase 2A.
 * Proposed values are never financial truth. No I/O.
 */

import { CATEGORIES, CATEGORY_SUBCATEGORIES, type Category } from '@/types'
import { OPS_TIMEZONE } from '@/lib/ops/types'

export const ASSISTANT_CAPABILITY_LABEL = 'הכנת טיוטת עסקה'
export const UNSUPPORTED_CAPABILITY_MESSAGE =
  'כרגע אני יודע להכין טיוטת עסקה. בהמשך אחבר מסמכים, מיילים ודוחות.'

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
}

export interface CollectorState {
  readonly slots: DraftSlots
  readonly lastPrompt: AssistantPrompt
  readonly draftIdempotencyKey: string
  readonly createdDraftId: string | null
  readonly reviewDismissed: boolean
  readonly hintText: string
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

export function nicosiaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OPS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function nicosiaShift(days: number, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  const utc = Date.UTC(year, month - 1, day + days)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utc))
}

const PAYMENT_HINT =
  /שילמתי|שילמנו|קיבלתי|הוצאה|הכנסה|טיוט|חשמל|מים|אינטרנט|שכירות|אירו|יורו|\beuro\b|\beur\b|€|paid|received|draft/i
const UNSUPPORTED_HINT =
  /מייל|אימייל|e-mail|\bmail\b|וואטסאפ|מסמך|\bdocuments?\b|דוח|\breports?\b|חוזה|\bcontracts?\b|אחסון/i
const OTHER_CURRENCY =
  /\$|₪|ש["׳']?ח|dollar|usd|shekel|ils|lira|gbp|£/i

const PERSON_HINTS: readonly { readonly he: string; readonly en: string }[] = [
  { he: 'תמיר', en: 'tamir' },
  { he: 'לירון', en: 'liron' },
  { he: 'אלון', en: 'alon' },
  { he: 'אורן', en: 'oren' },
  { he: 'יוסי', en: 'yossi' },
  { he: 'יעקב', en: 'jacob' },
]

const KEYWORD_SUBCATEGORIES: readonly { readonly re: RegExp; readonly names: readonly string[] }[] = [
  { re: /חשמל|electric/i, names: ['Electricity', 'Electricity Bill'] },
  { re: /מים|water/i, names: ['Water'] },
  { re: /אינטרנט|internet/i, names: ['Internet'] },
  { re: /שכירות|rent/i, names: ['Office Rent', 'Tenant Payment'] },
  { re: /ניקיון|cleaning/i, names: ['Cleaning', 'Cleaning Supplies'] },
  { re: /ביטוח|insurance/i, names: ['Insurance', 'Property Insurance'] },
]

const CHOICE_OTHER = 'other'
const CHOICE_UNKNOWN = 'unknown'
const CHOICE_NONE = 'none'
const CHOICE_NO_PROPERTY = 'no_property'

export function isUnsupportedCapability(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return UNSUPPORTED_HINT.test(t) && !PAYMENT_HINT.test(t)
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
  const seen = new Set<string>()
  const out: PropertyCatalogEntry[] = []
  for (const row of rows) {
    const key = row.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
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
  return null
}

function normalizeAmount(raw: string): string {
  const n = Number(raw.replace(',', '.'))
  if (!Number.isFinite(n)) return raw
  return String(n)
}

export function extractDate(text: string, now: Date = new Date()): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
  if (/היום|\btoday\b/i.test(text)) return nicosiaToday(now)
  if (/אתמול|\byesterday\b/i.test(text)) return nicosiaShift(-1, now)
  return null
}

function extractExplicitNoneClientCharge(text: string): boolean {
  return /אין חיוב|בלי חיוב|לא לחייב|client charge\s*(none|null|0)\b|no client charge/i.test(text)
}

function extractKnownPayee(text: string): string | null {
  const known = ['Company', 'Anastasia', 'Jacob', 'JJ', 'Owner', 'Yossi', 'Fabi', 'David', 'Yanis']
  for (const name of known) {
    const re = new RegExp(`\\b${name}\\b`, 'i')
    if (re.test(text)) return name
  }
  if (/לחברת?\s*jj|ל־?jj\b/i.test(text)) return 'JJ'
  return null
}

function paidByStaff(text: string): boolean {
  return /שילמתי|\bi paid\b|\bpaid\b/i.test(text)
}

function setSlot<T>(current: Slot<T>, value: T): Slot<T> {
  if (current.status === 'confirmed') return current
  return { status: 'proposed', value }
}

function confirm<T>(value: T): Slot<T> {
  return { status: 'confirmed', value }
}

function slotReady<T>(slot: Slot<T>): boolean {
  return slot.status !== 'unknown' && slot.value !== undefined
}

export function reviewFromSlots(slots: DraftSlots): DraftReview {
  return {
    date: slots.date.value ?? '—',
    property: slots.propertyName.value == null ? 'ללא נכס' : slots.propertyName.value,
    category: slots.category.value ?? '—',
    subcategory: slots.subcategory.value ?? '—',
    description: slots.description.value ?? '—',
    payer: slots.payer.value ?? '—',
    payee: slots.payee.value ?? '—',
    amount: formatEuro(slots.amountEur.value),
    clientCharge: slots.clientCharge.value == null ? 'אין / NULL' : formatEuro(slots.clientCharge.value),
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

function applyUtterance(slots: DraftSlots, text: string, ctx: CollectorContext): DraftSlots {
  let next = { ...slots }
  const now = ctx.now ?? new Date()

  const amount = extractAmountEur(text)
  if (amount && amount !== 'other_currency') {
    next = { ...next, amountEur: setSlot(next.amountEur, amount) }
  }

  const date = extractDate(text, now)
  if (date) next = { ...next, date: setSlot(next.date, date) }

  if (extractExplicitNoneClientCharge(text)) {
    next = { ...next, clientCharge: setSlot(next.clientCharge, null) }
  }

  const payee = extractKnownPayee(text)
  if (payee) next = { ...next, payee: setSlot(next.payee, payee) }

  if (paidByStaff(text) && ctx.staffPayerName) {
    next = { ...next, payer: setSlot(next.payer, ctx.staffPayerName) }
  }

  const props = matchProperties(text, ctx.catalog)
  const exact = ctx.catalog.filter((p) => p.name.toLowerCase() === text.trim().toLowerCase())
  if (exact.length === 1) {
    next = { ...next, propertyName: setSlot(next.propertyName, exact[0].name) }
  } else if (props.length === 1 && text.trim().toLowerCase() === props[0].name.toLowerCase()) {
    next = { ...next, propertyName: setSlot(next.propertyName, props[0].name) }
  }

  if (!next.description.value) {
    const trimmed = text.trim()
    if (trimmed.length >= 8 && PAYMENT_HINT.test(trimmed)) {
      next = { ...next, description: setSlot(next.description, trimmed.slice(0, 240)) }
    }
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
    searchProperties: false,
    allowOther: true,
    allowUnknown: true,
  }
}

function keywordSubcategories(text: string): string[] {
  const found: string[] = []
  for (const row of KEYWORD_SUBCATEGORIES) {
    if (row.re.test(text)) found.push(...row.names)
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

function nextPrompt(
  slots: DraftSlots,
  ctx: CollectorContext,
  lastText: string,
  reviewDismissed = false,
): AssistantPrompt {
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
    const candidates = matchProperties(lastText, ctx.catalog)
    return propertyQuestion(candidates)
  }

  if (!slotReady(slots.date)) {
    const today = nicosiaToday(ctx.now)
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
    for (const sub of subs) {
      for (const cat of categoriesForSubcategory(sub)) {
        paired.push({ id: `cat:${cat}|${sub}`, label: `${cat} / ${sub}` })
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
    return {
      kind: 'question',
      field: 'payee',
      prompt: 'למי שולם? אני לא מניח מקבל.',
      choices: [
        { id: 'payee:JJ', label: 'JJ' },
        { id: 'payee:Owner', label: 'Owner' },
        { id: 'payee:Company', label: 'Company' },
      ],
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

  const hintText = `${state.hintText} ${trimmed}`.trim()
  const slots = applyUtterance(state.slots, trimmed, ctx)
  if (
    state.lastPrompt.kind === 'question' &&
    (state.lastPrompt.choices.length === 0 || state.lastPrompt.searchProperties) &&
    looksLikeTypedValue(state.lastPrompt.field, trimmed)
  ) {
    return { ...applyTypedField({ ...state, slots, hintText }, state.lastPrompt.field, trimmed, ctx), reviewDismissed: false, hintText }
  }
  return {
    ...state,
    slots,
    hintText,
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
  if (field === 'amountEur') return /^\d+(?:[.,]\d{1,2})?$/.test(text.trim())
  if (field === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(text.trim()) || /היום|אתמול|today|yesterday/i.test(text)
  return text.trim().length > 0
}

export function applyChoiceId(
  state: CollectorState,
  id: string,
  label: string,
  ctx: CollectorContext,
): CollectorState {
  const field = state.lastPrompt.kind === 'question' ? state.lastPrompt.field : 'description'
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
  if (field === 'amountEur') {
    const amount = extractAmountEur(raw) ?? (/^\d+(?:[.,]\d{1,2})?$/.test(raw) ? normalizeAmount(raw) : null)
    if (amount && amount !== 'other_currency') slots = { ...slots, amountEur: confirm(amount) }
    else return state
  } else if (field === 'date') {
    const date = extractDate(raw, ctx.now) ?? (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null)
    if (!date) return state
    slots = { ...slots, date: confirm(date) }
  } else if (field === 'propertyName') {
    const hits = matchProperties(raw, ctx.catalog)
    const exact = ctx.catalog.filter((p) => p.name.toLowerCase() === raw.toLowerCase())
    if (exact.length === 1) {
      slots = { ...slots, propertyName: confirm(exact[0].name) }
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
  return { ...state, slots, lastPrompt: nextPrompt(slots, ctx, `${state.hintText} ${raw}`.trim(), false) }
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
  for (const text of texts) {
    state = applyUserText(state, text, ctx)
  }
  return state
}
