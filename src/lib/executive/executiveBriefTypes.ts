/**
 * @module executive/executiveBriefTypes
 * @description ExecutiveBriefDTO Contract v1.0 — Chief of Staff MVP.
 *
 * Channel-neutral contract for the CEO's Executive Brief.
 * The Chief of Staff assembles this DTO from multiple Digital Executive providers.
 * React renders it. React never computes business values.
 *
 * DIP Law: "The Chief of Staff does not reduce information.
 *           The Chief of Staff reduces uncertainty."
 *
 * @see JJ_DIP_CHAPTER_8_CHIEF_OF_STAFF.md — Chief of Staff definition
 * @see JJ_EXPERIENCE_PRINCIPLES.md — every screen answers 4 questions
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-8: JHKA is the source of historical truth.
 */

// ─── Digital Executive identifiers ──────────────────────────────────────────

/**
 * Every brief item is owned by exactly one Digital Executive.
 * The Chief of Staff owns prioritization and presentation,
 * not the underlying domain truth.
 *
 * @see JJ_DIP_CHAPTER_7_EXECUTIVE_CONSTITUTION.md — One Outcome, One Executive
 */
export type DigitalExecutive =
  | 'chief-of-staff'
  | 'cfo'
  | 'cro'
  | 'coo'
  | 'chief-guest-experience'
  | 'chief-owner-success'
  | 'chief-knowledge'
  | 'chief-growth'
  | 'chief-legal'

/** Human-readable label for each Executive */
export const EXECUTIVE_LABELS: Record<DigitalExecutive, string> = {
  'chief-of-staff': 'Chief of Staff',
  cfo: 'CFO',
  cro: 'CRO',
  coo: 'COO',
  'chief-guest-experience': 'Guest Experience',
  'chief-owner-success': 'Owner Success',
  'chief-knowledge': 'Knowledge',
  'chief-growth': 'Growth',
  'chief-legal': 'Legal',
}

/** The strategic asset each Executive guards */
export const EXECUTIVE_ASSETS: Record<DigitalExecutive, string> = {
  'chief-of-staff': 'Executive Attention',
  cfo: 'Financial Reality',
  cro: 'Sustainable Growth',
  coo: 'Operational Excellence',
  'chief-guest-experience': 'Guest Trust',
  'chief-owner-success': 'Owner Trust',
  'chief-knowledge': 'Organizational Intelligence',
  'chief-growth': 'Sustainable Expansion',
  'chief-legal': 'Trust Through Compliance',
}

// ─── Priority ──────────────────────────────────────────────────────────────

/**
 * Visible priority labels.
 * Derived from a deterministic numeric score — never set manually.
 * @see chiefOfStaffAssembly.ts for the scoring formula.
 */
export type BriefItemPriority = 'critical' | 'high' | 'normal' | 'monitor'

// ─── Section categories ────────────────────────────────────────────────────

/**
 * Executive Brief section categories.
 * Sections appear only when grounded data exists.
 * Empty sections are omitted — never shown.
 */
export type BriefSectionCategory =
  | 'critical-decisions'
  | 'financial-attention'
  | 'revenue-opportunities'
  | 'operational-risks'
  | 'trust-signals'
  | 'completed-outcomes'

export const SECTION_LABELS: Record<BriefSectionCategory, string> = {
  'critical-decisions': 'Critical Decisions',
  'financial-attention': 'Financial Attention',
  'revenue-opportunities': 'Revenue Opportunities',
  'operational-risks': 'Operational Risks',
  'trust-signals': 'Trust Signals',
  'completed-outcomes': 'Completed',
}

/** Display order — critical decisions first, completed last */
export const SECTION_ORDER: readonly BriefSectionCategory[] = [
  'critical-decisions',
  'financial-attention',
  'revenue-opportunities',
  'operational-risks',
  'trust-signals',
  'completed-outcomes',
]

// ─── Evidence ──────────────────────────────────────────────────────────────

/**
 * Confidence in the evidence backing a brief item.
 * Distinguishes between:
 *   - confirmed: evidence is verified and current
 *   - high: evidence exists, minor ambiguity
 *   - medium: evidence exists but incomplete
 *   - low: limited evidence, high uncertainty
 *   - stale: evidence exists but has not been refreshed recently
 *   - unavailable: source could not be reached
 *
 * "Missing evidence must never become 'all clear'."
 */
export type EvidenceConfidence =
  | 'confirmed'
  | 'high'
  | 'medium'
  | 'low'
  | 'stale'
  | 'unavailable'

