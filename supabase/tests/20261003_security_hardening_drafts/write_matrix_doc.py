#!/usr/bin/env python3
"""Turn the local PostgREST-shaped matrix CSV into the planning document."""

import csv
import sys
from collections import defaultdict

csv_path, out_path = sys.argv[1], sys.argv[2]

rows = list(csv.DictReader(open(csv_path, newline="")))
if not rows:
    raise SystemExit("matrix CSV is empty")

mismatches = [row for row in rows if row["expected"] != row["actual"]]
if mismatches:
    raise SystemExit(f"{len(mismatches)} mismatched rows; refusing to write the matrix")

phases = ["before", "after", "rollback"]
by_key = defaultdict(dict)
for row in rows:
    by_key[(row["object_name"], row["role_label"], row["operation"])][row["phase"]] = row

objects = []
for row in rows:
    if row["object_name"] not in objects:
        objects.append(row["object_name"])

role_order = ["anon", "nonstaff", "staff", "admin", "staff_nonmember"]
op_order = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "MAINTAIN", "EXECUTE"]


def cell(record):
    return f"{record['expected']} = {record['actual']}"


lines = []
add = lines.append
add("# Direct database matrix — 2026-10-03")
add("")
add("Draft proof only. Nothing in this file was applied to a Supabase project.")
add("The numbers below were produced by `supabase/tests/20261003_security_hardening_drafts/run.sh`")
add("on local PostgreSQL 17. Each cell is `expected = actual`. A mismatch fails the proof")
add("before this file is written.")
add("")
add("## How the role is chosen")
add("")
add("PostgREST uses the JWT role (`anon` or `authenticated`) and the `sub` claim.")
add("This proof does the same thing with `SET LOCAL ROLE` and `request.jwt.claims`.")
add("`auth.uid()` and `auth.role()` in the fixture read that claim. `service_role` is")
add("not a column here: it bypasses row security, and the per-file `after_*.sql` scripts")
add("still show that it can read and write. Table owner is `postgres`, so the probes")
add("never run as the owner.")
add("")
add("| Label | Database role | Claim |")
add("|---|---|---|")
add("| anon | anon | no `sub` |")
add("| nonstaff | authenticated | company member, no `jj_staff_config` row, role `partner` |")
add("| staff | authenticated | company member, active `finance_admin`, role `employee` |")
add("| admin | authenticated | company member, active `ceo`, active `superadmin` |")
add("| staff_nonmember | authenticated | active `employee`, no company membership |")
add("")
add("`staff_nonmember` is the extra isolation probe. The four labels above it are the")
add("required anon and authenticated cases.")
add("")
add("Seed for the named tables is one visible row, except `user_roles`, which has four")
add("rows (admin, staff, nonstaff, staff_nonmember). `property_name_aliases` has one row")
add("whose `operating_company_id` matches the three memberships. Tables with row security")
add("and no permissive policy are seeded with one row so a count of zero means the row")
add("was hidden.")
add("")
add("## What the tokens mean")
add("")
add("| Token | What happened |")
add("|---|---|")
add("| `rows:N` | Statement succeeded and returned or changed N rows |")
add("| `ok` | `TRUNCATE` succeeded. Row security does not apply to `TRUNCATE` |")
add("| `privilege` | SQLSTATE 42501, permission denied for the table or function |")
add("| `rls` | SQLSTATE 42501, new row violates row-level security |")
add("| `yes` / `no` | `has_table_privilege(..., 'MAINTAIN')` for anon |")
add("| `missing` | SQLSTATE 42883, function does not exist |")
add("| `rpc:...` | Function executed and returned that value |")
add("| `raise:...` | Function executed and raised |")
add("")
add("`UPDATE` and `DELETE` that cannot see a row succeed with `rows:0`. They do not")
add("raise. `INSERT` with no passing policy raises `rls`.")
add("")
add("## Phases")
add("")
add("- **before** — fixture only. This is the local reproduction of the 03.10.2026 grants")
add("  and the attested policies. `public.require_jj_staff` is absent, matching `main`.")
add("- **after** — drafts `20261003150000` through `20261003150600`, in timestamp order.")
add("- **rollback** — those drafts' rollback blocks, in reverse timestamp order.")
add("")
add("The rollback phase matched the before phase on every cell. Rolling one file back")
add("on its own is not the same thing: the `user_roles` rollback re-grants the write")
add("privileges that the anon-grant draft removes.")
add("")
add("## What was still open, and the draft that closes it")
add("")
add("Moving the app onto staff-checked server actions does not change what PostgREST")
add("allows. After the first five drafts, an authenticated non-staff company member")
add("could still read and write `property_name_aliases`, because `auth_all_property_name_aliases`")
add("allows every signed-in user and `company_member_read` allows a member.")
add("`20261003150600_property_name_aliases_staff_gate.sql` replaces only the permissive")
add("policy with the staff-or-admin predicate. `company_member_read` stays, so a staff")
add("user who is not a member of that company still sees nothing.")
add("")
add("The other company tables in this reproduction (`entity_registry`, `entity_aliases`,")
add("`partnership_ownership`, `accounting_rules`, and the rest of the 44 that have no")
add("attested permissive policy) already return no rows to anon and to authenticated.")
add("Row security is on and there is no policy. This fixture does not invent a permissive")
add("policy for them. No extra policy was added. If production has a permissive policy")
add("that was not in the attested set, this matrix does not show it.")
add("")
add("`audit_log_select` was open to every authenticated user. The capital draft now")
add("limits it to active staff or admin. No path under `src/`, `scripts/`, or")
add("`supabase/functions/` reads `case_audit_log`.")
add("")
add("Anon `MAINTAIN` is revoked on the attested 44 tables. The grant draft then refuses")
add("to commit if any ordinary public table still grants anon `INSERT`, `UPDATE`,")
add("`DELETE`, `TRUNCATE`, `MAINTAIN`, `REFERENCES`, or `TRIGGER`.")
add("")
add("## Matrix")
add("")
add(f"{len(rows)} cells. Mismatches: 0.")
add("")

