# Shared canonical inclusion — draft 2026-10-03

Draft only. Not applied. No decision table is created and no decision row is written. No flag is cleared. The view does not contain a transaction id.

## Mechanism

`public.v_canonical_transaction_inclusion` is the one admission set. A transaction is in it when the certified predicate passes, or when `public.canonical_inclusion_decided(id)` is true. The function returns false until `finance.canonical_inclusion_decisions` exists. This migration does not create that table.

Planned table, append-only, later and separately approved:

- `transaction_id uuid`
- `decision text` = `include`
- `reason text`
- `evidence_ref text`
- `decided_by text`
- `decided_at timestamptz`
- `voided_at timestamptz` null while the include is in force

One non-voided include per transaction id. A void is a later row, not an update of the decision. The view stays free of ids.

## Planned rows, not written

| Id | Role | In the confirmed balance? |
|---|---|---|
| `cfb1b60c-90f9-47c1-930f-6c7737ccf448` | pair 1 side A, include | yes, Ofri, view effect −3,917.49 |
| `20eaeb18-a457-4740-acb2-0fe446a01460` | pair 2 side A, include | yes, Ofri, view effect +3,322.37 |
| `dc3d60fb-f3a3-4ca6-9fc4-46ef40e4bdb3` | pair 4 side A, include | yes, Tom, view effect −1,553.96 |
| `ba646d2d-9122-4909-ae02-8a67739a0172` | Uriel Kamares 1,800 receipt. Evidence ref `uriel-kamares-1800-additional-receipt-yossi-2026-09-23`. Cert v3 `ad2ba8fd` line `c28551e0` `additional_receipt_id`. Yossi 2026-09-23 stands. | yes, Uriel, view effect −1,800.00 |
| `10622dde-dd02-464f-a6e1-d98cb25cde83` | pair 5 side A, canonical, held pending proof | no. Nothing on top of `ad2ba8fd` |
| `eb5256c8`, `49a6d8b5`, `6a24ba8c`, `9a5fdde0` | side B | no |
| Kamares tenant payment 975 on 2026-08-13 | report only | no |

`src/lib/ledger/certifiedLedger.ts` admits a soft-deleted row only when the caller passes that id in the documented-inclusion set. The Uriel test does that and expects the id once. The bare predicate still rejects other soft-deleted rows.

## Consumers

This draft switches only `v_contact_settlement`. `v_contact_settlement_summary` inherits it. Owner Room and the owner overview render that summary through `mapContactSettlementToDisplay` and do not change the view number.

| Consumer | Today | Later |
|---|---|---|
| `v_certified_ledger_transactions` | own predicate | point it at the shared view, separate approval; many migrations pin its md5 |
| `v_rc3_classified` and `v_rc3_purchase/sale/renovation/rental/airbnb` | copied predicate plus `reporting_name` | keep the name gate; source rows from the shared view |
| `src/lib/ledger/certifiedTransactionsReader.ts`, `certifiedLedger.ts` | view read, plus a TypeScript predicate | pass documented inclusions from the decision table; do not keep a second list |
| `src/lib/partner-settlement/ledgerRowFilter.ts` | second TypeScript predicate | same |
| `transactionsReader.ts`, `externalPartnerTransactionsSource.ts`, `loadClientAccountReport.ts`, `vm1ExpenseAdmissionService.ts` | `public.transactions` | shared view |
| `propertyAuditService.ts`, `fetchReport.ts` | certified view or RC3 views | follow those views |
| `finance.read_certified_client_settlement` and STR certification readers | certification lines | do not grow a second include list. Pair 5 stays off the top of `ad2ba8fd` |
| Transaction register, contracts, property pages | raw register | leave them. They are not a count |

## Display

View positive = owner owes JJ. Approved display positive = JJ owes the owner. The mapping function is presentation only.
