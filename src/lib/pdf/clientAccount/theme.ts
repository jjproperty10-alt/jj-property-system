/**
 * Client-account report theme — colors, spacing, typography and shared styles.
 * Presentation only. No business values live here.
 */
import { StyleSheet } from '@react-pdf/renderer'
import type { ClosingDirection } from '../../report/clientAccount/types'

export const colors = {
  navy: '#17365D',
  slate: '#5E718D',
  band: '#F4F7FA',
  border: '#D9E2EC',
  borderStrong: '#B9C6D4',
  text: '#25364D',
  muted: '#68788F',
  red: '#C62828',
  redBg: '#FDECEC',
  green: '#168447',
  greenBg: '#EAF7EF',
  neutralBg: '#F4F7FA',
  white: '#FFFFFF',
} as const

export const pageMetrics = {
  paddingX: 36,
  paddingTop: 20,
  paddingBottom: 58,
  footerBottom: 18,
} as const

export const typography = {
  family: 'Heebo',
  title: 24,
  hero: 30,
  property: 16,
  section: 12,
  cardTitle: 11,
  body: 9,
  status: 8,
  date: 8,
  note: 8,
  small: 7.5,
  footer: 7.5,
} as const

export const spacing = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 18,
} as const

export const columns = {
  date: 92,
  direction: 88,
  gap: 14,
  amount: 80,
  state: 44,
  figure: 72,
  sign: 14,
} as const

export const ink = (direction: ClosingDirection): string => (
  direction === 'client_owes_jj' ? colors.red : direction === 'jj_owes_client' ? colors.green : colors.muted
)

export const wash = (direction: ClosingDirection): string => (
  direction === 'client_owes_jj' ? colors.redBg : direction === 'jj_owes_client' ? colors.greenBg : colors.neutralBg
)

export const styles = StyleSheet.create({
  page: {
    paddingHorizontal: pageMetrics.paddingX,
    paddingTop: pageMetrics.paddingTop,
    paddingBottom: pageMetrics.paddingBottom,
    fontFamily: typography.family,
    fontSize: typography.body,
    color: colors.text,
    backgroundColor: colors.white,
  },

  // Headers
  header: { marginBottom: 6 },
  headerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontSize: typography.title, fontWeight: 'bold', color: colors.navy, textAlign: 'right' },
  propertyTitle: { fontSize: typography.property, fontWeight: 'bold', color: colors.navy, textAlign: 'right' },
  subtitle: { fontSize: typography.body, color: colors.slate, textAlign: 'right', marginTop: 1 },
  meta: { fontSize: typography.note, color: colors.muted },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.navy, marginTop: spacing.sm },
  continuedSlot: { height: 20, justifyContent: 'flex-start' },
  continued: { fontSize: typography.cardTitle, fontWeight: 'bold', color: colors.slate, textAlign: 'right' },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center' },
  wordmarkBar: { width: 3, height: 13, backgroundColor: colors.navy, marginRight: 5 },
  wordmark: { fontSize: 11, fontWeight: 'bold', color: colors.navy },

  // Cards
  balanceCard: { borderRadius: 3, paddingVertical: 8, paddingHorizontal: 14, marginTop: 6, marginBottom: 6, borderRightWidth: 3 },
  heroCard: { borderRadius: 3, paddingVertical: 18, paddingHorizontal: 16, marginTop: spacing.lg, marginBottom: spacing.lg, alignItems: 'center', borderRightWidth: 3 },
  heroAmount: { fontSize: typography.hero, fontWeight: 'bold', marginTop: spacing.sm },
  propertyAmount: { fontSize: 15, fontWeight: 'bold', textAlign: 'right' },
  card: { borderWidth: 0.8, borderColor: colors.border, borderRadius: 3, marginTop: 5 },
  cardHead: { backgroundColor: colors.band, paddingVertical: 3, paddingHorizontal: 8, borderBottomWidth: 0.8, borderBottomColor: colors.border },
  cardTitle: { fontSize: typography.cardTitle, fontWeight: 'bold', color: colors.navy, textAlign: 'right' },
  cardBody: { paddingHorizontal: 8, paddingBottom: 2 },

  // Section band
  sectionBand: { backgroundColor: colors.band, borderRightWidth: 2, borderRightColor: colors.navy, paddingVertical: 3, paddingHorizontal: 8, marginTop: 9, marginBottom: spacing.xs },
  sectionTitle: { fontSize: typography.section, fontWeight: 'bold', color: colors.navy, textAlign: 'right' },

  // Tables
  colHeadRow: { width: '100%', borderBottomWidth: 0.6, borderBottomColor: colors.borderStrong, paddingVertical: 2 },
  colHead: { fontSize: typography.small, color: colors.muted },
  row: { width: '100%', borderBottomWidth: 0.4, borderBottomColor: colors.border, paddingVertical: 2.5, alignItems: 'flex-start' },
  rowTint: { backgroundColor: colors.band },
  rowMonthBreak: { borderTopWidth: 0.8, borderTopColor: colors.borderStrong },
  rowTotal: { borderTopWidth: 1, borderTopColor: colors.navy, borderBottomWidth: 0, paddingTop: 4, marginTop: 2 },
  desc: { flexGrow: 1, flexShrink: 1, textAlign: 'right', paddingHorizontal: 6 },
  month: { width: columns.date, flexShrink: 0 },
  direction: { width: columns.direction, flexShrink: 0, paddingLeft: 4 },
  gap: { width: columns.gap, flexShrink: 0 },
  amount: { width: columns.amount, flexShrink: 0, textAlign: 'right' },
  figure: { width: columns.figure, flexShrink: 0, textAlign: 'right', fontSize: 8.5, paddingRight: 6 },
  stateText: { width: columns.state, flexShrink: 0, fontSize: typography.status, textAlign: 'right' },
  sign: { width: columns.sign, flexShrink: 0, fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  bold: { fontWeight: 'bold' },
  dateText: { fontSize: typography.date, color: colors.muted },

  // Summary box (purchase / renovation)
  summaryBox: { backgroundColor: colors.band, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3, marginTop: 3, marginBottom: spacing.xs },

  // Notes & chips
  note: { textAlign: 'right', color: colors.muted, fontSize: typography.note, marginTop: 3 },
  noteBox: { backgroundColor: colors.band, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 8, marginTop: spacing.sm, marginBottom: spacing.xs },
  chip: { alignSelf: 'flex-end', borderRadius: 2, paddingVertical: 1.5, paddingHorizontal: 6 },
  chipText: { fontSize: typography.small },

  // Footer — split into independent fixed blocks: react-pdf drops a fixed block whose
  // render-prop Text is nested inside a child View, so page-number Texts must be direct children.
  footerRule: {
    position: 'absolute',
    bottom: pageMetrics.footerBottom + 14,
    left: pageMetrics.paddingX,
    right: pageMetrics.paddingX,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  footerRight: { position: 'absolute', bottom: pageMetrics.footerBottom, right: pageMetrics.paddingX, flexDirection: 'row-reverse' },
  footerCenter: { position: 'absolute', bottom: pageMetrics.footerBottom, left: pageMetrics.paddingX, right: pageMetrics.paddingX, flexDirection: 'row-reverse', justifyContent: 'center' },
  footerLeft: { position: 'absolute', bottom: pageMetrics.footerBottom, left: pageMetrics.paddingX, flexDirection: 'row-reverse' },
  footerText: { fontSize: typography.footer, color: colors.muted },
  footerBrand: { fontSize: typography.footer, color: colors.navy, fontWeight: 'bold' },
  documentNote: { marginTop: 6, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 4 },
})
