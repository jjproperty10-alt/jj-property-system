/**
 * Generic full client-account PDF.
 * Date-column side follows the report language. Property names stay as supplied.
 * Composition only — theme lives in ./clientAccount/theme, components in ./clientAccount/components.
 */
import React from 'react'
import { Document, Page, Text, View, Font } from '@react-pdf/renderer'
import { fmt } from './formatters'
import { balanceDirectionText, heroDirectionText } from '../report/clientAccount/presentation'
import type { ReportLanguage } from '../report/clientAccount/presentation'
import { SECTION, term } from '../report/clientAccount/terminology'
import type { ClientAccountDocument, ClosingDirection, PropertyAccount } from '../report/clientAccount/types'
import { colors, ink, styles as s } from './clientAccount/theme'
import {
  BalanceCard,
  CategorySummary,
  ClosingBlock,
  ColumnHeader,
  ContinuationTitle,
  DateText,
  Desc,
  DetailSection,
  DetailTable,
  MonthlyStrTable,
  Phrase,
  PropertyHeader,
  ReportFooter,
  ReportHeader,
  RtlLine,
  SectionHeader,
  TableRow,
} from './clientAccount/components'

Font.register({
  family: 'Heebo',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSycckOnz02SXQ.ttf' },
    { src: 'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EbiucckOnz02SXQ.ttf', fontWeight: 'bold' },
  ],
})

export function clientReportOutline(doc: ClientAccountDocument): string[] {
  return [term('settlementSummary', doc.reportLanguage), ...doc.properties.map((property) => property.propertyName)]
}

function cutoffLabel(asOf: string): string {
  const [year, month, day] = asOf.split('-')
  return `${day}.${month}.${year}`
}

function directionOf(signed: number): ClosingDirection {
  return signed > 0 ? 'client_owes_jj' : signed < 0 ? 'jj_owes_client' : 'settled'
}

