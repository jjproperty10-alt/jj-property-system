/**
 * Generic full client-account PDF.
 * Colors follow direction text. Property names stay as supplied.
 */
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import { fmt } from './formatters'
import { balanceDirectionText, heroDirectionText } from '../report/clientAccount/presentation'
import type { ClientAccountDocument, ClosingDirection, DisplayLine, PropertyAccount } from '../report/clientAccount/types'

Font.register({
  family: 'Heebo',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSycckOnz02SXQ.ttf' },
    { src: 'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EbiucckOnz02SXQ.ttf', fontWeight: 'bold' },
  ],
})

const C = {
  navy: '#1e3a5f',
  red: '#b91c1c',
  redBg: '#fef2f2',
  green: '#15803d',
  greenBg: '#f0fdf4',
  gray: '#64748b',
  grayBg: '#f8fafc',
  line: '#e2e8f0',
  text: '#1e293b',
  white: '#ffffff',
}

const ink = (direction: ClosingDirection) => (
  direction === 'client_owes_jj' ? C.red : direction === 'jj_owes_client' ? C.green : C.gray
)
const wash = (direction: ClosingDirection) => (
  direction === 'client_owes_jj' ? C.redBg : direction === 'jj_owes_client' ? C.greenBg : C.grayBg
)

const s = StyleSheet.create({
  page: { paddingHorizontal: 36, paddingTop: 32, paddingBottom: 46, fontFamily: 'Heebo', fontSize: 9, color: C.text, backgroundColor: C.white },
  kicker: { fontSize: 8, color: C.gray, marginBottom: 4, textAlign: 'right' },
  h1: { fontSize: 18, fontWeight: 'bold', color: C.navy, textAlign: 'right', marginBottom: 4 },
  propertyTitle: { fontSize: 14, fontWeight: 'bold', color: C.navy, textAlign: 'right', marginBottom: 8 },
  hero: { borderRadius: 6, paddingVertical: 18, paddingHorizontal: 12, alignItems: 'center', marginTop: 16 },
  heroAmount: { fontSize: 26, fontWeight: 'bold', marginTop: 4 },
  heroLabel: { fontSize: 12, fontWeight: 'bold' },
  propertyBalance: { borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10, marginTop: 8, marginBottom: 8 },
  propertyAmount: { fontSize: 14, fontWeight: 'bold', textAlign: 'right' },
  section: { fontSize: 11, fontWeight: 'bold', textAlign: 'right', marginTop: 10, marginBottom: 4, color: C.navy },
  row: { flexDirection: 'row-reverse', borderBottomWidth: 0.4, borderBottomColor: C.line, paddingVertical: 3, alignItems: 'flex-start' },
  desc: { flex: 1, textAlign: 'right', paddingLeft: 8 },
  month: { width: 72, textAlign: 'left', color: C.gray, fontSize: 8 },
  direction: { width: 78, textAlign: 'left', fontSize: 7.5 },
  amount: { width: 68, textAlign: 'left' },
  unit: { fontSize: 11, fontWeight: 'bold', textAlign: 'right', marginTop: 8 },
  note: { textAlign: 'right', color: C.gray, marginTop: 4 },
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36, fontSize: 8, color: C.gray, textAlign: 'center' },
})

function RtlLine({ text, style }: { text: string; style?: object | object[] }) {
  const parts = text.split(/(\d[\d.,]*|[A-Za-z€][A-Za-z0-9€.,]*)/g).filter((part) => part !== '')
  const styles = Array.isArray(style) ? style : style ? [style] : []
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end' }}>
      {parts.map((part, index) => (
        <Text key={`${part}-${index}`} style={styles}>{part}</Text>
      ))}
    </View>
  )
}

function money(direction: ClosingDirection, amount: number) {
  return <Text style={{ color: ink(direction) }}>{fmt(amount)}</Text>
}

function Rows({ lines, clientName }: { lines: readonly DisplayLine[]; clientName: string }) {
  return (
    <View>
      {lines.map((line, index) => {
        const direction = line.effect === 'credit' ? 'jj_owes_client' : line.effect === 'reference' ? 'settled' : 'client_owes_jj'
        return (
          <View key={`${line.countedIn}-${index}`} style={s.row} wrap={false}>
            <Text style={s.desc}>{line.description}</Text>
            <View style={s.month}><RtlLine text={line.monthLabel} style={{ fontSize: 8, color: C.gray }} /></View>
            <View style={s.direction}>
              <RtlLine
                text={line.effect === 'credit' ? balanceDirectionText(clientName, 'jj_owes_client') : line.effect === 'reference' ? 'מידע.' : balanceDirectionText(clientName, 'client_owes_jj')}
                style={{ fontSize: 7.5, color: ink(direction as ClosingDirection) }}
              />
            </View>
            <Text style={s.amount}>{money(direction as ClosingDirection, line.amount)}</Text>
          </View>
        )
      })}
    </View>
  )
}

