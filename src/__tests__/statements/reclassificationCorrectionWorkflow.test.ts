/**
 * Atomic public reclassification workflow — SQL guards + behaviour.
 * No live Uriel Apply.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PublicApplyCorrectionError } from '@/lib/statements/publicApplyCorrectionCase'
import {
  WORKFLOW_RPC,
  WORKFLOW_RPC_ARGS,
  buildWorkflowRequest,
  canonicalizeReclassFields,
  emptyWorkflowStore,
  evaluateReclassificationWorkflow,
  workflowNaturalKey,
} from '@/lib/statements/reclassificationCorrectionWorkflow'
import type { SourceTransaction } from '@/lib/statements/publicApplyCorrectionCase'
import {
  cashboxSignedDelta,
  jjPnlSignedDelta,
  netCorrectingAmount,
  originalUnchanged,
} from '@/lib/statements/publicApplyCorrectionCase'

const M_WORKFLOW = '20260918100000_public_apply_reclassification_correction.sql'
const SQL = readFileSync(join(process.cwd(), 'supabase', 'migrations', M_WORKFLOW), 'utf8')
const ddl = SQL.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')

const C3: SourceTransaction = {
  id: 'e02e5c3c-7a87-5ba1-9de1-bbb001aad8dc',
  date: '2026-08-14',
  property_id: '780713fd-29c2-44b4-bb22-2386fa248742',
  property_name: 'Apartment Neer Yoav Dekelia',
  category: 'Sale',
  subcategory: 'Client Payment',
  description: 'אוריאל (INBALURI LTD) העביר 7000 אירו לחשבון JJ Property 10 Bank of Cyprus',
  payer: 'Client',
  payee: 'JJ',
  amount_eur: 7000,
  client_charge: null,
}
const C4: SourceTransaction = {
  id: '0eae3395-73d6-4bda-b855-9d40855eb9d8',
  date: '2025-07-23',
  property_id: null,
  property_name: 'Uriel Duplex',
  category: 'Airbnb',
  subcategory: 'Consumable Supplies',
  description: 'office supply',
  payer: 'Anastasia',
  payee: 'company',
  amount_eur: 51.85,
  client_charge: null,
}
const C6: SourceTransaction = {
  id: 'ae667eae-d0c8-45d6-bd42-61341209b663',
  date: '2026-03-14',
  property_id: null,
  property_name: 'Uriel Oroklini 2 Bed',
  category: 'Management',
  subcategory: 'Plumber',
  description: 'החלפת מנעולים',
  payer: 'Anastasia',
  payee: 'company',
  amount_eur: 29.37,
  client_charge: null,
}

const CEO = { hasSession: true, staffRole: 'ceo', isActive: true }
const ACTOR = '277f81e0-3b89-41ed-a099-22585959b77a'

describe('20260918100000 atomic reclassification RPC SQL', () => {
  test('filename/order follows YYYYMMDDHHMMSS after origin/main head 20260918090000', () => {
    expect(M_WORKFLOW > '20260918090000_agent_draft_approval_rpcs.sql').toBe(true)
  })
  test('single public function with the workflow signature', () => {
    expect(ddl.match(/CREATE OR REPLACE FUNCTION/gi)).toHaveLength(1)
    expect(ddl).toMatch(
      /public\.apply_reclassification_correction\s*\(\s*p_source_id\s+uuid,\s*p_correction_type\s+text,\s*p_corrected_fields\s+jsonb,\s*p_reason\s+text,\s*p_natural_key\s+text\s*\)/i,
    )
  })
  test('SECURITY DEFINER, empty search_path, ceo/finance_admin gate', () => {
    expect(ddl).toMatch(/SECURITY DEFINER/)
    expect(ddl).toMatch(/SET search_path TO ''/)
    expect(ddl).toMatch(/public\.require_jj_staff\s*\(\s*ARRAY\['ceo','finance_admin'\]\s*\)/)
  })
  test('preserves case state machine and approval audit', () => {
    expect(ddl).toMatch(/statements\.open_correction_case/)
    expect(ddl).toMatch(/statements\.transition_correction_case/)
    expect(ddl).toMatch(/'approved'/)
    expect(ddl).toMatch(/statements\.apply_correction_case/)
    expect(ddl).toMatch(/v_actor/)
    expect(ddl).toMatch(/'actor',\s*v_actor/)
    expect(ddl).toMatch(/'opened_by'/)
    expect(ddl).toMatch(/'resolved_by'/)
    expect(ddl).not.toMatch(/GRANT .*statements\./i)
    expect(ddl).not.toMatch(/CREATE OR REPLACE FUNCTION statements\./)
  })
  test('whitelist, frozen money, no DELETE/UPDATE of transactions, no COMMIT', () => {
    expect(ddl).toMatch(/NOT IN \('property_id', 'subcategory', 'description'\)/)
    expect(ddl).toMatch(/frozen money fields cannot be changed/)
    expect(ddl).not.toMatch(/DELETE\s+FROM\s+public\.transactions/i)
    expect(ddl).not.toMatch(/UPDATE\s+public\.transactions/i)
    expect(ddl).not.toMatch(/\bCOMMIT\b/)
    expect(ddl).not.toMatch(/autonomous/i)
  })
  test('idempotent replay and authenticated-only grants', () => {
    expect(ddl).toMatch(/'replay',\s*true/)
    expect(ddl).toMatch(/'inserted_count',\s*0/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public\.apply_reclassification_correction\([^)]+\) FROM anon/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public\.apply_reclassification_correction\([^)]+\) FROM PUBLIC/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public\.apply_reclassification_correction\([^)]+\) FROM service_role/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_reclassification_correction\([^)]+\) TO authenticated/)
    expect(ddl).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_reclassification_correction\([^)]+\) TO anon/)
  })
})

describe('workflow behaviour', () => {
  test('unauthorized call fails and store stays empty', () => {
    const { request } = buildWorkflowRequest(C3, { property_id: 'b587f463-279d-4376-bb14-38789f34cbba' }, 'C3')
    const store = emptyWorkflowStore()
    expect(() => evaluateReclassificationWorkflow({
      caller: { hasSession: false, staffRole: null, isActive: false },
      actorId: ACTOR,
      original: C3,
      request,
      store,
    })).toThrow(/unauthorized/)
    expect(store.cases).toHaveLength(0)
    expect(store.transactions).toHaveLength(0)
  })

  test('authorized create → approve → apply records actor and events', () => {
    const { request, rows } = buildWorkflowRequest(C3, { property_id: 'b587f463-279d-4376-bb14-38789f34cbba' }, 'C3')
    const result = evaluateReclassificationWorkflow({
      caller: CEO,
      actorId: ACTOR,
      original: C3,
      request,
      store: emptyWorkflowStore(),
    })
    expect(result.created_case).toBe(true)
    expect(result.actor).toBe(ACTOR)
    expect(result.inserted_count).toBe(2)
    expect(result.store.cases[0].events).toEqual(['opened', 'approved', 'applied'])
    expect(result.store.cases[0].openedBy).toBe(ACTOR)
    expect(result.store.cases[0].resolvedBy).toBe(ACTOR)
    expect(result.store.cases[0].status).toBe('applied')
    expect(netCorrectingAmount(rows)).toBe(0)
    expect(WORKFLOW_RPC).toBe('apply_reclassification_correction')
    expect(WORKFLOW_RPC_ARGS).toEqual([
      'p_source_id', 'p_correction_type', 'p_corrected_fields', 'p_reason', 'p_natural_key',
    ])
  })

  test('replay creates no duplicate rows', () => {
    const { request } = buildWorkflowRequest(C4, {
      subcategory: 'Airbnb Equipment',
      description: 'Jumbo / apartment equipment',
    }, 'C4')
    const first = evaluateReclassificationWorkflow({
      caller: CEO, actorId: ACTOR, original: C4, request, store: emptyWorkflowStore(),
    })
    const second = evaluateReclassificationWorkflow({
      caller: CEO,
      actorId: ACTOR,
      original: C4,
      request,
      store: first.store,
      existingLineage: [
        {
          sequence_no: 1, entry_role: 'reversal',
          applied_transaction_id: first.reversal_id!,
          amount_eur: -51.85, payer: 'Anastasia', payee: 'company', date: '2025-07-23',
        },
        {
          sequence_no: 2, entry_role: 'rebook',
          applied_transaction_id: first.rebook_id!,
          amount_eur: 51.85, payer: 'Anastasia', payee: 'company', date: '2025-07-23',
        },
      ],
    })
    expect(second.replay).toBe(true)
    expect(second.inserted_count).toBe(0)
    expect(second.store.transactions).toHaveLength(2)
    expect(second.correction_case_id).toBe(first.correction_case_id)
  })

  test('atomic rollback: failure after create leaves no committed case or rows', () => {
    const { request } = buildWorkflowRequest(C6, { subcategory: 'Lock Replacement' }, 'C6')
    const store = emptyWorkflowStore()
    expect(() => evaluateReclassificationWorkflow({
      caller: CEO, actorId: ACTOR, original: C6, request, store, failAt: 'approve',
    })).toThrow(/atomic rollback at approve/)
    expect(store.cases).toHaveLength(0)
    expect(store.transactions).toHaveLength(0)

    expect(() => evaluateReclassificationWorkflow({
      caller: CEO, actorId: ACTOR, original: C6, request, store, failAt: 'apply',
    })).toThrow(/atomic rollback at apply/)
    expect(store.cases).toHaveLength(0)
    expect(store.transactions).toHaveLength(0)
  })

  test.each([
    ['C3', C3, { property_id: 'b587f463-279d-4376-bb14-38789f34cbba' }],
    ['C4', C4, { subcategory: 'Airbnb Equipment', description: 'Jumbo / apartment equipment' }],
    ['C6', C6, { subcategory: 'Lock Replacement' }],
  ] as const)('%s payload is whitelist-only, net 0, cash/P&L 0, original frozen', (_label, original, fields) => {
    const before = { ...original }
    const { request, rows } = buildWorkflowRequest(original, { ...fields }, `${_label} reason`)
    expect(request.correctionType).toBe('reclassification')
    expect(request.naturalKey).toBe(workflowNaturalKey(original.id, fields))
    expect(canonicalizeReclassFields(fields)).toEqual(fields)
    expect(netCorrectingAmount(rows)).toBe(0)
    expect(cashboxSignedDelta(rows)).toBe(0)
    expect(jjPnlSignedDelta(rows)).toBe(0)
    expect(originalUnchanged(before, original)).toBe(true)
    expect(() => canonicalizeReclassFields({ ...fields, amount_eur: '1' } as any)).toThrow(PublicApplyCorrectionError)
  })

  test('natural key mismatch fails closed', () => {
    const { request } = buildWorkflowRequest(C3, { property_id: 'b587f463-279d-4376-bb14-38789f34cbba' }, 'C3')
    expect(() => evaluateReclassificationWorkflow({
      caller: CEO,
      actorId: ACTOR,
      original: C3,
      request: { ...request, naturalKey: 'tampered' },
      store: emptyWorkflowStore(),
    })).toThrow(/natural key mismatch/)
  })
})
