/**
 * JJ Property 10 — clientDisplayText() unit tests
 * ADR-001: Client Display Field Whitelist — Stage 3 enforcement
 *
 * These tests verify:
 * 1. clientDescription param is the highest-priority text source
 * 2. display_label is the second-priority text source
 * 3. '' (safe empty string) is returned when both are absent/empty
 * 4. row.description, row.notes, row.k_note NEVER surface in client output
 *
 * ADR-001 whitelist rule: client-facing output may render ONLY fields
 * explicitly declared for client visibility. All other fields forbidden.
 * Permitted: display_label, client_description (future).
 *
 * The critical invariant tested in the final describe block:
 *   even if display_label is empty and description/notes/k_note contain
 *   real text, clientDisplayText() must return '' — not the internal value.
 */

import { clientDisplayText } from '@/lib/report/clientDisplay'
import type { RC3AccountRow } from '@/lib/report/types'

/* ─── Test helper ────────────────────────────────────────────────────────────── */

/**
 * Builds a minimal valid RC3AccountRow for testing.
 *
 * description, notes, and k_note are set to sentinel values by default so that
 * any accidental read of these fields would produce a distinct, detectable string
 * rather than a blank that could mask the bug.
 */
function makeRow(overrides: Partial<RC3AccountRow> = {}): RC3AccountRow {
  return {
    id: 'test-row-1',
    date: '2026-01-01',
    property_name: 'Test Property',
    reporting_name: 'Test Property',
    category: 'Management',
    subcategory: null,
    // JJ-internal fields — clientDisplayText must NEVER read these:
    description: '__SENTINEL_DESCRIPTION__',
    notes: '__SENTINEL_NOTES__',
    k_note: '__SENTINEL_K_NOTE__',
    payer: null,
    payee: null,
    amount_eur: 100,
    client_charge: null,
    client_amount: 100,
    account_type: 'rental',
    is_contract_value: false,
    is_platform_tracking: false,
    is_bpo: false,
    review_status: 'active',
    balance_effect: 100,
    is_balance_affecting: true,
    display_group: 'income',
    display_label: '',     // default empty — tests override as needed
    ...overrides,
  }
}

/* ─── Priority 1: clientDescription ─────────────────────────────────────────── */

describe('clientDisplayText — Priority 1: clientDescription', () => {
  it('returns clientDescription when provided and non-empty', () => {
    const row = makeRow({ display_label: 'Should Not Appear' })
    expect(clientDisplayText(row, 'Client Note')).toBe('Client Note')
  })

  it('trims leading/trailing whitespace from clientDescription', () => {
    const row = makeRow()
    expect(clientDisplayText(row, '  Client Note  ')).toBe('Client Note')
  })

  it('clientDescription wins over display_label when both are present', () => {
    const row = makeRow({ display_label: 'Display Label Value' })
    expect(clientDisplayText(row, 'Override')).toBe('Override')
    expect(clientDisplayText(row, 'Override')).not.toBe('Display Label Value')
  })

  it('falls through to display_label when clientDescription is null', () => {
    const row = makeRow({ display_label: 'Rent Collected' })
    expect(clientDisplayText(row, null)).toBe('Rent Collected')
  })

  it('falls through to display_label when clientDescription is empty string', () => {
    const row = makeRow({ display_label: 'Rent Collected' })
    expect(clientDisplayText(row, '')).toBe('Rent Collected')
  })

  it('falls through to display_label when clientDescription is whitespace only', () => {
    const row = makeRow({ display_label: 'Rent Collected' })
    expect(clientDisplayText(row, '   ')).toBe('Rent Collected')
  })
})

/* ─── Priority 2: display_label ─────────────────────────────────────────────── */

