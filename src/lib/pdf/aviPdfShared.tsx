/**
 * Shared presentation primitives for Avi partner-report react-pdf.
 * No settlement math. RTL via separate Text runs (no char reverse / bidi marks).
 */
import React from 'react'
import { Text, View, StyleSheet } from '@react-pdf/renderer'
import {
  HEBREW_MONTH_STANDALONE,
  HEBREW_MONTH_WITH_BE,
  parseAviIsoDate,
} from '@/components/finance/HebrewDate'
import type { AviReportLang } from '@/components/finance/aviReportCopy'
import { AVI_REPORT_COLORS as C } from '@/components/finance/aviReportTokens'
import {
  rtlColumnOrder,
  rtlRowDirection,
  rtlTextStyle,
} from '@/lib/pdf/rtlHelpers'
import { fmt } from '@/lib/pdf/formatters'

export const AVI_PDF_GENERATED_ISO = '2026-09-15'

export const toneBg: Record<string, string> = {
  navy: C.navy,
  blue: C.blue,
  orange: C.orange,
  purple: C.purple,
  green: C.green,
}

export const shared = StyleSheet.create({
  section: { marginBottom: 10 },
  accountBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 3,
  },
  accountTitle: { fontSize: 10, fontWeight: 'bold', color: C.white, marginBottom: 2 },
  accountSub: { fontSize: 7, color: 'rgba(255,255,255,0.82)', lineHeight: 1.35, maxWidth: 320 },
  accountRight: { alignItems: 'flex-end' },
  accountAmount: { fontSize: 11, fontWeight: 'bold', color: C.white },
  accountHint: { fontSize: 6.5, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
  kpiStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  kpiTile: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 90,
    backgroundColor: C.grayBg,
    borderWidth: 0.5,
    borderColor: C.grayBorder,
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  kpiLabel: { fontSize: 6.5, color: C.grayText, marginBottom: 2 },
  kpiValue: { fontSize: 9, fontWeight: 'bold', color: C.grayDark },
  kpiHint: { fontSize: 6, color: C.grayText, marginTop: 2 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.grayBg,
    borderBottomWidth: 0.6,
    borderBottomColor: C.grayBorder,
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.35,
    borderBottomColor: C.grayLine,
    paddingVertical: 2.5,
    paddingHorizontal: 3,
  },
  tableTotal: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderTopWidth: 0.6,
    borderTopColor: C.navyLight,
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  th: { fontSize: 6.5, fontWeight: 'bold', color: C.grayText },
  td: { fontSize: 7.5, color: C.grayDark },
  tdBold: { fontSize: 7.5, fontWeight: 'bold', color: C.grayDark },
  muted: { fontSize: 7, color: C.grayText, marginBottom: 4, lineHeight: 1.35 },
  groupLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: C.navy,
    marginTop: 4,
    marginBottom: 3,
  },
  continued: {
    fontSize: 7,
    fontWeight: 'bold',
    color: C.orange,
    backgroundColor: C.orangeBg,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 3,
  },
})

export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return fmt(n)
}

export function LtrText({
  children,
  style,
}: {
  children: React.ReactNode
  style?: object | object[]
}) {
  return (
    <Text style={[{ fontFamily: 'Heebo' }, ...(Array.isArray(style) ? style : style ? [style] : [])]}>
      {children}
    </Text>
  )
}

/** Hebrew/EN label Text with RTL align when needed. */
export function HeText({
  lang,
  children,
  style,
}: {
  lang: AviReportLang
  children: React.ReactNode
  style?: object | object[]
}) {
  return (
    <Text
      style={[
        { fontFamily: 'Heebo' },
        rtlTextStyle(lang),
        ...(Array.isArray(style) ? style : style ? [style] : []),
      ]}
    >
      {children}
    </Text>
  )
}

/** Explicit visual gap between date / mixed-phrase segments (not a space char inside Text). */
function PdfGap({ width = 6 }: { width?: number }) {
  return <View style={{ width, minWidth: width, height: 2 }} />
}

/**
 * Mixed phrase: Hebrew/EN words + LTR numeric/brand run as sibling Texts.
 * Never character-reverse. Never wrap Hebrew+number in one Text when order matters.
 */
export function MixedRtlPhrase({
  lang,
  leading,
  trailingLtr,
  style,
}: {
  lang: AviReportLang
  leading: string
  trailingLtr: string
  style?: object | object[]
}) {
  const styles = Array.isArray(style) ? style : style ? [style] : []
  if (lang !== 'he') {
    return (
      <Text style={styles}>
        {leading} {trailingLtr}
      </Text>
    )
  }
  return (
    <View
      style={[
        { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'baseline' },
        ...styles,
      ]}
      wrap={false}
    >
      <HeText lang={lang}>{leading}</HeText>
      <PdfGap width={4} />
      <LtrText>{trailingLtr}</LtrText>
    </View>
  )
}

/**
 * Numeric settlement formula as one LTR-only Text (no Hebrew in the same node).
 * Visual order must stay: paid + credits − obligation = net.
 */
