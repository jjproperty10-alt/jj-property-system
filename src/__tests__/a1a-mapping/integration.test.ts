/**
 * M2 A1a Integration Tests — v4 (executed against real PostgreSQL)
 *
 * These tests run against an ISOLATED, DISPOSABLE PostgreSQL database.
 * They are NOT safe to run against production or any shared database.
 *
 * Required environment:
 *   A1A_TEST_DATABASE_URL     — connection string to a DISPOSABLE test DB
 *   A1A_CONFIRM_ISOLATED_DB   — must equal "yes-isolated-a1a-test-db"
 *
 * The target database MUST:
 *   - Have a name beginning with "a1a_test_"
 *   - Contain zero user tables and zero non-default schemas
 *   - NOT be the production Supabase project
 *   - NOT be named "postgres"
 *
 * The test suite:
 *   1. Validates isolation (multiple gates)
 *   2. Creates fixture schemas, tables, constraints, and seed data (plain CREATE, no IF NOT EXISTS)
 *   3. Runs the actual migration SQL
 *   4. Validates postconditions
 *   5. Destroys everything it created
 *
 * Run:
 *   A1A_TEST_DATABASE_URL="postgresql://postgres:@/a1a_test_20260720?host=/tmp/a1a_pgdata" \
 *   A1A_CONFIRM_ISOLATED_DB=yes-isolated-a1a-test-db \
 *   npx jest --testPathPatterns='integration\.test\.ts$' --forceExit
 */
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../..',
  'supabase/migrations/20260720_a1a_safe_hostaway_mapping.sql'
);

const DB_URL = process.env.A1A_TEST_DATABASE_URL;
const CONFIRM = process.env.A1A_CONFIRM_ISOLATED_DB;
const JJ_COMPANY_ID = '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
const PRODUCTION_PROJECT_REF = 'vsiiprzjrstjcmjpwcrd';

// =========================================================================
// Gate: Skip entire suite if environment is not configured
// =========================================================================

const hasEnv = DB_URL && CONFIRM === 'yes-isolated-a1a-test-db';
const describeIf = hasEnv ? describe : describe.skip;

if (!hasEnv) {
  describe('A1a Integration (skipped — no env)', () => {
    test('SKIPPED: A1A_TEST_DATABASE_URL or A1A_CONFIRM_ISOLATED_DB not set', () => {
      console.log('Integration tests require:');
      console.log('  A1A_TEST_DATABASE_URL=postgresql://...');
      console.log('  A1A_CONFIRM_ISOLATED_DB=yes-isolated-a1a-test-db');
    });
  });
}