describe('clientDisplayText — Priority 2: display_label', () => {
  it('returns display_label when no clientDescription is provided', () => {
    const row = makeRow({ display_label: 'Rent Collected' })
    expect(clientDisplayText(row)).toBe('Rent Collected')
  })

  it('returns display_label when clientDescription is omitted (undefined)', () => {
    const row = makeRow({ display_label: 'Payment Received' })
    expect(clientDisplayText(row, undefined)).toBe('Payment Received')
  })

  it('trims leading/trailing whitespace from display_label', () => {
    const row = makeRow({ display_label: '  Platform Income  ' })
    expect(clientDisplayText(row)).toBe('Platform Income')
  })

  it('falls through to empty string when display_label is empty', () => {
    const row = makeRow({ display_label: '' })
    expect(clientDisplayText(row)).toBe('')
  })
})

/* ─── Priority 3: safe empty fallback ───────────────────────────────────────── */

describe('clientDisplayText — Priority 3: safe empty fallback', () => {
  it('returns empty string when display_label is empty and no clientDescription', () => {
    const row = makeRow({ display_label: '' })
    expect(clientDisplayText(row)).toBe('')
  })

  it('returns empty string when display_label is whitespace only', () => {
    const row = makeRow({ display_label: '   ' })
    expect(clientDisplayText(row)).toBe('')
  })

  it('returns empty string when both clientDescription and display_label are empty', () => {
    const row = makeRow({ display_label: '' })
    expect(clientDisplayText(row, '')).toBe('')
  })
})

/* ─── ADR-001: internal fields must NEVER reach client output ────────────────── */

describe('clientDisplayText — ADR-001: description / notes / k_note must never surface', () => {
  /**
   * The sentinel values set in makeRow() (__SENTINEL_*) ensure that any
   * accidental read of these fields would cause the assertion to fail with
   * the sentinel string rather than silently passing.
   */

  it('returns "" not description — when display_label empty and description is set', () => {
    const row = makeRow({
      display_label: '',
      description: 'CONFIDENTIAL: Yossi deposit instruction — do not share',
    })
    expect(clientDisplayText(row)).toBe('')
    expect(clientDisplayText(row)).not.toBe(row.description)
  })

  it('returns "" not notes — when display_label empty and notes is set', () => {
    const row = makeRow({
      display_label: '',
      notes: 'Internal: offsetting deposit per partner agreement',
    })
    expect(clientDisplayText(row)).toBe('')
    expect(clientDisplayText(row)).not.toBe(row.notes)
  })

  it('returns "" not k_note — when display_label empty and k_note is set', () => {
    const row = makeRow({
      display_label: '',
      k_note: 'k: adjust against renovation balance — internal only',
    })
    expect(clientDisplayText(row)).toBe('')
    expect(clientDisplayText(row)).not.toBe(row.k_note)
  })

  it('returns display_label not description — when both are present', () => {
    const row = makeRow({
      display_label: 'Rent Collected',
      description: 'CONFIDENTIAL: internal rent note with partner split',
    })
    expect(clientDisplayText(row)).toBe('Rent Collected')
    expect(clientDisplayText(row)).not.toBe(row.description)
  })

  it('clientDescription wins even when description contains text', () => {
    const row = makeRow({
      display_label: '',
      description: 'Internal note that must never appear in client output',
    })
    expect(clientDisplayText(row, 'Safe Override')).toBe('Safe Override')
    expect(clientDisplayText(row, 'Safe Override')).not.toBe(row.description)
  })

  it('sentinel values in default makeRow() would catch any accidental field reads', () => {
    // This test documents the sentinel approach: if clientDisplayText ever
    // accidentally read description/notes/k_note, the result would contain
    // '__SENTINEL_*' which fails the '' assertion above. This test makes
    // that assumption explicit and verifiable.
    const row = makeRow() // description='__SENTINEL_DESCRIPTION__', display_label=''
    expect(row.description).toBe('__SENTINEL_DESCRIPTION__')
    expect(row.notes).toBe('__SENTINEL_NOTES__')
    expect(row.k_note).toBe('__SENTINEL_K_NOTE__')
    // The function must return '' — not any sentinel value
    expect(clientDisplayText(row)).toBe('')
  })
})
