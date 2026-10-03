# Per-owner impact — `v_contact_settlement` draft 20261003120000

Draft only. Not applied. No data, flags, exclusions, or counting code change.
This note is for JJ Manager before any apply. It does not authorise a restore.

Sign: `net_jj_settlement`. Positive = owner owes JJ. Negative = JJ owes owner.
Delta = draft balance − current balance.

**Current** = the live Production view captured read-only on 2026-10-03 (the view `main` still has; this draft is not applied). Source: `docs/planning/contact_settlement_certified_ledger_2026-10-03.md`.

**Draft** = the same rows read through `public.v_certified_ledger_transactions` (migration `20261003120000`).

The 2026-10-03 read covered **16** summary contacts. Only **6** change. The other **10** were unchanged, and their names and balances were not stored. They are not invented below. The query under `queries to run` lists them.

## (a) Balance by contact

Verified 2026-10-03, six contacts with a non-zero delta. Row counts are in brackets.

| Contact | Current (live) | Draft (certified) | Delta | Rows dropped |
|---|---:|---:|---:|---:|
| Liron and Alon | −46,915.74 (84) | −47,365.74 (83) | −450.00 | 1 |
| Ofri | −6,074.15 (132) | −5,724.77 (128) | +349.38 | 4 |
| Tamir | −97,015.66 (338) | −92,298.59 (333) | +4,717.07 | 5 |
| Tom | −65,323.88 (125) | −63,808.26 (123) | +1,515.62 | 2 |
| Uriel | −126,931.23 (293) | −123,230.71 (291) | +3,700.52 | 2 |
| Yogev | −54,130.83 (34) | −54,261.97 (33) | −131.14 | 1 |
| **Total of these 6** | **−396,391.49** | **−386,690.04** | **+9,701.45** | **15** |
| Other 10 contacts | not stored | same as current | 0 (stated) | 0 |

Check on each of the six: current = draft + pair side A (1, 2, 4, 5) + Group 1 + pair 3. That identity holds for every contact in the source table.

## (b) Removed rows

The draft drops 15 rows. All 15 are soft-deleted. Five of them, the side-A rows of pairs 1–5, also have an active `public.transaction_exclusions` row. Those five are flagged **two reasons**. Group 1 (10 rows) is soft-deleted only.

None of the 15 are removed for `review_status`. The live view already requires `review_status = 'active'` or NULL, and it already counts all 15. Side B of every pair is `confirmed_duplicate` and was already out of the live view. Side B is not part of the 15.

`deleted_at`, the exclusion row id, and the per-row `review_status` value (`active` versus NULL) were not in the 2026-10-03 capture. They are unverified. Query 2 and query 3 below return them.

### Pair side A — captured 2026-10-03

Settlement amount is the view amount. Drop delta is the change in that owner's `net_jj_settlement` from losing this row alone.

| Pair | Transaction | Owner | Date | Type | Settlement amount | Effect | Drop delta | Reasons |
|---|---|---|---|---|---:|---|---:|---|
| 1 | `cfb1b60c-90f9-47c1-930f-6c7737ccf448` | Ofri | 2026-05-30 | Platform Income (1/3/26–31/5/26), DS-016 | 3,917.49 | REDUCES | +3,917.49 | soft-deleted **and** active `transaction_exclusions` |
| 2 | `20eaeb18-a457-4740-acb2-0fe446a01460` | Ofri | 2026-06-04 | Bank Payment to Owner, DS-008, bank-sourced | 3,322.37 | INCREASES | −3,322.37 | soft-deleted **and** active `transaction_exclusions` |
| 3 | `82c8ee31-3667-4c7e-893f-c0d7a6acb70b` | Tamir | not stored | contribution −3,404.03; twin `e4a8a01c` already excluded | 3,404.03 | REDUCES | +3,404.03 | soft-deleted **and** active `transaction_exclusions` |
| 4 | `dc3d60fb-f3a3-4ca6-9fc4-46ef40e4bdb3` | Tom | 2026-05-31 | Platform Income (10/2/26–31/5/26), STR recon 15.08 | 1,553.96 | REDUCES | +1,553.96 | soft-deleted **and** active `transaction_exclusions` |
| 5 | `10622dde-dd02-464f-a6e1-d98cb25cde83` | Uriel | 2026-05-30 | Platform Income (1.1.26–31.5.26); twin `9a5fdde0` already excluded | 1,900.52 | REDUCES | +1,900.52 | soft-deleted **and** active `transaction_exclusions` |

