'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Mic, MicOff, Send, Sparkles, Square, Trash2 } from 'lucide-react'
import {
  ASSISTANT_CAPABILITY_LABEL,
  applyUserText,
  cancelCollector,
  createCollectorState,
  markDraftCreated,
  numberedDirectChoices,
  replayUtterances,
  resetForChangeDetails,
  resetForNewProposal,
  type AssistantPrompt,
  type CollectorContext,
  type CollectorState,
  type PropertyCatalogEntry,
} from '@/lib/ops/assistant/transactionDraftCollector'
import { MIC_PRIVACY_LABEL } from '@/lib/ops/assistant/speechTranscript'
import {
  createAssistantTransactionDraft,
  listOpsConversation,
  submitAssistantInbound,
} from '@/lib/ops/assistant/opsConversationActions'
import { useSpeechToText } from './useSpeechToText'
import { extractDate } from '@/lib/ops/assistant/cyprusDate'
import {
  CASH_SUMMARY_TITLE,
  FUNDING_CHOICE_CANCEL,
  FUNDING_CHOICE_JJ,
  FUNDING_CHOICE_PERSONAL,
  FUNDING_QUESTION,
  PERSONAL_SUMMARY_TITLE,
  matchEntitiesByCanonicalName,
  parseClientCashSettlementUtterance,
  type CashSettlementDirection,
  type EntityChoice,
  type SettlementFundingSource,
} from '@/lib/ops/assistant/clientCashSettlementIntent'
import {
  executeClientCashSettlement,
  executePartnerFundedClientSettlement,
  previewClientCashSettlement,
  previewPartnerFundedClientSettlement,
} from '@/lib/ops/assistant/clientCashSettlementActions'

function formatCashSuccess(input: {
  readonly transactionId: string
  readonly entityName: string
  readonly direction: string
  readonly amount: number
  readonly effectiveDate: string
  readonly balanceBefore: string
  readonly previewAfter: string
  readonly allocations: readonly unknown[]
  readonly reportUpdated: boolean
  readonly remainingR: string | null
  readonly remainingS: string | null
}): string {
  const fifo = input.allocations
    .map((row, i) => {
      const alloc = row as Record<string, unknown>
      return `${i + 1}. ${String(alloc.property_id ?? '')} · ${String(alloc.amount_applied ?? '')} · נותר ${String(alloc.remaining_after ?? '')}`
    })
    .join('\n')
  const reportLine = input.reportUpdated
    ? `יתרת הדוח אחרי הרישום: R=${input.remainingR} · S=${input.remainingS}`
    : 'יתרת הדוח לא אומתה מקריאת ה-reader; לא מוצג שהדוח עודכן.'
  return [
    'התשלום נרשם.',
    `מזהה עסקה: ${input.transactionId}`,
    `לקוח: ${input.entityName}`,
    `כיוון: ${input.direction}`,
    `סכום/תאריך: ${input.amount} / ${input.effectiveDate}`,
    `יתרה לפני: ${input.balanceBefore}`,
    `יתרה אחרי (FIFO): ${input.previewAfter}`,
    fifo ? `הקצאות FIFO:\n${fifo}` : 'הקצאות FIFO: אין',
    reportLine,
    'מסך לקוחות: /owners',
  ].join('\n')
}

interface ChatItem {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly prompt?: AssistantPrompt
}

function Ltr({ children }: { children: React.ReactNode }) {
  return (
    <span dir="ltr" className="inline-block tabular-nums">
      {children}
    </span>
  )
}

