# v_contact_settlement on the certified ledger — draft 20261003120000

Draft only. Not applied. No data, rows, flags, or exclusions change. Apply,
merge, and any data restore each need their own explicit approval from Yossi.

## What changes

`public.v_contact_settlement` reads `public.v_certified_ledger_transactions`
(migration `20260917090000`) in both branches instead of `public.transactions`
filtered by `review_status`. The live view counted 15 rows the certified
ledger rejects: all soft-deleted, 5 of them also with an active
`transaction_exclusions` row. `public.v_contact_settlement_summary` is not
recreated; it reads only `v_contact_settlement` and inherits the fix.

Captured Production definitions (read-only, 2026-10-03, PostgreSQL 17.6):
`v_contact_settlement` md5 `84b5a9448d4b8547b361602406bcf7e6`,
`v_contact_settlement_summary` md5 `edd2b35127b5299e4f6b66c62abac7b7`. Owner
`postgres`, reloptions NULL, ACL `postgres` + `service_role` only. The migration
aborts unless the live definition matches that md5, and checks after the
replace that owner, ACL, options, columns, and the summary are unchanged.
New definition md5 `3376f921ff58cfbdc2406bdb17fc2fd0`.

## Why planned inputs are not in the view

The twin-pair side-A rows (pairs 1, 2, 4, 5) and the Group 1 rows are
soft-deleted, and the pair rows also have an active exclusion. An allowlist
inside the view would make it disagree with the certified ledger and would
keep counting those rows after any later decision. The view stays "certified
rows only". The planned impact is reported separately by the read-only
`contact_settlement_planned_inputs_2026-10-03.sql`. The rows enter the view on
their own once a separately approved data change certifies them. No restore
and no flag change is part of this draft.

Planned-input sources:
- Pairs 1, 2, 4 side A: cfb1b60c, 20eaeb18, dc3d60fb. Yossi 03.10 12:56; DS-016, DS-008, STR recon 15.08.
- Pair 5 side A: 10622dde counted once, twin 9a5fdde0 excluded. Yossi 03.10 13:18 by ID.
- Group 1 batch 2509d3ad, 10 rows. Restore decision recorded; write not approved.
- Pair 3 (Tamir 82c8ee31 / e4a8a01c, 3,404.03): UNKNOWN, never counted.

## Before / after (read-only, Production, 2026-10-03)

`net_jj_settlement`, EUR. Positive = owner owes JJ, negative = JJ owes owner
(view convention). Only the 6 affected contacts; the other 10 are unchanged.

| Contact | Current (live) | Proposed (certified) | Pairs 1,2,4,5 side A | Group 1 (2509d3ad) | Proposed + planned | Pair 3 (unknown, not counted) |
|---|---:|---:|---:|---:|---:|---:|
| Liron and Alon | −46,915.74 (84) | −47,365.74 (83) | 0 | +450.00 | −46,915.74 | 0 |
| Ofri | −6,074.15 (132) | −5,724.77 (128) | −595.12 | +245.74 | −6,074.15 | 0 |
| Tamir | −97,015.66 (338) | −92,298.59 (333) | 0 | −1,313.04 | −93,611.63 | −3,404.03 |
| Tom | −65,323.88 (125) | −63,808.26 (123) | −1,553.96 | +38.34 | −65,323.88 | 0 |
| Uriel | −126,931.23 (293) | −123,230.71 (291) | −1,900.52 | −1,800.00 | −126,931.23 | 0 |
| Yogev | −54,130.83 (34) | −54,261.97 (33) | 0 | +131.14 | −54,130.83 | 0 |
| **Total (6)** | **−396,391.49** | **−386,690.04** | **−4,049.60** | **−2,247.82** | **−392,987.46** | **−3,404.03** |

Row counts in brackets. Pairs: cfb1b60c Ofri PI 3,917.49 (REDUCES), 20eaeb18
Ofri bank payment to owner 3,322.37 (INCREASES), dc3d60fb Tom PI 1,553.96
(REDUCES), 10622dde Uriel PI 1,900.52 (REDUCES). Group 1 = income 3,400
(REDUCES) and expenses 1,152.18 (INCREASES) across 5 contacts.

The live view already counts every one of these rows, because it ignores
`is_deleted` and exclusions: current = proposed + planned + pair 3, exactly,
for every contact. So the only contact whose planned total differs from
today's live figure is Tamir (+3,404.03, the unknown pair 3 row).

The 15 rows dropped by the fix: 10 Group 1 rows, side A of pairs 1, 2, 4, 5,
and side A of pair 3 (82c8ee31). Side B of every pair is `confirmed_duplicate`
and was already excluded.