Pair 3's date, category, and subcategory were not in the 2026-10-03 settlement capture. The captured view contribution is −3,404.03 (REDUCES). `docs/governance/JJ_BUSINESS_RULE_BOOK.md` Note E-01 calls the Tamir Dekelia Platform Income of €3,404.03 a reversed dedup pair. That label is not re-read from Production here.

### Group 1 batch `2509d3ad` — owner totals captured, row split incomplete

Captured Group 1 total: income 3,400.00 REDUCES and expenses 1,152.18 INCREASES, net **−2,247.82**, 10 rows, 5 contacts. No active exclusion was attributed to these 10.

| Contact | Group rows | Captured Group 1 effect on `net_jj_settlement` | What that fixes about the row |
|---|---:|---:|---|
| Liron and Alon | 1 | +450.00 | one INCREASES row, settlement amount 450.00 |
| Ofri | 2 | +245.74 | two rows, net INCREASES 245.74; split between the two ids is **not stored** |
| Tamir | 4 | −1,313.04 | see the four ids below; sum matches |
| Tom | 1 | +38.34 | one INCREASES row, settlement amount 38.34 |
| Uriel | 1 | −1,800.00 | one REDUCES row, settlement amount 1,800.00 |
| Yogev | 1 | +131.14 | one INCREASES row, settlement amount 131.14 |

Dates, property names, subcategories, `amount_eur` versus `client_charge`, and `deleted_at` for these rows are **unverified**. Ids in the batch, not assigned to an owner by the 2026-10-03 note:

`7acdcebd-7d83-44b5-8080-d048d8fdb104`, `07859b5d-5d04-4a1b-ba87-c5f51374546d`, `ba646d2d-9122-4909-ae02-8a67739a0172`, `98a46392-8d8b-435d-b81b-2689bebf2f94`, `886b710b-63c1-4d99-af52-1809766ec0d4`, `2976a45a-7b7c-460f-860f-c800b629ec45`, `11c038f8-b9c7-4962-ae14-15dc694e6283`, `3c54f570-4991-4a21-8e4e-f0c946c914c0`, `490f499a-343d-4100-aaad-69fd6d707b08`, `b18d427d-cc6d-4bba-a7d7-f94aee3eeacd`.

Two repo sources name some of those ids. They are **not** a 2026-10-03 Production read. They are listed because the amounts add up to the captured totals. Query 2 must confirm them before they are treated as fact.

- Tamir, from `src/lib/finance/tamirCertifiedReconciliation.ts` (pack dated 2026-09-14). All four ids are in batch `2509d3ad`. Signed settlement effects −1,600 + 117.36 + 76.81 + 92.79 = **−1,313.04**, the captured Tamir Group 1 total.
  - `07859b5d-5d04-4a1b-ba87-c5f51374546d` — LTR rent 1,600.00, soft-deleted. A test fixture that says it reproduces Production dates this row 2026-06-16, Tenant Payment, `deleted_at` 2026-07-11 19:12:09+00, `deleted_by` `dedupe` (`supabase/tests/20260917224500_tamir_kiti_september/fixtures.sql`). Not re-read on 2026-10-03.
  - `2976a45a-7b7c-460f-860f-c800b629ec45` — LTR electricity 117.36, soft-deleted. Date not stored.
  - `490f499a-343d-4100-aaad-69fd6d707b08` — LTR water 76.81, soft-deleted. Date not stored.
  - `98a46392-8d8b-435d-b81b-2689bebf2f94` — STR electricity 92.79, soft-deleted. Date not stored.
- Uriel: `src/lib/ledger/__tests__/certifiedLedger.test.ts` labels `ba646d2d-9122-4909-ae02-8a67739a0172` as Uriel Kamares deleted €1,800. That id is in the batch, and Uriel's captured Group 1 effect is exactly −1,800.00 from one row. Date, subcategory, and `deleted_at` are not stored. Unverified until query 2.

The other five ids are not named to Liron, Ofri, Tom, or Yogev anywhere in the repo.

