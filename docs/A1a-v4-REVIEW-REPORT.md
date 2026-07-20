# M2 A1a v4 — Integration Harness Fix

## Package Summary

| Item | Value |
|------|-------|
| Package | `m2-a1a-safe-mapping-v4.zip` |
| Version | v4 (integration harness fix — migration SQL unchanged from v3) |
| Date | 2026-07-20 |
| Static tests | **77/77 PASS** (0 skipped) |
| Integration tests | **40/40 PASS** (0 skipped) |
| SQL Compile + First Execution | **PASS** |
| PostgreSQL version | **16.2** (x86_64-pc-linux-gnu, gcc 10.2.1) |
| Disposable DB | `a1a_test_20260720` (created empty, verified empty, destroyed after) |
| Migration lines | ~813 |

## Scope

Mapping only — no financial snapshots, no backfill, no function creation.

| Listing | Action | Target |
|---------|--------|--------|
| 510557 | Approve existing proposed | Miranta Radisson |
| 534350 | Create full identity chain + mapping | Orit Rob Pingodes |
| 495138 | Read-only verification | Oren Kitty |

Frozen listings (untouched): 447075, 412145, 412147, 426237, 412148.

## v4 Changes (ChatGPT review response)

**Migration SQL: UNCHANGED from v3.** The v3 corrections (v_orit_target scope fix + contact_ref=NULL fail-closed) were accepted. No redesign.

**Integration harness: COMPLETELY REWRITTEN.** All changes are in `integration.test.ts`:

| # | v3 Defect | v4 Fix |
|---|-----------|--------|
| 1 | `CREATE SCHEMA IF NOT EXISTS` — unsafe for shared DB | Plain `CREATE` only — no `IF NOT EXISTS` anywhere |
| 2 | `DROP SCHEMA CASCADE` — destroys anything in schema | `createdObjects[]` tracks every object; `destroyFixture()` drops only what was created, in reverse order |
| 3 | No pre-creation emptiness check | Gate 5: zero non-default schemas; Gate 6: zero user tables in public |
| 4 | DB name only checked for "test" substring | Gate 2: DB name must begin with `a1a_test_` prefix |
| 5 | 33 integration tests SKIPPED without DB | All 40 tests EXECUTE against real PostgreSQL — 0 skipped |
| 6 | Frozen tests mutated rows BEFORE migration snapshot | Trigger-based: `_a1a_test_sabotage_frozen()` fires AFTER INSERT on pms.property_mappings DURING migration execution |
| 7 | Missing UNIQUE constraints in fixture | Added: `pms.property_mappings(provider, external_id)`, `registry.parties(company_id, canonical_name)`, `registry.external_identities(source_system, external_entity_type, external_id)`, `public.contact_properties(contact_id, property_name)` |
| 8 | No SQL compile proof | SQL compiled and executed on PostgreSQL 16.2 — PASS |
| 9 | Post-failure assertions hit aborted transaction state | `ROLLBACK` issued before every post-failure assertion query |

## SQL Compile + First Execution Gate

```
Database:    a1a_test_20260720  (disposable, created empty, verified 0 schemas + 0 tables)
PostgreSQL:  16.2 on x86_64-pc-linux-gnu
Result:      PASS — migration compiled and executed without error
Idempotency: PASS — second run succeeds, reuses existing Orit chain
```

## Integration Test Isolation Gates (6 gates)

```
Gate 1: URL must NOT contain production project ref (vsiiprzjrstjcmjpwcrd)
Gate 2: Database name must begin with "a1a_test_"
Gate 3: Database must not be "postgres"
Gate 4: Host must not contain production project ref
Gate 5: Zero non-default schemas (pg_catalog, information_schema, public only)
Gate 6: Zero user tables in public schema

Environment variables:
  A1A_TEST_DATABASE_URL      — connection to isolated test DB
  A1A_CONFIRM_ISOLATED_DB    — must equal "yes-isolated-a1a-test-db"

All 6 gates: PASS
```

## Integration Test Coverage (40 tests — 0 skipped)

