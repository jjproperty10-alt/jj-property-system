# Per-owner impact — `v_contact_settlement` draft 20261003120000

Draft only. Not applied. No data, flags, exclusions, or counting code change.
This note is for JJ Manager before any apply. It does not authorise a restore.

## Sign convention

**Positive = the owner owes JJ. Negative = JJ owes the owner.** This is the view logic.

`v_contact_settlement_summary.net_jj_settlement` = Σ `settlement_amount` where `settlement_effect = 'INCREASES'` − Σ `settlement_amount` where `settlement_effect = 'REDUCES'`. `DEAL_ONLY` and `NO_EFFECT` count as 0.

- `INCREASES` is money the JJ side (Yossi, Jacob, JJ, Anastasia) paid out for or to the owner: Bank Payment to Owner, Management Fee (non-Airbnb), Client Sale Expenses / Sale Tax, purchase capital, and operational expenses paid by the JJ side on a mapped property.
- `REDUCES` is money the JJ side took in for the owner: Platform Income, Rent, Tenant Payment, Staff Accommodation Rent, and Client/Owner → JJ payments.

Neither view has a `COMMENT`. The reading is the CASE classes in the captured view. Delta below = draft − live.

## Source

Read-only Production `vsiiprzjrstjcmjpwcrd`, 2026-10-03 about 18:00 Bucharest. Every call was a single `SELECT`. Nothing was created, applied, or written.

Live definitions at that read: `v_contact_settlement` md5 `84b5a9448d4b8547b361602406bcf7e6`, `v_contact_settlement_summary` md5 `edd2b35127b5299e4f6b66c62abac7b7`. Both match the pre-check in migration `20261003120000`. `v_certified_ledger_transactions` md5 `cad81fb0b8d50474f9b14825b9861b43`.

**Current / live** = `v_contact_settlement_summary` as it stands (the view `main` still has; this draft is not applied).

**Draft** = the body of migration `20261003120000`, summed with the same `net_jj_settlement` CASE over `v_certified_ledger_transactions`.

## (a) Every contact

Row counts are in brackets. The six changed contacts match the earlier six-contact table to the cent. The draft adds no contact and loses none.

| Contact | Contact id | Live `net_jj_settlement` | Draft | Delta | Rows dropped |
|---|---|---:|---:|---:|---:|
| Efi | `51a3d8a9-ab9f-400c-b7a9-39b4aa907607` | 8,059.88 (25) | 8,059.88 (25) | 0.00 | 0 |
| Ilan & Ilana | `9d86fcb4-d842-45b0-930b-6d268e6b3c1a` | −14,183.86 (60) | −14,183.86 (60) | 0.00 | 0 |
| Liora | `3974a458-ac4d-4c88-94bb-a90a4ccc3057` | 4,165.00 (49) | 4,165.00 (49) | 0.00 | 0 |
| Liron and Alon | `a990d491-8f37-4390-856e-23292917431c` | −46,915.74 (84) | −47,365.74 (83) | −450.00 | 1 |
| Miranta | `14658b78-4ec8-4afc-ac42-85f59cf4442c` | 90.00 (4) | 90.00 (4) | 0.00 | 0 |
| Ofri | `7109719a-4a14-432b-803a-f17317c79ab5` | −6,074.15 (132) | −5,724.77 (128) | +349.38 | 4 |
| Oren | `7c82adce-afa6-4bdf-9715-f463024f396a` | −91,251.81 (100) | −91,251.81 (100) | 0.00 | 0 |
| Orit Rob | `f5e9d870-ae36-43c7-b275-0a8288b5ef92` | 1,933.09 (27) | 1,933.09 (27) | 0.00 | 0 |
| Oshrit | `cb013068-6fe5-4f64-903d-9f38f638dfb0` | −4,620.00 (20) | −4,620.00 (20) | 0.00 | 0 |
| Roni | `a2e4523a-c48c-4dd7-9f79-f8edf81c2e2d` | −40,609.11 (61) | −40,609.11 (61) | 0.00 | 0 |
| Sharon | `d42c8780-6256-406f-b5a6-6d4324fe5873` | −14,753.85 (47) | −14,753.85 (47) | 0.00 | 0 |
| Tamir | `8cc76506-12b8-4883-9378-92f7ba7b5df9` | −97,015.66 (338) | −92,298.59 (333) | +4,717.07 | 5 |
| Tom | `7c126565-62f4-4dde-a15a-f6eb971d38eb` | −65,323.88 (125) | −63,808.26 (123) | +1,515.62 | 2 |
| Uriel | `3997b50d-63af-4c6c-bdce-e5060ecfb48a` | −126,931.23 (293) | −123,230.71 (291) | +3,700.52 | 2 |
| Vard | `0a22ccfe-44d6-4492-ad02-e6577f406124` | −500.00 (1) | −500.00 (1) | 0.00 | 0 |
| Yogev | `4b5f6044-1b32-4d8a-99a3-12f5c32ae341` | −54,130.83 (34) | −54,261.97 (33) | −131.14 | 1 |
| **All 16** | | **−548,062.15 (1,400)** | **−538,360.70 (1,385)** | **+9,701.45** | **15** |

