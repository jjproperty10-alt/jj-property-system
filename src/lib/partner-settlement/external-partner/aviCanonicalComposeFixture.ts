/**
 * Cloud / local Preview fixture: compose the certified Avi report from the
 * frozen 202-row canonical CSV when Supabase keys are absent.
 *
 * Not a Production path. Live staff and share routes still use
 * buildAviExternalPartnerReport() against the database.
 * No ledger writes.
 */

import 'server-only'
import * as fs from 'fs'
import * as path from 'path'
import { composeExternalPartnerAviReport } from './externalPartnerAviService'
import type { ComposeAviReportInput } from './externalPartnerAviService'
import type { ExternalPartnerAviReport } from './externalPartnerAviReportTypes'
import type { RawExternalPartnerTransaction } from './externalPartnerReadTypes'
import type { ExternalPartnerEvidence } from './types'
import { VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT } from './externalPartnerSnapshot'
import {
  AVI_VM1_ATTRIBUTED_AMOUNT_CONTROLS,
  AVI_VM1_CHARGES,
  AVI_VM1_LAYER_INPUTS,
  AVI_VM1_OWNERS,
  AVI_VM1_PREMIUM,
  AVI_VM1_RENOVATION_FUNDING_PAYMENT_IDS,
  AVI_VM1_REQUIRED_CONTROLS,
  buildAviVm1ControlInput,
} from './externalPartnerAviConfig'

function canonicalEvidence(): ExternalPartnerEvidence {
  return {
    classificationArtifact: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.classificationArtifact,
    sha256: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.sha256,
    rowCount: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.approvedRowCount,
    version: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.version,
  }
}

function loadCanonicalVm1RowsFromArtifact(): readonly RawExternalPartnerTransaction[] {
  const csvPath = path.join(
    process.cwd(),
    VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.classificationArtifact,
  )
  const text = fs.readFileSync(csvPath, 'utf8').replace(/\r\n/g, '\n')
  const lines = text.trim().split('\n')
  const header = lines[0].split(',')
  const idx = (name: string) => header.indexOf(name)
  return lines.slice(1).map((line) => {
    const cols = line.split(',')
    return {
      id: cols[idx('txn_id')],
      date: cols[idx('date')],
      property_name: 'Villa Mazotos',
      category: cols[idx('category')] || null,
      subcategory: cols[idx('subcategory')] || null,
      description: null,
      payer: cols[idx('payer')] || null,
      payee: cols[idx('payee')] || null,
      amount_eur: Number(cols[idx('amount_eur')]),
      client_charge: Number(cols[idx('client_charge')]),
      notes: null,
      k_note: null,
      is_deleted: false,
      review_status: 'active',
    }
  })
}

export function buildCanonicalAviComposeFixtureInput(): ComposeAviReportInput {
  const transactionRows = loadCanonicalVm1RowsFromArtifact()
  const evidence = canonicalEvidence()
  return {
    owners: AVI_VM1_OWNERS,
    charges: AVI_VM1_CHARGES,
    premium: AVI_VM1_PREMIUM,
    evidence,
    requiredControls: AVI_VM1_REQUIRED_CONTROLS,
    controlInput: buildAviVm1ControlInput(
      evidence,
      transactionRows.map((row) => row.id),
    ),
    expectedAttributedAmounts: [...AVI_VM1_ATTRIBUTED_AMOUNT_CONTROLS],
    transactionRows,
    layerInputs: AVI_VM1_LAYER_INPUTS,
    renovationFundingPaymentIds: AVI_VM1_RENOVATION_FUNDING_PAYMENT_IDS,
  }
}

export function composeAviCertifiedCanonicalFixtureReport(): ExternalPartnerAviReport {
  return composeExternalPartnerAviReport(buildCanonicalAviComposeFixtureInput())
}