function Section({ title, lines, clientName }: { title: string; lines: readonly DisplayLine[]; clientName: string }) {
  if (lines.length === 0) return null
  return (
    <View>
      <Text style={s.section}>{title}</Text>
      <Rows lines={lines} clientName={clientName} />
    </View>
  )
}

function PropertyPages({ property, clientName }: { property: PropertyAccount; clientName: string }) {
  const by = (section: string) => property.lines.filter((line) => line.section === section)
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.propertyTitle}>{property.propertyName}</Text>
      <View style={[s.propertyBalance, { backgroundColor: wash(property.direction) }]}>
        <Text style={[s.propertyAmount, { color: ink(property.direction) }]}>{fmt(Math.abs(property.amountDueToJj))}</Text>
        <RtlLine text={balanceDirectionText(clientName, property.direction)} style={{ color: ink(property.direction), fontWeight: 'bold', fontSize: 9 }} />
      </View>
      <Section title="קניית הנכס" lines={by('קניית הנכס')} clientName={clientName} />
      <Section title="שיפוץ" lines={by('שיפוץ')} clientName={clientName} />
      <Section title="ציוד והכנת הנכס להשכרה קצרה" lines={by('ציוד והכנת הנכס להשכרה קצרה')} clientName={clientName} />
      <Section title="הכנסות מהנכס" lines={[...by('הכנסות משכירות ארוכה'), ...by('הכנסות משכירות קצרה')]} clientName={clientName} />
      <Section title="תשלומים שהועברו לבעלים" lines={by('תשלומים שהועברו לבעלים')} clientName={clientName} />
      <Section title="הוצאות הנכס" lines={[...by('הוצאות הנכס'), ...by('הוצאות שוטפות'), ...by('הוצאות השכרה קצרה')]} clientName={clientName} />
      {property.units.map((unit) => (
        <View key={unit.title}>
          <Text style={s.unit}>{unit.title}</Text>
          <Rows lines={unit.lines} clientName={clientName} />
          <View style={{ flexDirection: 'row-reverse', marginTop: 3 }}>
            <RtlLine text={balanceDirectionText(clientName, unit.balanceDueToJj > 0 ? 'client_owes_jj' : unit.balanceDueToJj < 0 ? 'jj_owes_client' : 'settled')} style={{ color: ink(unit.balanceDueToJj > 0 ? 'client_owes_jj' : unit.balanceDueToJj < 0 ? 'jj_owes_client' : 'settled'), fontSize: 9 }} />
            <Text style={{ color: ink(unit.balanceDueToJj > 0 ? 'client_owes_jj' : unit.balanceDueToJj < 0 ? 'jj_owes_client' : 'settled'), fontSize: 9, marginLeft: 6 }}>{fmt(Math.abs(unit.balanceDueToJj))}</Text>
          </View>
        </View>
      ))}
      {property.units.length > 0 ? <Text style={s.note}>אין הוצאות משותפות שלא ניתן לשייך ליחידה.</Text> : null}
      <Text style={s.section}>גשר סגירה</Text>
      {property.bridge.map((step) => {
        const direction = step.signedDueToJj > 0 ? 'client_owes_jj' : step.signedDueToJj < 0 ? 'jj_owes_client' : 'settled'
        return (
          <View key={step.label} style={s.row} wrap={false}>
            <Text style={s.desc}>{step.label}</Text>
            <Text style={s.month}> </Text>
            <View style={s.direction}><RtlLine text={balanceDirectionText(clientName, direction)} style={{ fontSize: 7.5, color: ink(direction) }} /></View>
            <Text style={[s.amount, { color: ink(direction) }]}>{fmt(Math.abs(step.signedDueToJj))}</Text>
          </View>
        )
      })}
      <Text style={s.section}>מה נסגר ומה נשאר פתוח</Text>
      {property.statusLines.map((status) => (
        <View key={status.label} style={s.row} wrap={false}>
          <Text style={s.desc}>{status.label}</Text>
          <Text style={[s.month, { color: ink(status.direction) }]}>{status.state === 'closed' ? 'נסגר.' : 'פתוח.'}</Text>
          <View style={s.direction}><RtlLine text={balanceDirectionText(clientName, status.direction)} style={{ fontSize: 7.5, color: ink(status.direction) }} /></View>
          <Text style={[s.amount, { color: ink(status.direction) }]}>{fmt(status.amount)}</Text>
        </View>
      ))}
      <View style={[s.footer, { flexDirection: 'row-reverse', justifyContent: 'center' }]} fixed>
        <Text style={{ fontSize: 8, color: C.gray }}>עמוד</Text>
        <Text style={{ fontSize: 8, color: C.gray }} render={({ pageNumber }) => ` ${pageNumber} `} />
        <Text style={{ fontSize: 8, color: C.gray }}>מתוך</Text>
        <Text style={{ fontSize: 8, color: C.gray }} render={({ totalPages }) => ` ${totalPages}`} />
      </View>
    </Page>
  )
}