| Section | Tests | Category |
|---------|-------|----------|
| 0. Isolation gates | 5 | Safety |
| 1. SQL compile + clean first execution | 11 | Core |
| 2. Idempotency | 3 | Core |
| 3. Miranta wrong target → STOP | 1 | Miranta |
| 4. Orit contact wrong type → STOP | 1 | Fail-closed |
| 5. Orit party wrong party_type → STOP | 1 | Fail-closed |
| 6. Orit party wrong status → STOP | 1 | Fail-closed |
| 7. Orit party contact_ref NULL → STOP (v3) | 1 | Fail-closed |
| 8. Orit party conflicting contact_ref → STOP | 1 | Fail-closed |
| 9. External identity company mismatch → STOP | 1 | Fail-closed |
| 10. External identity canonical_type mismatch → STOP | 1 | Fail-closed |
| 11. External identity status mismatch → STOP | 1 | Fail-closed |
| 12. Soft-deleted contact_property collision → STOP | 1 | Fail-closed |
| 13. Wrong relationship role → STOP | 1 | Fail-closed |
| 14. Orit proposed mapping preserves evidence | 1 | Evidence |
| 15. Oren mismatch detection | 3 | Oren |
| 16. Frozen listing protection (A–E) | 5 | Frozen |
| 17. Reuse existing valid Orit chain | 1 | Idempotency |
| **Total** | **40** | |

### Frozen Listing Tests — Trigger-Based Design

Tests A–E install an `AFTER INSERT` trigger on `pms.property_mappings` that fires when the Orit mapping (external_id='534350') is inserted **during migration execution**. The trigger sabotages frozen rows between the before-snapshot and the final integrity check:

| Test | Sabotage | Expected |
|------|----------|----------|
| A | UPDATE frozen row status | Migration raises FROZEN STOP |
| B | DELETE frozen row | Migration raises FROZEN STOP |
| C | INSERT new frozen-range row | UNIQUE(provider, external_id) prevents insertion — stopped by DB constraint |
| D | INSERT duplicate frozen external_id | UNIQUE(provider, external_id) prevents insertion — defense-in-depth documentation |
| E | UPDATE frozen row (same as A) | No partial Miranta/Orit changes remain after rollback |

## Static Test Coverage (77 tests — 0 skipped)

All 77 static tests parse the migration SQL and verify structure, naming, safety constraints, and v2/v3 corrections without executing against a database.

## Fixture Schema Fidelity

Fixture tables match production constraints:

| Table | Constraint |
|-------|-----------|
| `pms.property_mappings` | `UNIQUE(provider, external_id)` |
| `registry.parties` | `UNIQUE(company_id, canonical_name)` |
| `registry.external_identities` | `UNIQUE(source_system, external_entity_type, external_id)` |
| `public.contact_properties` | `UNIQUE(contact_id, property_name)` |

## Files

| File | Lines | Changed in v4? |
|------|-------|---------------|
| `supabase/migrations/20260720_a1a_safe_hostaway_mapping.sql` | ~813 | **NO** — unchanged from v3 |
| `src/__tests__/a1a-mapping/migration.test.ts` | ~479 | **NO** — unchanged from v3 |
| `src/__tests__/a1a-mapping/integration.test.ts` | ~860 | **YES** — completely rewritten |
| `A1a-v4-REVIEW-REPORT.md` | This file | **YES** — new |

## Running Tests

```bash
# Integration tests — requires PostgreSQL:
A1A_TEST_DATABASE_URL="postgresql://user:pass@host:5432/a1a_test_20260720" \
A1A_CONFIRM_ISOLATED_DB="yes-isolated-a1a-test-db" \
  npx jest --testPathPatterns='integration\.test\.ts$'

# Static tests — no database required:
npx jest --testPathPatterns='migration\.test\.ts$'

# Both suites:
A1A_TEST_DATABASE_URL="..." A1A_CONFIRM_ISOLATED_DB="..." \
  npx jest --testPathPatterns='a1a-mapping'
```

## What This Does NOT Do

- No financial snapshots
- No `pms.upsert_financial_snapshot()` function
- No backfill scripts
- No `pg` dependency in production
- No role provisioning
- No transaction table writes
- No function creation
- No changes to frozen listings
- No production connection permitted

## Confirmations

- [x] Migration SQL unchanged from v3 (accepted by reviewer)
- [x] SQL compiled + executed on real PostgreSQL 16.2 — PASS
- [x] Idempotency verified — second run PASS
- [x] 40/40 integration tests PASS — 0 skipped
- [x] 77/77 static tests PASS — 0 skipped
- [x] All frozen listing tests use trigger-based mid-migration sabotage
- [x] Fixture uses plain CREATE (no IF NOT EXISTS)
- [x] Fixture tracks created objects, destroys only what it created
- [x] Disposable DB verified empty before fixture creation
- [x] DB name required to begin with `a1a_test_`
- [x] A1b untouched
- [x] No production connection used
- [x] No production migration applied
- [x] No push, PR, merge, or deployment

## Next Steps

1. **ChatGPT architectural review** of v4 package
2. After approval: apply migration via Supabase SQL Editor
3. After migration: A1b financial snapshots (separate package, BLOCKED)
