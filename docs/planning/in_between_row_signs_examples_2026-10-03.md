# In-between row signs — examples only (2026-10-03)

Draft examples for Yossi. No sign change is implemented in this commit. No blanket flip.

Balance display, when a row is a balance: **positive = JJ owes the owner, negative = the owner owes JJ.** Income, expense, and movement rows keep that meaning. They are not recoded as balances.

Internal `amount_due_to_jj` is the other way around: positive = the owner owes JJ, negative = JJ owes the owner. A minus printed from that field reads backwards under the balance rule.

Sources are existing fixtures, not a database:

- Tamir-shaped composer fixture `sequence()` in `src/lib/report/clientAccount/__tests__/ownerLevelCompose.test.ts`. House A `−8,000`, House B `−5,968.75` (`str_credit` of the same magnitudes), owner-level `+10,000`, opening `−3,968.75`, cash allocation signed `−3,450`, closing `−518.75`.
- Uriel-shaped DTO `URIEL_SHAPED_CERTIFIED` in `src/lib/finance/__fixtures__/certifiedClientSettlement.ts`. Eight property lines sum to opening `119,677.42`. FIFO `55,000` non-cash + `14,000` cash. Exclusion `13,900` with arithmetic effect 0. Closing `50,677.42`. No owner-level row. There is no passing composer document for this DTO, so Uriel has no income or expense detail rows here.

`fmt` prints an absolute euro amount. `fmtSigned` adds `+` or `−`. `fmtPropertyAmount` uses `fmtSigned` only when `amount_due_to_jj` is negative; a positive line is unsigned. The UI `eur()` helper is `en-IE` currency: a negative is `−€…` and a positive has no plus.

## Cover property lines (`fmtPropertyAmount`)

The cover property row is the property name plus the amount. It has no direction sentence.

| Client | Row | Type | Today | Meaning | Proposed display | Changes? |
|---|---|---|---|---|---|---|
| Tamir | House A | income (STR credit) | `−€8,000.00` | JJ owes the owner €8,000 of approved short-term income | `+€8,000.00` as income. Positive matches “JJ owes the owner” | Yes. The minus is `due_to_jj` |
| Tamir | House B | income (STR credit) | `−€5,968.75` | Same, €5,968.75 | `+€5,968.75` as income | Yes |
| Uriel | Property A | opening obligation | `€20,000.00` (no sign) | The owner owes JJ €20,000 | `−€20,000.00` if a sign is shown. Negative matches “the owner owes JJ” | Yes. A minus would appear |
| Uriel | Property B–H | opening obligation | `€15,000.00`, `€4,099.00`, `€25,000.00`, `€18,000.00`, `€12,000.00`, `€20,578.42`, `€5,000.00` (no signs) | The owner owes JJ each amount | The same amounts with a minus | Yes, same as Property A |

Other rows on the same cover page, not printed by `fmtPropertyAmount`:

| Client | Row | Formatter | Today | Meaning | Proposed display | Changes? |
|---|---|---|---|---|---|---|
| Tamir | Owner-level payment 24.08.2026 | `fmt` (absolute) | `€10,000.00` | The owner paid JJ €10,000. Movement. It reduces what JJ owes. It is not a new balance | Leave `€10,000.00` with the owner-level label. Do not print `+` or `−` | No |
| Tamir | Opening total | `fmt` (absolute) | `€3,968.75` | Balance: JJ owes the owner €3,968.75 | Leave the unsigned amount. Direction belongs in the balance sentence, which is already positive = JJ owes | No |
| Uriel | Opening balance (hero block) | `fmt` (absolute) | `€119,677.42` | Balance: the owner owes JJ €119,677.42 | Leave unsigned. The direction sentence stays “the owner owes JJ” | No |
| Uriel | Non-cash credit | `fmtSigned(−amount)` | `−€55,000.00` | Movement: a non-cash credit reduces what the owner owes. Not income JJ owes | `€55,000.00` with the credit label. The minus is `due_to_jj` arithmetic | Yes. Drop the minus |
| Uriel | Cash included in settlement | `fmtSigned(−amount)` | `−€14,000.00` | Movement: cash already counted reduces what the owner owes | `€14,000.00` with the cash label | Yes. Drop the minus |
| Uriel | FIFO total | `fmtSigned(−total)` | `−€69,000.00` | Sum of those reductions | `€69,000.00` labeled as credits, not as a balance | Yes. Drop the minus |
| Uriel | Exclusion | `fmt` (absolute) | `€13,900.00` | Shown only. Arithmetic effect 0 | Leave it | No |
| Both | Closing | `fmt` of the absolute value, plus the direction sentence | Tamir `€518.75`. Uriel `€50,677.42` | Tamir: JJ owes the owner. Uriel: the owner owes JJ | Leave the unsigned amounts. The sentence carries the direction | No |

## UI `CertifiedSettlementSection`

`eur(amount_due_to_jj)` on the opening, each property line, and each owner-level line. FIFO uses an explicit minus. Closing is the absolute amount plus a label.