export function LtrSettlementFormula({
  paidEur,
  creditsEur,
  obligationEur,
  netEur,
  style,
}: {
  paidEur: number | null | undefined
  creditsEur: number | null | undefined
  obligationEur: number | null | undefined
  netEur: number | null | undefined
  style?: object | object[]
}) {
  const styles = Array.isArray(style) ? style : style ? [style] : []
  const line = `${money(paidEur)} + ${money(creditsEur)} − ${money(obligationEur)} = ${money(netEur)}`
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'stretch' }} wrap={false}>
      <Text style={[{ fontFamily: 'Heebo', textAlign: 'left' }, ...styles]}>{line}</Text>
    </View>
  )
}

/**
 * Segmented Hebrew date — day | PdfGap | month | PdfGap | year.
 * Separate LTR/RTL Text runs + width-bearing gaps (not trailing spaces inside Text).
 * Do NOT join into one Text: react-pdf bidi reorders day/year around the Hebrew month.
 */
export function PdfAviDate({
  iso,
  lang,
  mode = 'full',
  style,
}: {
  iso: string
  lang: AviReportLang
  mode?: 'full' | 'month'
  style?: object
}) {
  const seg = { fontSize: 7.5, ...(style as object) }
  if (lang !== 'he') {
    if (mode === 'month') {
      const [y, m] = iso.split('-').map(Number)
      const label =
        y && m
          ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
              new Date(y, m - 1, 1),
            )
          : iso
      return <LtrText style={seg}>{label}</LtrText>
    }
    const parts = iso.split('-')
    if (parts.length === 3) {
      const y = Number(parts[0])
      const m = Number(parts[1])
      const d = Number(parts[2])
      if (y && m && d) {
        const label = new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date(y, m - 1, d))
        return <LtrText style={seg}>{label}</LtrText>
      }
    }
    return <LtrText style={seg}>{iso}</LtrText>
  }

  const key = mode === 'month' && iso.length === 7 ? `${iso}-01` : iso
  const p = parseAviIsoDate(key)
  if (!p) return <HeText lang={lang} style={seg}>{iso}</HeText>

  const gap = typeof (style as { fontSize?: number } | undefined)?.fontSize === 'number'
    && ((style as { fontSize: number }).fontSize as number) < 7.2
    ? 10
    : 7

  if (mode === 'month' || !p.day) {
    return (
      <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline' }} wrap={false}>
        <HeText lang={lang} style={seg}>
          {HEBREW_MONTH_STANDALONE[p.month]}
        </HeText>
        <PdfGap width={gap} />
        <LtrText style={seg}>{String(p.year)}</LtrText>
      </View>
    )
  }

  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline' }} wrap={false}>
      <LtrText style={seg}>{String(p.day)}</LtrText>
      <PdfGap width={gap} />
      <HeText lang={lang} style={seg}>
        {HEBREW_MONTH_WITH_BE[p.month]}
      </HeText>
      <PdfGap width={gap} />
      <LtrText style={seg}>{String(p.year)}</LtrText>
    </View>
  )
}

export function AccountBar({
  lang,
  tone,
  title,
  subtitle,
  amount,
  amountHint,
}: {
  lang: AviReportLang
  tone: keyof typeof toneBg
  title: string
  subtitle?: string
  amount?: string
  amountHint?: string
}) {
  const he = lang === 'he'
  return (
    <View
      style={[
        shared.accountBar,
        {
          backgroundColor: toneBg[tone] ?? C.navy,
          // Explicit direction: title on the reading-start side, amount on the end.
          flexDirection: he ? 'row-reverse' : 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          width: '100%',
        },
      ]}
      wrap={false}
    >
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          alignItems: he ? 'flex-end' : 'flex-start',
          paddingHorizontal: 4,
        }}
      >
        <HeText lang={lang} style={[shared.accountTitle, { textAlign: he ? 'right' : 'left' }]}>
          {title}
        </HeText>
        {subtitle ? (
          <HeText lang={lang} style={[shared.accountSub, { textAlign: he ? 'right' : 'left' }]}>
            {subtitle}
          </HeText>
        ) : null}
      </View>
      {amount != null ? (
        <View
          style={{
            alignItems: he ? 'flex-start' : 'flex-end',
            paddingHorizontal: 4,
            minWidth: 72,
          }}
        >
          <LtrText style={shared.accountAmount}>{amount}</LtrText>
          {amountHint ? (
            <HeText
              lang={lang}
              style={[shared.accountHint, { textAlign: he ? 'left' : 'right' }]}
            >
              {amountHint}
            </HeText>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

export function KpiTile({
  lang,
  label,
  value,
  hint,
}: {
  lang: AviReportLang
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
}) {
  return (
    <View style={shared.kpiTile} wrap={false}>
      <HeText lang={lang} style={shared.kpiLabel}>
        {label}
      </HeText>
      {typeof value === 'string' || typeof value === 'number' ? (
        <LtrText style={shared.kpiValue}>{String(value)}</LtrText>
      ) : (
        value
      )}
      {hint ? (
        typeof hint === 'string' ? (
          <HeText lang={lang} style={shared.kpiHint}>
            {hint}
          </HeText>
        ) : (
          hint
        )
      ) : null}
    </View>
  )
}

export function ColHeader({
  lang,
  children,
  width,
  flex,
}: {
  lang: AviReportLang
  children: string
  width?: number | string
  flex?: number
}) {
  return (
    <HeText
      lang={lang}
      style={[
        shared.th,
        width != null ? { width } : {},
        flex != null ? { flexGrow: flex, flexShrink: 1 } : {},
        rtlColumnOrder(lang),
      ]}
    >
      {children}
    </HeText>
  )
}