export function AssistantChat(props: {
  readonly staffPayerName: string
  readonly catalog: readonly PropertyCatalogEntry[]
  readonly entities?: readonly EntityChoice[]
  readonly partners?: readonly EntityChoice[]
  readonly initialConversationId: string | null
}) {
  const ctx: CollectorContext = useMemo(
    () => ({ catalog: props.catalog, staffPayerName: props.staffPayerName || null }),
    [props.catalog, props.staffPayerName],
  )
  const convKeyRef = useRef(crypto.randomUUID())
  const draftKeyRef = useRef(crypto.randomUUID())
  const creatingRef = useRef(false)
  const cashKeyRef = useRef(crypto.randomUUID())
  const recordingCashRef = useRef(false)
  const [cashCard, setCashCard] = useState<{
    readonly entityId: string
    readonly entityName: string
    readonly direction: 'JJ_TO_CLIENT' | 'CLIENT_TO_JJ'
    readonly amount: number
    readonly effectiveDate: string
    readonly preview: Record<string, unknown>
    readonly funding: SettlementFundingSource
    readonly partnerId: string | null
    readonly partnerName: string | null
  } | null>(null)
  const [cashPostedId, setCashPostedId] = useState<string | null>(null)
  const [pendingCash, setPendingCash] = useState<{
    readonly direction: CashSettlementDirection
    readonly amount: number
    readonly entity: EntityChoice
    readonly funding: SettlementFundingSource
    readonly partnerId: string | null
    readonly partnerName: string | null
  } | null>(null)
  const [pendingName, setPendingName] = useState<{
    readonly direction: CashSettlementDirection
    readonly amount: number
    readonly needsDate: boolean
    readonly funding: SettlementFundingSource
    readonly partnerId: string | null
    readonly partnerNameQuery: string | null
  } | null>(null)
  const [pendingFunding, setPendingFunding] = useState<{
    readonly direction: CashSettlementDirection
    readonly amount: number
    readonly entity: EntityChoice
    readonly needsDate: boolean
    readonly partnerNameQuery: string | null
  } | null>(null)
  const [pendingPartner, setPendingPartner] = useState<{
    readonly direction: CashSettlementDirection
    readonly amount: number
    readonly entity: EntityChoice
    readonly needsDate: boolean
  } | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(props.initialConversationId)
  const [draft, setDraft] = useState<CollectorState>(() => createCollectorState(draftKeyRef.current))
  const [items, setItems] = useState<ChatItem[]>(() => [{
    id: 'intro',
    role: 'assistant',
    text: 'אפשר להתחיל. לדוגמה: שילמתי 120 אירו חשמל בדירה של תמיר',
    prompt: createCollectorState(draftKeyRef.current).lastPrompt,
  }])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [propertyQuery, setPropertyQuery] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const speech = useSpeechToText({ value: text, onChange: setText, enabled: !loading })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [items, draft.lastPrompt, loading])

  useEffect(() => {
    if (!props.initialConversationId) return
    let cancelled = false
    void listOpsConversation(props.initialConversationId).then((listed) => {
      if (cancelled || !listed.ok) return
      const bodies = listed.messages.filter((m) => m.direction === 'inbound').map((m) => m.body)
      const replayed = replayUtterances(bodies, ctx, draftKeyRef.current)
      const history: ChatItem[] = []
      bodies.forEach((body, i) => {
        history.push({ id: `u-${i}`, role: 'user', text: body })
      })
      history.push({
        id: 'assistant-replay',
        role: 'assistant',
        text: promptText(replayed.lastPrompt, replayed.preface),
        prompt: replayed.lastPrompt,
      })
      setConversationId(listed.conversationId)
      setDraft(replayed)
      setItems(history)
    })
    return () => { cancelled = true }
  }, [ctx, props.initialConversationId])

  async function sendBody(body: string) {
    const trimmed = body.trim()
    if (!trimmed || loading || draft.createdDraftId) return
    setError('')
    setLoading(true)
    const messageKey = crypto.randomUUID()
    const persisted = await submitAssistantInbound({
      conversationId,
      conversationIdempotencyKey: convKeyRef.current,
      body: trimmed,
      messageIdempotencyKey: messageKey,
    })
    if (!persisted.ok) {
      setLoading(false)
      setError(persisted.error)
      return
    }
    if (persisted.conversationId !== conversationId) {
      setConversationId(persisted.conversationId)
      const url = new URL(window.location.href)
      url.searchParams.set('c', persisted.conversationId)
      window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}`)
    }
    const finishCash = async (
      entity: EntityChoice,
      direction: CashSettlementDirection,
      amount: number,
      effectiveDate: string,
      funding: SettlementFundingSource,
      partnerId: string | null,
      partnerName: string | null,
    ) => {
      if (funding === 'PARTNER_PERSONAL') {
        if (!partnerId || !partnerName) {
          setLoading(false)
          setError('יש לבחור שותף מהרשימה הקנונית.')
          return
        }
        const previewed = await previewPartnerFundedClientSettlement({
          clientEntityId: entity.id,
          partnerEntityId: partnerId,
          amount,
          effectiveDate,
        })
        if (!previewed.ok) {
          setLoading(false)
          setError(previewed.error)
          return
        }
        setPendingCash(null)
        setCashCard({
          entityId: entity.id,
          entityName: entity.canonicalName,
          direction,
          amount,
          effectiveDate,
          preview: previewed.preview,
          funding,
          partnerId,
          partnerName,
        })
        setItems((prev) => [
          ...prev,
          { id: messageKey, role: 'user', text: trimmed },
          { id: `${messageKey}-a`, role: 'assistant', text: PERSONAL_SUMMARY_TITLE },
        ])
        setText('')
        setLoading(false)
        return
      }
      const previewed = await previewClientCashSettlement({
        entityId: entity.id,
        direction,
        amount,
        effectiveDate,
      })
      if (!previewed.ok) {
        setLoading(false)
        setError(previewed.error)
        return
      }
      setPendingCash(null)
      setCashCard({
        entityId: entity.id,
        entityName: entity.canonicalName,
        direction,
        amount,
        effectiveDate,
        preview: previewed.preview,
        funding: 'JJ',
        partnerId: null,
        partnerName: null,
      })
      setItems((prev) => [
        ...prev,
        { id: messageKey, role: 'user', text: trimmed },
        { id: `${messageKey}-a`, role: 'assistant', text: CASH_SUMMARY_TITLE },
      ])
      setText('')
      setLoading(false)
    }

    if (pendingFunding) {
      if (trimmed === FUNDING_CHOICE_CANCEL || trimmed === 'ביטול') {
        setPendingFunding(null)
        setItems((prev) => [...prev, { id: messageKey, role: 'user', text: trimmed }, { id: `${messageKey}-a`, role: 'assistant', text: 'בוטל. לא נרשם תשלום.' }])
        setText('')
        setLoading(false)
        return
      }
      if (trimmed === FUNDING_CHOICE_JJ) {
        const next = pendingFunding
        setPendingFunding(null)
        if (next.needsDate) {
          setPendingCash({
            entity: next.entity, direction: next.direction, amount: next.amount,
            funding: 'JJ', partnerId: null, partnerName: null,
          })
          setItems((prev) => [...prev, { id: messageKey, role: 'user', text: trimmed }, { id: `${messageKey}-a`, role: 'assistant', text: `לקוח: ${next.entity.canonicalName}. מה התאריך? התשלום עדיין לא נרשם.` }])
          setText('')
          setLoading(false)
          return
        }
        const dateIso = extractDate(trimmed)
        if (!dateIso) {
          setPendingCash({
            entity: next.entity, direction: next.direction, amount: next.amount,
            funding: 'JJ', partnerId: null, partnerName: null,
          })
          setItems((prev) => [...prev, { id: messageKey, role: 'user', text: trimmed }, { id: `${messageKey}-a`, role: 'assistant', text: `לקוח: ${next.entity.canonicalName}. מה התאריך? התשלום עדיין לא נרשם.` }])
          setText('')
          setLoading(false)
          return
        }
        await finishCash(next.entity, next.direction, next.amount, dateIso, 'JJ', null, null)
        return
      }
      if (trimmed === FUNDING_CHOICE_PERSONAL) {
        setPendingFunding(null)
        setPendingPartner({
          direction: pendingFunding.direction,
          amount: pendingFunding.amount,
          entity: pendingFunding.entity,
          needsDate: pendingFunding.needsDate,
        })
        const actors = (props.partners ?? []).slice(0, 3)
        const textOut = actors.length === 0
          ? 'אין שותף קנוני ברשימה. לא ניחשתי ולא השתמשתי במשתמש המחובר.'
          : 'בחרו את השותף ששילם מכסף פרטי, בלי ניחוש:\n' + actors.map((m, i) => `${i + 1}. ${m.canonicalName}`).join('\n')
        setItems((prev) => [...prev, { id: messageKey, role: 'user', text: trimmed }, { id: `${messageKey}-a`, role: 'assistant', text: textOut }])
        setText('')
        setLoading(false)
        return
      }
      setItems((prev) => [...prev, { id: messageKey, role: 'user', text: trimmed }, { id: `${messageKey}-a`, role: 'assistant', text: FUNDING_QUESTION }])
      setText('')
      setLoading(false)
      return
    }

    if (pendingPartner) {
      const actors = props.partners ?? []
      const numbered = trimmed.match(/^(\d+)/)
      const byIndex = numbered ? actors[Number(numbered[1]) - 1] : undefined
      const matches = byIndex ? [byIndex] : matchEntitiesByCanonicalName(trimmed, actors)
      if (matches.length !== 1) {
        setItems((prev) => [...prev, { id: messageKey, role: 'user', text: trimmed }, { id: `${messageKey}-a`, role: 'assistant', text: 'בחרו שותף מהרשימה הקנונית. לא ניחשתי ולא השתמשתי במשתמש המחובר.' }])
        setText('')
        setLoading(false)
        return
      }
      const partner = matches[0]
      const next = pendingPartner
      setPendingPartner(null)
      if (next.needsDate) {
        setPendingCash({
          entity: next.entity, direction: next.direction, amount: next.amount,
          funding: 'PARTNER_PERSONAL', partnerId: partner.id, partnerName: partner.canonicalName,
        })
        setItems((prev) => [...prev, { id: messageKey, role: 'user', text: trimmed }, { id: `${messageKey}-a`, role: 'assistant', text: `שותף: ${partner.canonicalName}. מה התאריך? התשלום עדיין לא נרשם.` }])
        setText('')
        setLoading(false)
        return
      }
      const dateIso = extractDate(trimmed)
      if (!dateIso) {
        setPendingCash({
          entity: next.entity, direction: next.direction, amount: next.amount,
          funding: 'PARTNER_PERSONAL', partnerId: partner.id, partnerName: partner.canonicalName,
        })
        setItems((prev) => [...prev, { id: messageKey, role: 'user', text: trimmed }, { id: `${messageKey}-a`, role: 'assistant', text: `שותף: ${partner.canonicalName}. מה התאריך? התשלום עדיין לא נרשם.` }])
        setText('')
        setLoading(false)
        return
      }
      await finishCash(next.entity, next.direction, next.amount, dateIso, 'PARTNER_PERSONAL', partner.id, partner.canonicalName)
      return
    }

    if (pendingCash) {
      const dateIso = extractDate(trimmed)
      if (!dateIso) {
        setItems((prev) => [
          ...prev,
          { id: messageKey, role: 'user', text: trimmed },
          { id: `${messageKey}-a`, role: 'assistant', text: 'מה התאריך? התשלום עדיין לא נרשם.' },
        ])
        setText('')
        setLoading(false)
        return
      }
      await finishCash(
        pendingCash.entity, pendingCash.direction, pendingCash.amount, dateIso,
        pendingCash.funding, pendingCash.partnerId, pendingCash.partnerName,
      )
      return
    }

    if (pendingName) {
      const matches = matchEntitiesByCanonicalName(trimmed, props.entities ?? [])
      if (matches.length === 0) {
        setItems((prev) => [
          ...prev,
          { id: messageKey, role: 'user', text: trimmed },
          { id: `${messageKey}-a`, role: 'assistant', text: 'לא מצאתי לקוח ב-lifecycle.entity_identity. לא ניחשתי.' },
        ])
        setText('')
        setLoading(false)
        return
      }
      if (matches.length > 1) {
        setItems((prev) => [
          ...prev,
          { id: messageKey, role: 'user', text: trimmed },
          {
            id: `${messageKey}-a`,
            role: 'assistant',
            text: 'יש כמה לקוחות תואמים. בחרו אחד, בלי ניחוש:\n' + matches.map((m, i) => `${i + 1}. ${m.canonicalName}`).join('\n'),
          },
        ])
        setText('')
        setLoading(false)
        return
      }
      const funding = pendingName.funding
      setPendingName(null)
      if (funding === 'UNKNOWN') {
        setPendingFunding({
          direction: pendingName.direction,
          amount: pendingName.amount,
          entity: matches[0],
          needsDate: pendingName.needsDate,
          partnerNameQuery: pendingName.partnerNameQuery,
        })
        setItems((prev) => [...prev, { id: messageKey, role: 'user', text: trimmed }, { id: `${messageKey}-a`, role: 'assistant', text: FUNDING_QUESTION }])
        setText('')
        setLoading(false)
        return
      }
      if (pendingName.needsDate) {
        setPendingCash({
          entity: matches[0], direction: pendingName.direction, amount: pendingName.amount,
          funding, partnerId: pendingName.partnerId, partnerName: null,
        })
        setItems((prev) => [
          ...prev,
          { id: messageKey, role: 'user', text: trimmed },
          { id: `${messageKey}-a`, role: 'assistant', text: `לקוח: ${matches[0].canonicalName}. מה התאריך? התשלום עדיין לא נרשם.` },
        ])
        setText('')
        setLoading(false)
        return
      }
      const dateIso = extractDate(trimmed)
      if (!dateIso) {
        setPendingCash({
          entity: matches[0], direction: pendingName.direction, amount: pendingName.amount,
          funding, partnerId: pendingName.partnerId, partnerName: null,
        })
        setItems((prev) => [
          ...prev,
          { id: messageKey, role: 'user', text: trimmed },
          { id: `${messageKey}-a`, role: 'assistant', text: `לקוח: ${matches[0].canonicalName}. מה התאריך? התשלום עדיין לא נרשם.` },
        ])
        setText('')
        setLoading(false)
        return
      }
      await finishCash(matches[0], pendingName.direction, pendingName.amount, dateIso, funding, pendingName.partnerId, null)
      return
    }

    const parsed = parseClientCashSettlementUtterance(trimmed)
    if (parsed && parsed.amount && parsed.nameQuery) {
      const matches = matchEntitiesByCanonicalName(parsed.nameQuery, props.entities ?? [])
      let assistantText = ''
      if (matches.length === 0) {
        assistantText = 'לא מצאתי לקוח ב-lifecycle.entity_identity. לא ניחשתי.'
      } else if (matches.length > 1) {
        setPendingName({
          direction: parsed.direction, amount: parsed.amount, needsDate: parsed.needsDate,
          funding: parsed.fundingSource, partnerId: null, partnerNameQuery: parsed.partnerNameQuery,
        })
        assistantText = 'יש כמה לקוחות תואמים. בחרו אחד, בלי ניחוש:\n' + matches.map((m, i) => `${i + 1}. ${m.canonicalName}`).join('\n')
      } else if (parsed.fundingSource === 'UNKNOWN') {
        setPendingFunding({
          direction: parsed.direction, amount: parsed.amount, entity: matches[0],
          needsDate: parsed.needsDate, partnerNameQuery: parsed.partnerNameQuery,
        })
        assistantText = FUNDING_QUESTION
      } else if (parsed.needsDate) {
        setPendingCash({
          entity: matches[0], direction: parsed.direction, amount: parsed.amount,
          funding: parsed.fundingSource, partnerId: null, partnerName: null,
        })
        assistantText = `לקוח: ${matches[0].canonicalName}. מה התאריך? התשלום עדיין לא נרשם.`
      } else {
        const dateIso = extractDate(trimmed)
        if (!dateIso) {
          setPendingCash({
            entity: matches[0], direction: parsed.direction, amount: parsed.amount,
            funding: parsed.fundingSource, partnerId: null, partnerName: null,
          })
          assistantText = `לקוח: ${matches[0].canonicalName}. מה התאריך? התשלום עדיין לא נרשם.`
        } else if (parsed.fundingSource === 'PARTNER_PERSONAL') {
          setPendingPartner({
            direction: parsed.direction, amount: parsed.amount, entity: matches[0], needsDate: false,
          })
          const actors = (props.partners ?? []).slice(0, 3)
          assistantText = actors.length === 0
            ? 'אין שותף קנוני ברשימה. לא ניחשתי ולא השתמשתי במשתמש המחובר.'
            : 'בחרו את השותף ששילם מכסף פרטי, בלי ניחוש:\n' + actors.map((m, i) => `${i + 1}. ${m.canonicalName}`).join('\n')
        } else {
          await finishCash(matches[0], parsed.direction, parsed.amount, dateIso, 'JJ', null, null)
          return
        }
      }
      setItems((prev) => [
        ...prev,
        { id: messageKey, role: 'user', text: trimmed },
        { id: `${messageKey}-a`, role: 'assistant', text: assistantText },
      ])
      setText('')
      setLoading(false)
      return
    }
    if (cashCard) {
      setItems((prev) => [
        ...prev,
        { id: messageKey, role: 'user', text: trimmed },
        { id: `${messageKey}-a`, role: 'assistant', text: 'התשלום עדיין לא נרשם. בחרו רשום תשלום, שנה פרטים, או בטל.' },
      ])
      setText('')
      setLoading(false)
      return
    }
    const next = applyUserText(draft, trimmed, {
      ...ctx,
      freshIdempotencyKey: crypto.randomUUID(),
    })
    if (next.draftIdempotencyKey !== draft.draftIdempotencyKey) {
      draftKeyRef.current = next.draftIdempotencyKey
    }
    setDraft(next)
    setItems((prev) => [
      ...prev,
      { id: messageKey, role: 'user', text: trimmed },
      { id: `${messageKey}-a`, role: 'assistant', text: promptText(next.lastPrompt, next.preface), prompt: next.lastPrompt },
    ])
    setText('')
    setPropertyQuery('')
    setLoading(false)
  }

  async function onCreateDraft() {
    if (draft.lastPrompt.kind !== 'ready' || draft.createdDraftId || creatingRef.current) return
    creatingRef.current = true
    setLoading(true)
    setError('')
    const slots = draft.slots
    const result = await createAssistantTransactionDraft({
      date: slots.date.value ?? '',
      property_name: slots.propertyName.value ?? '',
      category: slots.category.value ?? '',
      subcategory: slots.subcategory.value ?? '',
      description: slots.description.value ?? '',
      notes: slots.notes.value ?? '',
      payer: slots.payer.value ?? '',
      payee: slots.payee.value ?? '',
      amount_eur: slots.amountEur.value ?? '',
      client_charge: slots.clientCharge.value ?? '',
      idempotency_key: draft.draftIdempotencyKey,
    })
    setLoading(false)
    if (!result.ok) {
      creatingRef.current = false
      setError(result.error)
      return
    }
    const next = markDraftCreated(draft, result.draftId)
    setDraft(next)
    setItems((prev) => [
      ...prev,
      {
        id: `draft-${result.draftId}`,
        role: 'assistant',
        text: `נוצרה טיוטה ${result.draftId} במצב ${result.status}. לא בוצע אישור או רישום לחשבונות.`,
      },
    ])
  }

  async function onRecordCash() {
    if (!cashCard || cashPostedId || recordingCashRef.current) return
    if (cashCard.preview.ok === false) return
    recordingCashRef.current = true
    setLoading(true)
    setError('')
    if (cashCard.funding === 'PARTNER_PERSONAL') {
      if (!cashCard.partnerId) {
        recordingCashRef.current = false
        setLoading(false)
        setError('יש לבחור שותף מהרשימה הקנונית.')
        return
      }
      const result = await executePartnerFundedClientSettlement({
        clientEntityId: cashCard.entityId,
        partnerEntityId: cashCard.partnerId,
        amount: cashCard.amount,
        effectiveDate: cashCard.effectiveDate,
        previewHash: String(cashCard.preview.preview_hash ?? ''),
        previewSnapshot: (cashCard.preview.canonical_snapshot as Record<string, unknown>) ?? {},
        idempotencyKey: cashKeyRef.current,
      })
      setLoading(false)
      if (!result.ok) {
        recordingCashRef.current = false
        setError(result.error)
        return
      }
      setCashPostedId(result.transactionId)
      setItems((prev) => [
        ...prev,
        {
          id: `cash-${result.transactionId}`,
          role: 'assistant',
          text: [
            'התשלום נרשם.',
            `מזהה עסקה: ${result.transactionId}`,
            `לקוח: ${cashCard.entityName}`,
            `משלם בפועל: ${cashCard.partnerName} — כסף פרטי`,
            `סכום/תאריך: ${cashCard.amount} / ${cashCard.effectiveDate}`,
            'השפעת קופת JJ כרגע: €0',
            'השפעת רווח והפסד: €0',
            'מסך לקוחות: /owners',
          ].join('\n'),
        },
      ])
      return
    }
    const result = await executeClientCashSettlement({
      entityId: cashCard.entityId,
      direction: cashCard.direction,
      amount: cashCard.amount,
      effectiveDate: cashCard.effectiveDate,
      previewHash: String(cashCard.preview.preview_hash ?? ''),
      canonicalSnapshot: (cashCard.preview.canonical_snapshot as Record<string, unknown>) ?? {},
      idempotencyKey: cashKeyRef.current,
    })
    setLoading(false)
    if (!result.ok) {
      recordingCashRef.current = false
      setError(result.error)
      return
    }
    setCashPostedId(result.transactionId)
    const remainingR =
      result.reportUpdated && result.reader
        ? String(result.reader.remaining_r ?? '')
        : null
    const remainingS =
      result.reportUpdated && result.reader
        ? String(result.reader.remaining_s ?? '')
        : null
    setItems((prev) => [
      ...prev,
      {
        id: `cash-${result.transactionId}`,
        role: 'assistant',
        text: formatCashSuccess({
          transactionId: result.transactionId,
          entityName: cashCard.entityName,
          direction: cashCard.direction,
          amount: cashCard.amount,
          effectiveDate: cashCard.effectiveDate,
          balanceBefore: String(cashCard.preview.balance_before_R ?? ''),
          previewAfter: String(cashCard.preview.balance_after_R ?? ''),
          allocations: Array.isArray(cashCard.preview.allocations)
            ? cashCard.preview.allocations
            : [],
          reportUpdated: result.reportUpdated,
          remainingR,
          remainingS,
        }),
      },
    ])
  }

  const prompt = draft.lastPrompt
  const numbered = prompt.kind === 'question' ? numberedDirectChoices(prompt) : []
  const filteredProps = prompt.kind === 'question' && prompt.searchProperties
    ? props.catalog.filter((p) => p.name.toLowerCase().includes(propertyQuery.trim().toLowerCase()))
    : []

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-gray-200 bg-white px-4 pb-3 pt-16 md:px-6 md:pt-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-500" aria-hidden />
          <h1 className="text-lg font-semibold text-gray-900">JJ Assistant / העוזר שלי</h1>
        </div>
        <p className="mt-1 text-sm text-gray-600" dir="rtl">
          העוזר מכין טיוטות בלבד. שום פעולה כספית אינה מתבצעת בלי אישור.
        </p>
        <p className="mt-1 text-xs font-medium text-brand-700" dir="rtl">
          יכולת נתמכת: {ASSISTANT_CAPABILITY_LABEL}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-3 py-4 md:px-6" data-testid="assistant-thread">
        <ol className="mx-auto flex max-w-3xl flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className={item.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[92%]'}>
              <div
                dir="auto"
                className={
                  item.role === 'user'
                    ? 'rounded-2xl bg-slate-800 px-4 py-2 text-sm text-white'
                    : 'rounded-2xl bg-white px-4 py-3 text-sm text-gray-900 shadow-sm ring-1 ring-gray-200'
                }
              >
                {item.text}
              </div>
            </li>
          ))}
        </ol>

        {prompt.kind === 'question' && (
          <div className="mx-auto mt-4 max-w-3xl space-y-2" data-testid="assistant-choices">
            {numbered.map((choice, i) => (
              <button
                key={choice.id}
                type="button"
                className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-right text-sm hover:bg-gray-50"
                onClick={() => void sendBody(choice.label)}
                disabled={loading}
              >
                <span className="font-semibold"><Ltr>{i + 1}.</Ltr></span> {choice.label}
              </button>
            ))}
            {prompt.allowOther && (
              <button type="button" className="text-sm text-gray-600 underline" disabled={loading} onClick={() => void sendBody('משהו אחר')}>
                משהו אחר
              </button>
            )}
            {prompt.allowUnknown && (
              <button type="button" className="mr-3 text-sm text-gray-600 underline" disabled={loading} onClick={() => void sendBody('אני לא יודע')}>
                אני לא יודע
              </button>
            )}
            {prompt.searchProperties && (
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <label className="mb-1 block text-xs text-gray-500" htmlFor="assistant-property-search">חיפוש נכס</label>
                <input
                  id="assistant-property-search"
                  className="input w-full"
                  value={propertyQuery}
                  onChange={(e) => setPropertyQuery(e.target.value)}
                  placeholder="הקלד שם נכס"
                  autoComplete="off"
                />
                <ul className="mt-2 max-h-48 overflow-y-auto">
                  {filteredProps.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full rounded px-2 py-1.5 text-right text-sm hover:bg-gray-50"
                        onClick={() => void sendBody(p.name)}
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {prompt.kind === 'ready' && (
          <div className="mx-auto mt-4 max-w-3xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200" data-testid="assistant-review" dir="rtl">
            <h2 className="mb-3 text-sm font-semibold">סיכום לאישור — טיוטה בלבד</h2>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <ReviewRow label="תאריך" value={prompt.summary.date} />
              <ReviewRow label="נכס" value={prompt.summary.property} />
              <ReviewRow label="קטגוריה" value={prompt.summary.category} />
              <ReviewRow label="תת־קטגוריה" value={prompt.summary.subcategory} />
              <ReviewRow label="תיאור" value={prompt.summary.description} />
              <ReviewRow label="משלם" value={prompt.summary.payer} />
              <ReviewRow label="מקבל" value={prompt.summary.payee} />
              <ReviewRow label="סכום" value={prompt.summary.amount} ltr />
              <ReviewRow label="חיוב לקוח" value={prompt.summary.clientCharge} ltr />
              <ReviewRow label="הערות" value={prompt.summary.notes} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-2" dir="rtl">
              <button
                type="button"
                data-testid="assistant-create-draft"
                className="btn-primary"
                disabled={loading || Boolean(draft.createdDraftId)}
                onClick={() => void onCreateDraft()}
              >
                1. צור טיוטה
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={loading || Boolean(draft.createdDraftId)}
                onClick={() => {
                  const next = resetForChangeDetails(draft, ctx)
                  setDraft(next)
                  setItems((prev) => [...prev, { id: `change-${Date.now()}`, role: 'assistant', text: promptText(next.lastPrompt, next.preface), prompt: next.lastPrompt }])
                }}
              >
                2. שנה פרטים
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={loading || Boolean(draft.createdDraftId)}
                onClick={() => {
                  draftKeyRef.current = crypto.randomUUID()
                  const next = cancelCollector(draftKeyRef.current)
                  setDraft(next)
                  setItems((prev) => [...prev, { id: `cancel-${Date.now()}`, role: 'assistant', text: 'בוטל. לא נוצרה טיוטה.', prompt: next.lastPrompt }])
                }}
              >
                3. בטל
              </button>
            </div>
            {draft.createdDraftId && (
              <p className="mt-3 text-sm text-green-700">
                טיוטה <Ltr>{draft.createdDraftId}</Ltr>
                {' '}
                <Link href="/transactions/drafts" className="underline">מעבר לטיוטות</Link>
              </p>
            )}
          </div>
        )}

        {pendingFunding && (
          <div className="mx-auto mt-4 max-w-3xl space-y-2" data-testid="assistant-funding-choices" dir="rtl">
            <p className="text-sm font-medium">{FUNDING_QUESTION}</p>
            <button type="button" className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-right text-sm hover:bg-gray-50" disabled={loading} onClick={() => void sendBody(FUNDING_CHOICE_JJ)}>
              1. {FUNDING_CHOICE_JJ}
            </button>
            <button type="button" className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-right text-sm hover:bg-gray-50" disabled={loading} onClick={() => void sendBody(FUNDING_CHOICE_PERSONAL)}>
              2. {FUNDING_CHOICE_PERSONAL}
            </button>
            <button type="button" className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-right text-sm hover:bg-gray-50" disabled={loading} onClick={() => void sendBody(FUNDING_CHOICE_CANCEL)}>
              3. {FUNDING_CHOICE_CANCEL}
            </button>
          </div>
        )}

        {cashCard && (
          <div className="mx-auto mt-4 max-w-3xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200" data-testid="assistant-cash-review" dir="rtl">
            <h2 className="mb-3 text-sm font-semibold">
              {cashCard.funding === 'PARTNER_PERSONAL' ? PERSONAL_SUMMARY_TITLE : CASH_SUMMARY_TITLE}
            </h2>
            <p className="text-sm">{cashCard.entityName} · {cashCard.direction} · {cashCard.amount} · {cashCard.effectiveDate}</p>
            {cashCard.funding === 'PARTNER_PERSONAL' && (
              <p className="mt-2 text-sm">משלם בפועל: {cashCard.partnerName} — כסף פרטי</p>
            )}
            <p className="mt-2 text-xs text-gray-600">
              R לפני: {String(cashCard.preview.balance_before_R ?? '')} · R אחרי: {String(cashCard.preview.balance_after_R ?? '')}
            </p>
            {cashCard.funding === 'PARTNER_PERSONAL' && (
              <p className="mt-2 text-xs text-gray-600">
                יתרת JJ לשותף לפני: {String(cashCard.preview.partner_balance_before ?? '')}
                {' · '}
                אחרי: {String(cashCard.preview.partner_balance_after ?? '')}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-600">
              השפעת קופת JJ כרגע: €{String(cashCard.preview.company_cash_effect ?? (cashCard.funding === 'PARTNER_PERSONAL' ? '0' : ''))}
              {' · '}
              השפעת רווח והפסד: €{String(cashCard.preview.pnl_effect ?? '0')}
            </p>
            {cashCard.preview.blocked_code != null && (
              <p className="mt-2 text-sm text-red-700">חסום: {String(cashCard.preview.blocked_code)}</p>
            )}
            <ul className="mt-3 space-y-1 text-sm">
              {(Array.isArray(cashCard.preview.allocations) ? cashCard.preview.allocations : []).map((row, i) => {
                const alloc = row as Record<string, unknown>
                return (
                  <li key={`${String(alloc.property_id ?? i)}-${i}`}>
                    נכס <Ltr>{String(alloc.property_id ?? '')}</Ltr>
                    {' · '}
                    {String(alloc.amount_applied ?? '')}
                    {' · נותר '}
                    {String(alloc.remaining_after ?? '')}
                  </li>
                )
              })}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2" dir="rtl">
              <button
                type="button"
                data-testid="assistant-record-cash"
                className="btn-primary"
                disabled={loading || Boolean(cashPostedId) || cashCard.preview.ok === false}
                onClick={() => void onRecordCash()}
              >
                1. רשום תשלום
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={loading || Boolean(cashPostedId)}
                onClick={() => {
                  setCashCard(null)
                  setPendingCash(null)
                  setPendingName(null)
                  setPendingFunding(null)
                  setPendingPartner(null)
                  cashKeyRef.current = crypto.randomUUID()
                }}
              >
                2. שנה פרטים
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={loading || Boolean(cashPostedId)}
                onClick={() => {
                  setCashCard(null)
                  setPendingCash(null)
                  setPendingName(null)
                  setPendingFunding(null)
                  setPendingPartner(null)
                  cashKeyRef.current = crypto.randomUUID()
                }}
              >
                3. בטל
              </button>
            </div>
            {cashPostedId && (
              <p className="mt-3 text-sm text-green-700">
                התשלום נרשם.{' '}
                <Link href="/owners" className="underline">מעבר למסך הלקוחות</Link>
              </p>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <footer className="flex-shrink-0 border-t border-gray-200 bg-white px-3 py-3 md:px-6">
        <p className="mb-2 text-xs text-gray-500" dir="rtl">{MIC_PRIVACY_LABEL}</p>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {speech.error && <p className="mb-2 text-sm text-red-600">{speech.error}</p>}
        {!speech.supported && (
          <p className="mb-2 text-xs text-gray-500">{speech.unsupportedMessage}</p>
        )}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <label htmlFor="assistant-input" className="sr-only">הודעה</label>
          <textarea
            id="assistant-input"
            data-testid="assistant-input"
            className="input min-h-[48px] flex-1 resize-none"
            rows={2}
            dir="auto"
            value={text}
            disabled={loading}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendBody(text)
              }
            }}
            placeholder="כתבו או דיברו בעברית…"
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="assistant-lang" className="sr-only">שפת הכתבה</label>
            <select
              id="assistant-lang"
              className="input py-1 text-xs"
              value={speech.lang}
              onChange={(e) => speech.setLang(e.target.value as typeof speech.lang)}
              disabled={speech.listening}
            >
              {speech.langs.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
            {speech.listening ? (
              <button type="button" className="btn-secondary" aria-label="Stop listening" onClick={speech.stop}>
                <Square className="mx-auto h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                aria-label="Start microphone"
                onClick={speech.start}
                disabled={!speech.supported || loading}
              >
                {speech.supported ? <Mic className="mx-auto h-4 w-4" /> : <MicOff className="mx-auto h-4 w-4" />}
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary whitespace-nowrap px-2 text-xs"
            aria-label="עסקה חדשה"
            data-testid="assistant-new-transaction"
            disabled={loading || Boolean(draft.createdDraftId)}
            onClick={() => {
              draftKeyRef.current = crypto.randomUUID()
              const next = resetForNewProposal(draft, draftKeyRef.current)
              setDraft(next)
              setItems((prev) => [...prev, {
                id: `new-${Date.now()}`,
                role: 'assistant',
                text: promptText(next.lastPrompt, next.preface),
                prompt: next.lastPrompt,
              }])
            }}
          >
            עסקה חדשה
          </button>
          <button type="button" className="btn-secondary" aria-label="Clear typed text" onClick={() => setText('')} disabled={!text}>
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="assistant-send"
            className="btn-primary"
            aria-label="Send"
            disabled={loading || !text.trim()}
            onClick={() => void sendBody(text)}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {speech.listening && (
          <p className="mt-2 text-center text-xs font-medium text-red-600" data-testid="assistant-listening">מאזין…</p>
        )}
        {loading && <p className="mt-2 text-center text-xs text-gray-500">שולח…</p>}
      </footer>
    </div>
  )
}

function promptText(prompt: AssistantPrompt, preface?: string): string {
  let body = ''
  if (prompt.kind === 'unsupported') body = prompt.message
  else if (prompt.kind === 'ready') body = 'זה הסיכום. טיוטה תיווצר רק אחרי לחיצה על צור טיוטה.'
  else body = prompt.prompt
  if (preface && preface.trim()) return `${preface}\n${body}`
  return body
}

function ReviewRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium" dir={ltr ? 'ltr' : 'auto'}>{value}</dd>
    </div>
  )
}
