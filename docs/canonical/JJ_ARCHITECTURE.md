# JJ_ARCHITECTURE — Canonical Index

> **Status:** DRAFT skeleton (Phase 1.5). Index only — points to authoritative architecture docs.

## System shape (structure only — all volatile counts → `JJ_CURRENT_STATE.md`)
- **App:** Next.js + TypeScript (`jj-property-system/`), deployed on Vercel. Route inventory → `JJ_CURRENT_STATE.md`.
- **Data:** Supabase Postgres 17. Schemas: `public` (accounting core), `pms`, `lifecycle`, `finance`, `statements`, `registry`, `historical`. RLS deny-all on non-public schemas. Table/view/transaction counts → `JJ_CURRENT_STATE.md`.
- **Integrations:** Hostaway (Edge Functions + webhooks, hourly sync — listing/reservation counts → `JJ_CURRENT_STATE.md`), Power BI, GitHub (`jjproperty10-alt/jj-property-system`, Bridge v2.1.0 FROZEN), Google Drive (JHKA, read-only).

## Authoritative architecture docs (pointers)
- **ADRs:** `ADR-001…006`, `docs/adr/ADR-P2-001…006`. ⚠️ ADR-number collisions exist → resolved by a non-breaking **ADR Registry** (namespaced Canonical UID → legacy file, no rename). See `JJ_OPEN_QUESTIONS.md` + review package §E.
- **Navigation:** `NAV-1_PHASE1…4` + `JJ_NAV_PRINCIPLES.md` + `NAV-1_IMPLEMENTATION_GATES.md`.
- **Design System:** `JJ_DESIGN_SYSTEM_V1.0.md`.
- **Capability:** `JJ_CAPABILITY_ARCHITECTURE_V1.md` (24 capabilities, 3 layers).
- **Settlement:** `docs/specifications/SETTLEMENT_ENGINE_ENGINEERING_SPEC_V1.md` (v1.2) + `SCHEMA_DESIGN_PACKAGE_V1.md` (v1.1) — architecture complete, **no code yet**.
- **Finance KG:** `finance` schema, PR #70 (Evidence→Claim→Position→Decision→Explanation→Audit).
- **Full provenance map:** `JJ_MASTER_PROJECT_INVENTORY_v1.0.md`.

## Critical hotspots (see `JJ_OPEN_QUESTIONS.md`)
Property Registry (text identity, no UUID) · Settlement Engine (spec locked, no code) · Identity Gen 3→4 migration (0 consumers) · PMS→Accounting bridge (manual).
