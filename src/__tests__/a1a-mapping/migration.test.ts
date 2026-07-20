/**
 * M2 A1a Static Migration Tests — v3 (corrected)
 *
 * These tests validate the SQL migration text WITHOUT requiring a database.
 * They verify structural correctness, naming conventions, safety constraints,
 * and the presence of all v2 corrections.
 *
 * Run: npx jest src/__tests__/a1a-mapping/migration.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../..',
  'supabase/migrations/20260720_a1a_safe_hostaway_mapping.sql'
);

let sql: string;

beforeAll(() => {
  sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
});

// === Structural Tests ===

describe('Migration structure', () => {
  test('begins with BEGIN and ends with COMMIT', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });

  test('contains all 4 sections', () => {
    expect(sql).toContain('FROZEN-LISTING PROTECTION');
    expect(sql).toContain('MIRANTA: Approve mapping 510557');
    expect(sql).toContain('ORIT: Identity chain + mapping for 534350');
    expect(sql).toContain('OREN: Verify existing mapping 495138');
  });

  test('has post-migration frozen check', () => {
    expect(sql).toContain('$frozen_check$');
    expect(sql).toContain('_frozen_before');
  });

  test('drops temp table at end', () => {
    expect(sql).toContain('DROP TABLE IF EXISTS _frozen_before');
  });
});

// === Frozen Listings ===

describe('Frozen listing protection', () => {
  const FROZEN = ['447075', '412145', '412147', '426237', '412148'];

  test.each(FROZEN)('frozen listing %s appears in fingerprint capture', (id) => {
    expect(sql).toContain(`'${id}'`);
  });

  test('captures at least 5 frozen rows', () => {
    expect(sql).toContain('v_count < 5');
  });

  test('detects duplicate frozen rows', () => {
    expect(sql).toContain('Duplicate frozen mapping rows detected');
  });

  test('4-way detection: new rows, hash mismatch, count change, duplicates', () => {
    expect(sql).toContain('new mapping row(s) inserted for frozen listings');
    expect(sql).toContain('frozen mapping row(s) were modified');
    expect(sql).toContain('Row count changed from');
    expect(sql).toContain('frozen external_id(s) have duplicate rows');
  });

  test('uses md5 hash for fingerprint comparison', () => {
    const md5Count = (sql.match(/md5\(/g) || []).length;
    expect(md5Count).toBeGreaterThanOrEqual(2); // before + after
  });
});

// === Miranta ===

describe('Miranta mapping (510557)', () => {
  test('targets Miranta Radisson', () => {
    expect(sql).toContain("'Miranta Radisson'");
  });

  test('sets approved fields: manual, exact, 1.00', () => {
    expect(sql).toContain("matched_by = 'manual'");
    expect(sql).toContain("confidence_label = 'exact'");
    expect(sql).toContain('match_confidence = 1.00');
  });

  test('preserves previous state in evidence', () => {
    expect(sql).toContain("'previous_status'");
    expect(sql).toContain("'previous_matched_by'");
    expect(sql).toContain("'previous_confidence_label'");
    expect(sql).toContain("'previous_match_confidence'");
    expect(sql).toContain("'previous_approved_by'");
    expect(sql).toContain("'previous_evidence'");
  });

  test('has ROW_COUNT guard on UPDATE', () => {
    // Find Miranta block and check it has ROW_COUNT
    const mirantaBlock = sql.split('$miranta$')[1] || '';
    expect(mirantaBlock).toContain('GET DIAGNOSTICS v_rows_updated = ROW_COUNT');
  });

  test('has post-Miranta verification block', () => {
    expect(sql).toContain('$miranta_verify$');
    expect(sql).toContain('MIRANTA VERIFY FAIL');
    expect(sql).toContain('MIRANTA VERIFY: PASS');
  });

  test('idempotent: handles already-approved state', () => {
    const mirantaBlock = sql.split('$miranta$')[1] || '';
    expect(mirantaBlock).toContain("v_current_status = 'approved'");
    expect(mirantaBlock).toContain('Already approved');
  });
});

// === Orit ===

describe('Orit identity chain (534350)', () => {
  test('uses correct company_id', () => {
    expect(sql).toContain("'10f6e9b3-c5b9-4d95-a318-48f20f89477f'");
  });

  test('targets Orit Rob Pingodes', () => {
    expect(sql).toContain("'Orit Rob Pingodes'");
  });

  test('targets listing name Central Avenue', () => {
    expect(sql).toContain("'Central Avenue'");
  });

  describe('Phase 1: Ambiguity checks', () => {
    test('checks contacts for unexpected Orit variants', () => {
      expect(sql).toContain("lower(name) LIKE '%orit%'");
      expect(sql).toContain("lower(name) NOT IN ('orit rob')");
    });

    test('checks parties for unexpected Orit variants', () => {
      expect(sql).toContain("lower(canonical_name) LIKE '%orit%'");
      expect(sql).toContain("lower(canonical_name) NOT IN ('orit rob')");
    });

    test('checks external_identities for unexpected Orit variants', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain('external identities linked to unexpected Orit variant');
    });

    test('checks contact_properties for unexpected Orit variants', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain('contact_properties linked to unexpected Orit variant');
    });
  });

  describe('Phase 2: Contact — v2 corrections', () => {
    test('[v2] creates with type Owner (uppercase)', () => {
      // The INSERT should use 'Owner' not 'owner'
      expect(sql).toContain("VALUES ('Orit Rob', 'Owner',");
    });

    test('[v2] does NOT create with type owner (lowercase)', () => {
      // Ensure no lowercase 'owner' in Orit contact creation
      expect(sql).not.toMatch(/VALUES\s*\(\s*'Orit Rob'\s*,\s*'owner'/);
    });

    test('[v2] verifies type on reuse', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain("v_contact_type != 'Owner'");
      expect(orit).toContain('Do not silently modify an existing contact type');
    });
  });

  describe('Phase 3: Party — v2 corrections', () => {
    test('[v2] verifies party_type on reuse', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain("v_p_type != 'client'");
    });

    test('[v2] verifies status on reuse', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain("v_p_status != 'active'");
    });

    test('[v2] verifies contact_ref on reuse', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain('v_p_contact_ref != v_contact_id');
    });

    test('[v3] NULL contact_ref raises EXCEPTION (fail-closed)', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain('v_p_contact_ref IS NULL');
      expect(orit).toContain('RAISE EXCEPTION');
      expect(orit).toContain('contact_ref=NULL');
      expect(orit).toContain('Do not repair an existing canonical identity');
    });

    test('[v3] does NOT auto-repair NULL contact_ref', () => {
      const orit = sql.split('$orit$')[1] || '';
      // After the NULL check, there should NOT be an UPDATE to fix it
      const nullBlock = orit.split('v_p_contact_ref IS NULL')[1]?.split('END IF')[0] || '';
      expect(nullBlock).not.toContain('SET contact_ref = v_contact_id');
    });

    test('creates new party with correct fields', () => {
      expect(sql).toContain("'Orit Rob', 'client', v_contact_id, 'active'");
    });
  });

  describe('Phase 4: External identity — v2 corrections', () => {
    test('[v2] verifies company_id on reuse', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain('v_ei_company != v_company_id');
    });

    test('[v2] verifies canonical_type on reuse', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain("v_ei_can_type != 'party'");
    });

    test('[v2] verifies canonical_id on reuse', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain('v_ei_can_id != v_party_id');
    });

    test('[v2] verifies mapping_status on reuse', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain("v_ei_map_status != 'approved'");
    });

    test('[v2] verifies confidence on reuse', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain('v_ei_confidence != 1.0');
    });
  });

  describe('Phase 5: Contact-properties — v2 corrections', () => {
    test('[v2] detects soft-deleted rows before insert', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain('is_deleted = true');
      expect(orit).toContain('soft-deleted contact_properties row');
    });

    test('[v2] separate soft-deleted check from active check', () => {
      const orit = sql.split('$orit$')[1] || '';
      // v_cp_deleted_count is separate from v_cp_count
      expect(orit).toContain('v_cp_deleted_count');
      expect(orit).toContain('v_cp_count');
    });

    test('checks for conflicting ownership by other contacts', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain('v_other_owner');
      expect(orit).toContain('Another contact already has an active relationship');
    });

    test('verifies role and status on reuse', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain("v_cp_role != 'Owner'");
      expect(orit).toContain("v_cp_status != 'confirmed'");
    });

    test('creates with Owner/confirmed', () => {
      expect(sql).toContain("'Owner', 'confirmed'");
    });
  });

  describe('Phase 6: Mapping — v2 corrections', () => {
    test('[v2] has ROW_COUNT guard on UPDATE', () => {
      // The $orit$ block should contain ROW_COUNT
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain('GET DIAGNOSTICS v_rows_updated = ROW_COUNT');
    });

    test('[v2] has post-Orit verification block', () => {
      expect(sql).toContain('$orit_verify$');
      expect(sql).toContain('ORIT VERIFY FAIL');
      expect(sql).toContain('ORIT VERIFY: PASS');
    });

    test('[v2] post-verify checks all 6 fields', () => {
      const verify = sql.split('$orit_verify$')[1] || '';
      expect(verify).toContain("v_rec.jj_property_name != 'Orit Rob Pingodes'");
      expect(verify).toContain("v_rec.status != 'approved'");
      expect(verify).toContain("v_rec.matched_by != 'manual'");
      expect(verify).toContain("v_rec.confidence_label != 'exact'");
      expect(verify).toContain('v_rec.match_confidence != 1.00');
    });

    test('[v2] documents that company_id is at identity layer', () => {
      const verify = sql.split('$orit_verify$')[1] || '';
      expect(verify).toContain('pms.property_mappings has no company_id column');
    });

    test('idempotent: handles already-approved state', () => {
      const orit = sql.split('$orit$')[1] || '';
      expect(orit).toContain("v_orit_status = 'approved'");
    });

    test('creates new mapping with all required fields', () => {
      expect(sql).toContain("'hostaway', '534350', 'Orit Rob Pingodes', 'approved'");
    });
  });
});

// === Orit dead code removed ===

describe('v2 correction 5: dead code removed', () => {
  test('does NOT contain unused v_property_uuid', () => {
    const orit = sql.split('$orit$')[1]?.split('$orit$')[0] || '';
    expect(orit).not.toContain('v_property_uuid');
  });

  test('does NOT contain the dead UUID value', () => {
    expect(sql).not.toContain('1185ccc9-7e20-49fc-bb9e-50d54392d51c');
  });
});

// === Oren (read-only) ===

describe('Oren verification (495138)', () => {
  test('read-only: no UPDATE or INSERT in oren block', () => {
    const blocks = sql.split('$oren$');
    const orenBlock = blocks.length >= 3 ? blocks[1] : '';
    expect(orenBlock).not.toContain('UPDATE');
    expect(orenBlock).not.toContain('INSERT');
  });

  test('verifies target is Oren Kitty', () => {
    expect(sql).toContain("'Oren Kitty'");
  });

  test('verifies status is approved', () => {
    const blocks = sql.split('$oren$');
    const orenBlock = blocks.length >= 3 ? blocks[1] : '';
    expect(orenBlock).toContain("v_rec.status != 'approved'");
  });

  test('[v2] verifies matched_by', () => {
    const blocks = sql.split('$oren$');
    const orenBlock = blocks.length >= 3 ? blocks[1] : '';
    expect(orenBlock).toContain("v_rec.matched_by != 'manual'");
  });

  test('[v2] verifies confidence_label', () => {
    const blocks = sql.split('$oren$');
    const orenBlock = blocks.length >= 3 ? blocks[1] : '';
    expect(orenBlock).toContain("v_rec.confidence_label != 'exact'");
  });

  test('[v2] verifies match_confidence', () => {
    const blocks = sql.split('$oren$');
    const orenBlock = blocks.length >= 3 ? blocks[1] : '';
    expect(orenBlock).toContain("v_rec.match_confidence != 1.00");
  });
});

// === Safety constraints ===

describe('Safety constraints', () => {
  test('no DELETE statements', () => {
    // Only rollback comments contain DELETE
    const nonComment = sql.split('\n')
      .filter(l => !l.trim().startsWith('--'))
      .join('\n');
    expect(nonComment).not.toMatch(/\bDELETE\b/i);
  });

  test('no CREATE FUNCTION', () => {
    expect(sql).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
  });

  test('no DROP SCHEMA', () => {
    expect(sql).not.toMatch(/DROP\s+SCHEMA/i);
  });

  test('no ALTER TABLE on public.transactions', () => {
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+(?:public\.)?transactions/i);
  });

  test('no INSERT into public.transactions', () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+(?:public\.)?transactions/i);
  });

  test('no UPDATE on public.transactions', () => {
    expect(sql).not.toMatch(/UPDATE\s+(?:public\.)?transactions/i);
  });

  test('no snapshot writes in executable SQL', () => {
    // Only check non-comment lines (comments document exclusions)
    const nonComment = sql.split('\n')
      .filter(l => !l.trim().startsWith('--'))
      .join('\n');
    expect(nonComment).not.toContain('financial_snapshot');
    expect(nonComment).not.toContain('upsert_financial_snapshot');
  });

  test('no function creation', () => {
    expect(sql).not.toMatch(/CREATE\s+FUNCTION/i);
  });

  test('contains rollback documentation', () => {
    expect(sql).toContain('ROLLBACK SQL');
    expect(sql).toContain('DO NOT EXECUTE');
  });
});

// === Naming conventions ===

describe('Naming conventions', () => {
  test('migration marker consistent', () => {
    expect(sql).toContain("'M2-A1a-safe-hostaway-mapping'");
    const markerCount = (sql.match(/M2-A1a-safe-hostaway-mapping/g) || []).length;
    expect(markerCount).toBeGreaterThanOrEqual(4); // Miranta, Orit mapping, Orit ext-id, rollback
  });

  test('approved_by consistent', () => {
    expect(sql).toContain('M2-A1a migration (Yossi directive 2026-07-20)');
  });

  test('provider is hostaway throughout', () => {
    const providerMatches = sql.match(/provider\s*=\s*'(\w+)'/g) || [];
    for (const m of providerMatches) {
      expect(m).toContain('hostaway');
    }
  });
});

// === v3 corrections ===

describe('v3 corrections', () => {
  test('[v3] Orit block declares v_orit_target (not v_current_target)', () => {
    const orit = sql.split('$orit$')[1] || '';
    expect(orit).toContain('v_orit_target');
    // v_current_target should NOT appear in Orit block (it belongs to Miranta)
    expect(orit).not.toContain('v_current_target');
  });

  test('[v3] Orit uses v_orit_target for target validation', () => {
    const orit = sql.split('$orit$')[1] || '';
    expect(orit).toMatch(/v_orit_target\s*!=\s*'Orit Rob Pingodes'/);
  });

  test('[v3] v_orit_target is DECLARED in Orit DECLARE block', () => {
    const orit = sql.split('$orit$')[1] || '';
    // Between DECLARE and BEGIN, v_orit_target should be declared
    const declareBlock = orit.split('BEGIN')[0] || '';
    expect(declareBlock).toContain('v_orit_target');
  });

  test('[v3] Orit SELECT INTO uses v_orit_target', () => {
    const orit = sql.split('$orit$')[1] || '';
    expect(orit).toMatch(/INTO\s+.*v_orit_target/s);
  });

  test('[v3] header documents v3 corrections', () => {
    const header = sql.substring(0, 3000);
    expect(header).toContain('v_orit_target');
    expect(header).toContain('contact_ref=NULL');
  });
});

// === v2 correction summary ===

describe('v2 corrections summary', () => {
  test('header documents v2 corrections', () => {
    const header = sql.substring(0, 3000);
    expect(header).toContain('CORRECTIONS IN v2');
    expect(header).toContain('Orit contact type');
    expect(header).toContain('Orit party');
    expect(header).toContain('Orit external identity');
    expect(header).toContain('Soft-deleted contact_properties');
    expect(header).toContain('Removed dead v_property_uuid');
    expect(header).toContain('Orit mapping postcondition');
    expect(header).toContain('ROW_COUNT');
  });
});
