/**
 * Owner Workspace Components
 *
 * PR #3 — JJ Workspace Navigation + Owner Workspace Design System
 */

// Identity + navigation
export { OwnerIdentityHeader } from './OwnerIdentityHeader'
export type { OwnerIdentityHeaderProps } from './OwnerIdentityHeader'
export { OwnerTabNavClient } from './OwnerTabNavClient'
export type { OwnerTabNavClientProps } from './OwnerTabNavClient'

// RC-003 — Entity Context Bridge (workspace-to-frame communication)
export { EntityContextBridge } from './EntityContextBridge'
export type { EntityContextBridgeProps } from './EntityContextBridge'

// Tab components
export { OverviewTab } from './tabs/OverviewTab'
export type { OverviewTabProps } from './tabs/OverviewTab'
export { FinancialTab } from './tabs/FinancialTab'
export type { FinancialTabProps } from './tabs/FinancialTab'
export { ReservationsTab } from './tabs/ReservationsTab'
export type { ReservationsTabProps } from './tabs/ReservationsTab'
export { DocumentsTab } from './tabs/DocumentsTab'
export type { DocumentsTabProps } from './tabs/DocumentsTab'
export { MaintenanceTab } from './tabs/MaintenanceTab'
export type { MaintenanceTabProps } from './tabs/MaintenanceTab'
export { RelationshipTab } from './tabs/RelationshipTab'
export type { RelationshipTabProps } from './tabs/RelationshipTab'
export { AuditTab } from './tabs/AuditTab'
export type { AuditTabProps } from './tabs/AuditTab'

// P1 — Rent Position
export { RentPositionCard } from './RentPositionCard'
export type { RentPositionCardProps } from './RentPositionCard'
export { RentTermHistory } from './RentTermHistory'
export type { RentTermHistoryProps } from './RentTermHistory'
export { RentObligationTimeline } from './RentObligationTimeline'
export type { RentObligationTimelineProps } from './RentObligationTimeline'

// P4 — Utilities / Sub-Meters
export { UtilityMeterCard } from './UtilityMeterCard'
export type { UtilityMeterCardProps } from './UtilityMeterCard'
export { ReadingHistory } from './ReadingHistory'
export type { ReadingHistoryProps } from './ReadingHistory'
export { ObligationView } from './ObligationView'
export type { ObligationViewProps } from './ObligationView'
