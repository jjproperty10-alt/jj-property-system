# PR #16 admin/pms — preservation (DRAFT)

Status: **DRAFT preservation only**. The admin page is not added under `src`. The design below is not implemented. Nothing is wired, deployed, or merged. This file is not business authority. No database was queried for this note.

| | |
| --- | --- |
| PR | [#16](https://github.com/jjproperty10-alt/jj-property-system/pull/16) `M0.4: PMS/Ops Admin Console (/admin/pms)` |
| Head | `refs/pull/16/head` = `f87a31564e94875eeb555b5a1e5dfffc244418be` (`m04/admin-console`) |
| Merge base | `037b7bb1110048e87a6936a16bfdf7006855bd44` (merge-base of that head with `main` `b0bac3a7`) |
| Preserved on | `main` `b0bac3a7ebdb9318faeac0348d21bf960377bfac` |
| Patch | `docs/preserved/pr16_admin_pms.patch` — three-dot diff of head vs that merge base. Not applied. |

The patch adds one file: `src/app/admin/pms/page.tsx` (+145). `git apply --check` against `main` `b0bac3a7` succeeds, because the path is absent on `main`. This branch does not apply it. The page stays unwired.

Role facts below are the read-only findings of 03.10.2026 (`old_prs_54_16_63_findings_2026-10-03`). Production counts in that file were not re-queried.

## What the page does

`src/app/admin/pms/page.tsx` on the PR head is a client component (`'use client'`). Its own header comment calls it the M0.4 PMS/Ops admin console, says data comes from the `pms-admin-status` edge function (anon rejected), says no secrets or PII are rendered, and says a missing session redirects to `/login`.

It does not define or verify a role. It does not read `user_roles`, `jj_staff_config`, or `access.company_memberships`.

Behavior at `f87a315`:

- Builds a browser Supabase client (`createSupabaseBrowserClient`).
- `call(fn, body)` loads `auth.getSession()`. With no session it sets `window.location.href = '/login'` and throws. With a session it `POST`s `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${fn}` using the session access token as `Authorization: Bearer`, the public anon key as `apikey`, and a JSON body.
- On mount, and on “רענן”, it calls `pms-admin-status` and stores the JSON.
- “Sync נכסים” calls `pms-hostaway-sync-listings`, then refreshes status.
- “Sync הזמנות” calls `pms-hostaway-sync-reservations` in a loop of up to 10 iterations, body `{ offset, maxPages: 2 }`, stopping when `ok` is false or `done` is true, otherwise continuing from `nextOffset`. Then it refreshes status.
- The screen is RTL. It shows the connector display name, masked account, connector version, and pagination flag; health cards (`green` / `yellow` / `red`); operational metrics; cron jobs and last-run status; webhooks; recent sync runs; and property mappings (`external_id`, `jj_property_name`, confidence label and score, status, mapping version).
- Loading and error states are Hebrew strings. Buttons disable while a sync `busy` flag is set.

That is a browser-session console. It is not the design in the next sections.

## Role evidence (findings, 03.10.2026)

Existing roles only. The PR page invents none, and this preservation invents none.

- `public.user_roles.role` CHECK allows `superadmin`, `partner`, `manager`, `employee`, `cleaner`, `viewer`. Findings: 1 active `superadmin`. Repo code defines `superadmin` in `src/lib/auth/reportAuthorization.ts` (report access; tests and policies also name it). The admin page does not.
- `jj_staff_config.staff_role` CHECK allows `ceo`, `finance_admin`, `statement_operator`. Findings: 1 active `ceo`.
- `access.company_memberships.membership_role` is `company_admin` or `member`.
- `public.get_my_role()` reads `user_profiles.role`, not `user_roles`. It is not authoritative. Repo `supabase/schema.sql` matches that shape: `SELECT role FROM user_profiles WHERE id = auth.uid()`. The comment on `user_profiles.role` lists a different vocabulary (`super_admin`, `partner_admin`, `airbnb_manager`, `rental_manager`, `employee`). That function is not the role source for this page.

## Unwired design

Recorded here so the intent is not lost. Not built on this branch. The page stays unwired: `src/app/admin/pms/page.tsx` is not added.

- Authentication is a server-side session. The browser `getSession` redirect in the PR is not the authorization boundary.
- Sync actions sit behind an explicit allowlist. Each action is authorized on its own: status, listings sync, reservations sync, refresh. A pass for one action does not cover the others.
- Authorization uses existing roles only: `user_roles.superadmin`, `jj_staff_config` (`ceo`, `finance_admin`, `statement_operator`), and `access.company_memberships` (`company_admin`, `member`). No new role.
- A call requires all of: an active staff row, an explicit verified company context, and an active `access.company_memberships` row for the target company.
- Company is never inferred from a property name or from a connector payload (including `jj_property_name` or an external id on the status response).
- Anything missing, stale, or unmatched fails closed. No default company, no anonymous call, no client-side-only gate.
