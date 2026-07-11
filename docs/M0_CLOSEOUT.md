# M0 Closeout & M0.1 CI Hardening

## M0 Summary

M0 established the foundational report-layer architecture for the JJ Property 10 client report system. All work was merged to `main` in PR #11 (SHA `0397d88d`).

### Files shipped in M0 (PR #11)

| File | Purpose |
|------|---------|
| `src/lib/report/approvedExtras.ts` | Whitelist of approved extra charge subcategories |
| `src/lib/report/clientDisplay.ts` | Gateway: `clientDisplayText()` — sole entry point for rendering internal fields |
| `src/lib/report/computeBalance.ts` | Core balance computation engine |
| `src/lib/report/labels.ts` | i18n label registry (EN + HE) |
| `src/lib/report/moduleStatus.ts` | Per-module completion status logic |
| `src/lib/report/reportTypes.ts` | Shared TypeScript types for the report layer |
| `src/__tests__/report/clientDisplay.test.ts` | Unit tests for clientDisplayText() |
| `src/__tests__/report/moduleStatus.test.ts` | Unit tests for moduleStatus |

### Key architectural decisions

**Client Display Gateway (`clientDisplayText`):** All rendering of internal transaction fields (`description`, `notes`, `k_note`, etc.) must go through `clientDisplayText()` in `src/lib/report/clientDisplay.ts`. Direct field access in client-facing rendering paths is forbidden and enforced by the whitelist CI gate added in M0.1.

**No root `.eslintrc`:** ESLint for the report layer runs with `--no-eslintrc --config .eslintrc.report.json` to avoid interfering with Next.js/Vercel build lint configuration.

---

## M0.1 CI Hardening

Branch: `m0.1/ci-hardening`

### Motivation

M0 shipped the architectural contracts but had no automated enforcement. M0.1 adds CI gates so violations are caught at PR time, not in code review.

### Files changed

| File | Change |
|------|--------|
| `.eslintrc.report.json` | NEW — isolated ESLint config for report layer |
| `scripts/check-client-display-whitelist.mjs` | NEW — static analysis script enforcing clientDisplayText() gateway |
| `package.json` | ADD — three new npm scripts: `typecheck`, `lint:report`, `check:whitelist` |
| `.github/workflows/test.yml` | UPDATE — Node 22, npm cache, four quality gates |
| `docs/M0_CLOSEOUT.md` | NEW — this file |

### CI workflow changes

The workflow was renamed from "Unit Tests" to "Unit Tests & Quality Gates" and the job from `test` to `quality`. Four steps now run in sequence on every PR and push to `main`:

1. `npm test -- --ci --verbose` — Jest unit tests
2. `npm run typecheck` — `tsc --noEmit` (TypeScript strict mode)
3. `npm run lint:report` — ESLint scoped to report layer only
4. `npm run check:whitelist` — Client Display gateway enforcement

Node upgraded from 20 → 22. npm cache enabled.

### Whitelist script design

`scripts/check-client-display-whitelist.mjs` scans:
- `src/app/client-report-rc3`
- `src/lib/pdf`

Forbidden fields: `description`, `notes`, `k_note`, `memo`, `internal_notes`, `supplier_notes`, `staff_notes`

Detection patterns:
- **dot / optional-chain**: `.description`, `.notes?.k_note`
- **bracket single-quote**: `['description']`
- **bracket double-quote**: `["notes"]`
- **destructuring**: `const { description } = row`, `const { description: label } = tx`

Known limitations (M1 scope):
- Multi-line destructuring not caught
- Function parameter destructuring `function f({ description })` not caught

### npm scripts (no npx)

```json
"typecheck":      "tsc --noEmit",
"lint:report":    "eslint --no-eslintrc --config .eslintrc.report.json --ext .ts,.tsx src/lib/report src/__tests__/report src/app/client-report-rc3 src/lib/pdf",
"check:whitelist":"node scripts/check-client-display-whitelist.mjs"
```

All scripts callable locally with `npm run <script>` — identical to CI invocation.

### Vercel impact

None. `.eslintrc.report.json` is used only with `--no-eslintrc` flag — Vercel's Next.js build uses its own lint config and is unaffected.

---

## What M0.1 does NOT change

- No source business logic
- No accounting rules or SQL
- No RLS policies or Supabase schema
- No Next.js or Vercel configuration
- No root `.eslintrc.json`

---

*Authored: 2026-07-11 | Branch: m0.1/ci-hardening*
