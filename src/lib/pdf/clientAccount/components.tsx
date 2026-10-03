/**
 * Reusable presentation components for the client-account PDF.
 * Every component renders data it receives — no client-specific values live here.
 */
import React from 'react'
import { Text, View } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { fmt } from '../formatters'
import {
  balanceDirectionText,
  completedTransferText,
  propertyLayerSummaries,
  periodHeaderText,
  settlementClosingDisplay,
  tableFlexDirection,
} from '../../report/clientAccount/presentation'
import type { ReportLanguage } from '../../report/clientAccount/presentation'
import { TERMS, term } from '../../report/clientAccount/terminology'
import type {
  CertifiedStrMonthlySection,
  ClientAccountDocument,
  ClosingDirection,
  ComponentSummary,
  DisplayLine,
  PropertyAccount,
} from '../../report/clientAccount/types'
import { colors, columns, ink, styles as s, typography, wash } from './theme'

type StyleProp = Style | Style[] | undefined

function styleList(style: StyleProp): Style[] {
  return Array.isArray(style) ? style : style ? [style] : []
}

// ---------- Bidi-safe text primitives ----------

/** Hebrew sentence with Latin/number tokens: each token is its own node so react-pdf cannot reorder it. */
export function RtlLine({ text, style, pack = 'end', grow = false }: { text: string; style?: StyleProp; pack?: 'start' | 'end'; grow?: boolean }) {
  const parts = text
    .split(/(\d[\d.,]*\d|\d|[A-Za-z€][A-Za-z0-9€.,]*|[–—])/g)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const styles = styleList(style)
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: pack === 'start' ? 'flex-start' : 'flex-end', flexGrow: grow ? 1 : 0, flexShrink: 1, paddingHorizontal: grow ? 6 : 0 }}>
      {parts.map((part, index) => (
        <View key={`${part}-${index}`} style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
          {index > 0 && !/^[.,:]$/.test(part) ? <View style={{ width: 4 }} /> : null}
          <Text style={styles}>{part}</Text>
        </View>
      ))}
    </View>
  )
}

/**
 * Description cell. react-pdf ignores textAlign on a flex-grown Text inside a row,
 * so alignment is done by the wrapping View (start edge = right in Hebrew).
 */
export function Desc({ text, language, style, muted = false, bold = false }: { text: string; language: ReportLanguage; style?: StyleProp; muted?: boolean; bold?: boolean }) {
  return (
    <View style={[s.desc, { alignItems: language === 'he' ? 'flex-end' : 'flex-start' }]}>
      <Text style={[muted ? { color: colors.muted } : {}, bold ? s.bold : {}, ...styleList(style)]}>{text}</Text>
    </View>
  )
}

export function Phrase({ text, language, color, size = typography.status, bold = false }: { text: string; language: ReportLanguage; color: string; size?: number; bold?: boolean }) {
  const style = { fontSize: size, color, fontWeight: bold ? 'bold' as const : 'normal' as const }
  if (language === 'en') return <Text style={style}>{text}</Text>
  return <RtlLine text={text} style={style} />
}

export function DateText({ label, language }: { label: string; language: ReportLanguage }) {
  const align = language === 'he' ? 'right' as const : 'left' as const
  const textStyle = [s.dateText, { textAlign: align }]
  if (language === 'en') return <Text style={textStyle}>{label}</Text>
  const match = /^(\S+)\s+(\d{4})$/.exec(label.trim())
  if (!match) return <Text style={textStyle}>{label}</Text>
  return (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'flex-start' }}>
      <Text style={textStyle}>{match[1]}</Text>
      <View style={{ width: 4 }} />
      <Text style={textStyle}>{match[2]}</Text>
    </View>
  )
}

export function DateColumn({ line, language }: { line: Pick<DisplayLine, 'monthLabel' | 'paymentMonthLabel'>; language: ReportLanguage }) {
  return (
    <View style={s.month}>
      <DateText label={line.monthLabel} language={language} />
      {line.paymentMonthLabel ? (
        <View style={{ flexDirection: tableFlexDirection(language), marginTop: 1 }}>
          <Text style={{ fontSize: 7, color: colors.muted }}>{term('paid', language)}</Text>
          <View style={{ width: 3 }} />
          <DateText label={line.paymentMonthLabel} language={language} />
        </View>
      ) : null}
    </View>
  )
}

