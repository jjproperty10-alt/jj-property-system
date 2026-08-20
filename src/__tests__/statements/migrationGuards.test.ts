/**
 * Gate cert - static guards over the correction/immutability migrations.
 * These pin the security-critical invariants in the SQL so a future edit that
 * weakens them fails CI. (DB-behaviour tests run when the migrations are applied
 * to a staging database; these protect the SQL text itself.)
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const DIR = join(process.cwd(), 'supabase', 'migrations')
const read = (f: string) => readFileSync(join(DIR, f), 'utf8')

const M1 = '20260820_001_baseline_deployed_corrections_and_statements.sql'
const M2 = '20260820_002_apply_correction_case_insert_only.sql'
const M3 = '20260820_003_transactions_financial_truth_protection.sql'
const M4 = '20260820_004_transition_correction_case_no_applied.sql'
const M5 = '20260820_005_fix_open_correction_case_guard.sql'

describe('001 baseline is verification-only (not a mutating "no-op")', () => {
  const sql = read(M1)
  test('does NOT redefine any function body (no CREATE OR REPLACE FUNCTION as DDL)', () => {
    // ignore the word appearing inside explanatory SQL comments
    const ddlLines = sql.split('\n').filter(l => !l.trimStart().startsWith('--'))
    expect(ddlLines.join('\n')).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i)
  })
  test('does not falsely claim NO-OP while mutating; it asserts + can fail', () => {
    expect(sql).toMatch(/RAISE EXCEPTION/i)
    expect(sql).toMatch(/verification/i)
  })
  test('asserts required deployed functions/tables exist', () => {
    expect(sql).toMatch(/apply_transaction_correction/)
    expect(sql).toMatch(/send_statement/)
    expect(sql).toMatch(/statements['".,\s]+correction_cases|correction_cases/)
  })
})

describe('002 apply_correction_case is approved-gated, case-anchored, strict', () => {
  const sql = read(M2)
  test('requires the case to be exactly approved', () => {
    expect(sql).toMatch(/status\s*<>\s*'approved'/)
  })
  test('loads the canonical original from the case, locked', () => {
    expect(sql).toMatch(/original_transaction_id/)
    expect(sql).toMatch(/FROM statements\.correction_cases WHERE id = p_case_id FOR UPDATE/)
  })
  test('amount is strict - no silent coalesce of unknown to 0 (P-ARCH-1)', () => {
    // must reject a missing amount rather than defaulting to 0
    expect(sql).toMatch(/amount_eur is required \(Unknown != 0\)/)
    // must NOT contain the old unsafe coalesce-to-zero on amount
    expect(sql).not.toMatch(/COALESCE\(\(v_row->>'amount_eur'\)::NUMERIC\(12,2\),\s*0\)/)
  })
  test('enforces reversal negation and rebook amount-preservation', () => {
    expect(sql).toMatch(/reversal amount .* negated original/)
    expect(sql).toMatch(/rebook amount .* preserve original amount/)
  })
  test('creates the lineage table + read RPC + inserts a lineage row per correcting tx', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS statements\.correction_applied_transactions/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION statements\.get_correction_applied_transactions/)
    expect(sql).toMatch(/INSERT INTO statements\.correction_applied_transactions/)
    expect(sql).toMatch(/UNIQUE \(case_id, applied_transaction_id\)/)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })
  test('returns a structured result (not just the first id)', () => {
    expect(sql).toMatch(/applied_transaction_ids/)
    expect(sql).toMatch(/inserted_count/)
  })
  test('never updates or deletes the original (INSERT-only into public.transactions)', () => {
    expect(sql).not.toMatch(/UPDATE\s+public\.transactions/i)
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.transactions/i)
  })
  test('value-binds each correcting row to the approved case (not just authorises)', () => {
    // a forward row uses corrected_field_values as the expected value...
    expect(sql).toMatch(/corrected_field_values->>v_field/)
    // ...otherwise the original value; and it RAISES on any mismatch.
    expect(sql).toMatch(/v_orig_json->>v_field/)
    expect(sql).toMatch(/does not match the .* for this approved case/)
    // every bindable field is checked, including the descriptive ones.
    for (const field of ['property_id', 'category', 'subcategory', 'description', 'payer', 'payee', 'date']) {
      expect(sql).toContain(`'${field}'`)
    }
  })
})

describe('004 transition_correction_case can never reach applied', () => {
  const sql = read(M4)
  test('hard-blocks a transition to applied', () => {
    expect(sql).toMatch(/p_new_status\s*=\s*'applied'/)
    expect(sql).toMatch(/RAISE EXCEPTION '\[denied\][^']*applied/)
  })
  test('rejects any caller-supplied applied_transaction_id', () => {
    expect(sql).toMatch(/p_applied_tx_id IS NOT NULL/)
    expect(sql).toMatch(/applied_transaction_id may only be set by/)
  })
  test('restricts targets to the four non-applied statuses', () => {
    expect(sql).toMatch(/p_new_status NOT IN \('under_review','approved','rejected','void'\)/)
  })
  test('maps void status to the voided event_type (events CHECK requires voided)', () => {
    expect(sql).toMatch(/p_new_status = 'void' THEN v_event_type := 'voided'/)
  })
  test('does not touch applied_transaction_id / applied_at in the UPDATE', () => {
    // the UPDATE sets status/resolved_*/notes/updated_at, never applied_* columns
    const update = sql.slice(sql.indexOf('UPDATE statements.correction_cases'))
    expect(update).not.toMatch(/applied_transaction_id\s*=/)
    expect(update).not.toMatch(/applied_at\s*=/)
  })
  test('guards with the guard that actually exists, not the dangling statements one', () => {
    // ignore the word appearing inside explanatory SQL comments
    const ddl = sql.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
    // must NOT call the non-existent statements.require_jj_staff()
    expect(ddl).not.toMatch(/statements\.require_jj_staff\s*\(/)
    // must call public.require_jj_staff(ARRAY[...])
    expect(ddl).toMatch(/public\.require_jj_staff\s*\(\s*ARRAY\[/)
  })
})

describe('005 fixes the dangling guard on open_correction_case', () => {
  const sql = read(M5)
  test('re-creates open_correction_case', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION statements\.open_correction_case/)
  })
  test('replaces the dangling statements.require_jj_staff() with public.require_jj_staff(ARRAY[...])', () => {
    expect(sql).not.toMatch(/PERFORM\s+statements\.require_jj_staff\s*\(/)
    expect(sql).toMatch(/public\.require_jj_staff\s*\(\s*ARRAY\[/)
  })
  test('preserves the case-insert + opened-event behaviour', () => {
    expect(sql).toMatch(/INSERT INTO statements\.correction_cases/)
    expect(sql).toMatch(/'opened'/)
  })
})

describe('003 transactions append-only guard', () => {
  const sql = read(M3)
  test('fires BEFORE UPDATE OR DELETE', () => {
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.transactions/)
  })
  test('blocks DELETE', () => {
    expect(sql).toMatch(/TG_OP\s*=\s*'DELETE'/)
    expect(sql).toMatch(/does not allow DELETE/)
  })
  test('freezes the financial/descriptive columns', () => {
    for (const col of ['date', 'property_id', 'category', 'subcategory', 'amount_eur', 'client_charge', 'payer', 'payee', 'description', 'notes', 'k_note']) {
      expect(sql).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`))
    }
  })
  test('allows operational metadata (review_status / is_deleted) to change', () => {
    // these must NOT be part of the frozen comparison list
    expect(sql).not.toMatch(/NEW\.review_status\s+IS DISTINCT FROM OLD\.review_status/)
    expect(sql).not.toMatch(/NEW\.is_deleted\s+IS DISTINCT FROM OLD\.is_deleted/)
  })
})
