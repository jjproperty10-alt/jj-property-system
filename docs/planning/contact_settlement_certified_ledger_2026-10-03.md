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

## Per-pair treatment (planning only; added 2026-10-03 14:30 Bucharest)

The live view counts side A of pairs 1, 2, 4 and 5 once, because it ignores
`is_deleted` and exclusions. This draft counts neither side, because the
certified ledger excludes soft-deleted and actively excluded rows. Yossi's
planning decision is to count side A once. **So this draft, on its own, would
remove those amounts from the owners' balances.** The counting code is
deliberately NOT changed here. The rows return only through a separately
approved un-delete and exclusion plan. Until then, the draft must not be
applied on its own without that plan, or without Yossi explicitly accepting
the gap below.

`net_jj_settlement`, EUR. Positive = owner owes JJ, negative = JJ owes owner
(view convention). Each delta is the effect of dropping that row alone.

| Pair | Row (side A) | Owner | Row | Live (counts A once) | Draft (counts neither) | Delta for owner | Owner-level certification covering it? | Planned treatment |
|---|---|---|---|---:|---:|---:|---|---|
| 1 | cfb1b60c-90f9-47c1-930f-6c7737ccf448 | Ofri | Platform Income 3,917.49 (30.05.2026, 1/3/26-31/5/26) | counted | dropped | +3,917.49 | None | Count once after an approved un-delete plus exclusion deactivation (DS-016) |
| 2 | 20eaeb18-a457-4740-acb2-0fe446a01460 | Ofri | Bank Payment to Owner 3,322.37 (04.06.2026) | counted | dropped | −3,322.37 | None | Count once after an approved un-delete plus exclusion deactivation (DS-008; bank-sourced, not Hostaway) |
| 4 | dc3d60fb-f3a3-4ca6-9fc4-46ef40e4bdb3 | Tom | Platform Income 1,553.96 (31.05.2026, 10/2/26-31/5/26) | counted | dropped | +1,553.96 | None | Count once after an approved un-delete plus exclusion deactivation (STR recon 15.08) |
| 5 | 10622dde-dd02-464f-a6e1-d98cb25cde83 | Uriel | Platform Income 1,900.52 (30.05.2026, 1.1.26-31.5.26) | counted | dropped | +1,900.52 | **Likely yes**: certification ad2ba8fd, line e55e4b35 (Uriel Duplex, opening_property_obligation 16,555.43, str_credit 6,983.10) | **Do NOT add on top of the certification.** First prove whether 1,900.52 sits inside str_credit 6,983.10. If it does, a cert-based consumer counts it through the cert only, and the view row is a duplicate. |

Owner totals for the pair rows alone:
- Ofri: +595.12 (+3,917.49 − 3,322.37).
- Tom: +1,553.96.
- Uriel: +1,900.52 (subject to the certification check above).

Full before/after per contact, including Group 1, is in the table above.

Open checks, not done in this draft:
- Pair 5: rebuild str_credit 6,983.10 for Uriel Duplex from its source rows, and confirm or deny that 10622dde is one of them. This is read-only, and JJ Evidence owns it. ("Likely" comes from JJ Evidence, 03.10 14:21. It has not been re-verified here.)
- Pairs 1, 2, 4: no client settlement certification line covers them, so the view is their only route into the owner balance.
- No restore, no exclusion change, no data write. Each needs separate approval from Yossi.