for obj in objects:
    add(f"### `{obj}`")
    add("")
    ops = []
    roles = []
    for (object_name, role, op), phases_for in by_key.items():
        if object_name != obj:
            continue
        if op not in ops:
            ops.append(op)
        if role not in roles:
            roles.append(role)
    ops.sort(key=lambda item: op_order.index(item) if item in op_order else 99)
    roles.sort(key=lambda item: role_order.index(item) if item in role_order else 99)
    header = "| Role | Op | before | after | rollback |"
    add(header)
    add("|---|---|---|---|---|")
    for role in roles:
        for op in ops:
            record = by_key.get((obj, role, op))
            if record is None:
                continue
            add(
                "| {role} | {op} | {before} | {after} | {rollback} |".format(
                    role=role,
                    op=op,
                    before=cell(record["before"]),
                    after=cell(record["after"]),
                    rollback=cell(record["rollback"]),
                )
            )
    add("")

add("## Apply order")
add("")
add("These files are not approved for apply. `supabase db push` would run every file")
add("in `supabase/migrations`, including these drafts. Do not push them.")
add("")
add("The repository has no migration labeled Slice A. The company-read isolation step")
add("is `20260930120000_company_member_read_isolation.sql`. It belongs after")
add("`20260924210000_access_company_memberships.sql` and")
add("`20260929200000_internal_operating_company_path.sql`. The security drafts are")
add("later timestamps and stay unapplied until each one is approved on its own:")
add("")
add("1. `20261003150000_user_roles_self_escalation_lock.sql`")
add("2. `20261003150100_contacts_staff_only_rls.sql`")
add("3. `20261003150200_capital_balances_audit_staff_rls.sql`")
add("4. `20261003150300_pms_rpc_revoke_authenticated.sql`")
add("5. `20261003150400_anon_grant_hardening.sql`")
add("6. `20261003150500_require_jj_staff.sql`")
add("7. `20261003150600_property_name_aliases_staff_gate.sql`")
add("")
add("Do not apply `20260904_002` or `20260922230000`.")
add("")

with open(out_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
print(f"wrote {out_path} ({len(rows)} cells)")
