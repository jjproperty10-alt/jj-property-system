# PR #54 E2 cosmetics — preservation (DRAFT)

Status: **DRAFT preservation only**. Nothing here is applied, wired, or merged.
No `src` file is changed by this note. This file is not business authority.

| | |
| --- | --- |
| PR | [#54](https://github.com/jjproperty10-alt/jj-property-system/pull/54) `feat(ds/e2): Partner Report migration to DS primitives` |
| Head | `refs/pull/54/head` = `c965baaa4023c8087066592d186351bc2dd71272` (`design-system-2035/e2-partner-report-migration`) |
| Merge base | `69daa8935a72d85225b0dcf26d0681ae4ecdc9b4` (merge-base of that head with `main` `b0bac3a7`) |
| Preserved on | `main` `b0bac3a7ebdb9318faeac0348d21bf960377bfac` |
| Patch | `docs/preserved/pr54_e2_cosmetics.patch` — three-dot diff of head vs that merge base. Not applied. |

The patch is the PR diff (`git diff 69daa893…c965baaa`). It records what #54 changed. It is not a change to the partner components on this branch.

Scope of the PR: five files, +339 / −305.

- `src/components/partner/PartnerCapitalSection.tsx`
- `src/components/partner/PartnerFinancialSection.tsx`
- `src/components/partner/PartnerPortfolioSection.tsx`
- `src/components/partner/PartnerTimelineSection.tsx`
- `src/__tests__/ds/e2Migration.test.tsx` (added)

`git apply --check` of the full patch against `main` `b0bac3a7` fails. Capital, Portfolio, and the new test file match the context the patch expects. Financial and Timeline do not. The Timeline failure is the independent `HighlightTimeline` refactor, called out below. Financial fails because `main` (R4, #59) dropped the `settlement` prop and the Current Balance block; the PR diff still edits the older signature that takes `financial` and `settlement`.

## Timeline does not apply verbatim

`PartnerTimelineSection` on `main` `b0bac3a7` does not contain the inline renderer the PR edits.

On `main` the section imports `HighlightTimeline` and delegates the event list to it (`src/components/partner/PartnerTimelineSection.tsx`). The header comment states that the previous inline `EventItem` was removed and that `HighlightTimeline` is the owner of partner-visible event list rendering. The section itself keeps the `<h3>Timeline</h3>` header, the pending-date badge (“N date(s) to confirm”), and the empty-state sentence.

The PR patch still searches for that removed inline file: local `eur()`, `EventItem`, the `<ol>` of events, and the amber “· unconfirmed” marker. `git apply --check` fails on `src/components/partner/PartnerTimelineSection.tsx` while searching for that text. The Timeline hunk will not apply verbatim onto `main`. Replaying it would need a fresh edit against `HighlightTimeline`, which this preservation does not do.

## Per file (diff vs merge base `69daa893`)

Descriptions below are what `c965baaa` changed relative to the merge base, read from the patch. They are not a description of `main`.

### `PartnerCapitalSection.tsx`

Cosmetic migration of the capital block onto design-system primitives. The DTO is still the only source of values.

- Removes the local `eur()` formatter (`Intl.NumberFormat`, `en-IE`, EUR, 0 fraction digits).
- Imports `MoneyValue` and `SectionHeader` from `@/components/ds`.
- Replaces the bare `<section>` and inline `<h3>Capital</h3>` with a rounded card (`rounded-lg border border-gray-200 bg-white p-5 shadow-sm`) and `<SectionHeader title="Capital" action={…} />`.
- Removes the four KPI tiles (`KpiTile`) and the paid-percent progress bar (`paidPct`, the emerald/blue bar, `motion-reduce:transition-none`).
- Renders Agreed Valuation, Required Capital, Capital Paid, and Remaining as a two-column grid of `jj-label` plus `<MoneyValue size="sm" />`. Paid is green when non-null. Remaining is amber when `> 0`, otherwise green. Null amounts stay on the `MoneyValue` null path (em dash), not coerced to 0.
- Payment history becomes a compact `<ul>` under a `text-[10px]` “Payment History” label. Date uses `toLocaleDateString('en-IE')` (the merge base used an explicit day/short-month/year pattern). A missing date renders U+2014. Payer stays `via {payerName}`. `pending_verification` stays a “date unconfirmed” chip. The amount is `<MoneyValue size="sm" />`.
- The “Capital details pending confirmation.” line remains, and only when `capitalStatus === 'capital_unknown'` and there are no payments. Copy color moves to `text-gray-400`.
- Replaces `KpiTile` with `CapitalStatusBadge` in the header action slot. It maps all five `CapitalStatus` values, including deprecated `not_applicable` (label `N/A`): `no_capital_event` → No Capital Events, `fully_paid` → Fully Paid, `partially_paid` → Partially Paid, `capital_unknown` → Capital Pending. Unknown status falls back to the raw status string. The badge is a compact `text-[10px]` pill, not a KPI tile.

### `PartnerFinancialSection.tsx`

Cosmetic migration of the RC3 financial table. Row filtering is unchanged: `visibleRow` is not in the diff.

- Removes local `eur()`. Imports `MoneyValue` and `SectionHeader`.
- Replaces `<section>` + inline `<h3>Financial</h3>` with the same rounded card and `<SectionHeader title="Financial Report" />`.
- Period label moves into the header `action` slot. The merge-base en dash (`–`) becomes an arrow: `{fromDate ?? 'all time'} → {toDate ?? 'present'}`, still `dir="ltr"`.
- Section closing balance becomes `<MoneyValue amount={section.closing_balance} size="sm" />`, blue when `>= 0`, red otherwise. The separate `isPositive` local is removed.
- The bordered gray table wrapper is removed. The table is a plain `border-collapse` table: `text-[10px]` header (Date / Description / Amount), row date `dir="ltr"`, `display_label` plus optional ` — {description}`, amount `<MoneyValue amount={row.client_amount} size="sm" />` green/red from `balance_effect`. Hover remains; `motion-reduce:transition-none`, cell padding, and `break-words` from the a11y pass are dropped.
- Current Balance becomes `<MoneyValue amount={settlement.currentBalanceEur} size="sm" className="font-bold text-gray-400" />`. Null is left to `MoneyValue` (em dash). The null note changes from “Pending Settlement Engine” to “Final balance pending Settlement Engine.” Direction is not inferred from null.

On `main` this file no longer takes `settlement` (see the apply note above), so this hunk does not apply verbatim either.

### `PartnerPortfolioSection.tsx`

Cosmetic migration of the portfolio summary. The component still does not render a settled / payable / receivable label.

- Removes local `eur()` (the merge-base helper already mapped `null` to `—`). Imports `MoneyValue` and `SectionHeader`.
- Replaces the `rounded-2xl` header strip and inline `<h2>` with the rounded card and `<SectionHeader title="Portfolio Summary — {n} property|properties" />`.
- Removes `PortfolioTile` KPI tiles. Totals become a two-column `jj-label` + `<MoneyValue size="sm" />` grid:
  - Total Agreed Valuation
  - Total Capital Paid (green when non-null)
  - Total Remaining (amber when non-null and `> 0`, green when non-null and not `> 0`)
- Net Settlement is no longer a gray KPI tile. It is a `jj-label` plus `text-gray-400 text-xs italic` “Pending Settlement Engine”. The comment that `direction: 'unknown'` must not be rendered as balanced/payable/receivable stays.
- Unknown-total note: condition is unchanged (`totalCapitalPaidEur === null` or `totalCapitalRemainingEur === null`). Copy becomes “\* Some totals are unavailable — capital amounts for one or more properties are not yet confirmed.” at `text-[10px] text-gray-400`.

### `PartnerTimelineSection.tsx`

Cosmetic migration of the inline timeline that existed at the merge base. This is the hunk that conflicts with `HighlightTimeline` on `main`.

- Removes local `eur()` and the `TimelineEvent` import stays. Imports `MoneyValue` and `SectionHeader`.
- Replaces `<section>` + inline `<h3>Timeline</h3>` with the rounded card and `<SectionHeader title="Timeline" />`.
- Pending-date badge moves to the header `action` slot. Copy changes from “{n} date/dates to confirm” (amber pill) to “{n} date/dates pending confirmation” (`text-[10px] text-amber-600`). Same guard: `hasPendingDates && openVerificationTasks > 0`.
- Empty copy stays “No timeline events recorded yet.” Color moves from `text-gray-500` to `text-gray-400`.
- The event list stays an `<ol>` on a left border. `EventItem` is renamed `TimelineEventItem`. Dot color moves from `bg-blue-500` to `bg-blue-400`. Date line becomes `text-[10px] text-gray-400` with `dir="ltr"`. Missing date stays “Date unknown”. `pending_verification` stays inline as “date unconfirmed” (the merge base used “· unconfirmed”). `break-words` on the description is removed. A non-null `amountEur` renders `<MoneyValue amount={event.amountEur} size="sm" className="text-gray-600" />` instead of `eur()`.

### `src/__tests__/ds/e2Migration.test.tsx`

New file. Pure rendering checks via `renderToStaticMarkup` (no jsdom). They render `MoneyValue` and `SectionHeader` directly. They do not mount the four partner sections.

The findings summary dated 03.10.2026 said “9 pure rendering tests”. The file at `c965baaa` contains **10** `it` cases:

1. `MoneyValue` null renders an em dash, and does not render `>0<` or `>null<`.
2. `MoneyValue` zero renders `0` and does not render the em-dash entity.
3. A non-null amount includes `dir="ltr"`.
4. A null amount does not include `dir="ltr"`.
5. `SectionHeader` renders the title string.
6. `SectionHeader` renders `action` slot content.
7. `SectionHeader` renders `badge` slot content together with the title.
8. `size="sm"` includes `text-sm`.
9. `size="lg"` includes `text-xl`.
10. A null amount with a conditional `className` still renders the em dash and includes `text-gray-400`.

Header comment in the test file: null → em dash is the P-ARCH-1 check through `MoneyValue`. Business logic is explicitly out of scope of these tests.