| Client | Row | Type | Today | Meaning | Proposed display | Changes? |
|---|---|---|---|---|---|---|
| Tamir | Opening | opening | `−€3,968.75` | JJ owes the owner €3,968.75 | `+€3,968.75`, or unsigned `€3,968.75` with “JJ owes the owner” | Yes. Today’s minus reads as “the owner owes JJ” |
| Tamir | House A | income | `−€8,000.00` | JJ owes the owner €8,000 of STR income | `+€8,000.00` labeled income | Yes |
| Tamir | House B | income | `−€5,968.75` | Same | `+€5,968.75` labeled income | Yes |
| Tamir | Owner-level | owner transfer | `€10,000.00` (no plus) | The owner paid JJ €10,000 | Leave `€10,000.00` with the payment label. A plus would read as “JJ owes €10,000” | No |
| Uriel | Opening | opening | `€119,677.42` (no plus) | The owner owes JJ €119,677.42 | `−€119,677.42`, or keep the unsigned amount and state “the owner owes JJ” | Yes if a sign is added. An unsigned positive is easy to read as “JJ owes” |
| Uriel | Property A–H | opening obligation | `€20,000.00` through `€5,000.00` (no signs) | The owner owes JJ | Minus on each line if signed | Yes, same as the cover |
| Uriel | Non-cash credit | movement | `−€55,000.00` | Credit reduces what the owner owes | `€55,000.00` with the credit label | Yes. Drop the minus |
| Uriel | Cash included | movement | `−€14,000.00` | Cash reduces what the owner owes | `€14,000.00` with the cash label | Yes. Drop the minus |
| Uriel | Exclusion | movement, effect 0 | `€13,900.00` | Explanation only | Leave it | No |
| Tamir | Closing | total | `€518.75` plus the client-credit label | JJ owes the owner €518.75 | Leave it | No |
| Uriel | Closing | total | `€50,677.42` plus “final balance due to JJ” | The owner owes JJ €50,677.42 | Leave it | No |

## Client PDF rows

Page-1 property, total, owner-level, and opening amounts already go through `fmt` (absolute). Direction is a sentence, not a sign. Property detail lines are absolute amounts inside a named section.

Tamir, from the same composer fixture (client name in the fixture is `לקוח`):

| Row | Type | Today | Meaning | Proposed display | Changes? |
|---|---|---|---|---|---|
| House A | income, rolled into the property balance | `€8,000.00` and `זיכוי ללקוח.` | JJ owes the owner €8,000 | Leave it | No |
| House B | income | `€5,968.75` and `זיכוי ללקוח.` | Same | Leave it | No |
| Property-balances total | total | `€13,968.75` and `זיכוי ללקוח.` | JJ owes the owner the property total. The label is no longer `נסגר` | Leave the unsigned amount | No |
| STR detail, House A | income | `€8,000.00`, section הכנסות משכירות קצרה, text `זיכוי Airbnb מאושר` | Approved STR income of €8,000 | Leave the unsigned income amount | No |
| STR detail, House B | income | `€5,968.75`, same section | Same | Leave it | No |
| Owner-level 24.08.2026 | owner transfer | `€10,000.00`, label `תשלום כללי ברמת הבעלים` | The owner paid JJ €10,000 | Leave it. Do not sign it | No |
| Certified opening | opening | `€3,968.75` and `זיכוי ללקוח.` | JJ owes the owner €3,968.75 | Leave it | No |
| Cash allocation on the closing bridge | movement | `€3,450.00` (bridge stores `+3,450` because the allocation signed amount is `−3,450`; the PDF prints the absolute value) | JJ already paid the owner €3,450. That payment reduced what JJ owes | Leave `€3,450.00` as a payment. A plus would read as a new amount JJ owes | No |
| Closing hero | total | `€518.75` and `זיכוי ללקוח.` | JJ owes the owner €518.75 | Leave it | No |

Uriel page 1, if the fixture property lines were the document’s property balances. Detail income and expense lines are not in a passing composer output, so they are not listed.

| Row | Type | Today | Meaning | Proposed display | Changes? |
|---|---|---|---|---|---|
| Property A–H | opening obligation | Unsigned euros (`€20,000.00` … `€5,000.00`) and `לתשלום ל־JJ.` | The owner owes JJ | Leave the unsigned amounts and the owner-owes sentence | No |
| Property-balances total | total | `€119,677.42` and `לתשלום ל־JJ.` | The owner owes JJ the opening | Leave it | No |
| Closing hero | total | `€50,677.42` and `{name} חייב ל־JJ.` | The owner owes JJ €50,677.42 | Leave the amount. The owner is the subject of `חייב` | No |

## What would change, and for whom

Rows that would change are the ones that print a `due_to_jj` sign:

- Tamir-shaped negative property lines and the negative opening on the UI. Today’s minus means JJ owes the owner. Under the balance rule that minus means the opposite. Affected: clients with a negative property line or a negative opening shown through `eur()` or `fmtPropertyAmount`. In these fixtures, that is Tamir only.
- Uriel-shaped positive property lines and the positive opening, if a sign is added. Today they have no plus, so they can be read as “JJ owes”. A balance-rule sign would be a minus. Affected: clients whose certified property lines are positive. In these fixtures, that is Uriel.
- FIFO and cash-included lines that are printed as an explicit minus. The minus means “reduces `due_to_jj`”, not “the owner owes JJ”. Affected: clients with FIFO credits. In these fixtures, that is Uriel.

Rows that would not change:

- Cover and UI closing amounts. They are already absolute, with a direction sentence.
- The Tamir owner-level €10,000 payment. It stays an unsigned movement.
- Client PDF rows in these fixtures. They are already absolute amounts plus a section or a direction sentence.
- The Uriel exclusion. Arithmetic effect stays 0.

No other client is in these two fixtures. Orit Rob is not represented here.