/**
 * Freshness of a data source.
 * 'unavailable' means the source could not be queried — NOT that no issues exist.
 */
export type DataFreshness = 'live' | 'recent' | 'stale' | 'unavailable'

/**
 * A single evidence reference backing a brief item.
 * Every item must have at least one. No item exists solely because
 * a text-generation function produced it.
 */
export interface EvidenceReference {
  readonly sourceId: string
  readonly sourceType: string
  readonly description: string
  readonly queriedAt: string
  readonly freshness: DataFreshness
}

// ─── Brief Item ────────────────────────────────────────────────────────────

/**
 * A single item in the Executive Brief.
 *
 * Every item:
 * - has an Executive owner (who is responsible)
 * - has evidence (why it's here)
 * - has a deterministic priority (reproducible in tests)
 * - answers: what happened, why it matters, what to do, why trust this
 */
export interface ExecutiveBriefItem {
  readonly id: string
  readonly executiveOwner: DigitalExecutive
  readonly strategicAsset: string
  readonly category: BriefSectionCategory
  readonly title: string
  readonly explanation: string
  readonly priority: BriefItemPriority
  readonly status: 'open' | 'in_progress' | 'resolved' | 'monitoring'
  readonly recommendedAction: string | null
  readonly decisionRequired: boolean
  readonly dueAt: string | null
  readonly confidence: EvidenceConfidence
  readonly impact: string | null
  readonly evidence: readonly EvidenceReference[]
  readonly sourceFreshness: DataFreshness
  readonly route: string | null
}

// ─── Section ───────────────────────────────────────────────────────────────

/**
 * A group of brief items under one category.
 * Only appears when items exist — never rendered empty.
 */
export interface ExecutiveBriefSection {
  readonly category: BriefSectionCategory
  readonly label: string
  readonly items: readonly ExecutiveBriefItem[]
}

// ─── Evidence Coverage ─────────────────────────────────────────────────────

/**
 * How much of the company's data landscape was successfully queried.
 * If coverage is incomplete, the brief cannot claim "all clear."
 */
export interface EvidenceCoverage {
  readonly totalSources: number
  readonly availableSources: number
  readonly staleSources: number
  readonly unavailableSources: number
}

// ─── ExecutiveBriefDTO ─────────────────────────────────────────────────────

/**
 * The complete Executive Brief — the Chief of Staff's primary product.
 *
 * Channel-neutral: can render as web UI, email digest, mobile push,
 * or structured API response.
 *
 * Assembled entirely server-side. UI receives only this output.
 */
export interface ExecutiveBriefDTO {
  readonly meta: {
    readonly schemaVersion: 'ExecutiveBriefDTO/1.0'
    readonly generatedAt: string
  }
  readonly dataFreshness: DataFreshness
  readonly evidenceCoverage: EvidenceCoverage
  readonly summary: {
    readonly totalItems: number
    readonly criticalCount: number
    readonly decisionsRequired: number
    /**
     * True when at least one source was unavailable or stale.
     * When true, the brief MUST NOT claim "everything is fine."
     * "Missing evidence must never become 'all clear'."
     */
    readonly hasInsufficientEvidence: boolean
  }
  readonly sections: readonly ExecutiveBriefSection[]
}

// ─── Provider interface ────────────────────────────────────────────────────

/**
 * Raw candidate produced by a data provider before Chief of Staff assembly.
 * rawPriority is a numeric score (0–100) used for deterministic sorting.
 */
export interface ExecutiveBriefCandidate {
  readonly providerId: string
  readonly executiveOwner: DigitalExecutive
  readonly strategicAsset: string
  readonly category: BriefSectionCategory
  readonly title: string
  readonly explanation: string
  readonly rawPriority: number
  readonly status: 'open' | 'in_progress' | 'resolved' | 'monitoring'
  readonly recommendedAction: string | null
  readonly decisionRequired: boolean
  readonly dueAt: string | null
  readonly confidence: EvidenceConfidence
  readonly impact: string | null
  readonly evidence: readonly EvidenceReference[]
  readonly sourceFreshness: DataFreshness
  readonly route: string | null
}

/**
 * Result from a single provider's gather() call.
 * Includes metadata about the source for evidence coverage tracking.
 */
export interface ProviderResult {
  readonly providerId: string
  readonly sourceType: string
  readonly freshness: DataFreshness
  readonly candidates: readonly ExecutiveBriefCandidate[]
  readonly error: string | null
}
