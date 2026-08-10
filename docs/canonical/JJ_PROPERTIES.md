# JJ_PROPERTIES — Canonical Consolidation

> **Status:** DRAFT skeleton (Phase 1.5). Structure + pointers. Live counts marked PENDING LIVE VERIFICATION.

## Identity model
- Properties are referenced by **`property_name` (TEXT)** in `public.transactions` — no stable UUID yet. Property Registry (UUID) is designed but **not built** (`OPERATIONAL_READINESS_DESIGN.md` §2). This is Critical Hotspot #1.
- Property type: `property_definitions` (`client` | `jj` | `partnership` | `jj_company`).
- Ownership + %: `property_owners` (e.g., Villa Mazotos = Avi 50 / Yossi 25 / Jacob 25; Villa Mazotos 2 = Oren 35 / Yossi 32.5 / Jacob 32.5).

## Known data-quality issues (RC3.1 backlog — documented, unfixed under RC1 Freeze)
- **391 rows with `property_name = NULL`** — invisible to property-scoped reports. *(figure per docs; re-verify live.)*
- **9 variant pairs** (same property, different spelling/case): Tamir Dekelia/dekelia, JJ Ground Floor Dekeleia/jj ground floor Dekeleia, Villa Mazotos 2/mazotos 2, Tom Dekelia/dekelia, Ofri Makarios 5 Floor/makarios, Liora Anafotia 202/anafotia, Orit Rob Pingodes/pingodes, Tamir Kiti 2/kiti 2, Yogev Port/yogev port.
- Unique `property_name` values: ~55 *(per docs; re-verify live).*

## PENDING LIVE VERIFICATION (do not infer from historical docs)
- Authoritative unique property list + row counts per property — **PENDING** (single `SELECT property_name, count(*) …` when authorized).
- NULL `property_name` count as of now — **PENDING**.
- Lifecycle coverage: 2/45 properties seeded (Villa Mazotos, Villa Mazotos 2) — re-verify.

## Rule
No property-level number is authoritative here until verified against the live DB with timestamp + query. Until then: PENDING.
