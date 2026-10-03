# Direct database matrix — 2026-10-03

Draft proof only. Nothing in this file was applied to a Supabase project.
The numbers below were produced by `supabase/tests/20261003_security_hardening_drafts/run.sh`
on local PostgreSQL 17. Each cell is `expected = actual`. A mismatch fails the proof
before this file is written.

## How the role is chosen

PostgREST uses the JWT role (`anon` or `authenticated`) and the `sub` claim.
This proof does the same thing with `SET LOCAL ROLE` and `request.jwt.claims`.
`auth.uid()` and `auth.role()` in the fixture read that claim. `service_role` is
not a column here: it bypasses row security, and the per-file `after_*.sql` scripts
still show that it can read and write. Table owner is `postgres`, so the probes
never run as the owner.

| Label | Database role | Claim |
|---|---|---|
| anon | anon | no `sub` |
| nonstaff | authenticated | company member, no `jj_staff_config` row, role `partner` |
| staff | authenticated | company member, active `finance_admin`, role `employee` |
| admin | authenticated | company member, active `ceo`, active `superadmin` |
| staff_nonmember | authenticated | active `employee`, no company membership |

`staff_nonmember` is the extra isolation probe. The four labels above it are the
required anon and authenticated cases.

Seed for the named tables is one visible row, except `user_roles`, which has four
rows (admin, staff, nonstaff, staff_nonmember). `property_name_aliases` has one row
whose `operating_company_id` matches the three memberships. Tables with row security
and no permissive policy are seeded with one row so a count of zero means the row
was hidden.

## What the tokens mean

| Token | What happened |
|---|---|
| `rows:N` | Statement succeeded and returned or changed N rows |
| `ok` | `TRUNCATE` succeeded. Row security does not apply to `TRUNCATE` |
| `privilege` | SQLSTATE 42501, permission denied for the table or function |
| `rls` | SQLSTATE 42501, new row violates row-level security |
| `yes` / `no` | `has_table_privilege(..., 'MAINTAIN')` for anon |
| `missing` | SQLSTATE 42883, function does not exist |
| `rpc:...` | Function executed and returned that value |
| `raise:...` | Function executed and raised |

`UPDATE` and `DELETE` that cannot see a row succeed with `rows:0`. They do not
raise. `INSERT` with no passing policy raises `rls`.

## Phases

- **before** — fixture only. This is the local reproduction of the 03.10.2026 grants
  and the attested policies. `public.require_jj_staff` is absent, matching `main`.
- **after** — drafts `20261003150000` through `20261003150600`, in timestamp order.
- **rollback** — those drafts' rollback blocks, in reverse timestamp order.

The rollback phase matched the before phase on every cell. Rolling one file back
on its own is not the same thing: the `user_roles` rollback re-grants the write
privileges that the anon-grant draft removes.

## What was still open, and the draft that closes it

Moving the app onto staff-checked server actions does not change what PostgREST
allows. After the first five drafts, an authenticated non-staff company member
could still read and write `property_name_aliases`, because `auth_all_property_name_aliases`
allows every signed-in user and `company_member_read` allows a member.
`20261003150600_property_name_aliases_staff_gate.sql` replaces only the permissive
policy with the staff-or-admin predicate. `company_member_read` stays, so a staff
user who is not a member of that company still sees nothing.

The other company tables in this reproduction (`entity_registry`, `entity_aliases`,
`partnership_ownership`, `accounting_rules`, and the rest of the 44 that have no
attested permissive policy) already return no rows to anon and to authenticated.
Row security is on and there is no policy. This fixture does not invent a permissive
policy for them. No extra policy was added. If production has a permissive policy
that was not in the attested set, this matrix does not show it.

`audit_log_select` was open to every authenticated user. The capital draft now
limits it to active staff or admin. No path under `src/`, `scripts/`, or
`supabase/functions/` reads `case_audit_log`.

Anon `MAINTAIN` is revoked on the attested 44 tables. The grant draft then refuses
to commit if any ordinary public table still grants anon `INSERT`, `UPDATE`,
`DELETE`, `TRUNCATE`, `MAINTAIN`, `REFERENCES`, or `TRIGGER`.

## Matrix

3543 cells. Mismatches: 0.

### `finance.is_active_jj_admin()`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | EXECUTE | privilege = privilege | privilege = privilege | privilege = privilege |
| nonstaff | EXECUTE | rpc:false = rpc:false | rpc:false = rpc:false | rpc:false = rpc:false |
| staff | EXECUTE | rpc:false = rpc:false | rpc:false = rpc:false | rpc:false = rpc:false |
| admin | EXECUTE | rpc:true = rpc:true | rpc:true = rpc:true | rpc:true = rpc:true |
| staff_nonmember | EXECUTE | rpc:false = rpc:false | rpc:false = rpc:false | rpc:false = rpc:false |

