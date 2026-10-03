/**
 * Figures Yossi already approved. The offline harness diffs rendered reports
 * against this file. It does not read the database.
 *
 * Orit: REVIEW-6, render-summary sha 0129011a….
 * Uriel: cert ad2ba8fd version 3, the 15:38 PDF. No adapter yet.
 * Tamir: two applied certs, pending cumulative vs separate. The unapproved
 * draft reader is not used.
 */
import { REVIEW6_RENDER_SHA } from '../presentationTags'

export type ApprovedDirection = 'client_owes_jj' | 'jj_owes_client' | 'settled'

export interface ApprovedBridgeRow {
  readonly label: string
  readonly signedDueToJj: number
}

/** A client the harness can render because an adapter and a fixture exist. */
export interface ApprovedRenderableFigures {
  readonly kind: 'renderable'
  readonly clientSlug: string
  readonly contactName: string
  readonly approvalRef: string
  readonly gross: number
  readonly paid: number
  readonly balance: number
  readonly direction: ApprovedDirection
  readonly gender: 'masculine' | 'feminine'
  readonly propertyLine: string
  readonly heroDirection: string
  /** Engine wording when the balance is JJ owes this client. Feminine subject. */
  readonly jjOwesDirection: string
  readonly bridge: readonly ApprovedBridgeRow[]
}

/** Expected figures only. The harness does not render these. */
export interface ApprovedPendingAdapterFigures {
  readonly kind: 'pending-adapter'
  readonly clientSlug: string
  readonly contactName: string
  readonly approvalRef: string
  readonly gross: number
  readonly paid: number
  readonly balance: number
  readonly direction: ApprovedDirection
  readonly note: string
}

export interface ApprovedTamirCert {
  readonly certPrefix: string
  readonly asOf: string
  readonly balance: number
}

/** Two certs. No combined total until cumulative vs separate is decided. */
export interface ApprovedPendingDecisionFigures {
  readonly kind: 'pending-decision'
  readonly clientSlug: string
  readonly contactName: string
  readonly decision: 'cumulative-vs-separate'
  readonly excludedDraft: string
  readonly certs: readonly ApprovedTamirCert[]
  readonly note: string
}

export type ApprovedFigures =
  | ApprovedRenderableFigures
  | ApprovedPendingAdapterFigures
  | ApprovedPendingDecisionFigures

const PROPERTY_LINE = 'יתרת הנכס לפני תשלומים כלליים'

export const ORIT_APPROVED: ApprovedRenderableFigures = {
  kind: 'renderable',
  clientSlug: 'orit-rob',
  contactName: 'Orit Rob',
  approvalRef: REVIEW6_RENDER_SHA,
  gross: 3322.52,
  paid: 2770,
  balance: 552.52,
  direction: 'client_owes_jj',
  gender: 'feminine',
  propertyLine: PROPERTY_LINE,
  heroDirection: 'אורית רוב חייבת ל־JJ.',
  jjOwesDirection: 'JJ חייבת לאורית רוב.',
  bridge: [
    { label: PROPERTY_LINE, signedDueToJj: 3322.52 },
    { label: 'תשלום אפריל 2026', signedDueToJj: -1770 },
    { label: 'תשלום מאי 2026', signedDueToJj: -1000 },
    { label: 'יתרה לתשלום ל־JJ', signedDueToJj: 552.52 },
  ],
}

export const URIEL_APPROVED: ApprovedPendingAdapterFigures = {
  kind: 'pending-adapter',
  clientSlug: 'uriel',
  contactName: 'Uriel',
  approvalRef: 'cert ad2ba8fd v3',
  gross: 117901.54,
  paid: 69000,
  balance: 48901.54,
  direction: 'client_owes_jj',
  note: 'Expected figures only, matching the 15:38 PDF. No adapter yet.',
}

export const TAMIR_APPROVED: ApprovedPendingDecisionFigures = {
  kind: 'pending-decision',
  clientSlug: 'tamir',
  contactName: 'Tamir',
  decision: 'cumulative-vs-separate',
  excludedDraft: 'supabase/drafts/20261002150000_certified_settlement_sequence_reader.sql',
  certs: [
    { certPrefix: '280b7fbf', asOf: '2026-08-31', balance: -13248.75 },
    { certPrefix: '890e86f9', asOf: '2026-09-17', balance: -720 },
  ],
  note: 'Pending a decision on cumulative vs separate. The unapproved draft reader is not used.',
}

export const APPROVED_FIGURES: readonly ApprovedFigures[] = [ORIT_APPROVED, URIEL_APPROVED, TAMIR_APPROVED]