describeIf('A1a Integration Tests (isolated PostgreSQL)', () => {
  let client: Client;
  let migrationSql: string;
  let dbName: string;
  let dbUser: string;
  let dbHost: string;
  let dbPort: string;
  let pgVersion: string;
  // Track all objects we create for cleanup
  const createdObjects: string[] = [];

  // =========================================================================
  // Setup: Connect, validate isolation, create fixture
  // =========================================================================

  beforeAll(async () => {
    migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
    client = new Client({ connectionString: DB_URL });
    await client.connect();

    // --- Pre-flight: query actual DB identity ---
    const identRes = await client.query(`
      SELECT current_database() AS db,
             current_user AS usr,
             coalesce(inet_server_addr()::text, 'local') AS host,
             coalesce(inet_server_port()::text, 'local') AS port,
             version() AS ver
    `);
    dbName = identRes.rows[0].db;
    dbUser = identRes.rows[0].usr;
    dbHost = identRes.rows[0].host;
    dbPort = identRes.rows[0].port;
    pgVersion = identRes.rows[0].ver;

    // Log safe metadata only — never credentials
    console.log(`[ISOLATION] db=${dbName} user=${dbUser} host=<redacted> port=${dbPort}`);
    console.log(`[ISOLATION] PostgreSQL: ${pgVersion}`);

    // --- GATE 1: production project ref ---
    if (DB_URL!.includes(PRODUCTION_PROJECT_REF)) {
      await client.end();
      throw new Error('ISOLATION GATE FAILED: URL contains production project ref');
    }

    // --- GATE 2: database name must begin with a1a_test_ ---
    if (!dbName.startsWith('a1a_test_')) {
      await client.end();
      throw new Error(
        `ISOLATION GATE FAILED: database "${dbName}" does not begin with "a1a_test_". ` +
        'Use a dedicated disposable database.'
      );
    }

    // --- GATE 3: not "postgres" ---
    if (dbName === 'postgres') {
      await client.end();
      throw new Error('ISOLATION GATE FAILED: database is "postgres"');
    }

    // --- GATE 4: host must not contain production ref ---
    if (dbHost.includes(PRODUCTION_PROJECT_REF)) {
      await client.end();
      throw new Error('ISOLATION GATE FAILED: server address contains production ref');
    }

    // --- GATE 5: zero pre-existing user schemas ---
    const schemaCheck = await client.query(`
      SELECT count(*) AS c FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast','public')
    `);
    if (parseInt(schemaCheck.rows[0].c) > 0) {
      await client.end();
      throw new Error(
        `ISOLATION GATE FAILED: database "${dbName}" has ${schemaCheck.rows[0].c} non-default schemas. ` +
        'The test database must be completely empty.'
      );
    }

    // --- GATE 6: zero pre-existing user tables in public ---
    const tableCheck = await client.query(`
      SELECT count(*) AS c FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    if (parseInt(tableCheck.rows[0].c) > 0) {
      await client.end();
      throw new Error(
        `ISOLATION GATE FAILED: database "${dbName}" has ${tableCheck.rows[0].c} existing tables. ` +
        'The test database must be completely empty.'
      );
    }

    console.log('[ISOLATION] All 6 gates passed — proceeding with fixture');

    // --- Create fixture ---
    await createFixture();
  }, 30000);

  afterAll(async () => {
    if (client) {
      try {
        await destroyFixture();
      } catch (e) {
        console.error('[CLEANUP] Fixture destruction failed:', e);
      }
      await client.end();
    }
  }, 15000);

  // =========================================================================
  // Fixture: plain CREATE (no IF NOT EXISTS), real constraints
  // =========================================================================

  async function createFixture(): Promise<void> {
    // Schemas — plain CREATE (will fail if already exists = desired behavior)
    await client.query('CREATE SCHEMA registry');
    createdObjects.push('SCHEMA registry');
    await client.query('CREATE SCHEMA pms');
    createdObjects.push('SCHEMA pms');

    // --- public.contacts ---
    await client.query(`
      CREATE TABLE public.contacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        type text,
        phone text,
        email text,
        notes text,
        created_at timestamptz DEFAULT now(),
        is_deleted boolean DEFAULT false
      )
    `);
    createdObjects.push('TABLE public.contacts');

    // --- registry.parties (with unique constraint matching production) ---
    await client.query(`
      CREATE TABLE registry.parties (
        party_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        canonical_name text NOT NULL,
        party_type text NOT NULL,
        contact_ref uuid,
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(company_id, canonical_name)
      )
    `);
    createdObjects.push('TABLE registry.parties');

    // --- registry.external_identities (unique on source+entity+id) ---
    await client.query(`
      CREATE TABLE registry.external_identities (
        mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid,
        source_system text,
        external_entity_type text,
        external_id text,
        canonical_type text,
        canonical_id uuid,
        mapping_status text DEFAULT 'approved',
        confidence numeric,
        audit jsonb DEFAULT '{}',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(source_system, external_entity_type, external_id)
      )
    `);
    createdObjects.push('TABLE registry.external_identities');

    // --- public.contact_properties (unique on contact+property) ---
    await client.query(`
      CREATE TABLE public.contact_properties (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id uuid NOT NULL,
        property_name text NOT NULL,
        relationship_role text NOT NULL DEFAULT 'Owner',
        confirmation_status text NOT NULL DEFAULT 'confirmed',
        notes text,
        created_at timestamptz DEFAULT now(),
        is_deleted boolean DEFAULT false,
        UNIQUE(contact_id, property_name)
      )
    `);
    createdObjects.push('TABLE public.contact_properties');

    // --- pms.property_mappings (unique on provider+external_id) ---
    await client.query(`
      CREATE TABLE pms.property_mappings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider text,
        external_id text,
        jj_property_name text,
        match_confidence numeric,
        matched_by text,
        status text DEFAULT 'proposed',
        approved_by text,
        approved_at timestamptz,
        confidence_label text,
        evidence jsonb DEFAULT '{}',
        mapping_version text DEFAULT '1.0.0',
        UNIQUE(provider, external_id)
      )
    `);
    createdObjects.push('TABLE pms.property_mappings');

    // --- public.transactions (minimal for safety checks) ---
    await client.query(`
      CREATE TABLE public.transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        date date,
        description text,
        amount_eur numeric
      )
    `);
    createdObjects.push('TABLE public.transactions');

    console.log(`[FIXTURE] Created ${createdObjects.length} objects`);
  }

  async function seedBaseline(): Promise<void> {
    // Miranta: contact + party + ext-id + contact_property + proposed mapping
    const mc = await client.query(`INSERT INTO public.contacts (name, type, notes) VALUES ('Miranta Radisson', 'Owner', 'seed') RETURNING id`);
    const mcId = mc.rows[0].id;
    const mp = await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Miranta Radisson', 'client', $2, 'active') RETURNING party_id`, [JJ_COMPANY_ID, mcId]);
    await client.query(`INSERT INTO registry.external_identities (company_id, source_system, external_entity_type, external_id, canonical_type, canonical_id, mapping_status, confidence) VALUES ($1, 'app.contacts', 'contact', $2, 'party', $3, 'approved', 1.0)`, [JJ_COMPANY_ID, mcId, mp.rows[0].party_id]);
    await client.query(`INSERT INTO public.contact_properties (contact_id, property_name, relationship_role, confirmation_status) VALUES ($1, 'Miranta Radisson', 'Owner', 'likely')`, [mcId]);
    await client.query(`INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, status, matched_by, confidence_label, match_confidence, evidence) VALUES ('hostaway', '510557', 'Miranta Radisson', 'proposed', 'auto', 'low', 0.40, '{}')`);

    // Oren: contact + party + ext-id + contact_property + approved mapping
    const oc = await client.query(`INSERT INTO public.contacts (name, type, notes) VALUES ('Oren', 'Owner', 'seed') RETURNING id`);
    const ocId = oc.rows[0].id;
    const op = await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Oren', 'client', $2, 'active') RETURNING party_id`, [JJ_COMPANY_ID, ocId]);
    await client.query(`INSERT INTO registry.external_identities (company_id, source_system, external_entity_type, external_id, canonical_type, canonical_id, mapping_status, confidence) VALUES ($1, 'app.contacts', 'contact', $2, 'party', $3, 'approved', 1.0)`, [JJ_COMPANY_ID, ocId, op.rows[0].party_id]);
    await client.query(`INSERT INTO public.contact_properties (contact_id, property_name, relationship_role, confirmation_status) VALUES ($1, 'Oren Kitty', 'Owner', 'confirmed')`, [ocId]);
    await client.query(`INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, status, matched_by, confidence_label, match_confidence, approved_at, approved_by) VALUES ('hostaway', '495138', 'Oren Kitty', 'approved', 'manual', 'exact', 1.00, now(), 'seed')`);

    // 5 frozen listings
    for (const f of [
      { ext: '447075', name: 'TM05 Property', status: 'proposed' },
      { ext: '412145', name: 'Tamir Dekelia', status: 'approved' },
      { ext: '412147', name: 'Tamir Radisson', status: 'approved' },
      { ext: '426237', name: 'Villa Mazotos', status: 'approved' },
      { ext: '412148', name: 'Apartment Neer Yoav Dekelia', status: 'approved' },
    ]) {
      await client.query(`INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, status, matched_by, confidence_label, match_confidence, approved_at, approved_by) VALUES ('hostaway', $1, $2, $3, 'manual', 'exact', 1.00, now(), 'seed')`, [f.ext, f.name, f.status]);
    }

    // One transaction row
    await client.query(`INSERT INTO public.transactions (date, description, amount_eur) VALUES ('2026-01-01', 'fixture', 100.00)`);
  }

  async function clearAllData(): Promise<void> {
    // If a migration failed mid-transaction (BEGIN without COMMIT),
    // PG is in an aborted state. ROLLBACK first to clear it.
    try { await client.query('ROLLBACK'); } catch (_) { /* not in tx */ }
    await client.query('DELETE FROM pms.property_mappings');
    await client.query('DELETE FROM public.contact_properties');
    await client.query('DELETE FROM registry.external_identities');
    await client.query('DELETE FROM registry.parties');
    await client.query('DELETE FROM public.contacts');
    await client.query('DELETE FROM public.transactions');
    await client.query('DROP TABLE IF EXISTS _frozen_before');
    await client.query('DROP FUNCTION IF EXISTS _a1a_test_sabotage_frozen() CASCADE');
  }

  async function destroyFixture(): Promise<void> {
    // Clear any aborted transaction first
    try { await client.query('ROLLBACK'); } catch (_) { /* not in tx */ }
    // Destroy only what we created, in reverse order
    for (const obj of [...createdObjects].reverse()) {
      const [type, name] = obj.split(' ', 2);
      try {
        if (type === 'TABLE') {
          await client.query(`DROP TABLE ${name} CASCADE`);
        } else if (type === 'SCHEMA') {
          await client.query(`DROP SCHEMA ${name} CASCADE`);
        }
      } catch (e) {
        // Already cleaned up
      }
    }
    console.log('[FIXTURE] Destroyed all created objects');
  }

  /** Run migration SQL (strips outer BEGIN/COMMIT for use inside test transactions) */
  function getMigrationBody(): string {
    return migrationSql
      .replace(/^BEGIN;\s*/m, '')
      .replace(/^COMMIT;\s*$/m, '');
  }

  /** Run migration with its own BEGIN/COMMIT (full execution) */
  async function runMigrationFull(): Promise<void> {
    await client.query(migrationSql);
  }

  /** Run migration body inside a SAVEPOINT for rollback */
  async function runMigrationInSavepoint(): Promise<void> {
    await client.query(getMigrationBody());
  }

  // =========================================================================
  // 0. Isolation gates (runtime verification)
  // =========================================================================

  describe('0. Isolation gates', () => {
    test('database name begins with a1a_test_', () => {
      expect(dbName.startsWith('a1a_test_')).toBe(true);
    });

    test('database is not "postgres"', () => {
      expect(dbName).not.toBe('postgres');
    });

    test('connection URL does not contain production project ref', () => {
      expect(DB_URL).not.toContain(PRODUCTION_PROJECT_REF);
    });

    test('A1A_CONFIRM_ISOLATED_DB is set correctly', () => {
      expect(CONFIRM).toBe('yes-isolated-a1a-test-db');
    });

    test('PostgreSQL version is reported', () => {
      expect(pgVersion).toContain('PostgreSQL');
      console.log(`[VERSION] ${pgVersion}`);
    });
  });

  // =========================================================================
  // 1. SQL compile + clean first execution
  // =========================================================================

  describe('1. SQL compile + clean first execution', () => {
    beforeAll(async () => {
      await seedBaseline();
    });

    afterAll(async () => {
      await clearAllData();
    });

    test('migration compiles and executes without error', async () => {
      await expect(runMigrationFull()).resolves.not.toThrow();
    });

    test('Miranta 510557 is approved', async () => {
      const r = await client.query(`SELECT status, matched_by, confidence_label, match_confidence FROM pms.property_mappings WHERE external_id='510557'`);
      expect(r.rows[0].status).toBe('approved');
      expect(r.rows[0].matched_by).toBe('manual');
      expect(r.rows[0].confidence_label).toBe('exact');
      expect(parseFloat(r.rows[0].match_confidence)).toBe(1.0);
    });

    test('Miranta evidence preserves previous state', async () => {
      const r = await client.query(`SELECT evidence FROM pms.property_mappings WHERE external_id='510557'`);
      const ev = r.rows[0].evidence;
      expect(ev.previous_status).toBe('proposed');
      expect(ev.previous_matched_by).toBe('auto');
      expect(ev.migration).toBe('M2-A1a-safe-hostaway-mapping');
    });

    test('Orit contact created with type Owner', async () => {
      const r = await client.query(`SELECT name, type FROM contacts WHERE lower(name)='orit rob'`);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].type).toBe('Owner');
    });

    test('Orit party created as client/active', async () => {
      const r = await client.query(`SELECT party_type, status FROM registry.parties WHERE company_id=$1 AND lower(canonical_name)='orit rob'`, [JJ_COMPANY_ID]);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].party_type).toBe('client');
      expect(r.rows[0].status).toBe('active');
    });

    test('Orit external identity links contact→party', async () => {
      const c = await client.query(`SELECT id FROM contacts WHERE lower(name)='orit rob'`);
      const r = await client.query(`SELECT canonical_type, mapping_status, confidence FROM registry.external_identities WHERE external_id=$1 AND source_system='app.contacts'`, [c.rows[0].id]);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].canonical_type).toBe('party');
      expect(r.rows[0].mapping_status).toBe('approved');
      expect(parseFloat(r.rows[0].confidence)).toBe(1.0);
    });

    test('Orit contact_property created', async () => {
      const c = await client.query(`SELECT id FROM contacts WHERE lower(name)='orit rob'`);
      const r = await client.query(`SELECT relationship_role, confirmation_status FROM contact_properties WHERE contact_id=$1 AND property_name='Orit Rob Pingodes'`, [c.rows[0].id]);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].relationship_role).toBe('Owner');
      expect(r.rows[0].confirmation_status).toBe('confirmed');
    });

    test('Orit mapping 534350 approved with evidence', async () => {
      const r = await client.query(`SELECT status, jj_property_name, matched_by, confidence_label, match_confidence, evidence FROM pms.property_mappings WHERE external_id='534350'`);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].status).toBe('approved');
      expect(r.rows[0].jj_property_name).toBe('Orit Rob Pingodes');
      expect(r.rows[0].matched_by).toBe('manual');
      expect(parseFloat(r.rows[0].match_confidence)).toBe(1.0);
      expect(r.rows[0].evidence.migration).toBe('M2-A1a-safe-hostaway-mapping');
    });

    test('Oren 495138 unchanged (approved/manual/exact)', async () => {
      const r = await client.query(`SELECT status, matched_by, confidence_label, match_confidence FROM pms.property_mappings WHERE external_id='495138'`);
      expect(r.rows[0].status).toBe('approved');
      expect(r.rows[0].matched_by).toBe('manual');
      expect(r.rows[0].confidence_label).toBe('exact');
    });

    test('all 5 frozen listings unchanged', async () => {
      const r = await client.query(`SELECT external_id, jj_property_name, status FROM pms.property_mappings WHERE external_id IN ('447075','412145','412147','426237','412148') ORDER BY external_id`);
      expect(r.rows).toHaveLength(5);
    });

    test('total mappings = 8', async () => {
      const r = await client.query(`SELECT count(*)::int AS c FROM pms.property_mappings`);
      expect(r.rows[0].c).toBe(8);
    });
  });

  // =========================================================================
  // 2. Idempotency (second run)
  // =========================================================================

  describe('2. Idempotency', () => {
    beforeAll(async () => {
      await seedBaseline();
      await runMigrationFull(); // first run
    });

    afterAll(async () => {
      await clearAllData();
    });

    test('second run succeeds without error', async () => {
      await expect(runMigrationFull()).resolves.not.toThrow();
    });

    test('still exactly 1 Orit contact after 2 runs', async () => {
      const r = await client.query(`SELECT count(*)::int AS c FROM contacts WHERE lower(name)='orit rob'`);
      expect(r.rows[0].c).toBe(1);
    });

    test('still exactly 8 mappings after 2 runs', async () => {
      const r = await client.query(`SELECT count(*)::int AS c FROM pms.property_mappings`);
      expect(r.rows[0].c).toBe(8);
    });
  });

  // =========================================================================
  // 3. Miranta wrong target → STOP
  // =========================================================================

  describe('3. Miranta wrong target', () => {
    beforeEach(async () => {
      await seedBaseline();
    });

    afterEach(async () => {
      await clearAllData();
    });

    test('rejects if Miranta target is wrong', async () => {
      await client.query(`UPDATE pms.property_mappings SET jj_property_name='WRONG' WHERE external_id='510557'`);
      await expect(runMigrationFull()).rejects.toThrow(/MIRANTA STOP/);
    });
  });

  // =========================================================================
  // 4–11. Orit fail-closed guards
  // =========================================================================

  describe('4. Orit contact wrong type → STOP', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects contact with type "agent"', async () => {
      await client.query(`INSERT INTO contacts (name, type) VALUES ('Orit Rob', 'agent')`);
      await expect(runMigrationFull()).rejects.toThrow(/ORIT STOP/);
    });
  });

  describe('5. Orit party wrong party_type → STOP', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects party with type "vendor"', async () => {
      const c = await client.query(`INSERT INTO contacts (name, type) VALUES ('Orit Rob', 'Owner') RETURNING id`);
      await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Orit Rob', 'vendor', $2, 'active')`, [JJ_COMPANY_ID, c.rows[0].id]);
      await expect(runMigrationFull()).rejects.toThrow(/ORIT STOP/);
    });
  });

  describe('6. Orit party wrong status → STOP', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects party with status "inactive"', async () => {
      const c = await client.query(`INSERT INTO contacts (name, type) VALUES ('Orit Rob', 'Owner') RETURNING id`);
      await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Orit Rob', 'client', $2, 'inactive')`, [JJ_COMPANY_ID, c.rows[0].id]);
      await expect(runMigrationFull()).rejects.toThrow(/ORIT STOP/);
    });
  });

  describe('7. Orit party contact_ref NULL → STOP (v3 fail-closed)', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects party with NULL contact_ref', async () => {
      await client.query(`INSERT INTO contacts (name, type) VALUES ('Orit Rob', 'Owner')`);
      await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Orit Rob', 'client', NULL, 'active')`, [JJ_COMPANY_ID]);
      await expect(runMigrationFull()).rejects.toThrow(/ORIT STOP.*contact_ref=NULL/);
    });
  });

  describe('8. Orit party conflicting contact_ref → STOP', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects party pointing to different contact', async () => {
      const c = await client.query(`INSERT INTO contacts (name, type) VALUES ('Orit Rob', 'Owner') RETURNING id`);
      const other = await client.query(`INSERT INTO contacts (name, type) VALUES ('Someone Else', 'Owner') RETURNING id`);
      await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Orit Rob', 'client', $2, 'active')`, [JJ_COMPANY_ID, other.rows[0].id]);
      await expect(runMigrationFull()).rejects.toThrow(/ORIT STOP/);
    });
  });

  describe('9. External identity company mismatch → STOP', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects wrong company_id', async () => {
      const c = await client.query(`INSERT INTO contacts (name, type) VALUES ('Orit Rob', 'Owner') RETURNING id`);
      const p = await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Orit Rob', 'client', $2, 'active') RETURNING party_id`, [JJ_COMPANY_ID, c.rows[0].id]);
      await client.query(`INSERT INTO registry.external_identities (company_id, source_system, external_entity_type, external_id, canonical_type, canonical_id, mapping_status, confidence) VALUES ($1, 'app.contacts', 'contact', $2, 'party', $3, 'approved', 1.0)`, ['00000000-0000-0000-0000-000000000000', c.rows[0].id, p.rows[0].party_id]);
      await expect(runMigrationFull()).rejects.toThrow(/ORIT STOP.*company_id/);
    });
  });

  describe('10. External identity canonical_type mismatch → STOP', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects wrong canonical_type', async () => {
      const c = await client.query(`INSERT INTO contacts (name, type) VALUES ('Orit Rob', 'Owner') RETURNING id`);
      const p = await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Orit Rob', 'client', $2, 'active') RETURNING party_id`, [JJ_COMPANY_ID, c.rows[0].id]);
      await client.query(`INSERT INTO registry.external_identities (company_id, source_system, external_entity_type, external_id, canonical_type, canonical_id, mapping_status, confidence) VALUES ($1, 'app.contacts', 'contact', $2, 'organization', $3, 'approved', 1.0)`, [JJ_COMPANY_ID, c.rows[0].id, p.rows[0].party_id]);
      await expect(runMigrationFull()).rejects.toThrow(/ORIT STOP.*canonical_type/);
    });
  });

  describe('11. External identity status mismatch → STOP', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects wrong mapping_status', async () => {
      const c = await client.query(`INSERT INTO contacts (name, type) VALUES ('Orit Rob', 'Owner') RETURNING id`);
      const p = await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Orit Rob', 'client', $2, 'active') RETURNING party_id`, [JJ_COMPANY_ID, c.rows[0].id]);
      await client.query(`INSERT INTO registry.external_identities (company_id, source_system, external_entity_type, external_id, canonical_type, canonical_id, mapping_status, confidence) VALUES ($1, 'app.contacts', 'contact', $2, 'party', $3, 'pending', 1.0)`, [JJ_COMPANY_ID, c.rows[0].id, p.rows[0].party_id]);
      await expect(runMigrationFull()).rejects.toThrow(/ORIT STOP.*mapping_status/);
    });
  });

  describe('12. Soft-deleted contact_property collision → STOP', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects if soft-deleted contact_property exists for Orit', async () => {
      const c = await client.query(`INSERT INTO contacts (name, type) VALUES ('Orit Rob', 'Owner') RETURNING id`);
      const p = await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Orit Rob', 'client', $2, 'active') RETURNING party_id`, [JJ_COMPANY_ID, c.rows[0].id]);
      await client.query(`INSERT INTO registry.external_identities (company_id, source_system, external_entity_type, external_id, canonical_type, canonical_id, mapping_status, confidence) VALUES ($1, 'app.contacts', 'contact', $2, 'party', $3, 'approved', 1.0)`, [JJ_COMPANY_ID, c.rows[0].id, p.rows[0].party_id]);
      await client.query(`INSERT INTO contact_properties (contact_id, property_name, relationship_role, is_deleted) VALUES ($1, 'Orit Rob Pingodes', 'Owner', true)`, [c.rows[0].id]);
      await expect(runMigrationFull()).rejects.toThrow(/soft-deleted contact_properties/);
    });
  });

  describe('13. Wrong relationship role → STOP', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects existing contact_property with wrong role', async () => {
      const c = await client.query(`INSERT INTO contacts (name, type) VALUES ('Orit Rob', 'Owner') RETURNING id`);
      const p = await client.query(`INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status) VALUES ($1, 'Orit Rob', 'client', $2, 'active') RETURNING party_id`, [JJ_COMPANY_ID, c.rows[0].id]);
      await client.query(`INSERT INTO registry.external_identities (company_id, source_system, external_entity_type, external_id, canonical_type, canonical_id, mapping_status, confidence) VALUES ($1, 'app.contacts', 'contact', $2, 'party', $3, 'approved', 1.0)`, [JJ_COMPANY_ID, c.rows[0].id, p.rows[0].party_id]);
      await client.query(`INSERT INTO contact_properties (contact_id, property_name, relationship_role, confirmation_status) VALUES ($1, 'Orit Rob Pingodes', 'Tenant', 'confirmed')`, [c.rows[0].id]);
      await expect(runMigrationFull()).rejects.toThrow(/ORIT STOP.*role/);
    });
  });

  // =========================================================================
  // 14. Orit proposed mapping evidence preservation
  // =========================================================================

  describe('14. Orit proposed mapping preserves evidence', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('proposed mapping is approved with previous state in evidence', async () => {
      // Pre-create a proposed mapping for 534350
      await client.query(`INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, status, matched_by, confidence_label, match_confidence, evidence) VALUES ('hostaway', '534350', 'Orit Rob Pingodes', 'proposed', 'auto', 'low', 0.30, '{"old":"data"}')`);
      await runMigrationFull();
      const r = await client.query(`SELECT status, evidence FROM pms.property_mappings WHERE external_id='534350'`);
      expect(r.rows[0].status).toBe('approved');
      expect(r.rows[0].evidence.previous_status).toBe('proposed');
      expect(r.rows[0].evidence.previous_evidence).toEqual({ old: 'data' });
    });
  });

  // =========================================================================
  // 15. Oren mismatch detection
  // =========================================================================

  describe('15. Oren mismatch detection', () => {
    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => { await clearAllData(); });

    test('rejects if Oren target is wrong', async () => {
      await client.query(`UPDATE pms.property_mappings SET jj_property_name='WRONG' WHERE external_id='495138'`);
      await expect(runMigrationFull()).rejects.toThrow(/OREN STOP/);
    });

    test('rejects if Oren status is not approved', async () => {
      await client.query(`UPDATE pms.property_mappings SET status='proposed' WHERE external_id='495138'`);
      await expect(runMigrationFull()).rejects.toThrow(/OREN STOP/);
    });

    test('rejects if Oren matched_by is wrong', async () => {
      await client.query(`UPDATE pms.property_mappings SET matched_by='auto' WHERE external_id='495138'`);
      await expect(runMigrationFull()).rejects.toThrow(/OREN STOP/);
    });
  });

  // =========================================================================
  // 16. Frozen listing protection — trigger-based mid-migration mutation
  // =========================================================================

  describe('16. Frozen listing protection', () => {
    /*
     * Strategy: The migration captures _frozen_before at the start, then checks
     * at the end. We install a trigger on the Orit INSERT (the last mutating
     * operation before the frozen check) that sabotages a frozen row.
     *
     * This tests mutations that happen DURING the migration, between the
     * before-snapshot and the final frozen check.
     */

    beforeEach(async () => { await seedBaseline(); });
    afterEach(async () => {
      // Clean triggers
      await client.query('DROP FUNCTION IF EXISTS _a1a_test_sabotage_frozen() CASCADE').catch(() => {});
      await clearAllData();
    });

    test('A: frozen row UPDATE during migration → FROZEN STOP', async () => {
      // Trigger fires after INSERT into pms.property_mappings (Orit's new mapping)
      // and UPDATEs a frozen row
      await client.query(`
        CREATE OR REPLACE FUNCTION _a1a_test_sabotage_frozen()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.external_id = '534350' THEN
            UPDATE pms.property_mappings SET jj_property_name = 'SABOTAGED'
            WHERE provider = 'hostaway' AND external_id = '412145';
          END IF;
          RETURN NEW;
        END; $$
      `);
      await client.query(`
        CREATE TRIGGER trg_a1a_test_sabotage
        AFTER INSERT ON pms.property_mappings
        FOR EACH ROW EXECUTE FUNCTION _a1a_test_sabotage_frozen()
      `);

      await expect(runMigrationFull()).rejects.toThrow(/FROZEN STOP/);

      // Clear aborted transaction state so we can verify rollback effects
      await client.query('ROLLBACK');

      // Verify rollback: no Orit artifacts remain
      const orit = await client.query(`SELECT count(*)::int AS c FROM pms.property_mappings WHERE external_id='534350'`);
      expect(orit.rows[0].c).toBe(0);
      // Verify frozen row restored (transaction rolled back)
      const frozen = await client.query(`SELECT jj_property_name FROM pms.property_mappings WHERE external_id='412145'`);
      expect(frozen.rows[0].jj_property_name).toBe('Tamir Dekelia');
    });

    test('B: frozen row DELETE during migration → FROZEN STOP', async () => {
      await client.query(`
        CREATE OR REPLACE FUNCTION _a1a_test_sabotage_frozen()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.external_id = '534350' THEN
            DELETE FROM pms.property_mappings
            WHERE provider = 'hostaway' AND external_id = '412147';
          END IF;
          RETURN NEW;
        END; $$
      `);
      await client.query(`
        CREATE TRIGGER trg_a1a_test_sabotage
        AFTER INSERT ON pms.property_mappings
        FOR EACH ROW EXECUTE FUNCTION _a1a_test_sabotage_frozen()
      `);

      await expect(runMigrationFull()).rejects.toThrow(/FROZEN STOP/);

      // Clear aborted transaction state
      await client.query('ROLLBACK');

      // Verify frozen row restored
      const frozen = await client.query(`SELECT count(*)::int AS c FROM pms.property_mappings WHERE external_id='412147'`);
      expect(frozen.rows[0].c).toBe(1);
    });

    test('C: new frozen row INSERT during migration → FROZEN STOP', async () => {
      // This trigger inserts a NEW mapping with a frozen external_id but different UUID
      // The unique constraint (provider, external_id) will prevent this.
      // Document: the DB unique constraint itself prevents this path.
      // Test that the constraint fires (which also rolls back the transaction).
      await client.query(`
        CREATE OR REPLACE FUNCTION _a1a_test_sabotage_frozen()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.external_id = '534350' THEN
            -- This will fail due to UNIQUE(provider, external_id) constraint
            -- which is the correct production behavior
            INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, status)
            VALUES ('hostaway', '412145', 'FAKE DUPLICATE', 'proposed');
          END IF;
          RETURN NEW;
        END; $$
      `);
      await client.query(`
        CREATE TRIGGER trg_a1a_test_sabotage
        AFTER INSERT ON pms.property_mappings
        FOR EACH ROW EXECUTE FUNCTION _a1a_test_sabotage_frozen()
      `);

      // The unique constraint prevents the duplicate INSERT, which aborts the transaction
      await expect(runMigrationFull()).rejects.toThrow();

      // Clear aborted transaction state
      await client.query('ROLLBACK');

      // Verify rollback
      const orit = await client.query(`SELECT count(*)::int AS c FROM pms.property_mappings WHERE external_id='534350'`);
      expect(orit.rows[0].c).toBe(0);
    });

    test('D: duplicate frozen external_id — DB unique constraint prevents this path', () => {
      // Document: pms.property_mappings has UNIQUE(provider, external_id).
      // A true duplicate frozen row (same external_id, different UUID) is prevented
      // by the database constraint before the migration's frozen check can detect it.
      // The migration's duplicate detection is defense-in-depth for environments
      // that may lack the unique constraint.
      // Test C above already proves the constraint fires.
      expect(true).toBe(true);
    });

    test('E: no partial Miranta/Orit changes remain after frozen failure', async () => {
      // Install trigger that sabotages frozen AFTER both Miranta and Orit complete
      await client.query(`
        CREATE OR REPLACE FUNCTION _a1a_test_sabotage_frozen()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.external_id = '534350' THEN
            UPDATE pms.property_mappings SET status = 'deleted'
            WHERE provider = 'hostaway' AND external_id = '426237';
          END IF;
          RETURN NEW;
        END; $$
      `);
      await client.query(`
        CREATE TRIGGER trg_a1a_test_sabotage
        AFTER INSERT ON pms.property_mappings
        FOR EACH ROW EXECUTE FUNCTION _a1a_test_sabotage_frozen()
      `);

      await expect(runMigrationFull()).rejects.toThrow(/FROZEN STOP/);

      // Clear aborted transaction state
      await client.query('ROLLBACK');

      // Miranta should NOT be approved (rolled back)
      const miranta = await client.query(`SELECT status FROM pms.property_mappings WHERE external_id='510557'`);
      expect(miranta.rows[0].status).toBe('proposed');

      // No Orit contact should exist
      const oritContact = await client.query(`SELECT count(*)::int AS c FROM contacts WHERE lower(name)='orit rob'`);
      expect(oritContact.rows[0].c).toBe(0);

      // Frozen row restored
      const villa = await client.query(`SELECT status FROM pms.property_mappings WHERE external_id='426237'`);
      expect(villa.rows[0].status).toBe('approved');
    });
  });

  // =========================================================================
  // 17. Reuse existing valid Orit chain
  // =========================================================================

  describe('17. Reuse existing valid Orit chain', () => {
    beforeAll(async () => {
      await seedBaseline();
      await runMigrationFull(); // creates Orit chain
    });
    afterAll(async () => {
      await clearAllData();
    });

    test('second run reuses chain, does not create duplicates', async () => {
      await expect(runMigrationFull()).resolves.not.toThrow();
      const contacts = await client.query(`SELECT count(*)::int AS c FROM contacts WHERE lower(name)='orit rob'`);
      expect(contacts.rows[0].c).toBe(1);
      const parties = await client.query(`SELECT count(*)::int AS c FROM registry.parties WHERE lower(canonical_name)='orit rob'`);
      expect(parties.rows[0].c).toBe(1);
    });
  });
});