### `finance.is_active_jj_staff()`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | EXECUTE | privilege = privilege | privilege = privilege | privilege = privilege |
| nonstaff | EXECUTE | rpc:false = rpc:false | rpc:false = rpc:false | rpc:false = rpc:false |
| staff | EXECUTE | rpc:true = rpc:true | rpc:true = rpc:true | rpc:true = rpc:true |
| admin | EXECUTE | rpc:true = rpc:true | rpc:true = rpc:true | rpc:true = rpc:true |
| staff_nonmember | EXECUTE | rpc:true = rpc:true | rpc:true = rpc:true | rpc:true = rpc:true |

### `public._view_base_ceo_summary`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | MAINTAIN | no = no | no = no | no = no |

### `public.accounting_rules`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.admin_manage_user_role(uuid,text,boolean,text,text,text)`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | EXECUTE | missing = missing | privilege = privilege | missing = missing |
| nonstaff | EXECUTE | missing = missing | raise:BLOCKED_BY_AUTHORIZATION = raise:BLOCKED_BY_AUTHORIZATION | missing = missing |
| staff | EXECUTE | missing = missing | raise:BLOCKED_BY_AUTHORIZATION = raise:BLOCKED_BY_AUTHORIZATION | missing = missing |
| admin | EXECUTE | missing = missing | rpc:rows:1 = rpc:rows:1 | missing = missing |
| staff_nonmember | EXECUTE | missing = missing | raise:BLOCKED_BY_AUTHORIZATION = raise:BLOCKED_BY_AUTHORIZATION | missing = missing |

### `public.airbnb_reservations`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.alerts`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.business_cases`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.business_event_sources`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.business_events`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.case_audit_log`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | INSERT | rows:1 = rows:1 | rls = rls | rows:1 = rows:1 |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.case_completeness_gaps`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.case_entities`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.case_relationships`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.case_workflow_state`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.category_subcategories`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.contact_opening_balance_history`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.contact_opening_balances`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | INSERT | rows:1 = rows:1 | rls = rls | rows:1 = rows:1 |
| nonstaff | UPDATE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | DELETE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | INSERT | rows:1 = rows:1 | rls = rls | rows:1 = rows:1 |
| staff | UPDATE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| staff | DELETE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | UPDATE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | DELETE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | INSERT | rows:1 = rows:1 | rls = rls | rows:1 = rows:1 |
| staff_nonmember | UPDATE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| staff_nonmember | DELETE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.contact_properties`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | INSERT | rows:1 = rows:1 | rls = rls | rows:1 = rows:1 |
| nonstaff | UPDATE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | DELETE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | UPDATE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | DELETE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | UPDATE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | DELETE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | UPDATE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | DELETE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.contacts`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | INSERT | rows:1 = rows:1 | rls = rls | rows:1 = rows:1 |
| nonstaff | UPDATE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | DELETE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | UPDATE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | DELETE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | UPDATE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | DELETE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | UPDATE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | DELETE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.custody_positions`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.data_quality_backup_20260610`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.entities`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.entity_aliases`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.entity_registry`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.freeze_v1_ceo_kpis`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.freeze_v1_ceo_summary`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.freeze_v1_settlement`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.jj_staff_config`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | MAINTAIN | no = no | no = no | no = no |

### `public.ownership`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.partnership_capital`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | INSERT | rows:1 = rows:1 | rls = rls | rows:1 = rows:1 |
| nonstaff | UPDATE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | DELETE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | INSERT | rows:1 = rows:1 | rls = rls | rows:1 = rows:1 |
| staff | UPDATE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| staff | DELETE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | UPDATE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | DELETE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff_nonmember | INSERT | rows:1 = rows:1 | rls = rls | rows:1 = rows:1 |
| staff_nonmember | UPDATE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| staff_nonmember | DELETE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.partnership_ownership`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.payer_aliases`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.pending_queue`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.pms_reservations_for_property(text,date,date)`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | EXECUTE | privilege = privilege | privilege = privilege | privilege = privilege |
| nonstaff | EXECUTE | rpc:rows:1 = rpc:rows:1 | privilege = privilege | rpc:rows:1 = rpc:rows:1 |
| staff | EXECUTE | rpc:rows:1 = rpc:rows:1 | privilege = privilege | rpc:rows:1 = rpc:rows:1 |
| admin | EXECUTE | rpc:rows:1 = rpc:rows:1 | privilege = privilege | rpc:rows:1 = rpc:rows:1 |
| staff_nonmember | EXECUTE | rpc:rows:1 = rpc:rows:1 | privilege = privilege | rpc:rows:1 = rpc:rows:1 |

### `public.pms_resolve_mapping(text)`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | EXECUTE | privilege = privilege | privilege = privilege | privilege = privilege |
| nonstaff | EXECUTE | rpc:rows:1 = rpc:rows:1 | privilege = privilege | rpc:rows:1 = rpc:rows:1 |
| staff | EXECUTE | rpc:rows:1 = rpc:rows:1 | privilege = privilege | rpc:rows:1 = rpc:rows:1 |
| admin | EXECUTE | rpc:rows:1 = rpc:rows:1 | privilege = privilege | rpc:rows:1 = rpc:rows:1 |
| staff_nonmember | EXECUTE | rpc:rows:1 = rpc:rows:1 | privilege = privilege | rpc:rows:1 = rpc:rows:1 |

