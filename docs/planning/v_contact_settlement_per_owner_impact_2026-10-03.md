# Per-owner impact — `v_contact_settlement` draft 20261003120000

Draft only. Not applied. No data, flags, exclusions, or counting code change.
This note is for JJ Manager before any apply. It does not authorise a restore.

## Sign convention

Two signs. They are opposites. Every amount below names which one it is.

**View sign** (`v_contact_settlement` / `net_jj_settlement`): positive = the owner owes JJ. Negative = JJ owes the owner. This is the stored view. This draft does not flip it.

**Display sign** (approved rule): positive = JJ owes the owner. Negative = the owner owes JJ. Display amount = −(view amount). Screens use `mapContactSettlementToDisplay` in `src/lib/owners/contactSettlementDisplay.ts`. The Hebrew sentence is `JJ חייבת ל-{owner}` when JJ owes, `{owner} חייב/חייבת ל-JJ` when the owner owes, and `היתרה אפס` at zero.

This total is `net_jj_settlement`.

`net_jj_settlement` = Σ `settlement_amount` where `settlement_effect = 'INCREASES'` − Σ `settlement_amount` where `settlement_effect = 'REDUCES'`. `DEAL_ONLY` and `NO_EFFECT` count as 0.

- `INCREASES` is money the JJ side (Yossi, Jacob, JJ, Anastasia) paid out for or to the owner: Bank Payment to Owner, Management Fee (non-Airbnb), Client Sale Expenses / Sale Tax, purchase capital, and operational expenses paid by the JJ side on a mapped property.
- `REDUCES` is money the JJ side took in for the owner: Platform Income, Rent, Tenant Payment, Staff Accommodation Rent, and Client/Owner → JJ payments.

The view also classifies Sale and Purchase rows. `Purchase Contract`, `Sale Contract`, and `Renovation Contract` are `NO_EFFECT`, and the view's filter drops `NO_EFFECT`, so those contract rows are not in the output. Rows that are in the output include purchase capital (`category = Purchase`, subcategory other than `Purchase Contract`, payer not Client/Owner; amount `COALESCE(client_charge, amount_eur)`) and `Client Sale Expenses` / `Sale Tax`. The repo does not list those production rows or their amounts. Read-only:

```sql
SELECT contact_name, property_name, transaction_id, date, category, subcategory,
       payer, payee, amount_eur, client_charge, settlement_class, settlement_effect,
       settlement_amount
FROM public.v_contact_settlement
WHERE category IN ('Sale', 'Purchase')
   OR subcategory IN ('Client Sale Expenses', 'Sale Tax')
ORDER BY contact_name, date, transaction_id;
```

Neither view has a `COMMENT`. The reading is the CASE classes in the captured view. Delta below = draft − live, in the view sign.

## Source

Read-only Production `vsiiprzjrstjcmjpwcrd`, 2026-10-03 about 18:00 Bucharest. Every call was a single `SELECT`. Nothing was created, applied, or written.

Live definitions at that read: `v_contact_settlement` md5 `84b5a9448d4b8547b361602406bcf7e6`, `v_contact_settlement_summary` md5 `edd2b35127b5299e4f6b66c62abac7b7`. Both match the pre-check in migration `20261003120000`. `v_certified_ledger_transactions` md5 `cad81fb0b8d50474f9b14825b9861b43`.

**Current / live** = `v_contact_settlement_summary` as it stands (the view `main` still has; this draft is not applied).

**Draft SQL** = migration `20261003120000` as written. It reads `public.v_canonical_transaction_inclusion`. That view applies the certified predicate, plus any future `finance.canonical_inclusion_decisions` row. This draft does not create that table and inserts no decision row, so the draft SQL figures equal the certified predicate.

**Confirmed plan** = those draft figures, plus decision rows for pair 1 side A `cfb1b60c`, pair 2 side A `20eaeb18`, pair 4 side A `dc3d60fb`, and Uriel `ba646d2d` (1,800). The ids are not in the view. Choosing the canonical id does not by itself add the amount. Pair 5 side A `10622dde` is the canonical id and is held pending proof, so its 1,900.52 is not in the confirmed balance. Pair 3 stays held. Side B stays out. The 975 Kamares tenant payment of 2026-08-13 is not an include row.

**Read** for every total in this note: 2026-10-03 18:00 Europe/Bucharest (the read recorded as about 18:00). **All 16** means Efi, Ilan & Ilana, Liora, Liron and Alon, Miranta, Ofri, Oren, Orit Rob, Oshrit, Roni, Sharon, Tamir, Tom, Uriel, Vard, Yogev. **Total (6)** means Liron and Alon, Ofri, Tamir, Tom, Uriel, Yogev.

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

