/**
 * Universal client report entry point (pure). Composes the certified account and runs every
 * accounting gate before the document is allowed to reach a renderer.
 */

import { composeCertifiedClientAccount } from './composeCertifiedAccount'
import { runAccountingGates, type GateReport } from './gates'
import type { ClientAccountDocument, CompositionInput } from './types'

export interface ClientAccountReport {
  readonly document: ClientAccountDocument
  readonly gates: GateReport
}

/** Throws ClientAccountBlock on any accounting or presentation failure — never returns a partial report. */
export function buildClientAccountReport(input: CompositionInput): ClientAccountReport {
  const document = composeCertifiedClientAccount(input)
  const gates = runAccountingGates(document, input)
  return { document, gates }
}