export function ClientAccountPdf({ doc }: { doc: ClientAccountDocument }) {
  const name = doc.clientDisplayName
  const [year, month, day] = doc.asOf.split('-')
  const cutoff = `${day}.${month}.${year}`
  return (
    <Document title={doc.reportTitle} author="JJ Property">
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>JJ Property</Text>
        <Text style={s.h1}>{doc.reportTitle}</Text>
        <Text style={{ textAlign: 'right', color: C.navy }}>{`לקוח: ${name}`}</Text>
        <View style={{ flexDirection: 'row-reverse', marginTop: 2 }}>
          <RtlLine text="עד תאריך:" style={s.kicker} />
          <Text style={[s.kicker, { marginHorizontal: 4 }]}>{cutoff}</Text>
          <RtlLine text="כולל." style={s.kicker} />
        </View>
        <View style={[s.hero, { backgroundColor: wash(doc.closingDirection) }]}>
          <RtlLine text={heroDirectionText(name, doc.closingDirection)} style={[s.heroLabel, { color: ink(doc.closingDirection) }]} />
          <Text style={[s.heroAmount, { color: ink(doc.closingDirection) }]}>{fmt(Math.abs(doc.closingDueToJj))}</Text>
        </View>
        <View style={[s.footer, { flexDirection: 'row-reverse', justifyContent: 'center' }]} fixed>
          <Text style={{ fontSize: 8, color: C.gray }}>עמוד</Text>
          <Text style={{ fontSize: 8, color: C.gray }} render={({ pageNumber }) => ` ${pageNumber} `} />
          <Text style={{ fontSize: 8, color: C.gray }}>מתוך</Text>
          <Text style={{ fontSize: 8, color: C.gray }} render={({ totalPages }) => ` ${totalPages}`} />
        </View>
      </Page>
      {doc.properties.map((property) => (
        <PropertyPages key={property.propertyKey} property={property} clientName={name} />
      ))}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>סיכום התחשבנות</Text>
        {doc.properties.map((property) => (
          <View key={property.propertyKey} style={s.row} wrap={false}>
            <Text style={s.desc}>{property.propertyName}</Text>
            <Text style={s.month}> </Text>
            <View style={s.direction}><RtlLine text={balanceDirectionText(name, property.direction)} style={{ fontSize: 7.5, color: ink(property.direction) }} /></View>
            <Text style={[s.amount, { color: ink(property.direction) }]}>{fmt(Math.abs(property.amountDueToJj))}</Text>
          </View>
        ))}
        <View style={s.row}>
          <Text style={[s.desc, { fontWeight: 'bold' }]}>סך יתרות הנכסים</Text>
          <Text style={s.month}> </Text>
          <View style={s.direction}><RtlLine text={balanceDirectionText(name, doc.openingDueToJj > 0 ? 'client_owes_jj' : 'settled')} style={{ fontSize: 7.5 }} /></View>
          <Text style={s.amount}>{fmt(doc.openingDueToJj)}</Text>
        </View>
        {doc.credits.map((credit) => (
          <View key={credit.label} style={s.row} wrap={false}>
            <Text style={s.desc}>{credit.label}</Text>
            <Text style={s.month}>{credit.monthLabel}</Text>
            <View style={s.direction}><RtlLine text={balanceDirectionText(name, 'jj_owes_client')} style={{ fontSize: 7.5, color: C.green }} /></View>
            <Text style={[s.amount, { color: C.green }]}>{fmt(credit.amount)}</Text>
          </View>
        ))}
        <View style={[s.hero, { backgroundColor: wash(doc.closingDirection) }]}>
          <RtlLine text={heroDirectionText(name, doc.closingDirection)} style={[s.heroLabel, { color: ink(doc.closingDirection) }]} />
          <Text style={[s.heroAmount, { color: ink(doc.closingDirection) }]}>{fmt(Math.abs(doc.closingDueToJj))}</Text>
        </View>
        <View style={[s.footer, { flexDirection: 'row-reverse', justifyContent: 'center' }]} fixed>
          <Text style={{ fontSize: 8, color: C.gray }}>עמוד</Text>
          <Text style={{ fontSize: 8, color: C.gray }} render={({ pageNumber }) => ` ${pageNumber} `} />
          <Text style={{ fontSize: 8, color: C.gray }}>מתוך</Text>
          <Text style={{ fontSize: 8, color: C.gray }} render={({ totalPages }) => ` ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
