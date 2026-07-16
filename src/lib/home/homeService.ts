import type { HomeScreenState } from './homeTypes'
import type { TimeOfDay } from '@/components/ds'

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 9) return 'morning'
  if (hour >= 9 && hour < 13) return 'midday'
  if (hour >= 13 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'night'
}

/**
 * getHomeScreenState — data layer for the home screen.
 *
 * E3-A1: Returns static state for experience validation.
 *        Proves the narrative works before wiring real data.
 *
 * E3-A2 TODO: Replace this with live Supabase queries:
 *   - needsAttentionCount: query transactions with review_status = 'active' + flags
 *   - aiTasksCompleted: query AI activity log since lastVisit
 *   - greeting: call AI generation endpoint with today’s summary
 *   - health: derive from needsAttentionCount + any urgent flags
 *   - lastVisit: read from session / user preferences table
 */
export async function getHomeScreenState(): Promise<HomeScreenState> {
  const timeOfDay = getTimeOfDay()

  // E3-A1: Static state — real data in E3-A2
  return {
    ownerName: 'Yossi',
    timeOfDay,
    health: 'healthy',
    greeting: 'Business is healthy.',
    needsAttentionCount: 0,
    needsAttentionItems: [],
    aiTasksCompleted: 28,
    aiDecisionsPending: 0,
    allClearLines: [
      'Everything important has already been handled.',
      'There are no approvals waiting for you.',
      "AI completed today\u2019s routine work.",
    ],
    allClearEmoji: '\u2615',
    quickAction: null,
    lastVisit: null,
  }
}
