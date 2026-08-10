# JJ_CURRENT_STATE — Canonical (verified facts + index)

> **Status:** DRAFT skeleton (Phase 1.5). Numbers below are LIVE-VERIFIED with timestamp + query. They are snapshots — **re-run the query to refresh; do not treat as static.**
> **Rule (Unknown > Guess):** no disputed number is declared here without live verification. Where not yet verified → `PENDING LIVE VERIFICATION`.
> **Authority scope:** this file is authoritative for **current operational / DB state only.** Historical reconstruction → JHKA; business rules → `JJ_FINANCE_RULES.md`; principles → `JJ_BUSINESS_CONSTITUTION.md`. A live value here supersedes an old snapshot, not history or rules.

## Transactions baseline — VERIFIED
- **Source:** live query on Supabase project `vsiiprzjrstjcmjpwcrd` (`public.transactions`).
- **Verified at:** 2026-08-10 21:57:32 UTC.

| Metric | Value |
|---|---|
| Total rows (audit baseline) | **2,162** |
| Active rows (`active` OR NULL) | **2,137** |
| Confirmed duplicates | **25** |
| Other status | 0 |
| Active `amount_eur` | **€12,689,602.23** |
| Active `client_charge` | **€113,460.13** |
| All-rows `client_charge` | **€120,555.14** |
| Latest `created_at` | 2026-07-23 |
| Latest `updated_at` | 2026-08-06 |

**Query (reproduces EVERY field above):**
```sql
SELECT now() AT TIME ZONE 'UTC' AS verified_at_utc,
 count(*) AS total_rows,
 count(*) FILTER (WHERE review_status='active' OR review_status IS NULL) AS active_rows,
 count(*) FILTER (WHERE review_status='confirmed_duplicate') AS confirmed_duplicates,
 count(*) FILTER (WHERE review_status IS NOT NULL AND review_status NOT IN ('active','confirmed_duplicate')) AS other_status_rows,
 round(sum(amount_eur) FILTER (WHERE review_status='active' OR review_status IS NULL),2) AS active_amount_eur,
 round(sum(client_charge) FILTER (WHERE review_status='active' OR review_status IS NULL),2) AS active_client_charge,
 round(sum(client_charge),2) AS all_rows_client_charge,
 max(created_at) AS latest_created_at,
 max(updated_at) AS latest_updated_at
FROM public.transactions;
```
> ⚠️ These differ from CLAUDE.md (2,161 / 2,138 / 23) and from every document number found (2,127 / 2,136 / 2,154 / 2,172 / 2,199 …). Those are **stale snapshots**, not competing truths. The live value above supersedes them.

## Cashboxes — VERIFIED (`v_cashbox_audit`, live 2026-08-10)
| Box | Received | Paid | Balance |
|---|---|---|---|
| Yossi | 934,644.35 | 979,173.60 | **−44,529.25** |
| Jacob | 1,355,426.97 | 1,297,547.50 | **+57,879.47** |
| JJ | 482,304.25 | 369,157.85 | **+113,146.40** |
> Scope: `review_status='active' OR NULL`, minus active `transaction_exclusions`, matched by payer/payee, `amount_eur`, no date cutoff. Power BI targets in CLAUDE.md §5 are a **31 May 2026 snapshot** — refresh PBI to reconcile; DB is authoritative.

**Cashbox reproducibility (every value above):**
```sql
SELECT * FROM public.v_cashbox_audit;                                  -- the balances
SELECT pg_get_viewdef('public.v_cashbox_audit'::regclass, true);       -- the exact scope/formula
```
The scope statement above is not prose — it is read directly from the view definition returned by the second query.

## Platform / schemas
7 schemas (public, pms, lifecycle, finance, statements, registry, historical). ~90 tables, ~48 public views, 6 Edge Functions, 6 pg_cron jobs. Full map: `JJ_MASTER_PROJECT_INVENTORY_v1.0.md`, `DOMAIN_MAP.md`.

## PENDING LIVE VERIFICATION
Per-property counts · NULL `property_name` count · lifecycle coverage · view inventory classification.
