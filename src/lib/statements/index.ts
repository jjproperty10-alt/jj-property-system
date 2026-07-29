/**
 * @module statements
 * @description VS-1A — Statement builder barrel exports.
 *
 * Public API:
 *   - buildStatementPreview() — builds StatementBuilderOutput (read-only)
 *   - classifyDisposition()   — pure disposition engine
 *   - Types: StatementBuilderOutput, DispositionSummary, TransactionDisposition, etc.
 */

// Types
export type {
  DispositionBucket,
  P1BalanceEffect,
  TransactionDisposition,
  DispositionSummary,
  FreshnessStatus,
  SourceFreshnessGate,
  StatementBuilderOutput,
  AccountSectionSummary,
  DraftLineInput,
  SnapshotEntryInput,
} from './types'

// Disposition engine (pure, no DB)
export { classifyDisposition } from './dispositionEngine'
export type { RC3RowForDisposition } from './dispositionEngine'

// Statement builder service (server-only, reads DB)
export { buildStatementPreview } from './statementBuilderService'
export type { BuildStatementInput } from './statementBuilderService'
