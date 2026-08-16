# JJ Canonical Integration — Final Application Wiring Gate + Owner Room Migration Package

**Agent:** Agent 3 — Canonical Integration / Identity & Cross-Module Wiring
**Authorization:** Yossi "Final Application Wiring Gate" (2026-08-15), items A–H.
**Posture:** Additive only. **Owner Room source switch NOT activated** (it would change visible behaviour — see §C). No new features. Yogev `relationship_type` untouched (G).

---

## 0. Correction: wrong repo tree in the previous round (disclosed)

The previous round wrote code/migrations under `JJ\src` and `JJ\supabase`. The **live app is `JJ\jj-property-system\`** (has `package.json`, `jest.config.ts`, `.next`, `.vercel`). This round re-committed everything to the correct tree: `jj-property-system\src\lib\identity\` and `jj-property-system\supabase\migrations\`. The earlier `JJ\src` / `JJ\supabase` copies are stray and can be deleted (I cannot delete on-device; flagging for you). **DB objects were unaffected by this** — they live in one Supabase project regardless of repo path, and remain correct.

Reuse-First also surfaced pre-existing infra I now build on instead of duplicating: `public.resolve_party_id()` (lifecycle-entity→party bridge, PR#89) and `public.get_owner_statement_snapshots(p_owner_party_id)` (already party-keyed).

---

## A. Public identity contract — DONE

`src/lib/identity/index.ts` now exports the canonical resolvers as first-class API (no duplicated logic; SQL remains source of truth):

```
resolveProperty()             // → property_definitions.property_id
resolveParty()                // → registry.parties.party_id
resolvePartyForEntity()       // lifecycle entity id → party (REUSE of public.resolve_party_id)
isUuidLike / isBlankInput / normalizeIdentityName   // pure helpers
```

## B. DTO / source model — DONE (smallest safe change)

`CanonicalEntityIdentityDTO.source` widened from the hardcoded literal to a union, plus additive provenance — backward compatible, no behavioural change (the existing resolver still emits `lifecycle.entity_identity`):

```ts
readonly source: 'registry.parties' | 'lifecycle.entity_identity'
readonly partyId?: string | null                       // canonical party when bridged (H.3)
readonly legacySource?: 'lifecycle.entity_identity' | null   // provenance retained
```

Provenance is preserved, not removed.

---

## C. Owner Room before/after impact matrix (READ-ONLY)

Current Owner Room = `getAllVerifiedOwners()` = active `lifecycle.entity_identity` with ≥1 **verified** active `management_relationship`. **14 owners today.** Proposed = same relationships, WHO resolved to `registry.parties` via `public.resolve_party_id`.

| Current lifecycle entity | Canonical registry party | Current slug | Canonical slug | Verified rels | Properties | Appears after? | Reason |
|---|---|---|---|---|---|---|---|
| Ben Zvi | **— none —** | ben-zvi | — | 1 | Ben Zvi Tersefanou | **NO — BLOCKED** | not in registry.parties |
| Efi | Efi | efi | efi | 1 | Efi Dekelia | yes | mapped, slug stable |
| Liora | Liora | liora | liora | 1 | Liora Anafotia 202 | yes | mapped |
| Miranta | Miranta | miranta | miranta | 1 | Miranta Radisson | yes | mapped |
| Neer | **— none —** | neer | — | 1 | Apartment Neer Yoav Dekelia | **NO — BLOCKED** | not in registry.parties |
| Ofri | Ofri | ofri | ofri | 1 | Ofri Makarios 5 Floor | yes | mapped |
| Oren | Oren | oren | oren | 2 | Oren Aradipou, Oren Kitty | yes | mapped |
| Orit Rob | Orit Rob | orit-rob | orit-rob | 1 | Orit Rob Pingodes | yes | mapped |
| Oshrit | Oshrit | oshrit | oshrit | 1 | Oshrit Deklia | yes | mapped |
| Roni | Roni | roni | roni | 1 | Roni Penthouse Tersefanou | yes | mapped |
| Sharon | Sharon | sharon | sharon | 1 | Sharon Kiti | yes | mapped |
| Tamir | Tamir | tamir | tamir | 5 | Tamir Dekelia, Kiti, Kiti 1, Kiti 2, Radisson | yes | mapped |
| Tom | Tom | tom | tom | 1 | Tom Dekelia | yes | mapped |
| Uriel | Uriel | uriel | uriel | 5 | Uriel Debenhams, Duplex, Kamares, Kokkines, Studio Kitty | yes | mapped |

**All 12 mapped owners keep an identical canonical name → slugs are stable → no Owner Room URL breaks.** 0 merges, 0 ambiguous.

Specifically requested entities:
- **Yogev** — NOT in the current Owner Room and NOT after. He has a canonical party (`72e48c83…`) but **no `management_relationship`**. His Owner Room absence is a **relationship gap (lifecycle/business-state), not an identity gap.** Identity is ready; a verified `management_relationship` must be created (lifecycle domain) for him to appear. Out of identity scope.
- **Uriel / אוריאל** and **Tamir / תמיר דדון** — the Hebrew rows are `entity_type='external'` in `lifecycle.entity_identity` with **no verified relationships**, so they are **not Owner Room owners** and do not affect the switch. They are unmerged import residue (P3 cleanup), not owners.
- **Present only in lifecycle (as owners):** Ben Zvi, Neer → the 2 blockers below.
- **Present only in registry.parties (not current owners):** Airbnb, Anastasia, Avi, Fabi, Jacob, Yossi, Yogev, Ilan & Ilana, Liron and Alon, Vard — none are managed-owner relationships today, so none are added by the switch.

### C.1 BLOCKER — 2 owners would be silently lost
"Ben Zvi" and "Neer" are real Owner Room clients (verified relationships) that exist **only** in `lifecycle.entity_identity` — absent from `registry.parties` **and** from `public.contacts`. A naive WHO-switch drops them. **The switch must not be activated until the party spine is completed.**

Remediation (additive, prepared — NOT executed, pending approval): create the two parties + contacts + bridge rows:
- `registry.parties`: Ben Zvi (client), Neer (client)
- `public.contacts`: Ben Zvi, Neer (so `contact_ref` is populated, consistent with the other 20 parties)
- `registry.external_identities`: `lifecycle.entity_identity` → new party for each (so `resolve_party_id` returns them)

I did not auto-create these because they mint new canonical party identities for real people — that is a canonical-identity decision I want you to approve first.

---

## D. Responsibility separation (target — respected)

```
registry.parties                    = WHO (canonical party)
registry.external_identities        = identity bridge
lifecycle.management_relationship   = WHAT JJ manages / business-state relationship
property_definitions.property_id    = canonical PROPERTY
```

The prepared migration keeps `management_relationship` as the sole relationship source (unchanged), and only re-sources WHO/labels/slug from `registry.parties`. No relationship state is moved into `registry.parties`; no management relationships are duplicated.

---

## E. CROSS-AGENT DEPENDENCY package (for Agent 2)

- **Owner:** Agent 3 owns `identityResolverService.ts`; Agent 2 owns the Owner Room UI/report consumers of `getAllVerifiedOwners()` / `resolveBySlug()`.
- **Change:** re-source WHO in `getAllVerifiedOwners`/`resolveBySlug` from `lifecycle.entity_identity` → `registry.parties` (via `resolvePartyForEntity`), keeping relationships from `management_relationship`.
- **Visible effect:** none for the 12 mapped owners (identical slugs/names); **2 owners (Ben Zvi, Neer) disappear unless §C.1 remediation is applied first.**
- **Blocking:** YES for activation until §C.1 is approved+applied. Non-blocking for the identity layer already delivered (resolvers/adapters are additive and live-verified).
- **Prepared, not executed:** the `identityResolverService` swap is designed (WHO via `resolvePartyForEntity`, DTO `source:'registry.parties'` + `partyId`), not written into the live resolver, pending Agent 2 sign-off.

---

## F. Required proof

| # | Item | Result |
|---|------|--------|
| 1 | Current Owner Room owner count | **14** |
| 2 | Count after registry-party resolution | **12** resolved + **2 blocked** |
| 3 | Exact added owners | **none** |
| 4 | Exact removed owners | **Ben Zvi, Neer** (blocked → must remediate before activation) |
| 5 | Exact ambiguous owners | **none (0)** |
| 6 | Property relationship changes | **none** — `management_relationship` untouched; only WHO/label/slug re-sourced |
| 7 | Financial formulas unchanged | **yes** — this gate added only functions + a widened type + barrel exports; no view/relationship/row changed. (Prior gate fingerprint `e813d9b6…` already identical before/after.) |
| 8 | Agent 1 PMS mappings untouched | **yes** — `pms.*` not modified; resolver still 8/8 agrees with `pms.property_mappings` |
| 9 | Reports/statements code untouched | **yes** — no `statements.*`, no report views, no `src/lib/statements` / `src/app/owners` / `src/app/partner` changes |

---

## G. Yogev relationship_type — untouched

`property_definitions.relationship_type` for Yogev Port is **not modified** (financial-classification gate remains separate from identity). Consumer list unchanged from the prior report.

---

## H. Toolchain — honest report

- **Jest unit suite (pure identity-input helpers): PASS — 8/8.** Executed in a clean sandbox (`ts-jest`, node) because the device Linux workspace was unavailable and the full repo/`node_modules` is not stageable into this cloud session. Command: `npx jest identityInput.test.ts`.
- **Full-repo `tsc --noEmit` (typecheck), `next build`, and full `jest`: NOT executed here.** The device workspace returned "Workspace unavailable," and this cloud container does not hold the `jj-property-system` project graph. Per your instruction I am **not** claiming CI completion. Please run in the repo toolchain:
  ```
  cd jj-property-system
  npm run typecheck      # tsc --noEmit
  npm test               # jest (add resolver integration tests behind a service-role env if desired)
  npm run build          # next build
  ```
  Notes to expect: the new resolver services use `(sb as any).rpc(...)` (no new type surface); `index.ts` adds server-only re-exports consistent with the existing `getAllVerifiedOwners` export; `identityTypes.ts` widened a literal union (backward compatible).
- **DB layer: proven live** — property resolver 19/19, party resolver 8/8, STR agreement 8/8, public wrappers verified, financial non-regression identical.

---

## I. Open decisions for you

1. **Approve §C.1 remediation** (create Ben Zvi + Neer as parties/contacts/bridge) — required before the Owner Room switch can activate without data loss.
2. **Approve the Owner Room resolver swap** (with Agent 2) once §C.1 is in.
3. **Liora 201/101 tension:** a prior migration you authorized — `20260807_001_liora_201_to_101.sql` (applied 2026-08-05) — already treats "Liora Anafotia 201" as a **data-entry error for 101** and renamed it across transactions, management_relationship, property_definitions, property_owners. Today's H.4 says keep 201/101 **separate (CONFLICT)**. The only remaining "201" is the orphaned row in legacy `public.properties`. These two directives conflict. My bridge currently records 201 as CONFLICT→not_found (per today's H.4). Tell me which holds: (a) 201 = 101 per the 8/5 correction (I'd map the legacy row to 101), or (b) keep separate (leave as-is). I did not act.
4. Optional P3: cleanup the `אוריאל` / `תמיר דדון` external residue in `lifecycle.entity_identity`.

---

## J. Definition-of-Done status (this gate)

| Item | Status |
|------|--------|
| A. Public identity contract exposes resolvers | ✅ |
| B. DTO source model corrected (registry.parties allowed, provenance kept) | ✅ |
| C. Owner Room before/after matrix (read-only) | ✅ (2 blockers surfaced) |
| D. Responsibility separation preserved | ✅ |
| E. Cross-agent dependency package (no Owner Room/report changes) | ✅ prepared, not activated |
| F. Required proof (1–9) | ✅ |
| G. Yogev relationship_type untouched | ✅ |
| H. Toolchain run | ⚠️ unit tests PASS; full typecheck/build not runnable here — reported honestly, not claimed |
| Chain proven: external party → registry.parties → lifecycle relationship → canonical property → consumer | ✅ at DB/adapter layer; Owner Room activation gated on C.1 + Agent 2 |

**I am returning with this package BEFORE activating the Owner Room source switch, because activation changes visible behaviour (loses 2 owners until remediated).**