function PropertyPages({
  property,
  clientName,
  cutoff,
  language,
  isLast,
}: {
  property: PropertyAccount
  clientName: string
  cutoff: string
  language: ReportLanguage
  isLast: boolean
}) {
  const by = (section: string) => property.lines.filter((line) => line.section === section)
  const purchase = property.summaries.find((item) => item.kind === 'purchase')
  const renovation = property.summaries.find((item) => item.kind === 'renovation')
  const footer = <ReportFooter clientName={clientName} cutoff={cutoff} language={language} />
  return (
    <>
      <Page size="A4" style={s.page}>
        <ContinuationTitle title={property.propertyName} language={language} />
        <PropertyHeader title={property.propertyName} subtitle={term('propertyAccount', language)} cutoff={cutoff} language={language} />
        <BalanceCard
          direction={property.direction}
          amount={property.amountDueToJj}
          label={balanceDirectionText(clientName, property.direction, language)}
          language={language}
        />
        <CategorySummary property={property} clientName={clientName} language={language} />
        <DetailSection title={term('purchase', language)} lines={by(SECTION.purchase)} language={language} summary={purchase} />
        <DetailSection title={term('renovation', language)} lines={by(SECTION.renovation)} language={language} summary={renovation} />
        <DetailSection title={term('setup', language)} lines={by(SECTION.setup)} language={language} />
        <DetailSection title={term('income', language)} lines={[...by(SECTION.ltrIncome), ...by(SECTION.strIncome)]} language={language} />
        {/* The monthly summary stays with the property's closing area (remaining sections + bridge + status)
            instead of leaving the bridge alone on a trailing page. */}
        {property.certifiedMonthlyStr ? <MonthlyStrTable section={property.certifiedMonthlyStr} language={language} minPresenceAhead={310} /> : null}
        <DetailSection title={term('ownerTransfers', language)} lines={by(SECTION.ownerTransfers)} language={language} />
        <DetailSection title={term('operatingExpenses', language)} lines={[...by(SECTION.propertyExpenses), ...by(SECTION.recurring)]} language={language} />
        <DetailSection title={term('repairs', language)} lines={by(SECTION.repairs)} language={language} />
        {property.units.length === 0 ? (
          <ClosingBlock property={property} clientName={clientName} language={language} documentNoteCutoff={isLast ? cutoff : undefined} />
        ) : null}
        {footer}
      </Page>
      {property.units.map((unit, unitIndex) => {
        const longTerm = unit.kind === 'ltr'
        const unitDirection = directionOf(unit.balanceDueToJj)
        const lines = unit.lines.filter((line) => longTerm || line.countedIn !== 'str-credit')
        const zebra = lines.length > 8
        const lastUnit = unitIndex === property.units.length - 1
        const totalRow = (description: string) => (
          <TableRow
            language={language}
            style={s.rowTotal}
            date={<View style={s.month} />}
            description={<Desc text={description} language={language} bold />}
            direction={(
              <View style={s.direction}>
                <Phrase text={balanceDirectionText(clientName, unitDirection, language)} language={language} color={ink(unitDirection)} bold />
              </View>
            )}
            amount={<Text style={[s.amount, s.bold, { color: ink(unitDirection) }]}>{fmt(Math.abs(unit.balanceDueToJj))}</Text>}
          />
        )
        const unitTail = longTerm ? (
          <>
            <Text style={s.note}>{term('noSharedExpenses', language)}</Text>
            <SectionHeader title={term('ltrCreditsTotal', language)} language={language} />
            {totalRow(term('ltrCreditsTotalNote', language))}
          </>
        ) : totalRow(term('unitBalance', language))
        return (
          <Page key={unit.title} size="A4" style={s.page}>
            <ContinuationTitle title={unit.title} language={language} />
            <PropertyHeader title={unit.title} subtitle={term('unitDetail', language)} cutoff={cutoff} language={language} />
            {!longTerm && unit.note ? (
              <View style={s.noteBox}>
                <RtlLine text={unit.note} pack="start" style={{ color: colors.text, fontSize: 9 }} />
              </View>
            ) : null}
            <View wrap={false}>
              <SectionHeader title={term('transactions', language)} language={language} />
              <ColumnHeader language={language} />
              {lines.length > 0 ? <DetailTable lines={lines.slice(0, 1)} language={language} zebra={zebra} /> : null}
              {lines.length < 2 ? unitTail : null}
            </View>
            {lines.slice(1).map((line, index) => {
              const isLastLine = index === lines.length - 2
              const row = (
                <DetailTable
                  lines={[line]}
                  language={language}
                  zebra={zebra}
                  startIndex={index + 1}
                  monthSeparators={lines.length > 12}
                  previousMonthLabel={lines[index].monthLabel}
                />
              )
              const explanation = unit.note && /שימוש של JJ|for JJ use/.test(line.clientText) ? (
                <View style={s.noteBox}>
                  <RtlLine text={unit.note} pack="start" style={{ color: colors.text, fontSize: 8.5 }} />
                </View>
              ) : null
              // The closing row of the unit table never stands alone on a page.
              if (isLastLine) {
                return (
                  <View key={`${line.traceSourceId || line.clientText}-${index}`} wrap={false}>
                    {row}
                    {explanation}
                    {unitTail}
                  </View>
                )
              }
              // wrap={false} on the wrapper: react-pdf keeps a sole nested child on the current page
              // even when it overflows, so the break must be decided at this level.
              return (
                <View key={`${line.traceSourceId || line.clientText}-${index}`} wrap={false}>
                  {row}
                  {explanation}
                </View>
              )
            })}
            {longTerm || lastUnit ? (
              <ClosingBlock property={property} clientName={clientName} language={language} documentNoteCutoff={isLast && lastUnit ? cutoff : undefined} />
            ) : null}
            {footer}
          </Page>
        )
      })}
    </>
  )
}

