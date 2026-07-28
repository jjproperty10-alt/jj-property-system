/**
 * @module home/homeBriefService
 * @description buildHomeBrief — Pure, Total, Deterministic transform.
 *
 * Converts ExecutiveBriefDTO → HomeBriefDTO.
 * This function is the ONLY bridge between the Executive Brief pipeline
 * and the Home screen presentation layer.
 *
 * CONTRACT (Yossi, 28 July 2026):
 *
 * 1. TOTAL FUNCTION
 *    Every legal input combination produces a valid HomeBriefDTO.
 *    Never throws an exception.
 *    Failures are represented inside the DTO, not as exceptions.
 *
 * 2. AUTHORITY BOUNDARY
 *    Must never call another service.
 *    No Provider, no DAL, no Repository, no fetch, no cache.
 *    Receives a DTO, returns a DTO. That is all.
 *
 * 3. PROVIDER ISOLATION
 *    Adding a Provider never requires changing this function.
 *    Reads only ExecutiveBriefDTO.summary and .sections — never providerId.
 *
 * @see PR79_GATE0_AND_DESIGN_PACKAGE.md — Contract Hardening §3.1–3.3
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 */

import type { ExecutiveBriefDTO } from '@/lib/executive/executiveBriefTypes'
import type { BusinessHealthStatus } from '@/components/ds/HealthSignal'
import type { TimeOfDay } from '@/components/ds/DailyGreeting'
import type { HomeBriefDTO, HomeBriefAttentionItem } from './homeBriefTypes'

// ─── allClear truth table ──────────────────────────────────────────────────

/**
 * Determine the allClear state from ExecutiveBriefDTO summary.
 *
 * | totalItems | hasInsufficientEvidence | allClear |
 * |------------|------------------------|----------|
 * | 0          | false                  | true     |
 * | > 0        | (any)                  | false    |
 * | 0          | true                   | null     |
 */
function deriveAllClear(brief: ExecutiveBriefDTO): boolean | null {
  if (brief.summary.totalItems > 0) return false
  if (brief.summary.hasInsufficientEvidence) return null
  return true
}

// ─── Health derivation ─────────────────────────────────────────────────────

/**
 * Derive business health status from Executive Brief.
 *
 * Maps to HealthSignal's BusinessHealthStatus ('healthy' | 'attention' | 'urgent').
 * Returns null when indeterminate — HealthSignal is not rendered.
 */
function deriveHealth(brief: ExecutiveBriefDTO): BusinessHealthStatus | null {
  if (brief.summary.criticalCount > 0) return 'urgent'
  if (brief.summary.totalItems > 0) return 'attention'
  if (brief.summary.hasInsufficientEvidence) return null
  return 'healthy'
}

// ─── Greeting message ──────────────────────────────────────────────────────

/**
 * Derive a one-sentence greeting message from the brief state.
 * Returns null when indeterminate — DailyGreeting renders nothing.
 */
function deriveGreetingMessage(brief: ExecutiveBriefDTO): string | null {
  const { totalItems, criticalCount } = brief.summary

  if (totalItems === 0 && !brief.summary.hasInsufficientEvidence) {
    return 'Everything is handled.'
  }

  if (criticalCount > 0) {
    return criticalCount === 1
      ? '1 item needs your attention.'
      : `${criticalCount} items need your attention.`
  }

  if (totalItems > 0) {
    return totalItems === 1
      ? '1 item to review when you\'re ready.'
      : `${totalItems} items to review when you're ready.`
  }

  // totalItems === 0 but hasInsufficientEvidence — indeterminate
  return null
}

// ─── Attention items mapping ───────────────────────────────────────────────

/**
 * Map Executive Brief items to Home attention items.
 * Preserves Chief of Staff's prioritization order.
 * No filtering, no re-sorting — authority preserved.
 */
function mapAttentionItems(brief: ExecutiveBriefDTO): readonly HomeBriefAttentionItem[] {
  return brief.sections.flatMap(section =>
    section.items.map(item => ({
      id: item.id,
      title: item.title,
      explanation: item.explanation,
      severity: item.priority === 'critical' ? 'urgent' as const : 'normal' as const,
      executiveOwner: item.strategicAsset,
      route: item.route,
    }))
  )
}

// ─── AllClear card content ─────────────────────────────────────────────────

function deriveAllClearHeadline(allClear: boolean | null): string | null {
  if (allClear !== true) return null
  return 'Nothing needs your attention right now.'
}

function deriveAllClearLines(allClear: boolean | null): readonly string[] {
  if (allClear !== true) return []
  return [
    'Everything important has been handled.',
    'All systems checked and operational.',
  ]
}

// ─── buildHomeBrief (public API) ───────────────────────────────────────────

/**
 * Build the Home screen state from an Executive Brief DTO.
 *
 * TOTAL FUNCTION: every input produces a valid HomeBriefDTO.
 * PURE FUNCTION: no side effects, no service calls, no exceptions.
 * DETERMINISTIC: same inputs → same output.
 *
 * @param brief - The Executive Brief DTO, or null if the brief pipeline failed
 * @param ownerName - Authenticated owner name (from auth identity)
 * @param timeOfDay - Current time of day (from server clock)
 * @returns HomeBriefDTO — always valid, never throws
 */
export function buildHomeBrief(
  brief: ExecutiveBriefDTO | null,
  ownerName: string,
  timeOfDay: TimeOfDay,
): HomeBriefDTO {
  // Brief unavailable — all derived fields are null (P-ARCH-1)
  if (brief === null) {
    return {
      ownerName,
      timeOfDay,
      health: null,
      allClear: null,
      greetingMessage: null,
      needsAttentionCount: null,
      needsAttentionItems: [],
      allClearHeadline: null,
      allClearLines: [],
      briefFreshness: null,
      briefGeneratedAt: null,
    }
  }

  const allClear = deriveAllClear(brief)

  return {
    ownerName,
    timeOfDay,
    health: deriveHealth(brief),
    allClear,
    greetingMessage: deriveGreetingMessage(brief),
    needsAttentionCount: brief.summary.totalItems,
    needsAttentionItems: mapAttentionItems(brief),
    allClearHeadline: deriveAllClearHeadline(allClear),
    allClearLines: deriveAllClearLines(allClear),
    briefFreshness: brief.dataFreshness,
    briefGeneratedAt: brief.meta.generatedAt,
  }
}