Scope of the All 16 total: the 16 names listed under Source, read 2026-10-03 18:00 Europe/Bucharest. View sign. Display sign of the same totals is +548,062.15 live and +538,360.70 draft (JJ owes the owners, in aggregate).

**Total (6)** — Liron and Alon, Ofri, Tamir, Tom, Uriel, Yogev; same read; view sign — is −396,391.49 live and −386,690.04 draft. Display sign of that Total (6) is +396,391.49 live and +386,690.04 draft. The other ten contribute 0 to the draft-minus-live delta. 1,400 − 1,385 = 15.

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

### Finding (i) — Uriel Kamares 1,800 is a documented inclusion

Certification `ad2ba8fd-d3b1-4877-8cbf-38770aa1c8bf` (cert v3), line `c28551e0-cf07-44b3-aec9-22f2e1206e93` (Uriel Kamares, −7,343.22) counts `ba646d2d-9122-4909-ae02-8a67739a0172` (1,800.00, 2026-06-16) as received. JJ Evidence passed: that id is the line's `additional_receipt_id`. Yossi's 2026-09-23 decision stands and is not reopened: it is an extra rent receipt, and a soft-delete is not evidence of non-receipt.

The confirmed plan counts it **once**, through the shared mechanism, as a future append-only decision row. The view does not contain the id. Evidence ref: `uriel-kamares-1800-additional-receipt-yossi-2026-09-23`. The row stays `is_deleted = true`. No exclusion flag is cleared. The other nine Group 1 rows stay out. `src/lib/ledger/certifiedLedger.ts` still rejects a soft-deleted row that has no documented inclusion; the test passes this id in the documented-inclusion set and expects it once.

### The 975 Kamares tenant payment is not included

Report only. The active 975 tenant payment of 2026-08-13 is not a decision row in this plan.

Repo evidence for the certification's scope: `finance.client_settlement_certifications` has `as_of date` and no period columns (`supabase/migrations/20260919160000_client_settlement_certifications.sql`). The 2026-10-03 read recorded `ad2ba8fd` as applied, `as_of` 2026-08-31, `total_due_to_jj` 117,901.54. This task calls that certification v3; the same note calls `6cbafde3` the v2 predecessor of its Duplex line. A reader period, when the report type is `period_account`, must end on that `as_of` (`composeCertifiedAccount.ts`). The header itself is not a period.

2026-08-13 is on or before 2026-08-31, so the payment date is inside the `as_of` cutoff. `inForce` keeps a row dated on or before `as_of` when the row is active and not deleted (`composeCertifiedAccount.ts`). That is the date window. It does not mean a certification line cites the payment.

A repo text search does not find a 975 Kamares tenant payment, and it does not find that amount on a line of `ad2ba8fd`. The only additional receipt named on the Kamares line is `ba646d2d`. Whether any line metadata cites the 975 payment is not in the repo. This draft does not query Production. The read-only check is:

```sql
SELECT id, as_of, certification_type, status, version, total_due_to_jj
FROM finance.client_settlement_certifications
WHERE id = 'ad2ba8fd-d3b1-4877-8cbf-38770aa1c8bf';

SELECT id, date, property_name, category, subcategory, payer, payee,
       amount_eur, is_deleted, review_status
FROM public.transactions
WHERE property_name = 'Uriel Kamares'
  AND date = DATE '2026-08-13'
  AND amount_eur = 975
  AND subcategory = 'Tenant Payment';

SELECT l.id, l.property_name, l.component_code, l.amount_due_to_jj, l.metadata
FROM finance.client_settlement_certification_lines l
WHERE l.certification_id = 'ad2ba8fd-d3b1-4877-8cbf-38770aa1c8bf'
  AND (
    l.metadata::text ILIKE '%975%'
    OR l.amount_due_to_jj IN (975, -975)
    OR l.metadata::text ILIKE '%2026-08-13%'
    OR l.metadata::text ILIKE '%' || (
      SELECT t.id::text FROM public.transactions t
      WHERE t.property_name = 'Uriel Kamares'
        AND t.date = DATE '2026-08-13'
        AND t.amount_eur = 975
        AND t.subcategory = 'Tenant Payment'
      LIMIT 1
    ) || '%'
  );
```

### Finding (ii) — side B is out only by `review_status`

