/**
 * M1-DB enablement — static guards over the new migration + unique-violation UX.
 * No Production connection. Proves SQL text invariants and app error translation.
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  isPostgresUniqueViolation,
  uniqueNonterminalCaseMessage,
} from '@/lib/transactions/uniqueCaseViolation'

const MIG_DIR = join(process.cwd(), 'supabase', 'migrations')
const ROLLBACK_DIR = join(process.cwd(), 'docs', 'rollbacks')
const MIG = '20260904_001_m1_correction_authenticated_grants_and_unique_case.sql'
const ROLLBACK = '20260904_001_m1_correction_authenticated_grants_and_unique_case_rollback.sql'
const readMig = (f: string) => readFileSync(join(MIG_DIR, f), 'utf8')
const readRollback = () => readFileSync(join(ROLLBACK_DIR, ROLLBACK), 'utf8')

const OPEN_SIG =
  'statements.open_correction_case(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb)'
const TRANSITION_SIG = 'statements.transition_correction_case(uuid, text, text, uuid)'
const APPLY_SIG = 'statements.apply_correction_case(uuid, jsonb)'

const REAL_NONTERMINAL = ['open', 'under_review', 'approved'] as const
const REAL_TERMINAL = ['applied', 'rejected', 'void'] as const

describe('M1-DB packaging — only forward migration is deployable', () => {
  test('only the forward M1-DB SQL file exists under supabase/migrations/', () => {
    const m1Files = readdirSync(MIG_DIR).filter(
      (f) => f.includes('m1_correction_authenticated') && f.endsWith('.sql'),
    )
    expect(m1Files).toEqual([MIG])
    expect(existsSync(join(MIG_DIR, MIG))).toBe(true)
    expect(existsSync(join(MIG_DIR, ROLLBACK))).toBe(false)
    expect(existsSync(join(MIG_DIR, `${MIG.replace('.sql', '')}_rollback.sql`))).toBe(false)
  })

  test('rollback file cannot be discovered as a deployable migration', () => {
    expect(existsSync(join(ROLLBACK_DIR, ROLLBACK))).toBe(true)
    const underMigrations = readdirSync(MIG_DIR).filter((f) =>
      f.toLowerCase().includes('rollback'),
    )
    // Historical occupancy rollback files may exist; M1-DB rollback must not.
    expect(underMigrations.filter((f) => f.includes('m1_correction'))).toEqual([])
    expect(join(ROLLBACK_DIR, ROLLBACK)).not.toMatch(/supabase[/\\]migrations/)
  })
})

describe('M1-DB migration 20260904_001 — grants and unique index', () => {
  const sql = readMig(MIG)
  const ddl = sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')

  test('grants EXECUTE to authenticated with exact signatures for all three RPCs', () => {
    expect(ddl).toMatch(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${OPEN_SIG.replace(/[()]/g, '\\$&')} TO authenticated`,
        'i',
      ),
    )
    expect(ddl).toMatch(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${TRANSITION_SIG.replace(/[()]/g, '\\$&')} TO authenticated`,
        'i',
      ),
    )
    expect(ddl).toMatch(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${APPLY_SIG.replace(/[()]/g, '\\$&')} TO authenticated`,
        'i',
      ),
    )
  })

  test('authenticated EXECUTE is limited to the three approved RPCs (no other GRANT EXECUTE TO authenticated)', () => {
    const grants: string[] = []
    const re = /GRANT EXECUTE ON FUNCTION\s+(.+?)\s+TO authenticated/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(ddl)) !== null) {
      grants.push(m[1].toLowerCase().replace(/\s+/g, ''))
    }
    expect(grants.sort()).toEqual(
      [
        'statements.open_correction_case(uuid,uuid,text,text,numeric,numeric,text,jsonb,jsonb)',
        'statements.transition_correction_case(uuid,text,text,uuid)',
        'statements.apply_correction_case(uuid,jsonb)',
      ].sort(),
    )
  })

  test('revokes EXECUTE from PUBLIC and anon; preserves service_role', () => {
    for (const sig of [OPEN_SIG, TRANSITION_SIG, APPLY_SIG]) {
      const esc = sig.replace(/[()]/g, '\\$&')
      expect(ddl).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${esc} FROM PUBLIC`, 'i'))
      expect(ddl).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${esc} FROM anon`, 'i'))
      expect(ddl).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${esc} TO service_role`, 'i'))
    }
  })

  test('grants schema USAGE to authenticated (required for RPC lookup)', () => {
    expect(ddl).toMatch(/GRANT USAGE ON SCHEMA statements TO authenticated/i)
  })

  test('does NOT grant table mutation privileges on public.transactions', () => {
    expect(ddl).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL).*ON\s+(TABLE\s+)?public\.transactions/i)
    expect(ddl).not.toMatch(/GRANT\s+UPDATE\s+ON/i)
    expect(ddl).not.toMatch(/GRANT\s+DELETE\s+ON/i)
    expect(ddl).not.toMatch(/GRANT\s+INSERT\s+ON/i)
  })

  test('does NOT grant correction table INSERT/UPDATE/DELETE to authenticated', () => {
    expect(ddl).not.toMatch(
      /GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL).*ON\s+statements\.correction_cases\s+TO\s+authenticated/i,
    )
    expect(ddl).not.toMatch(
      /GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL).*ON\s+statements\.correction_events\s+TO\s+authenticated/i,
    )
  })

  test('does NOT redefine RPC bodies or weaken require_jj_staff', () => {
    expect(ddl).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i)
    expect(sql).toMatch(/public\.require_jj_staff/)
    expect(sql).toMatch(/ceo.*finance_admin|finance_admin/)
  })

  test('creates unique partial index for real non-terminal statuses; NULL original_tx excluded', () => {
    expect(ddl).toMatch(/uq_correction_cases_one_nonterminal_per_tx/)
    expect(ddl).toMatch(/UNIQUE INDEX/i)
    expect(ddl).toMatch(/status IN \('open',\s*'under_review',\s*'approved'\)/)
    expect(ddl).toMatch(/original_transaction_id IS NOT NULL/)
    for (const s of REAL_NONTERMINAL) expect(ddl).toContain(`'${s}'`)
    for (const s of REAL_TERMINAL) {
      // terminal statuses must not appear in the partial-index WHERE list
      expect(ddl).not.toMatch(new RegExp(`status IN \\([^)]*'${s}'[^)]*\\)`))
    }
  })

  test('preflight fails clearly with schema-qualified index name when conflicts exist', () => {
    expect(ddl).toMatch(/RAISE EXCEPTION/)
    expect(ddl).toMatch(/Cannot create statements\.uq_correction_cases_one_nonterminal_per_tx/)
    expect(ddl).toMatch(/HAVING count\(\*\) > 1/)
  })

  test('documents that terminal cases do not block later corrections', () => {
    expect(sql).toMatch(/Terminal statuses applied\|rejected\|void do not block/i)
  })

  test('points to docs/rollbacks rollback path (not supabase/migrations)', () => {
    expect(sql).toMatch(
      /docs\/rollbacks\/20260904_001_m1_correction_authenticated_grants_and_unique_case_rollback\.sql/,
    )
  })
})

describe('M1-DB rollback SQL (docs/rollbacks — not auto-applied)', () => {
  const sql = readRollback()
  const ddl = sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')

  test('drops only the new unique index (schema-qualified)', () => {
    expect(ddl).toMatch(/DROP INDEX IF EXISTS statements\.uq_correction_cases_one_nonterminal_per_tx/)
  })

  test('revokes authenticated EXECUTE on the three RPCs with exact signatures', () => {
    expect(ddl).toMatch(
      /REVOKE EXECUTE ON FUNCTION statements\.open_correction_case\(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb\) FROM authenticated/,
    )
    expect(ddl).toMatch(
      /REVOKE EXECUTE ON FUNCTION statements\.transition_correction_case\(uuid, text, text, uuid\) FROM authenticated/,
    )
    expect(ddl).toMatch(
      /REVOKE EXECUTE ON FUNCTION statements\.apply_correction_case\(uuid, jsonb\) FROM authenticated/,
    )
  })

  test('preserves service_role EXECUTE (re-affirm grants)', () => {
    expect(ddl).toMatch(
      /GRANT EXECUTE ON FUNCTION statements\.open_correction_case\(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb\) TO service_role/,
    )
    expect(ddl).toMatch(
      /GRANT EXECUTE ON FUNCTION statements\.transition_correction_case\(uuid, text, text, uuid\) TO service_role/,
    )
    expect(ddl).toMatch(
      /GRANT EXECUTE ON FUNCTION statements\.apply_correction_case\(uuid, jsonb\) TO service_role/,
    )
    expect(ddl).not.toMatch(/REVOKE EXECUTE[\s\S]*FROM service_role/)
  })

  test('does not revoke schema USAGE (cannot prove exclusive introduction)', () => {
    expect(ddl).not.toMatch(/REVOKE USAGE ON SCHEMA statements FROM authenticated/i)
  })

  test('does not delete or modify correction data', () => {
    expect(ddl).not.toMatch(/DROP TABLE/i)
    expect(ddl).not.toMatch(/DELETE\s+FROM\s+statements\.correction/i)
    expect(ddl).not.toMatch(/TRUNCATE/i)
    expect(ddl).not.toMatch(/UPDATE\s+statements\.correction/i)
  })
})

describe('M1 unique-violation translation', () => {
  test('detects Postgres 23505 and index name in messages', () => {
    expect(isPostgresUniqueViolation({ code: '23505' })).toBe(true)
    expect(
      isPostgresUniqueViolation({
        message: 'duplicate key value violates unique constraint "uq_correction_cases_one_nonterminal_per_tx"',
      }),
    ).toBe(true)
    expect(
      isPostgresUniqueViolation({
        message: 'statements.uq_correction_cases_one_nonterminal_per_tx',
      }),
    ).toBe(true)
    expect(isPostgresUniqueViolation({ code: '42501', message: 'permission denied' })).toBe(false)
  })

  test('builds a clear user-facing non-terminal conflict message', () => {
    const msg = uniqueNonterminalCaseMessage('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(msg).toMatch(/non-terminal correction case already exists/i)
    expect(msg).toMatch(/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/)
    expect(msg).not.toMatch(/unhandled|stack|exception/i)
  })
})

describe('M1-DB authorization documentation invariants (from prior migrations)', () => {
  const open = readMig('20260820_005_fix_open_correction_case_guard.sql')
  const transition = readMig('20260820_004_transition_correction_case_no_applied.sql')
  const apply = readMig('20260820_002_apply_correction_case_insert_only.sql')
  const create = readMig('20260816_001_billing_payment_correction.sql')

  test('all three RPCs are SECURITY DEFINER and call public.require_jj_staff(ceo, finance_admin)', () => {
    for (const sql of [open, transition, apply]) {
      expect(sql).toMatch(/SECURITY DEFINER/)
      expect(sql).toMatch(/public\.require_jj_staff\s*\(\s*ARRAY\['ceo',\s*'finance_admin'\]\)/)
    }
  })

  test('open stores opened_by = auth.uid(); apply assigns actor from require_jj_staff', () => {
    expect(open).toMatch(/opened_by[\s\S]*auth\.uid\(\)/)
    expect(apply).toMatch(/v_actor\s*:=\s*public\.require_jj_staff/)
  })

  test('apply is INSERT-only into public.transactions (no UPDATE/DELETE of source)', () => {
    const ddl = apply
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n')
    expect(ddl).toMatch(/INSERT INTO public\.transactions/)
    expect(ddl).not.toMatch(/UPDATE\s+public\.transactions/i)
    expect(ddl).not.toMatch(/DELETE\s+FROM\s+public\.transactions/i)
  })

  test('there is no statements.require_jj_staff — public.require_jj_staff is the guard', () => {
    const openDdl = open
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n')
    expect(openDdl).not.toMatch(/PERFORM\s+statements\.require_jj_staff\s*\(/)
  })

  test('correction_cases deny-all RLS; prior grants are service_role EXECUTE only', () => {
    expect(create).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(create).toMatch(/deny_all_correction_cases/)
    expect(create).toMatch(/GRANT EXECUTE ON FUNCTION statements\.open_correction_case TO service_role/)
    expect(create).not.toMatch(
      /GRANT EXECUTE ON FUNCTION statements\.open_correction_case TO authenticated/,
    )
  })

  test('correction_cases CHECK statuses match index predicate vocabulary', () => {
    expect(create).toMatch(/'open'/)
    expect(create).toMatch(/'under_review'/)
    expect(create).toMatch(/'approved'/)
    expect(create).toMatch(/'rejected'/)
    expect(create).toMatch(/'applied'/)
    expect(create).toMatch(/'void'/)
  })

  test('partial unique index excludes terminal statuses so later corrections remain possible', () => {
    const mig = readMig(MIG)
    expect(mig).toMatch(/status IN \('open',\s*'under_review',\s*'approved'\)/)
    expect(mig).not.toMatch(/status IN \('open',\s*'under_review',\s*'approved',\s*'applied'/)
    expect(mig).toMatch(/Terminal statuses applied\|rejected\|void do not block/i)
  })
})

describe('M1 billingActions session path (app-layer auth for RPCs)', () => {
  const billing = readFileSync(
    join(process.cwd(), 'src', 'lib', 'owners', 'billingActions.ts'),
    'utf8',
  )

  test('correction mutations use session client, not service role, and gate ceo|finance_admin', () => {
    expect(billing).toMatch(/createSupabaseServerClient/)
    expect(billing).toMatch(/CORRECTION_MUTATOR_ROLES/)
    expect(billing).toMatch(/correctionSessionDb/)
    const openFn = billing.slice(billing.indexOf('export async function openCorrectionCaseAction'))
    const openBody = openFn.slice(0, openFn.indexOf('export async function transitionCorrectionCaseAction'))
    expect(openBody).toMatch(/correctionSessionDb\(\)/)
    expect(openBody).not.toMatch(/createServiceClient\(\)/)
    expect(openBody).toMatch(/unique_violation/)
  })
})