export function CutoffLine({ cutoff, periodStart, language, style }: { cutoff: string; periodStart?: string | null; language: ReportLanguage; style?: StyleProp }) {
  const textStyle = [s.meta, ...styleList(style)]
  if (language === 'en') return <Text style={textStyle}>{periodHeaderText(cutoff, periodStart ?? null, language)}</Text>
  if (!periodStart) {
    return (
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
        <Text style={textStyle}>עד תאריך</Text>
        <Text style={textStyle}>:</Text>
        <Text style={[...textStyle, { marginHorizontal: 4 }]}>{cutoff}</Text>
        <Text style={textStyle}>כולל</Text>
        <Text style={textStyle}>.</Text>
      </View>
    )
  }
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
      <Text style={textStyle}>מתאריך</Text>
      <Text style={[...textStyle, { marginHorizontal: 4 }]}>{periodStart}</Text>
      <Text style={textStyle}>עד תאריך</Text>
      <Text style={[...textStyle, { marginHorizontal: 4 }]}>{cutoff}</Text>
      <Text style={textStyle}>כולל</Text>
      <Text style={textStyle}>.</Text>
    </View>
  )
}

// ---------- Brand & headers ----------

export function Wordmark() {
  return (
    <View style={s.wordmarkRow}>
      <View style={s.wordmarkBar} />
      <Text style={s.wordmark}>JJ Property</Text>
    </View>
  )
}

export function ReportHeader({ title, clientName, cutoff, periodStart = null, language }: { title: string; clientName: string; cutoff: string; periodStart?: string | null; language: ReportLanguage }) {
  return (
    <View style={s.header}>
      <View style={s.headerRow}>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.title}>{title}</Text>
          <View style={{ flexDirection: tableFlexDirection(language), marginTop: 2 }}>
            <Text style={s.subtitle}>{term('client', language)}</Text>
            <Text style={s.subtitle}>:</Text>
            <View style={{ width: 4 }} />
            <Text style={s.subtitle}>{clientName}</Text>
          </View>
          <CutoffLine cutoff={cutoff} periodStart={periodStart} language={language} />
        </View>
        <Wordmark />
      </View>
      <View style={s.divider} />
    </View>
  )
}

export function PropertyHeader({ title, subtitle, cutoff, periodStart = null, language }: { title: string; subtitle: string; cutoff: string; periodStart?: string | null; language: ReportLanguage }) {
  return (
    <View style={s.header} wrap={false}>
      <View style={s.headerRow}>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.propertyTitle}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>
        <View style={{ alignItems: 'flex-start' }}>
          <Wordmark />
          <View style={{ marginTop: 3 }}>
            <CutoffLine cutoff={cutoff} periodStart={periodStart} language={language} />
          </View>
        </View>
      </View>
      <View style={s.divider} />
    </View>
  )
}

/**
 * Shown only on the 2nd+ page of a property/unit: "<title> — המשך".
 * The slot has a constant height on every page: pagination is computed once, so a taller
 * fixed element on continuation pages would push the last row past the footer-safe zone.
 */
export function ContinuationTitle({ title, language }: { title: string; language: ReportLanguage }) {
  const label = `${title} — ${term('continued', language)}`
  return (
    <View fixed style={s.continuedSlot}>
      <Text
        style={[s.continued, { textAlign: language === 'he' ? 'right' : 'left' }]}
        render={({ subPageNumber }) => (subPageNumber > 1 ? label : '')}
      />
    </View>
  )
}

// ---------- Balance cards ----------

export function BalanceCard({ direction, amount, label, language, hero = false }: { direction: ClosingDirection; amount: number; label: string; language: ReportLanguage; hero?: boolean }) {
  const color = ink(direction)
  if (hero) {
    return (
      <View style={[s.heroCard, { backgroundColor: wash(direction), borderRightColor: color }]} wrap={false}>
        <Phrase text={label} language={language} color={color} size={13} bold />
        <Text style={[s.heroAmount, { color }]}>{fmt(Math.abs(amount))}</Text>
      </View>
    )
  }
  return (
    <View style={[s.balanceCard, { backgroundColor: wash(direction), borderRightColor: color, flexDirection: tableFlexDirection(language), justifyContent: 'space-between', alignItems: 'center' }]} wrap={false}>
      <Phrase text={label} language={language} color={color} size={10} bold />
      <View style={s.gap} />
      <Text style={[s.propertyAmount, { color }]}>{fmt(Math.abs(amount))}</Text>
    </View>
  )
}