| Pair | Side B | Property (as stored) | Date | Payer → payee | Amount | is_deleted | review_status | Exclusion |
|---|---|---|---|---|---:|---|---|---|
| 1 | `eb5256c8-112d-47ec-ab7f-c1c8df36839e` | Ofri makarios 5 Floor | 2026-05-30 | Airbnb → JJ | 3,917.49 | false | confirmed_duplicate | `9aeacc51-3167-413a-9d70-3c796ad2e29f`, **inactive**, `dedup_2026_06_29` |
| 2 | `49a6d8b5-4987-488f-869d-1a1aedb38f2b` | Ofri makarios | 2026-06-04 | JJ → Owner | 3,322.37 | false | confirmed_duplicate | none |
| 3 | `e4a8a01c-b8aa-4ef9-81ee-7401b5d9a18b` | Tamir dekelia | 2026-04-30 | JJ → JJ | 3,404.03 | false | confirmed_duplicate | `af56e16f-bedc-41b1-8b0c-fd120d03c5c7`, **inactive**, `dedup_2026_06_29` |
| 4 | `6a24ba8c-b63c-4476-9f1d-2760311872b7` | Tom dekelia | 2026-05-31 | Airbnb → JJ | 1,553.96 | false | confirmed_duplicate | `b180c7b1-8f64-4758-aa65-d970abdec1be`, **inactive**, `dedup_2026_06_29` |
| 5 | `9a5fdde0-1591-474c-9c6c-09b2078508b4` | Uriel Duplex | 2026-05-30 | Airbnb → JJ | 1,900.52 | false | confirmed_duplicate | `e51320fb-8907-4f76-bbe0-bb17307955e3`, **inactive**, `dedup_2026_06_29` |

Side B is excluded **only** by `review_status = 'confirmed_duplicate'`. The 2026-06-29 dedup exclusions are inactive. Pair 2's side B never had an exclusion row. Both the live view and the certified ledger omit side B today. A later write that sets side B back to `active` or NULL would admit it again, with no active exclusion to stop it.

## (c) Balances under the shared-inclusion plan

Yossi 2026-10-03 18:10, option 1: each transaction is counted once, across every consumer, through one shared mechanism. The mechanism is drafted in migration `20261003120000` as `public.v_canonical_transaction_inclusion` and `public.canonical_inclusion_decided(uuid)`. The view contains no transaction id. A later migration, separately approved, creates the append-only table `finance.canonical_inclusion_decisions` and writes the rows. This draft does not create that table and does not write a row. Flags stay as they are.

| Item | Status | Amount | Effect if counted | In the confirmed balance? |
|---|---|---:|---|---|
| Pair 1 Ofri side A `cfb1b60c` | canonical side A, confirmed include. Side B `eb5256c8` stays out | 3,917.49 | REDUCES −3,917.49 | yes |
| Pair 2 Ofri side A `20eaeb18` | canonical side A, confirmed include. Side B `49a6d8b5` stays out | 3,322.37 | INCREASES +3,322.37 | yes |
| Pair 4 Tom side A `dc3d60fb` | canonical side A, confirmed include. Side B `6a24ba8c` stays out | 1,553.96 | REDUCES −1,553.96 | yes |
| Uriel `ba646d2d` | confirmed include. Evidence ref `uriel-kamares-1800-additional-receipt-yossi-2026-09-23` | 1,800.00 | REDUCES −1,800.00 | yes |
| Pair 3 Tamir `82c8ee31` | held | 3,404.03 | REDUCES −3,404.03 | no |
| Pair 5 Uriel side A `10622dde` | canonical side A, held pending proof. Side B `9a5fdde0` stays out. The canonical label does not add the amount | 1,900.52 | REDUCES −1,900.52 | no |
| Other Group 1 (9 rows) | out. The 1,800 above is the only Group 1 include | contribution −447.82 | see (b) | no |
| Kamares tenant payment 2026-08-13 | report only, not an include | 975.00 | not in this plan | no |

**Pair 5 is canonical and held.** Certification `ad2ba8fd` (applied, as_of 2026-08-31, total_due_to_jj 117,901.54; read 2026-10-03 18:00 Europe/Bucharest) line `e55e4b35` is Uriel Duplex `opening_property_obligation` 16,555.43, metadata `str_credit` 6,983.10, with no source transaction id. Nothing is counted on top of that certification until inclusion is proven. The 1,900.52 is not in the confirmed balance.

Side B stays out because `review_status = 'confirmed_duplicate'`. The draft does not change that flag.