### `public.property_definitions`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.property_name_aliases`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | INSERT | rows:1 = rows:1 | rls = rls | rows:1 = rows:1 |
| nonstaff | UPDATE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | DELETE | rows:1 = rows:1 | rows:0 = rows:0 | rows:1 = rows:1 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | UPDATE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | DELETE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | INSERT | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | UPDATE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | DELETE | rows:1 = rows:1 | rows:1 = rows:1 | rows:1 = rows:1 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.property_owners`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.property_ownership`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.property_reporting_map`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.renovation_projects`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.require_jj_staff(ARRAY[ceo])`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | EXECUTE | missing = missing | privilege = privilege | missing = missing |
| nonstaff | EXECUTE | missing = missing | raise:not_in_config = raise:not_in_config | missing = missing |
| staff | EXECUTE | missing = missing | raise:not_permitted = raise:not_permitted | missing = missing |
| admin | EXECUTE | missing = missing | rpc:11111111-1111-4111-8111-111111111111 = rpc:11111111-1111-4111-8111-111111111111 | missing = missing |
| staff_nonmember | EXECUTE | missing = missing | raise:not_permitted = raise:not_permitted | missing = missing |

### `public.require_jj_staff(text[])`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | EXECUTE | missing = missing | privilege = privilege | missing = missing |
| nonstaff | EXECUTE | missing = missing | raise:not_in_config = raise:not_in_config | missing = missing |
| staff | EXECUTE | missing = missing | rpc:22222222-2222-4222-8222-222222222222 = rpc:22222222-2222-4222-8222-222222222222 | missing = missing |
| admin | EXECUTE | missing = missing | rpc:11111111-1111-4111-8111-111111111111 = rpc:11111111-1111-4111-8111-111111111111 | missing = missing |
| staff_nonmember | EXECUTE | missing = missing | rpc:66666666-6666-4666-8666-666666666666 = rpc:66666666-6666-4666-8666-666666666666 | missing = missing |

### `public.settlement_temporal_transitions`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.tamir_redisson_backup_20260610`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.transaction_business_metadata`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.transaction_corrections`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.transaction_exclusions`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.transactions_backup_20260609`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.transactions_deletion_backup`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.user_profiles`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | INSERT | rls = rls | rls = rls | rls = rls |
| nonstaff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | INSERT | rls = rls | rls = rls | rls = rls |
| staff | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | INSERT | rls = rls | rls = rls | rls = rls |
| admin | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | INSERT | rls = rls | rls = rls | rls = rls |
| staff_nonmember | UPDATE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | DELETE | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

### `public.user_roles`

| Role | Op | before | after | rollback |
|---|---|---|---|---|
| anon | SELECT | rows:0 = rows:0 | rows:0 = rows:0 | rows:0 = rows:0 |
| anon | INSERT | rls = rls | privilege = privilege | rls = rls |
| anon | UPDATE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | DELETE | rows:0 = rows:0 | privilege = privilege | rows:0 = rows:0 |
| anon | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| anon | MAINTAIN | yes = yes | no = no | yes = yes |
| nonstaff | SELECT | rows:4 = rows:4 | rows:1 = rows:1 | rows:4 = rows:4 |
| nonstaff | INSERT | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| nonstaff | UPDATE | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| nonstaff | DELETE | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| nonstaff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff | SELECT | rows:4 = rows:4 | rows:1 = rows:1 | rows:4 = rows:4 |
| staff | INSERT | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| staff | UPDATE | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| staff | DELETE | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| staff | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| admin | SELECT | rows:4 = rows:4 | rows:1 = rows:1 | rows:4 = rows:4 |
| admin | INSERT | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| admin | UPDATE | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| admin | DELETE | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| admin | TRUNCATE | ok = ok | privilege = privilege | ok = ok |
| staff_nonmember | SELECT | rows:4 = rows:4 | rows:1 = rows:1 | rows:4 = rows:4 |
| staff_nonmember | INSERT | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| staff_nonmember | UPDATE | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| staff_nonmember | DELETE | rows:1 = rows:1 | privilege = privilege | rows:1 = rows:1 |
| staff_nonmember | TRUNCATE | ok = ok | privilege = privilege | ok = ok |

## Apply order

These files are not approved for apply. `supabase db push` would run every file
in `supabase/migrations`, including these drafts. Do not push them.

The repository has no migration labeled Slice A. The company-read isolation step
is `20260930120000_company_member_read_isolation.sql`. It belongs after
`20260924210000_access_company_memberships.sql` and
`20260929200000_internal_operating_company_path.sql`. The security drafts are
later timestamps and stay unapplied until each one is approved on its own:

1. `20261003150000_user_roles_self_escalation_lock.sql`
2. `20261003150100_contacts_staff_only_rls.sql`
3. `20261003150200_capital_balances_audit_staff_rls.sql`
4. `20261003150300_pms_rpc_revoke_authenticated.sql`
5. `20261003150400_anon_grant_hardening.sql`
6. `20261003150500_require_jj_staff.sql`
7. `20261003150600_property_name_aliases_staff_gate.sql`

Do not apply `20260904_002` or `20260922230000`.