// ---------- Section & table primitives ----------

export function SectionHeader({ title, language }: { title: string; language: ReportLanguage }) {
  return (
    <View style={s.sectionBand}>
      <Text style={[s.sectionTitle, { textAlign: language === 'he' ? 'right' : 'left' }]}>{title}</Text>
    </View>
  )
}

export function ColumnHeader({ language, withDate = true }: { language: ReportLanguage; withDate?: boolean }) {
  return (
    <View style={[s.colHeadRow, { flexDirection: tableFlexDirection(language) }]}>
      {withDate ? <Text style={[s.colHead, s.month]}>{term('date', language)}</Text> : null}
      <Desc text={term('description', language)} language={language} style={s.colHead} />
      <Text style={[s.colHead, s.direction]}>{term('status', language)}</Text>
      <View style={s.gap} />
      <Text style={[s.colHead, s.amount]}>{term('amount', language)}</Text>
    </View>
  )
}

export function TableRow({
  language,
  date,
  description,
  direction,
  amount,
  tint = false,
  style,
}: {
  language: ReportLanguage
  date: React.ReactNode
  description: React.ReactNode
  direction: React.ReactNode
  amount: React.ReactNode
  tint?: boolean
  style?: StyleProp
}) {
  return (
    <View style={[s.row, { flexDirection: tableFlexDirection(language) }, tint ? s.rowTint : {}, ...styleList(style)]} wrap={false} minPresenceAhead={24}>
      {date}
      {description}
      {direction}
      <View style={s.gap} />
      {amount}
    </View>
  )
}

export function lineAmountDirection(line: DisplayLine): ClosingDirection {
  if (line.statusLabel === TERMS.paidStatus.he || line.statusLabel === TERMS.paidStatus.en) return 'settled'
  if (line.effect === 'credit') return 'jj_owes_client'
  if (line.effect === 'reference') return 'settled'
  return 'client_owes_jj'
}

export function DetailTable({
  lines,
  language,
  zebra = false,
  monthSeparators = false,
  startIndex = 0,
  previousMonthLabel,
}: {
  lines: readonly DisplayLine[]
  language: ReportLanguage
  zebra?: boolean
  monthSeparators?: boolean
  startIndex?: number
  previousMonthLabel?: string
}) {
  return (
    <View>
      {lines.map((line, index) => {
        const amountDirection = lineAmountDirection(line)
        const neutral = Boolean(line.statusLabel) || line.directionText === completedTransferText(language)
        const previous = index === 0 ? previousMonthLabel : lines[index - 1].monthLabel
        const monthBreak = monthSeparators && previous != null && previous !== line.monthLabel
        return (
          <TableRow
            key={`${line.countedIn}-${line.traceSourceId || index}-${index}`}
            language={language}
            tint={zebra && (startIndex + index) % 2 === 1}
            style={monthBreak ? s.rowMonthBreak : undefined}
            date={<DateColumn line={line} language={language} />}
            description={(
              <View style={[s.desc, { alignItems: language === 'he' ? 'flex-end' : 'flex-start' }]}>
                {language === 'he'
                  ? <RtlLine text={line.clientText} pack="start" grow />
                  : <Text style={{ textAlign: 'left' }}>{line.clientText}</Text>}
                {line.clientChargeDefaulted ? (
                  <Text style={{ fontSize: 7, color: colors.muted }}>{term('chargeDefaulted', language)}</Text>
                ) : null}
              </View>
            )}
            direction={(
              <View style={s.direction}>
                <Phrase text={line.directionText} language={language} color={neutral ? colors.muted : ink(amountDirection)} />
              </View>
            )}
            amount={<Text style={[s.amount, { color: ink(amountDirection) }]}>{fmt(line.amount)}</Text>}
          />
        )
      })}
    </View>
  )
}