The six-contact subtotal remains −396,391.49 live and −386,690.04 draft. The other ten contribute 0 to the delta. 1,400 − 1,385 = 15.

## (b) The 15 removed rows

Found as rows in the live view that are not in `v_certified_ledger_transactions`. All 15 are `property_mapped`. None come from `settlement_allocation`. Each has `is_deleted = true` and `review_status = 'active'` (none is NULL). **None is removed for `review_status`.**

Contribution = the row's effect on live `net_jj_settlement`. The draft removes it, so the owner's delta from that row is −1 × contribution.

`deleted_at` is `timestamp without time zone`, stored in UTC. Bucharest (UTC+3) is in brackets.

### Pair side A — two reasons: soft-deleted and an active exclusion

Each side-A row has exactly one exclusion row, and it is active. `source_batch` is the Group D or Group E audit named in `deleted_by`.

| Pair | Transaction | Contact | Date | Property | Type | Payer → payee | amount_eur | Effect | Contribution | deleted_at UTC (Bucharest) | deleted_by | Exclusion id |
|---|---|---|---|---|---|---|---:|---|---:|---|---|---|
| 1 | `cfb1b60c-90f9-47c1-930f-6c7737ccf448` | Ofri | 2026-05-30 | Ofri Makarios 5 Floor | Airbnb / Platform Income | Airbnb → JJ | 3,917.49 | REDUCES | −3,917.49 | 2026-06-30 19:37:12 (22:37:12) | Yossi — Group E audit 2026-06-30 | `2ac4628c-0266-43a1-8ba2-d3b344235b5d` |
| 2 | `20eaeb18-a457-4740-acb2-0fe446a01460` | Ofri | 2026-06-04 | Ofri Makarios 5 Floor | Airbnb / Bank Payment to Owner | JJ → Owner | 3,322.37 | INCREASES | +3,322.37 | 2026-06-30 18:52:32 (21:52:32) | Yossi — Group D audit 2026-06-30 | `8fed47b4-2042-4abf-960b-b7c59063dd50` |
| 3 (held) | `82c8ee31-3667-4c7e-893f-c0d7a6acb70b` | Tamir | 2026-04-30 | Tamir Dekelia | Airbnb / Platform Income ("1/1/26-30/4/26") | Airbnb → JJ | 3,404.03 | REDUCES | −3,404.03 | 2026-06-30 19:37:12 (22:37:12) | Yossi — Group E audit 2026-06-30 | `f65b209a-fb37-4ff4-9c48-8244df30962a` |
| 4 | `dc3d60fb-f3a3-4ca6-9fc4-46ef40e4bdb3` | Tom | 2026-05-31 | Tom Dekelia | Airbnb / Platform Income | Airbnb → JJ | 1,553.96 | REDUCES | −1,553.96 | 2026-06-30 19:37:12 (22:37:12) | Yossi — Group E audit 2026-06-30 | `37e4ba00-27a3-4f72-93ad-6673fb44a97c` |
| 5 | `10622dde-dd02-464f-a6e1-d98cb25cde83` | Uriel | 2026-05-30 | Uriel Duplex | Airbnb / Platform Income ("1.1.26-31.5.26") | Airbnb → JJ | 1,900.52 | REDUCES | −1,900.52 | 2026-06-30 19:37:12 (22:37:12) | Yossi — Group E audit 2026-06-30 | `7947c710-f117-4e62-ab2e-7f2ade1e3d32` |