Confirmed plan = draft SQL, plus pair 1 side A, pair 2 side A, pair 4 side A, and `ba646d2d`. Amounts in this table are the view sign unless the display column says otherwise. Read: 2026-10-03 18:00 Europe/Bucharest.

| Contact | Live view | Draft SQL view | Confirmed view | Confirmed display (−view) | Confirmed view − live view |
|---|---:|---:|---:|---:|---:|
| Liron and Alon | −46,915.74 | −47,365.74 | −47,365.74 | +47,365.74 | −450.00 |
| Ofri | −6,074.15 | −5,724.77 | −6,319.89 | +6,319.89 | −245.74 |
| Tamir | −97,015.66 | −92,298.59 | −92,298.59 | +92,298.59 | +4,717.07 |
| Tom | −65,323.88 | −63,808.26 | −65,362.22 | +65,362.22 | −38.34 |
| Uriel | −126,931.23 | −123,230.71 | −125,030.71 | +125,030.71 | +1,900.52 |
| Yogev | −54,130.83 | −54,261.97 | −54,261.97 | +54,261.97 | −131.14 |
| **Total (6)** | **−396,391.49** | **−386,690.04** | **−390,639.12** | **+390,639.12** | **+5,752.37** |
| Other 10 | see (a) | same as live | same as live | −(live view) | 0.00 |
| **All 16** | **−548,062.15** | **−538,360.70** | **−542,309.78** | **+542,309.78** | **+5,752.37** |

Total (6) is Liron and Alon, Ofri, Tamir, Tom, Uriel, Yogev. All 16 is the list under Source. Both totals are the read of 2026-10-03 18:00 Europe/Bucharest. Display positive means JJ owes the owner.

Ofri confirmed view: −5,724.77 + (−3,917.49) + 3,322.37 = −6,319.89. Tom: −63,808.26 + (−1,553.96) = −65,362.22. Uriel: −123,230.71 + (−1,800.00) = −125,030.71. Pair 5's 1,900.52 is not in the Uriel figure.

Left out of the confirmed balance, same read, view sign:

| Contact | Item | Amount left out |
|---|---|---:|
| Tamir | pair 3 held | 3,404.03 REDUCES |
| Tamir | Group 1 four rows | contribution −1,313.04 |
| Tom | Group 1 `98a46392` | contribution +38.34 |
| Uriel | pair 5 canonical, held pending proof | 1,900.52 REDUCES |
| Ofri | Group 1 `7acdcebd` + `07859b5d` | contribution +245.74 |
| Liron and Alon | Group 1 `886b710b` | contribution +450.00 |
| Yogev | Group 1 `b18d427d` | contribution +131.14 |

Check, All 16, view sign, read 2026-10-03 18:00 Europe/Bucharest: rows left out contribute −3,404.03 − 1,900.52 − 447.82 = −5,752.37. −548,062.15 − (−5,752.37) = −542,309.78. The −447.82 is Group 1's −2,247.82 without the included −1,800.00. Total (6) moves by the same −5,752.37 because every left-out row is one of those six contacts: −396,391.49 − (−5,752.37) = −390,639.12.

## (d) Reconciliation

Scope of this reconciliation: All 16 (the list under Source), view sign, read 2026-10-03 18:00 Europe/Bucharest. These are draft-SQL figures, before the planned decision rows. Display sign of the live total is +548,062.15 and of the draft total is +538,360.70.

| | View EUR |
|---|---:|
| Live, All 16 | −548,062.15 |
| Draft SQL, All 16 | −538,360.70 |
| Σ deltas (draft − live), All 16 | +9,701.45 |
| Σ contributions of the 15 removed rows, All 16 | −9,701.45 |
| Σ deltas + Σ contributions, All 16 | 0.00 |

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
| **Total, All 16, same read** | **−9,701.45** | **+9,701.45** |

## Still open

1. Pair 5: `10622dde` is the canonical side A, and it still adds nothing. Whether 1,900.52 sits inside `str_credit` 6,983.10 on line `e55e4b35` is unproven. Until inclusion is decided, do not add 1,900.52 on top of certification `ad2ba8fd`.
3. The 975 Kamares tenant payment of 2026-08-13: date is inside `as_of` 2026-08-31. Repo evidence does not show it on a certification line. It is not an include. The SELECT above is the check.
4. Side B returns if its `review_status` is set back to `active` or NULL. The old exclusions will not stop it: four are inactive, and pair 2 never had one.
5. Other consumers still use their own copies of the predicate. The switch plan is `docs/planning/canonical_transaction_inclusion_2026-10-03.md`.

Do not merge. Do not apply. Do not deploy.