Income check, using the Tamir 1,600 and the Uriel 1,800: 1,600 + 1,800 = **3,400.00**, the captured Group 1 income. Expense check: 450.00 + 245.74 + 38.34 + 131.14 + 117.36 + 76.81 + 92.79 = **1,152.18**, the captured Group 1 expenses. Net −3,400.00 + 1,152.18 = **−2,247.82**.

## (c) Pairs 1–5 against the approved treatment

Approved, and **not** implemented by migration `20261003120000`: restore side A of pairs **1, 2, 4, and 5** and count each once. Pair **3** (Tamir Dekelia, `82c8ee31`) is **held** and stays out. Group 1 stays out: a restore was recorded earlier and the write was not approved.

The draft today counts **neither** side of every pair. Side B stays out either way (`confirmed_duplicate`).

| Pair | Approved | What the draft does today | Owner effect of the draft versus the approval |
|---|---|---|---|
| 1 Ofri `cfb1b60c` 3,917.49 REDUCES | count side A once | drops it | draft is 3,917.49 higher than the approved balance |
| 2 Ofri `20eaeb18` 3,322.37 INCREASES | count side A once | drops it | draft is 3,322.37 lower than the approved balance |
| 3 Tamir `82c8ee31` 3,404.03 REDUCES | held, do not count | drops it | draft matches the hold |
| 4 Tom `dc3d60fb` 1,553.96 REDUCES | count side A once | drops it | draft is 1,553.96 higher than the approved balance |
| 5 Uriel `10622dde` 1,900.52 REDUCES | count side A once | drops it | draft is 1,900.52 higher than a view that counts the row once |

Pair 5 has a second constraint from the 2026-10-03 14:30 note. Certification `ad2ba8fd`, line `e55e4b35` (Uriel Duplex, opening property obligation 16,555.43, `str_credit` 6,983.10) **likely** already contains `10622dde`. Do **not** add 1,900.52 on top of that certification. A consumer that reads the certification must not also add the view row. The view itself does not read the certification. Whether 1,900.52 sits inside `str_credit` 6,983.10 is still an open read-only check. "Likely" is JJ Evidence, 03.10 14:21, and was not re-verified in this note.

Balance under each rule. "Approved view" = draft, plus side A of pairs 1, 2, 4, and 5 counted once, pair 3 still out, Group 1 still out.

| Contact | Current (live) | Draft today | Approved view | Approved − live | Why they still differ |
|---|---:|---:|---:|---:|---|
| Liron and Alon | −46,915.74 | −47,365.74 | −47,365.74 | −450.00 | Group 1 expense 450.00 still out |
| Ofri | −6,074.15 | −5,724.77 | −6,319.89 | −245.74 | pairs 1 and 2 restored; Group 1 net +245.74 still out |
| Tamir | −97,015.66 | −92,298.59 | −92,298.59 | +4,717.07 | pair 3 held (−3,404.03) and Group 1 (−1,313.04) both out |
| Tom | −65,323.88 | −63,808.26 | −65,362.22 | −38.34 | pair 4 restored; Group 1 expense 38.34 still out |
| Uriel | −126,931.23 | −123,230.71 | −125,131.23 | +1,800.00 | pair 5 restored in the view; Group 1 income 1,800.00 still out. Do not also add 1,900.52 on top of cert `ad2ba8fd` / `e55e4b35` |
| Yogev | −54,130.83 | −54,261.97 | −54,261.97 | −131.14 | Group 1 expense 131.14 still out |
| Other 10 | not stored | unchanged | unchanged | 0 | no removed row |

Ofri approved view: −5,724.77 + (−595.12) = −6,319.89.
Tom approved view: −63,808.26 + (−1,553.96) = −65,362.22.
Uriel approved view: −123,230.71 + (−1,900.52) = −125,131.23.
Liron, Tamir, and Yogev have no approved pair row, so the approved view equals the draft.

## (d) Total check

Scope of the two headline figures: the **six** contacts above, not a grand total of all 16. The other 10 add nothing to the delta. Their euro balances were not stored, so an all-contact grand total is not stated.

| | EUR |
|---|---:|
| Current, six contacts | −396,391.49 |
| Draft, six contacts | −386,690.04 |
| Delta | +9,701.45 |

Removed-row contributions (the amount the live view includes and the draft removes):

