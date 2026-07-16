import type { BusinessHealthStatus, TimeOfDay } from '@/components/ds'

/**
 * HomeScreenState — the complete data contract for the home screen.
 *
 * E3-A1: Populated by homeService (static).
 * E3-A2: Populated by homeService (live Supabase queries).
 *
 * Constitutional: P-ARCH-1 — unknown values are null, never 0 or placeholder.
 */
export interface HomeScreenState {
  ownerName: string
  timeOfDay: TimeOfDay

  /** Current business health — drives HealthSignal and AllClearCard */
  health: BusinessHealthStatus

  /**
   * AI-generated greeting. 1 sentence from live data.
   * Empty string if AI unavailable — DailyGreeting will render nothing.
   */
  greeting: string

  /** Number of items that require the owner’s decision today */
  needsAttentionCount: number
  needsAttentionItems: AttentionItem[]

  /** Number of tasks AI completed since the owner’s last visit */
  aiTasksCompleted: number

  /** Number of AI decisions still awaiting owner approval */
  aiDecisionsPending: number

  /**
   * Lines for AllClearCard when needsAttentionCount === 0.
   * Should be warm and specific — never generic.
   */
  allClearLines: string[]

  /** Optional emoji for AllClearCard. Only when it genuinely fits. */
  allClearEmoji?: string

  /** Owner’s single most important next step. null if nothing urgent. */
  quickAction: QuickAction | null

  /** Timestamp of owner’s previous visit. null on first ever visit. */
  lastVisit: Date | null
}

export interface AttentionItem {
  id: string
  /** One sentence: what the decision is */
  title: string
  /** What AI found or recommends */
  detail: string
  severity: 'normal' | 'urgent'
  /** AI confidence 0–1. null if not AI-generated. */
  aiConfidence: number | null
  action: {
    label: string
    href: string
  }
  /** Cost of not deciding today — shown below the action button */
  deferralCost?: string
}

export interface QuickAction {
  /** One-line label — the most important action */
  label: string
  href: string
  /** Context sentence — why this is the recommended action */
  context: string
}