export function SummaryBox({ summary, language }: { summary: ComponentSummary; language: ReportLanguage }) {
  const labels = summary.kind === 'purchase'
    ? [term('purchasePrice', language), term('purchasePricePayments', language), term('purchaseAncillary', language), term('purchaseRemaining', language)]
    : [term('agreedAmount', language), term('paymentsTotal', language), term('ancillaryCharges', language), term('renovationRemaining', language)]
  const amounts = [summary.agreed, summary.payments, summary.ancillary, summary.balance]
  const state = summary.state === 'closed' ? term('closed', language) : term('open', language)
  const balanceDirection: ClosingDirection = Math.abs(summary.balance) < 0.005 ? 'settled' : 'client_owes_jj'
  return (
    <View style={s.summaryBox}>
      {labels.map((label, index) => (
        <TableRow
          key={label}
          language={language}
          date={<Text style={[s.stateText, { width: columns.date, color: ink(balanceDirection) }]}>{index === 3 ? state : ' '}</Text>}
          description={<Desc text={label} language={language} bold={index === 3} />}
          direction={<View style={s.direction} />}
          amount={<Text style={[s.amount, { color: index === 3 ? ink(balanceDirection) : colors.navy }, index === 3 ? s.bold : {}]}>{fmt(amounts[index])}</Text>}
        />
      ))}
      {summary.receipts != null ? (
        <TableRow
          key="receipts"
          language={language}
          date={<Text style={[s.stateText, { width: columns.date }]}>{' '}</Text>}
          description={<Desc text={term('totalReceipts', language)} language={language} />}
          direction={<View style={s.direction} />}
          amount={<Text style={[s.amount, { color: colors.navy }]}>{fmt(summary.receipts)}</Text>}
        />
      ) : null}
      {summary.explanation ? <Text style={s.note}>{summary.explanation}</Text> : null}
    </View>
  )
}

/** Section heading + optional purchase/renovation summary + detail rows. Heading and first row never separate. */
export function DetailSection({
  title,
  lines,
  language,
  summary,
}: {
  title: string
  lines: readonly DisplayLine[]
  language: ReportLanguage
  summary?: ComponentSummary
}) {
  if (lines.length === 0 && !summary) return null
  const zebra = lines.length > 8
  const monthSeparators = lines.length > 12
  // A section of up to three rows is kept whole: splitting it across pages leaves
  // a heading with a single orphan row on one side.
  const keepWhole = lines.length <= 3
  return (
    <View wrap={!keepWhole}>
      <View wrap={false}>
        <SectionHeader title={title} language={language} />
        {summary ? <SummaryBox summary={summary} language={language} /> : null}
        {lines.length > 0 ? <ColumnHeader language={language} /> : null}
        {lines.length > 0 ? <DetailTable lines={lines.slice(0, 1)} language={language} zebra={zebra} /> : null}
      </View>
      <DetailTable
        lines={lines.slice(1)}
        language={language}
        zebra={zebra}
        monthSeparators={monthSeparators}
        startIndex={1}
        previousMonthLabel={lines[0]?.monthLabel}
      />
    </View>
  )
}

// ---------- Category summary ----------

function layerStateLabel(state: 'closed' | 'open' | 'informational', language: ReportLanguage): string {
  if (state === 'closed') return term('closed', language)
  if (state === 'informational') return term('information', language)
  return term('open', language)
}

export function CategorySummary({ property, clientName, language, closingTitle = null }: { property: PropertyAccount; clientName: string; language: ReportLanguage; closingTitle?: string | null }) {
  const layers = propertyLayerSummaries(property, language)
  const flex = tableFlexDirection(language)
  return (
    <View style={s.card} minPresenceAhead={48}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{term('propertyAccountSummary', language)}</Text>
      </View>
      <View style={s.cardBody}>
        <View style={[s.colHeadRow, { flexDirection: flex }]}>
          <Text style={[s.colHead, s.stateText]}>{term('status', language)}</Text>
          <Desc text={term('component', language)} language={language} style={s.colHead} />
          <Text style={[s.colHead, s.figure]}>{term('charges', language)}</Text>
          <Text style={[s.colHead, s.figure]}>{term('credits', language)}</Text>
          <Text style={[s.colHead, s.direction]}>{term('direction', language)}</Text>
          <View style={s.gap} />
          <Text style={[s.colHead, s.amount]}>{term('balance', language)}</Text>
        </View>
        {layers.map((layer) => {
          const closing = layer.key === 'closing'
          const title = closing && closingTitle ? closingTitle : layer.title
          const status = closing && closingTitle ? '' : layerStateLabel(layer.state, language)
          const color = closing || layer.state !== 'closed' ? ink(layer.direction) : colors.muted
          return (
            <View key={layer.key} style={[s.row, { flexDirection: flex }, closing ? s.rowTotal : {}]} wrap={false}>
              <Text style={[s.stateText, { color }]}>{status}</Text>
              <Desc text={title} language={language} bold={closing} />
              <Text style={[s.figure, { color: colors.muted }]}>{closing ? '' : fmt(layer.charges)}</Text>
              <Text style={[s.figure, { color: colors.muted }]}>{closing ? '' : fmt(layer.credits)}</Text>
              <View style={s.direction}>
                {closing && closingTitle ? null : (
                  <Phrase text={balanceDirectionText(clientName, layer.direction, language, closing ? 'balance' : 'movement')} language={language} color={color} bold={closing} />
                )}
              </View>
              <View style={s.gap} />
              <Text style={[s.amount, { color: ink(layer.direction) }, closing ? s.bold : {}]}>{fmt(Math.abs(layer.balance))}</Text>
            </View>
          )
        })}
        <Text style={s.note}>{term('closingCountedOnce', language)}</Text>
      </View>
    </View>
  )
}