Pair 3 `client_charge` is also 3,404.03. The other four pair rows have no `client_charge`. Side B ids: pair 1 `eb5256c8-112d-47ec-ab7f-c1c8df36839e`, pair 2 `49a6d8b5-4987-488f-869d-1a1aedb38f2b`, pair 3 `e4a8a01c-b8aa-4ef9-81ee-7401b5d9a18b`, pair 4 `6a24ba8c-b63c-4476-9f1d-2760311872b7`, pair 5 `9a5fdde0-1591-474c-9c6c-09b2078508b4`.

### Group 1 batch `2509d3ad` — soft-deleted only

All 10 rows: `deleted_at` 2026-07-11 19:12:09.61282 UTC (22:12:09 Bucharest), `deleted_by` = `yossi (rollback pending manual review, via Cowork)`, `review_status` = `active`. Notes: "Imported from historical Cash_flow.xlsx — Sheet1 row N". **None has a row in `transaction_exclusions`**, active or inactive. One reason only: soft-deleted.

| Transaction | Contact | Date | Property | Type | Payer → payee | amount_eur | Effect | Contribution | Sheet1 row |
|---|---|---|---|---|---|---:|---|---:|---:|
| `7acdcebd-7d83-44b5-8080-d048d8fdb104` | Liron and Alon | 2026-06-15 | Liron and Alon | Management / Property insurance | Anastasia → company | 450.00 | INCREASES | +450.00 | 377 |
| `886b710b-63c1-4d99-af52-1809766ec0d4` | Ofri | 2026-06-20 | Ofri makarios | Airbnb / Electricity bill | Anastasia → company | 56.27 | INCREASES | +56.27 | 393 |
| `3c54f570-4991-4a21-8e4e-f0c946c914c0` | Ofri | 2026-06-25 | Ofri makarios | Airbnb / Water bill | Anastasia → company | 189.47 | INCREASES | +189.47 | 399 |
| `07859b5d-5d04-4a1b-ba87-c5f51374546d` | Tamir | 2026-06-16 | Tamir Kiti 2 | Management / Tenant Payment | tenant → Anastasia | 1,600.00 | REDUCES | −1,600.00 | 381 |
| `2976a45a-7b7c-460f-860f-c800b629ec45` | Tamir | 2026-06-20 | Tamir Kiti | Management / Electricity bill | Anastasia → company | 117.36 | INCREASES | +117.36 | 394 |
| `98a46392-8d8b-435d-b81b-2689bebf2f94` | Tamir | 2026-06-20 | Tamir Dekelia | Airbnb / Electricity bill | Anastasia → company | 92.79 | INCREASES | +92.79 | 389 |
| `490f499a-343d-4100-aaad-69fd6d707b08` | Tamir | 2026-06-25 | Tamir Kiti | Management / Water bill | Anastasia → company | 76.81 | INCREASES | +76.81 | 401 |
| `b18d427d-cc6d-4bba-a7d7-f94aee3eeacd` | Tom | 2026-06-25 | Tom Dekelia | Airbnb / Water bill | Anastasia → company | 38.34 | INCREASES | +38.34 | 405 |
| `ba646d2d-9122-4909-ae02-8a67739a0172` | Uriel | 2026-06-16 | Uriel Kamares | Management / Tenant Payment | tenant → Anastasia | 1,800.00 | REDUCES | −1,800.00 | 383 |
| `11c038f8-b9c7-4962-ae14-15dc694e6283` | Yogev | 2026-06-20 | Yogev Port | Airbnb / Electricity bill | Anastasia → company | 131.14 | INCREASES | +131.14 | 396 |

Group 1 by contact: Liron +450.00. Ofri +245.74 (56.27 + 189.47). Tamir −1,313.04 (−1,600.00 + 117.36 + 92.79 + 76.81). Tom +38.34. Uriel −1,800.00. Yogev +131.14. Net −2,247.82: income −3,400.00, expenses +1,152.18.