| Bucket | Contribution to `net_jj_settlement` |
|---|---:|
| Pairs 1, 2, 4, 5 side A | −4,049.60 |
| Group 1, 10 rows | −2,247.82 |
| Pair 3 side A, held | −3,404.03 |
| **Sum of the 15** | **−9,701.45** |

−396,391.49 − (−9,701.45) = −386,690.04.

Per contact, the same identity: draft − current = −1 × (pair side A + Group 1 + pair 3).

| Contact | Removed contribution | −1 × contribution | Draft − current |
|---|---:|---:|---:|
| Liron and Alon | +450.00 | −450.00 | −450.00 |
| Ofri | −595.12 + 245.74 = −349.38 | +349.38 | +349.38 |
| Tamir | −1,313.04 + −3,404.03 = −4,717.07 | +4,717.07 | +4,717.07 |
| Tom | −1,553.96 + 38.34 = −1,515.62 | +1,515.62 | +1,515.62 |
| Uriel | −1,900.52 + −1,800.00 = −3,700.52 | +3,700.52 | +3,700.52 |
| Yogev | +131.14 | −131.14 | −131.14 |
| **Sum** | **−9,701.45** | **+9,701.45** | **+9,701.45** |

## queries to run

Read-only. Do not apply the migration to run these. Run each statement inside `BEGIN READ ONLY` … `ROLLBACK`. Nothing here was executed for this note.

### Query 1 — every contact, live view

Fills the 10 names and balances that are not stored. On 2026-10-03 this population was 16 rows.

```sql
BEGIN READ ONLY;
SELECT contact_name,
       total_rows,
       net_jj_settlement
FROM public.v_contact_settlement_summary
ORDER BY contact_name;
ROLLBACK;
```

### Query 2 — the 15 rows: date, amount, type, `deleted_at`, `review_status`

```sql
BEGIN READ ONLY;
WITH ids(id) AS (
  VALUES
    ('cfb1b60c-90f9-47c1-930f-6c7737ccf448'::uuid),
    ('20eaeb18-a457-4740-acb2-0fe446a01460'::uuid),
    ('82c8ee31-3667-4c7e-893f-c0d7a6acb70b'::uuid),
    ('dc3d60fb-f3a3-4ca6-9fc4-46ef40e4bdb3'::uuid),
    ('10622dde-dd02-464f-a6e1-d98cb25cde83'::uuid),
    ('7acdcebd-7d83-44b5-8080-d048d8fdb104'::uuid),
    ('07859b5d-5d04-4a1b-ba87-c5f51374546d'::uuid),
    ('ba646d2d-9122-4909-ae02-8a67739a0172'::uuid),
    ('98a46392-8d8b-435d-b81b-2689bebf2f94'::uuid),
    ('886b710b-63c1-4d99-af52-1809766ec0d4'::uuid),
    ('2976a45a-7b7c-460f-860f-c800b629ec45'::uuid),
    ('11c038f8-b9c7-4962-ae14-15dc694e6283'::uuid),
    ('3c54f570-4991-4a21-8e4e-f0c946c914c0'::uuid),
    ('490f499a-343d-4100-aaad-69fd6d707b08'::uuid),
    ('b18d427d-cc6d-4bba-a7d7-f94aee3eeacd'::uuid)
)
SELECT t.id,
       t.date,
       t.property_name,
       c.name AS contact_name,
       t.category,
       t.subcategory,
       t.payer,
       t.payee,
       t.amount_eur,
       t.client_charge,
       t.review_status,
       t.is_deleted,
       t.deleted_at,
       t.deleted_by
FROM public.transactions t
JOIN ids ON ids.id = t.id
LEFT JOIN public.contact_properties cp
  ON cp.property_name = t.property_name
 AND cp.is_deleted = false
LEFT JOIN public.contacts c ON c.id = cp.contact_id
ORDER BY c.name, t.date, t.id;
ROLLBACK;
```

### Query 3 — active and inactive exclusion rows for those 15

The exclusion table is `public.transaction_exclusions`. An active row is `is_active = true`. More than one exclusion row may exist per transaction. The exclusion **row id** was not captured.