// ---------- Monthly STR ----------

export function MonthlyStrTable({ section, language, minPresenceAhead }: { section: CertifiedStrMonthlySection; language: ReportLanguage; minPresenceAhead?: number }) {
  const he = language === 'he'
  const flex = tableFlexDirection(language)
  const widths = [110, 80, 80, 90]
  const cell = (text: string, index: number, bold = false) => (
    <Text key={`${text}-${index}`} style={{ width: widths[index], fontSize: 8.5, textAlign: index === 0 ? (he ? 'right' : 'left') : 'center', fontWeight: bold ? 'bold' : 'normal', color: colors.text }}>{text}</Text>
  )
  const reservationsTotal = section.months.some((month) => month.reservationCount == null)
    ? term('unavailable', language)
    : String(section.months.reduce((sum, month) => sum + (month.reservationCount || 0), 0))
  const nightsTotal = section.months.some((month) => month.nights == null)
    ? term('unavailable', language)
    : String(section.months.reduce((sum, month) => sum + (month.nights || 0), 0))
  return (
    <View wrap={false} minPresenceAhead={minPresenceAhead}>
      <SectionHeader title={term('strOwnerNet', language)} language={language} />
      <Text style={s.note}>{term('strMonthlyNote', language)}</Text>
      <View style={[s.colHeadRow, { flexDirection: flex, marginTop: 3 }]}>
        {[term('monthYear', language), term('reservations', language), term('nights', language), term('ownerNet', language)].map((text, index) => (
          <Text key={text} style={[s.colHead, { width: widths[index], textAlign: index === 0 ? (he ? 'right' : 'left') : 'center' }]}>{text}</Text>
        ))}
      </View>
      {section.months.map((month, rowIndex) => (
        <View key={month.monthStart} style={[s.row, { flexDirection: flex }, rowIndex % 2 === 1 ? s.rowTint : {}]}>
          <View style={{ width: widths[0], alignItems: he ? 'flex-end' : 'flex-start' }}>
            <DateText label={month.monthLabel} language={language} />
          </View>
          {cell(month.reservationCountLabel, 1)}
          {cell(month.nightsLabel, 2)}
          {cell(fmt(month.ownerNet), 3)}
        </View>
      ))}
      <View style={[s.row, s.rowTotal, { flexDirection: flex }]}>
        {cell(term('total', language), 0, true)}
        {cell(reservationsTotal, 1, true)}
        {cell(nightsTotal, 2, true)}
        {cell(fmt(section.totalOwnerNet), 3, true)}
      </View>
      <Text style={s.note}>{term('strMonthlyFootnote', language)}</Text>
    </View>
  )
}