`07859b5d` `deleted_by` on Production is `yossi (rollback pending manual review, via Cowork)`. The local fixture `supabase/tests/20260917224500_tamir_kiti_september/fixtures.sql` says `dedupe`. That fixture value is wrong for Production. The date 2026-06-16 and `deleted_at` 2026-07-11 19:12:09 UTC do match.

### Finding (i) — draft view and the Uriel Kamares certification disagree by 1,800

Certification `ad2ba8fd-d3b1-4877-8cbf-38770aa1c8bf`, line `c28551e0-cf07-44b3-aec9-22f2e1206e93` (Uriel Kamares, −7,343.22) **counts Group 1 row `ba646d2d` (1,800.00) as received.** Its metadata has `additional_receipt_id = ba646d2d-…`, `source_row_is_deleted = true`, and `soft_delete_is_not_non_receipt = true`, from Yossi's 2026-09-23 decision that a soft-delete is not a non-receipt. The draft view drops `ba646d2d` because Group 1 stays out of the certified ledger. For that 1,800.00 the draft view and the certification disagree.

### Finding (ii) — side B is out only by `review_status`

| Pair | Side B | Property (as stored) | Date | Payer → payee | Amount | is_deleted | review_status | Exclusion |
|---|---|---|---|---|---:|---|---|---|
| 1 | `eb5256c8-112d-47ec-ab7f-c1c8df36839e` | Ofri makarios 5 Floor | 2026-05-30 | Airbnb → JJ | 3,917.49 | false | confirmed_duplicate | `9aeacc51-3167-413a-9d70-3c796ad2e29f`, **inactive**, `dedup_2026_06_29` |
| 2 | `49a6d8b5-4987-488f-869d-1a1aedb38f2b` | Ofri makarios | 2026-06-04 | JJ → Owner | 3,322.37 | false | confirmed_duplicate | none |
| 3 | `e4a8a01c-b8aa-4ef9-81ee-7401b5d9a18b` | Tamir dekelia | 2026-04-30 | JJ → JJ | 3,404.03 | false | confirmed_duplicate | `af56e16f-bedc-41b1-8b0c-fd120d03c5c7`, **inactive**, `dedup_2026_06_29` |
| 4 | `6a24ba8c-b63c-4476-9f1d-2760311872b7` | Tom dekelia | 2026-05-31 | Airbnb → JJ | 1,553.96 | false | confirmed_duplicate | `b180c7b1-8f64-4758-aa65-d970abdec1be`, **inactive**, `dedup_2026_06_29` |
| 5 | `9a5fdde0-1591-474c-9c6c-09b2078508b4` | Uriel Duplex | 2026-05-30 | Airbnb → JJ | 1,900.52 | false | confirmed_duplicate | `e51320fb-8907-4f76-bbe0-bb17307955e3`, **inactive**, `dedup_2026_06_29` |

Side B is excluded **only** by `review_status = 'confirmed_duplicate'`. The 2026-06-29 dedup exclusions are inactive. Pair 2's side B never had an exclusion row. Both the live view and the certified ledger omit side B today. A later write that sets side B back to `active` or NULL would admit it again, with no active exclusion to stop it.

## (c) Pairs 1–5 against the approved treatment

Approved, and **not** implemented by migration `20261003120000`: restore side A of pairs **1, 2, 4, and 5** and count each once. Pair **3** (Tamir Dekelia, `82c8ee31`, Platform Income 3,404.03 on 2026-04-30) is **held** and stays out. Group 1 stays out of this view: a restore was recorded earlier and the write was not approved. Finding (i) is the place the certification already counts one of those Group 1 rows.

The draft today counts **neither** side of every pair. Side B stays out either way, and only because of `confirmed_duplicate`.

| Pair | Approved | What the draft does today |
|---|---|---|
| 1 Ofri `cfb1b60c` 3,917.49 REDUCES | count side A once | drops it |
| 2 Ofri `20eaeb18` 3,322.37 INCREASES | count side A once | drops it |
| 3 Tamir `82c8ee31` 3,404.03 REDUCES | held, do not count | drops it; matches the hold |
| 4 Tom `dc3d60fb` 1,553.96 REDUCES | count side A once | drops it |
| 5 Uriel `10622dde` 1,900.52 REDUCES | count side A once in the view | drops it |