```sql
BEGIN READ ONLY;
SELECT te.id AS exclusion_id,
       te.transaction_id,
       te.is_active,
       te.reason,
       te.source_batch,
       te.excluded_by,
       te.created_at,
       te.duplicate_of
FROM public.transaction_exclusions te
WHERE te.transaction_id IN (
  'cfb1b60c-90f9-47c1-930f-6c7737ccf448',
  '20eaeb18-a457-4740-acb2-0fe446a01460',
  '82c8ee31-3667-4c7e-893f-c0d7a6acb70b',
  'dc3d60fb-f3a3-4ca6-9fc4-46ef40e4bdb3',
  '10622dde-dd02-464f-a6e1-d98cb25cde83',
  '7acdcebd-7d83-44b5-8080-d048d8fdb104',
  '07859b5d-5d04-4a1b-ba87-c5f51374546d',
  'ba646d2d-9122-4909-ae02-8a67739a0172',
  '98a46392-8d8b-435d-b81b-2689bebf2f94',
  '886b710b-63c1-4d99-af52-1809766ec0d4',
  '2976a45a-7b7c-460f-860f-c800b629ec45',
  '11c038f8-b9c7-4962-ae14-15dc694e6283',
  '3c54f570-4991-4a21-8e4e-f0c946c914c0',
  '490f499a-343d-4100-aaad-69fd6d707b08',
  'b18d427d-cc6d-4bba-a7d7-f94aee3eeacd'
)
ORDER BY te.transaction_id, te.is_active DESC, te.created_at;
ROLLBACK;
```

### Query 4 — pair 5 inside the Uriel certification line

Read-only check owned by JJ Evidence. The 2026-10-03 note stored only the 8-hex prefixes `ad2ba8fd` and `e55e4b35`. Do not invent the other bytes. Migration `20260919160000_client_settlement_certifications.sql` defines `finance.client_settlement_certifications` and `finance.client_settlement_certification_lines`. Lines have `property_name`, `component_code`, `amount_due_to_jj`, `evidence_ref`, and `metadata`. They have no transaction-id column. `str_credit` and `opening_property_obligation` are not column names in that migration; they are expected as `component_code` values or inside `metadata`. If a later migration renamed the tables, use the live name and do not write.

```sql
BEGIN READ ONLY;
SELECT id, entity_id, as_of, status, total_due_to_jj, evidence_ref
FROM finance.client_settlement_certifications
WHERE id::text LIKE 'ad2ba8fd-%';

SELECT id, certification_id, line_order, property_name, component_code,
       amount_due_to_jj, evidence_ref, metadata
FROM finance.client_settlement_certification_lines
WHERE id::text LIKE 'e55e4b35-%'
   OR certification_id::text LIKE 'ad2ba8fd-%'
   OR metadata::text LIKE '%10622dde%'
   OR evidence_ref LIKE '%10622dde%';
ROLLBACK;
```

Do not add 1,900.52 on top of the line until this result shows whether `10622dde` is already inside `str_credit` 6,983.10.

## Open questions

1. Names and live `net_jj_settlement` of the other 10 contacts. Delta was stated as 0 on 2026-10-03. Balances were not stored. Query 1.
2. `deleted_at`, `deleted_by`, and `review_status` on each of the 15. Query 2.
3. `transaction_exclusions.id` for the five pair side-A rows, and confirmation that the 10 Group 1 rows have no active exclusion. Query 3.
4. Which Group 1 id belongs to Liron, Ofri (two ids), Tom, and Yogev, and the split of Ofri's +245.74. Query 2.
5. Pair 3 date and subcategory on `82c8ee31`. The held amount −3,404.03 is captured. The Platform Income label is from the rule book, not from this read.
6. Pair 5: is 1,900.52 inside `str_credit` 6,983.10 on line `e55e4b35`? If yes, a certification consumer must not add the view row on top. Query 4. Full uuids are not in git.
7. Group 1 restore was recorded and the write was not approved. This note leaves Group 1 out of the approved view. That is a decision still in front of Yossi, separate from pairs 1, 2, 4, and 5.
8. Side B transaction ids for pairs 1, 2, and 4 are not in the planning capture. Pair 3 side B is `e4a8a01c`. Pair 5 side B is `9a5fdde0`. Both were already excluded as `confirmed_duplicate`.

Do not merge. Do not apply. Do not deploy.
