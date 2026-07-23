/**
 * Owner Workspace — Explicit Fixture Boundary
 * PR #3: JJ Workspace Navigation + Owner Workspace Design System
 *
 * These are placeholder values used where the corresponding backend is not yet
 * wired. Each constant is named to make clear:
 *   (a) what real data it represents
 *   (b) which future PR/milestone will replace it
 *
 * ⚠️ FIXTURE DATA — not canonical financial truth.
 * ⚠️ Do NOT use these values in financial calculations.
 * ⚠️ Do NOT present these values as production figures in any report.
 *
 * Replacement map:
 * ─────────────────────────────────────────────────────────────────
 * FIXTURE_STATEMENT_STATUS    → when statement_series is wired per-owner
 *                               (statements schema, future backend PR)
 * FIXTURE_CLOSING_BALANCE_EUR → when Settlement Engine RC2 is implemented
 * FIXTURE_OWNER_BALANCE_EUR   → when Partner Capital engine computes per-owner balance
 * FIXTURE_OPEN_CORRECTIONS    → when corrections module is wired
 * FIXTURE_UPCOMING_COUNT      → when upcoming_events is wired to statements schema
 * FIXTURE_PRIORITY_GROUP      → when real priority routing is implemented
 * FIXTURE_BALANCE_DIRECTION   → when owner balance polarity is engine-computed
 * ─────────────────────────────────────────────────────────────────
 */

import type { StatementStatus, EuroAmount } from './ownerWorkspaceTypes'

/** Demo statement status — replace when statement_series is wired per-owner */
export const FIXTURE_STATEMENT_STATUS: StatementStatus = 'draft'

/**
 * Closing balance — always null until Settlement Engine (RC2).
 * The UI renders UnknownValue with an explicit RC2 message.
 * This is not a missing fixture — it is an explicit architectural boundary.
 */
export const FIXTURE_CLOSING_BALANCE_EUR: EuroAmount = null

/**
 * Owner balance — null until Partner Capital engine is implemented.
 * The UI renders UnknownValue; the balance direction is shown as 'balanced'
 * to avoid presenting a false financial position.
 */
export const FIXTURE_OWNER_BALANCE_EUR: EuroAmount = null

/** Open correction count — 0 until corrections module is wired */
export const FIXTURE_OPEN_CORRECTIONS = 0

/** Upcoming events count — 0 until upcoming_events backend is wired */
export const FIXTURE_UPCOMING_COUNT = 0

/**
 * Priority group — 'rest' for all owners until real priority routing is implemented.
 * Priority routing requires: days-since-last-statement, overdue payments, open corrections.
 */
export const FIXTURE_PRIORITY_GROUP = 'rest' as const

/**
 * Balance direction — 'balanced' until engine computes real polarity.
 * Using 'balanced' (grey) prevents showing a misleading red/green state.
 */
export const FIXTURE_BALANCE_DIRECTION = 'balanced' as const
