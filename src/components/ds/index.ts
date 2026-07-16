/**
 * JJ Design System 2035 — Component Exports
 *
 * Import from '@/components/ds' to use any design system component.
 *
 * Usage:
 *   import { MoneyValue, StatusBadge, KpiCard } from '@/components/ds'
 *
 * Token imports (not components):
 *   import { JJ_COLORS, STATUS_CLASSES, MONEY_SIZE_CLASSES } from '@/lib/ds/tokens'
 */

export { MoneyValue } from './MoneyValue'
export { StatusBadge } from './StatusBadge'
export { KpiCard } from './KpiCard'
export { EmptyState } from './EmptyState'
export { UnknownValue } from './UnknownValue'
export { SectionHeader } from './SectionHeader'
export { PageShell } from './PageShell'
export { AttentionBanner } from './AttentionBanner'
export { DataTable } from './DataTable'
export { AiActivityCard } from './AiActivityCard'

// Re-export column type so consumers can type their column definitions
export type { DataTableColumn } from './DataTable'

// E3-A1 — Experience Layer components
// HealthSignal was pushed to main via PR-R1 (squash merge lost barrel export — restored here)
export { HealthSignal } from './HealthSignal'
export type { BusinessHealthStatus } from './HealthSignal'