**Pair 5 is not determinable from the database.** Certification `ad2ba8fd-d3b1-4877-8cbf-38770aa1c8bf` (applied, as_of 2026-08-31, total_due_to_jj 117,901.54) line `e55e4b35-507b-4b62-ac25-7012fc74b263` is Uriel Duplex `opening_property_obligation` 16,555.43, with metadata `str_credit` 6,983.10. That line stores no source transaction id. A text search did not find `10622dde`, `9a5fdde0`, or `1900.52` outside `transaction_exclusions`. `6983.1` appears only on that line, its v2 predecessor `6cbafde3-ebc2-4026-afe0-d3fb15b77201`, and their audit rows. **The rule stands: do not add 1,900.52 on top of `ad2ba8fd` until JJ Evidence verifies it.**

Approved view = draft, plus side A of pairs 1, 2, 4, and 5 counted once, pair 3 still out, Group 1 still out. Unchanged contacts stay at the live figure.

| Contact | Live | Draft today | Approved view | Approved − live |
|---|---:|---:|---:|---:|
| Liron and Alon | −46,915.74 | −47,365.74 | −47,365.74 | −450.00 |
| Ofri | −6,074.15 | −5,724.77 | −6,319.89 | −245.74 |
| Tamir | −97,015.66 | −92,298.59 | −92,298.59 | +4,717.07 |
| Tom | −65,323.88 | −63,808.26 | −65,362.22 | −38.34 |
| Uriel | −126,931.23 | −123,230.71 | −125,131.23 | +1,800.00 |
| Yogev | −54,130.83 | −54,261.97 | −54,261.97 | −131.14 |
| Other 10 | see (a) | same as live | same as live | 0.00 |

Ofri approved: −5,724.77 + (−595.12) = −6,319.89. Tom: −63,808.26 + (−1,553.96) = −65,362.22. Uriel: −123,230.71 + (−1,900.52) = −125,131.23. That Uriel view figure counts pair 5 once inside the view. It still omits Group 1 `ba646d2d` (1,800), which certification line `c28551e0` already counts as received. It does not answer whether 1,900.52 is already inside `str_credit` 6,983.10.

## (d) Reconciliation

| | EUR |
|---|---:|
| Live, all 16 contacts | −548,062.15 |
| Draft, all 16 contacts | −538,360.70 |
| Σ deltas (draft − live) | +9,701.45 |
| Σ contributions of the 15 removed rows | −9,701.45 |
| Σ deltas + Σ contributions | 0.00 |

By bucket: pairs 1, 2, 4, 5 side A −4,049.60 (−3,917.49 + 3,322.37 − 1,553.96 − 1,900.52). Pair 3 −3,404.03. Group 1 −2,247.82. Total −9,701.45.

−548,062.15 − (−9,701.45) = −538,360.70.

| Contact | Σ removed contributions | Delta |
|---|---:|---:|
| Liron and Alon | +450.00 | −450.00 |
| Ofri | −3,917.49 + 3,322.37 + 56.27 + 189.47 = −349.38 | +349.38 |
| Tamir | −3,404.03 − 1,600.00 + 117.36 + 92.79 + 76.81 = −4,717.07 | +4,717.07 |
| Tom | −1,553.96 + 38.34 = −1,515.62 | +1,515.62 |
| Uriel | −1,900.52 − 1,800.00 = −3,700.52 | +3,700.52 |
| Yogev | +131.14 | −131.14 |
| Other 10 | 0 | 0.00 |
| **Total** | **−9,701.45** | **+9,701.45** |

## Still open

1. Pair 5: whether 1,900.52 sits inside `str_credit` 6,983.10 on line `e55e4b35`. Not determinable from the database. JJ Evidence still has to verify it. Until then, do not add 1,900.52 on top of certification `ad2ba8fd`.
2. Group 1 write is still not approved. The draft leaves all ten rows out. Certification line `c28551e0` already treats Uriel `ba646d2d` (1,800) as received, so those two consumers disagree by 1,800 until Yossi decides.
3. Side B returns if its `review_status` is set back to `active` or NULL. The old exclusions will not stop it: four are inactive, and pair 2 never had one.

Do not merge. Do not apply. Do not deploy.
