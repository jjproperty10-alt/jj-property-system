/**
 * Control Room Service — canonical composition contract for the Control Room.
 *
 * Wiring Agent (2026-08-16). READ-ONLY. server-only. Composes existing certified
 * services/sources — no new business logic, no recomputation, never mock.
 *
 * Sections:
 *   - cashPosition        → getMoneyPosition()  (certified v_money_position; receivable/payable)
 *   - str                 → revintel.v_portfolio_summary (occupancy/ADR — already certified)
 *   - revenueIntelligence → getRevenueRecommendations()  (revintel.recommendation)
 *   - attention           → getAttentionItems()  (real signals)
 *   - portfolio           → counts from certified sources (best-effort, labelled)
 *
 * The UI must never assemble business truth itself — it consumes this contract.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { getMoneyPosition, type MoneyPositionDTO } from '@/lib/money/moneyPositionService'
import { getAttentionItems, type AttentionItemDTO } from '@/lib/attention/attentionService'
import { getRevenueRecommendations, type RevenueRecommendationDTO } from '@/lib/revintel/revenueIntelligenceService'

export interface ControlRoomStrSummaryDTO {
  readonly strPropertyCount: number
  readonly avgOccupancy30d: string | null   // 0..1 or pct as stored
  readonly avgAdr30d: string | null
  readonly sourceUnavailable: boolean
}

export interface ControlRoomPortfolioDTO {
  readonly activePropertyCount: number | null
  readonly clientsWithOpenPosition: number
  readonly strPropertyCount: number
}

export interface ControlRoomSummaryDTO {
  readonly period: string | null
  readonly cashPosition: MoneyPositionDTO
  readonly str: ControlRoomStrSummaryDTO
  readonly revenueIntelligence: readonly RevenueRecommendationDTO[]
  readonly attention: readonly AttentionItemDTO[]
  readonly portfolio: ControlRoomPortfolioDTO
}

async function loadStrSummary(
  db: ReturnType<typeof createServiceClient>,
): Promise<ControlRoomStrSummaryDTO> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('revintel')
      .from('v_portfolio_summary')
      .select('occ_30d, adr_30d')
    if (error) throw error
    type R = { occ_30d: number | null; adr_30d: number | null }
    const rows = (data ?? []) as R[]
    const occ = rows.map(r => r.occ_30d).filter((v): v is number => v != null)
    const adr = rows.map(r => r.adr_30d).filter((v): v is number => v != null)
    const avg = (a: number[]) => (a.length ? (a.reduce((s, x) => s + x, 0) / a.length) : null)
    const occAvg = avg(occ)
    const adrAvg = avg(adr)
    return {
      strPropertyCount: rows.length,
      avgOccupancy30d: occAvg == null ? null : occAvg.toFixed(4),
      avgAdr30d: adrAvg == null ? null : adrAvg.toFixed(2),
      sourceUnavailable: false,
    }
  } catch (err) {
    console.error('[controlRoom] STR summary failed:', err)
    return { strPropertyCount: 0, avgOccupancy30d: null, avgAdr30d: null, sourceUnavailable: true }
  }
}

async function loadActivePropertyCount(
  db: ReturnType<typeof createServiceClient>,
): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count, error } = await (db as any)
      .from('property_definitions')
      .select('property_id', { count: 'exact', head: true })
    if (error) throw error
    return typeof count === 'number' ? count : null
  } catch (err) {
    console.error('[controlRoom] property count failed:', err)
    return null
  }
}

/**
 * Compose the Control Room summary from certified sources. Each section fails
 * closed independently (partial data is honest data). `period` is passed through;
 * cashPosition is a current certified position (as-of), see MoneyPositionDTO.asOfDate.
 */
export async function getControlRoomSummary(period?: string): Promise<ControlRoomSummaryDTO> {
  let db: ReturnType<typeof createServiceClient>
  try {
    db = createServiceClient()
  } catch (err) {
    console.error('[controlRoom] createServiceClient failed:', err)
    // Still return a shaped, empty-but-honest contract.
    const emptyMoney = await getMoneyPosition(period) // fail-closed inside
    return {
      period: period ?? null,
      cashPosition: emptyMoney,
      str: { strPropertyCount: 0, avgOccupancy30d: null, avgAdr30d: null, sourceUnavailable: true },
      revenueIntelligence: [],
      attention: [],
      portfolio: { activePropertyCount: null, clientsWithOpenPosition: 0, strPropertyCount: 0 },
    }
  }

  const [cashPosition, str, revenueIntelligence, attention, activePropertyCount] = await Promise.all([
    getMoneyPosition(period),
    loadStrSummary(db),
    getRevenueRecommendations({ currentOnly: true }),
    getAttentionItems(),
    loadActivePropertyCount(db),
  ])

  const clientsWithOpenPosition =
    cashPosition.receivableToJJ.counterparties + cashPosition.payableByJJ.counterparties

  return {
    period: period ?? null,
    cashPosition,
    str,
    revenueIntelligence,
    attention,
    portfolio: {
      activePropertyCount,
      clientsWithOpenPosition,
      strPropertyCount: str.strPropertyCount,
    },
  }
}
