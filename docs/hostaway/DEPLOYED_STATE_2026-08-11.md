# Hostaway / PMS — Deployed-State Manifest (2026-08-11)

**Purpose:** record the currently-deployed Hostaway/PMS integration so it is reproducible, reviewable, and rollback-able from Git. **This capture changed zero production behavior** — it only recovers deployed truth into source control.

## Supabase project
- Project: `vsiiprzjrstjcmjpwcrd`
- Capture timestamp (UTC): `2026-08-11T19:12Z`
- Recovery branch base (`origin/main`): `0a6f6da1875a520c3862815f216ce0a422c7b772`

## Architectural boundary (unchanged)
> Hostaway / PMS is **operational evidence**, not an independent JJ financial authority.

## Edge Functions

Recovered verbatim from the deployed source (`get_edge_function`) into `supabase/functions/<slug>/index.ts`.
`DEPLOYED VERSION` and `EZBR SHA-256` are from Supabase (the EZBR hash is a **deployment-bundle** digest, not a source-file digest — it is expected to differ from the recovered-file SHA, which is a sha256 of the `.ts` file). `RECOVERED SHA-256` = sha256 of the committed file (first 12 hex shown).

| FUNCTION | DEPLOYED VER | EZBR SHA-256 (bundle) | RECOVERED SHA-256 (file) | SOURCE PATH | verify_jwt | STATUS |
|---|---|---|---|---|---|---|
| pms-hostaway-auth-test | v2 | `95ff518f…6589dfe5` | `97c4c4d91f19…` | supabase/functions/pms-hostaway-auth-test/index.ts | true | RECOVERED |
| pms-hostaway-sync-listings | v4 | `c0fe48e3…d0267cac` | `1fef0dfdacb0…` | supabase/functions/pms-hostaway-sync-listings/index.ts | true | RECOVERED |
| pms-hostaway-sync-reservations | v6 | `61746913…994cb9b8` | `eec0d476b3de…` | supabase/functions/pms-hostaway-sync-reservations/index.ts | true | RECOVERED |
| pms-admin-status | v2 | `03352b74…ce73ba72f` | `94dae007eb19…` | supabase/functions/pms-admin-status/index.ts | true | RECOVERED |
| pms-hostaway-webhook | v1 | `a59dc6ff…1ecc99c3e9` | `020c219caacb…` | supabase/functions/pms-hostaway-webhook/index.ts | **false** (Basic-auth via Vault) | RECOVERED |
| pms-hostaway-register-webhook | v1 | `9bd7eb8b…d204befc39` | `0f379b4c11d7…` | supabase/functions/pms-hostaway-register-webhook/index.ts | true | RECOVERED |
| pms-hostaway-finance-query | v1 | `fc9d3546…9684c5a3` | `0eccfd688ca9…` | supabase/functions/pms-hostaway-finance-query/index.ts | true | RECOVERED |
| jj-qa-auth-helper | v1 | `c3f75e5c…58d0b1d3` | — | **EXCLUDED** (see below) | true | NOT RECOVERED |

**`jj-qa-auth-helper` — excluded from Hostaway scope, intentionally.** It is a QA magic-link helper (generates a login link for a single email via `SUPABASE_SERVICE_ROLE_KEY`), unrelated to Hostaway/PMS. Its source contains a **hardcoded gate string** (`secret === '…'`), so recovering it verbatim would commit a credential-like literal. It is therefore documented and deliberately not captured. Any future recovery of QA tooling should live under a general/QA path and rotate that gate string — out of scope for this P0.

## Database baseline
Captured under `supabase/baselines/hostaway/` (documentation snapshots, **not** executable migrations — each has a hard `RAISE EXCEPTION` guard and lives outside `supabase/migrations/`):

| File | Objects |
|---|---|
| `DEPLOYED_PMS_OPS_BASELINE_2026-08-11.sql` | `pms` 11 tables (+indexes, RLS-enabled deny-all), `pms.v_reservation_financial_effective`; `ops.health_checks`, `ops.v_operational_metrics`; `ops` functions `invoke_pms_function`, `normalize_pms`, `refresh_health`, `watchdog_stuck_runs` |
| `STR_SETTLEMENT_VIEWS_2026-08-11.sql` | `pms.v_str_property_settlement`, `public.v_str_settlement_report` (unwired/non-authoritative financial views) |
| `CRON_JOBS_2026-08-11.sql` | the 6 active `cron.job` definitions (documentation) |

Migration-ledger entries that originally produced this schema (in Supabase, **not** as repo files): `pms_phase1_001_schema`, `pms_002_canonical_operational_fields`, `pms_003_mapping_evidence`, `ops_001_m01_automation`, `ops_002_normalize_cron`, `ops_003_operational_metrics`.

## Cron (6 active jobs)
| jobname | schedule | invokes |
|---|---|---|
| pms-sync-listings-hourly | `5 * * * *` | `ops.invoke_pms_function('pms-hostaway-sync-listings', …)` |
| pms-sync-reservations-hourly | `10 * * * *` | `ops.invoke_pms_function('pms-hostaway-sync-reservations', …)` |
| pms-reconcile-nightly | `0 3 * * *` | same reservations sync (not a distinct reconcile — audit note) |
| ops-watchdog | `*/15 * * * *` | `ops.watchdog_stuck_runs()` |
| ops-health-refresh | `*/15 * * * *` | `ops.refresh_health()` |
| pms-normalize-hourly | `20 * * * *` | `ops.normalize_pms()` |

## Secret references (NAMES ONLY — no values in Git)
- Env: `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (last two used only by the excluded QA helper)
- Vault secret names: `edge_invoke_key`, `hostaway_webhook_auth`, and per-connection `credentials_ref`; legacy fixed names `hostaway_account_id`, `hostaway_client_secret` (used by `pms-hostaway-auth-test` and `pms-hostaway-finance-query`).

## Verified operational baseline (validation, not business assumption)
- Listings: **8** current (canonical 8, 0 duplicate external_ids)
- Reservations: **656** canonical (0 duplicate external_ids)
- Last successful cron sync at capture: listings `18:05`, reservations `18:10` (2026-08-11)

## Known findings captured as-is (NOT fixed in P0)
- `ops.*` functions have role-mutable `search_path` (advisor WARN).
- 17 stale `pms.sync_errors` (`page_upsert_failed`, 2026-07-30 window, never retried).
- `pms-reconcile-nightly` duplicates the reservations sync (no drift detection).
- `pms.*`/`ops.*` RLS enabled with 0 policies (deny-all, intentional).
These are recorded for later, explicitly-reviewed hardening — P0 captures current truth only.