/** Client closing bridge. Renders the existing settlement steps; the last row is the result. */
export function SettlementClosingBridge({ doc }: { doc: ClientAccountDocument }) {
  const language = doc.reportLanguage
  const hasClientMovement = doc.settlementBridge.steps.some((step) => step.kind === 'payment' || step.kind === 'credit' || step.kind === 'cash-allocation')
  if (!hasClientMovement) return null
  const rows = settlementClosingDisplay(doc)
  const result = rows.find((row) => row.result)
  const movements = rows.filter((row) => !row.result)
  if (!result) return null
  const sum = movements.reduce((total, row) => total + row.signedDueToJj, 0)
  if (Math.abs(sum - result.signedDueToJj) > 0.02) {
    throw new Error(`settlement closing display ${sum} does not equal ${result.signedDueToJj}.`)
  }
  const flex = tableFlexDirection(language)
  const he = language === 'he'
  return (
    <View style={s.card} wrap={false}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{term('closingBridge', language)}</Text>
      </View>
      <View style={s.cardBody}>
        {rows.map((row) => {
          const direction: ClosingDirection = row.signedDueToJj > 0 ? 'client_owes_jj' : row.signedDueToJj < 0 ? 'jj_owes_client' : 'settled'
          const sign = row.result || row.signedDueToJj >= 0 ? '' : '−'
          return (
            <View key={`${row.label}-${row.signedDueToJj}-${row.result ? 'result' : 'step'}`} style={[s.row, row.result ? s.rowTotal : {}, { flexDirection: flex }]}>
              <Text style={[s.sign, { color: ink(direction) }]}>{sign}</Text>
              <View style={[s.desc, { alignItems: he ? 'flex-end' : 'flex-start' }]}>
                {he
                  ? <RtlLine text={row.label} pack="end" style={{ fontSize: 9, color: ink(direction), fontWeight: row.result ? 'bold' : 'normal' }} />
                  : <Desc text={row.label} language={language} bold={row.result} />}
              </View>
              <View style={s.gap} />
              <Text style={[s.amount, row.result ? s.bold : {}, { color: ink(direction) }]}>{fmt(Math.abs(row.signedDueToJj))}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ---------- Closing bridge & status ----------

export function ClosingBridge({ property, clientName, language, title, resultLabel }: { property: PropertyAccount; clientName: string; language: ReportLanguage; title?: string; resultLabel?: string }) {
  const flex = tableFlexDirection(language)
  const sum = property.bridge.reduce((total, step) => total + step.signedDueToJj, 0)
  if (Math.abs(sum - property.amountDueToJj) > 0.02) {
    throw new Error(`${property.propertyName}: closing bridge ${sum} does not equal certified ${property.amountDueToJj}.`)
  }
  const resultColor = ink(property.direction)
  return (
    <View style={s.card} wrap={false}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{title || term('closingBridge', language)}</Text>
      </View>
      <View style={s.cardBody}>
        {property.bridge.map((step) => {
          const direction: ClosingDirection = step.signedDueToJj > 0 ? 'client_owes_jj' : step.signedDueToJj < 0 ? 'jj_owes_client' : 'settled'
          const neutral = step.directionText !== balanceDirectionText(clientName, direction, language)
          const sign = step.signedDueToJj > 0 ? '+' : step.signedDueToJj < 0 ? '−' : ''
          return (
            <View key={step.label} style={[s.row, { flexDirection: flex }]}>
              <Text style={[s.sign, { color: ink(direction) }]}>{sign}</Text>
              <Desc text={step.label} language={language} />
              <View style={s.direction}>
                <Phrase text={step.directionText} language={language} color={neutral ? colors.muted : ink(direction)} />
              </View>
              <View style={s.gap} />
              <Text style={[s.amount, { color: ink(direction) }]}>{fmt(Math.abs(step.signedDueToJj))}</Text>
            </View>
          )
        })}
        <View style={[s.row, s.rowTotal, { flexDirection: flex }]}>
          <Text style={[s.sign, { color: resultColor }]}>=</Text>
          <Desc text={resultLabel || term('propertyBalance', language)} language={language} bold />
          <View style={s.direction}>
            <Phrase text={balanceDirectionText(clientName, property.direction, language, 'balance')} language={language} color={resultColor} bold />
          </View>
          <View style={s.gap} />
          <Text style={[s.amount, s.bold, { color: resultColor }]}>{fmt(Math.abs(property.amountDueToJj))}</Text>
        </View>
      </View>
    </View>
  )
}

export function StateChip({ open, language }: { open: boolean; language: ReportLanguage }) {
  const color = open ? colors.red : colors.muted
  const background = open ? colors.redBg : colors.neutralBg
  const label = open ? term('open', language) : term('closed', language)
  return (
    <View style={[s.chip, { backgroundColor: background }]}>
      <Text style={[s.chipText, { color }]}>{label}</Text>
    </View>
  )
}

export function OpenClosedStatus({ property, clientName, language, finalOpen }: { property: PropertyAccount; clientName: string; language: ReportLanguage; finalOpen?: { label: string; amount: number; direction: ClosingDirection } | null }) {
  const he = language === 'he'
  return (
    <View wrap={false}>
      <SectionHeader title={term('openClosed', language)} language={language} />
      {property.statusLines.map((status) => {
        const replacement = finalOpen && status.label === term('propertyBalance') ? finalOpen : null
        const label = replacement ? replacement.label : status.label
        const amount = replacement ? replacement.amount : status.amount
        const direction = replacement ? replacement.direction : status.direction
        const open = replacement ? replacement.direction !== 'settled' : status.state !== 'closed'
        const color = open ? ink(direction) : colors.muted
        return (
          <TableRow
            key={label}
            language={language}
            date={<View style={[s.month, { alignItems: he ? 'flex-end' : 'flex-start' }]}><StateChip open={open} language={language} /></View>}
            description={<Desc text={label} language={language} muted={!open} />}
            direction={(
              <View style={s.direction}>
                <Phrase text={balanceDirectionText(clientName, direction, language, 'balance')} language={language} color={color} />
              </View>
            )}
            amount={<Text style={[s.amount, { color }]}>{fmt(amount)}</Text>}
          />
        )
      })}
    </View>
  )
}

/** Bridge, open/closed status and (on the last page) the document note move as one block — never orphaned. */
export function ClosingBlock({ property, clientName, language, documentNoteCutoff, bridgeTitle, bridgeNote, resultLabel, finalOpen }: { property: PropertyAccount; clientName: string; language: ReportLanguage; documentNoteCutoff?: string; bridgeTitle?: string; bridgeNote?: string | null; resultLabel?: string; finalOpen?: { label: string; amount: number; direction: ClosingDirection } | null }) {
  return (
    <View wrap={false}>
      <ClosingBridge property={property} clientName={clientName} language={language} title={bridgeTitle} resultLabel={resultLabel} />
      {bridgeNote ? (
        <View style={s.documentNote} wrap={false}>
          {bridgeNote.split(/(?<=\.)\s+/).map((line) => (
            language === 'he'
              ? <RtlLine key={line} text={line} style={s.note} />
              : <Text key={line} style={s.note}>{line}</Text>
          ))}
        </View>
      ) : null}
      <OpenClosedStatus property={property} clientName={clientName} language={language} finalOpen={finalOpen} />
      {documentNoteCutoff ? <DocumentNote cutoff={documentNoteCutoff} language={language} /> : null}
    </View>
  )
}

// ---------- Footer & document note ----------

export function ReportFooter({ clientName, cutoff, language }: { clientName: string; cutoff: string; language: ReportLanguage }) {
  const he = language === 'he'
  return (
    <>
      <View style={s.footerRule} fixed />
      <View style={s.footerRight} fixed>
        <Text style={s.footerBrand}>JJ Property</Text>
      </View>
      <View style={s.footerCenter} fixed>
        <Text style={s.footerText}>{term('clientReport', language)}</Text>
        <Text style={[s.footerText, { marginHorizontal: 3 }]}>—</Text>
        <Text style={s.footerText}>{clientName}</Text>
        <Text style={[s.footerText, { marginHorizontal: 4 }]}>·</Text>
        <Text style={s.footerText}>{cutoff}</Text>
      </View>
      <View style={[s.footerLeft, { flexDirection: he ? 'row-reverse' : 'row' }]} fixed>
        <Text style={s.footerText}>{term('page', language)}</Text>
        <Text style={[s.footerText, { marginHorizontal: 3 }]} render={({ pageNumber }) => `${pageNumber}`} />
        <Text style={s.footerText}>{term('of', language)}</Text>
        <Text style={[s.footerText, { marginHorizontal: 3 }]} render={({ totalPages }) => `${totalPages}`} />
      </View>
    </>
  )
}

export function DocumentNote({ cutoff, language }: { cutoff: string; language: ReportLanguage }) {
  const text = language === 'he'
    ? `הדוח הופק על בסיס הפעילות וההתחשבנות המאושרת עד ליום ${cutoff}.`
    : `This report is based on the approved activity and settlement through ${cutoff}.`
  return (
    <View style={s.documentNote} wrap={false}>
      {language === 'he' ? <RtlLine text={text} style={s.note} /> : <Text style={s.note}>{text}</Text>}
    </View>
  )
}