export function ClientAccountPdf({ doc }: { doc: ClientAccountDocument }) {
  const name = doc.clientDisplayName
  const language = doc.reportLanguage
  const he = language === 'he'
  const cutoff = cutoffLabel(doc.asOf)
  const totalDirection: ClosingDirection = doc.openingDueToJj > 0 ? 'client_owes_jj' : 'settled'
  return (
    <Document title={doc.reportTitle} author="JJ Property">
      <Page size="A4" style={s.page}>
        <View style={s.continuedSlot} />
        <ReportHeader title={term('settlementSummary', language)} clientName={name} cutoff={cutoff} language={language} />

        <BalanceCard
          hero
          direction={doc.closingDirection}
          amount={doc.closingDueToJj}
          label={heroDirectionText(name, doc.closingDirection, language)}
          language={language}
        />

        <SectionHeader title={term('balancesByProperty', language)} language={language} />
        <ColumnHeader language={language} withDate={false} />
        {doc.properties.map((property, index) => (
          <TableRow
            key={property.propertyKey}
            language={language}
            tint={index % 2 === 1 && property.direction !== 'jj_owes_client'}
            style={property.direction === 'jj_owes_client' ? { backgroundColor: colors.greenBg } : undefined}
            date={null}
            description={<Desc text={property.propertyName} language={language} />}
            direction={(
              <View style={s.direction}>
                <Phrase text={balanceDirectionText(name, property.direction, language)} language={language} color={ink(property.direction)} />
              </View>
            )}
            amount={<Text style={[s.amount, { color: ink(property.direction) }]}>{fmt(Math.abs(property.amountDueToJj))}</Text>}
          />
        ))}
        <TableRow
          language={language}
          style={s.rowTotal}
          date={null}
          description={<Desc text={term('propertyBalances', language)} language={language} bold style={{ color: colors.navy }} />}
          direction={(
            <View style={s.direction}>
              <Phrase text={balanceDirectionText(name, totalDirection, language)} language={language} color={colors.navy} bold />
            </View>
          )}
          amount={<Text style={[s.amount, s.bold, { color: colors.navy }]}>{fmt(doc.openingDueToJj)}</Text>}
        />

        {doc.credits.length > 0 ? (
          <View style={s.card} wrap={false}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>{term('clientLevelCredits', language)}</Text>
            </View>
            <View style={s.cardBody}>
              <Text style={s.note}>
                {he
                  ? `הזיכויים הבאים שייכים להתחשבנות הכוללת של ${name} ואינם מוקצים בדוח לנכס מסוים.`
                  : 'The following credits belong to the client settlement and are not allocated to a property in this report.'}
              </Text>
              <ColumnHeader language={language} />
              {doc.credits.map((credit) => (
                <View key={credit.eventId}>
                  <TableRow
                    language={language}
                    date={(
                      <View style={s.month}>
                        <DateText label={credit.monthLabel} language={language} />
                        {credit.dateCaption ? <Text style={{ fontSize: 7, color: colors.muted }}>{credit.dateCaption}</Text> : null}
                      </View>
                    )}
                    description={<Desc text={credit.label} language={language} />}
                    direction={(
                      <View style={s.direction}>
                        <Phrase
                          text={credit.dateRole === 'credit-event'
                            ? term('nonCash', language)
                            : balanceDirectionText(name, 'jj_owes_client', language)}
                          language={language}
                          color={credit.dateRole === 'credit-event' ? colors.muted : colors.green}
                        />
                      </View>
                    )}
                    amount={<Text style={[s.amount, { color: colors.green }]}>{fmt(credit.amount)}</Text>}
                  />
                  {credit.note ? <Text style={s.note}>{credit.note}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <ReportFooter clientName={name} cutoff={cutoff} language={language} />
      </Page>
      {doc.properties.map((property, index) => (
        <PropertyPages
          key={property.propertyKey}
          property={property}
          clientName={name}
          cutoff={cutoff}
          language={language}
          isLast={index === doc.properties.length - 1}
        />
      ))}
    </Document>
  )
}
