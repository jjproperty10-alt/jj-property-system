/**
 * @module home/homeBriefTypes
 * @description HomeBriefDTO Contract v1.0 — PR #79 Reference Case #2.
 *
 * Pure presentation contract for the Home screen.
 * Every field traces to exactly one authority:
 *   - ownerName     → Auth Identity (auth.users)
 *   - timeOfDay     → Server clock
 *   - All others    → Derived from ExecutiveBriefDTO (Chief of Staff)
 *
 * Contract hardening (Yossi, 28 July 2026):
 *   - buildHomeBrief is a Total Function — never throws
 *   - buildHomeBrief must never call another service
 *   - Adding a Provider never requires changing Home components
 *
 * @see PR79_GATE0_AND_DESIGN_PACKAGE.md — Gate 0 + Design Package
 * @see executiveBriefTypes.ts — source DTO contract
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 */

import type { BusinessHealthStatus } from '@/components/ds/HealthSignal'
import type { TimeOfDay } from '@/components/ds/DailyGreeting'
import type { DataFreshness } from '@/lib/executive/executiveBriefTypes'

// ─── HomeBriefDTO ──────────────────────────────────────────────────────────

/**
 * The complete Home screen state — derived server-side, rendered client-side.
 *
 * Every field either:
 *   (a) comes directly from an authority (ownerName, timeOfDay), or
 *   (b) is derived deterministically from ExecutiveBriefDTO by buildHomeBrief().
 *
 * No field is fabricated. No field is guessed.
 * Fields without an authoritative source are absent from the type — not null.
 */
export interface HomeBriefDTO {
  /** Owner name — from authenticated user (server-side) */
  readonly ownerName: string

  /** Time of day — from server clock */
  readonly timeOfDay: TimeOfDay

  /**
   * Business health derived from Executive Brief.
   * null = indeterminate (provider unavailable or brief failed).
   * When null, HealthSignal is not rendered — silence > noise (EX-2).
   */
  readonly health: BusinessHealthStatus | null

  /**
   * The most important signal on the Home screen.
   * Server-computed. Never UI-computed.
   *
   * true  = all providers reached, nothing to report
   * false = at least one actionable item exists
   * null  = completeness unknown — cannot claim all-clear or not
   *
   * When null: neither AllClearCard nor NeedsAttentionSection renders.
   */
  readonly allClear: boolean | null

  /** One-sentence contextual greeting — null when indeterminate */
  readonly greetingMessage: string | null

  /**
   * Attention count — from ExecutiveBriefDTO.summary.totalItems.
   * null when brief unavailable — never 0 as substitute for unknown.
   */
  readonly needsAttentionCount: number | null

  /** Attention items derived from Executive Brief sections */
  readonly needsAttentionItems: readonly HomeBriefAttentionItem[]

  /** AllClear card content — only populated when allClear === true */
  readonly allClearHeadline: string | null
  readonly allClearLines: readonly string[]

  /** Source metadata — for transparency */
  readonly briefFreshness: DataFreshness | null
  readonly briefGeneratedAt: string | null
}

// ─── HomeBriefAttentionItem ────────────────────────────────────────────────

/**
 * A single attention item for the Home screen.
 * Mapped 1:1 from ExecutiveBriefItem — no filtering, no re-sorting.
 * Chief of Staff's prioritization is preserved.
 */
export interface HomeBriefAttentionItem {
  readonly id: string
  readonly title: string
  readonly explanation: string
  readonly severity: 'urgent' | 'normal'
  readonly executiveOwner: string
  readonly route: string | null
}
