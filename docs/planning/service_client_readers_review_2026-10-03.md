# Service client readers — 2026-10-03

Draft review of every production file that calls `createServiceClient()`. Nothing here was applied to a database.

The factory is `src/lib/supabase.ts`. `createServiceClient()` awaits `requireStaffCompanyPermission()` before `rawServiceClient()`. A caller who is not active staff, or not a member of the resolved company, never receives the client and no relation is read.

Repo search found no cron, webhook, or script that calls `createServiceClient()`. Files below marked unwired have no page, route, server action, or other production importer. They are not given a separate unguarded client.

## Counts

- action: 16
- page/route: 6
- unwired: 8
- user-reachable library: 48
- cron / webhook / script: 0
- total readers (excluding the factory): 78

## Readers

| Path | Reach | Relations | Guard before this draft | Risk | Action |
|---|---|---|---|---|---|
| `src/app/(app)/finance/external-partner/avi/operations/page.tsx` | page/route | (client only; relations are in a callee) | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/app/(app)/owners/[slug]/page.tsx` | page/route | (client only; relations are in a callee) | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/app/(app)/owners/[slug]/report/pdf/route.ts` | page/route | schema statements, rpc get_draft_lines_for_transactions, statement_series | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/app/(app)/owners/[slug]/statement/ltr/page.tsx` | page/route | schema lifecycle, property_definitions, rental_contracts, service_engagements | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/app/(app)/owners/new/page.tsx` | page/route | property_definitions, user_roles | session getUser | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/app/(app)/page.tsx` | page/route | v_anastasia_clearing, v_cashbox_audit, v_ceo_summary, v_jj_company_pl | requireStaffCompanyPermission at the call site | Call site already refused a missing staff role or membership. Other readers of the same client did not. | Kept the call-site check. createServiceClient now repeats it before opening the service connection. |
| `src/lib/attention/attentionService.ts` | unwired | schema lifecycle/pms/revintel, sync_errors, v_portfolio_summary, verification_tasks | none in this file | No current production caller. A later import would have been an unguarded service read. | No bypass added. Not a cron, webhook, or script. The factory check still applies if this file is imported later. |
| `src/lib/auth/reportAuthorization.ts` | action | property_owners, user_roles | session getUser | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/ceo/companyDataService.ts` | user-reachable library | v_anastasia_clearing, v_cashbox_audit, v_jj_company_pl | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/controlroom/controlRoomService.ts` | unwired | schema revintel, property_definitions, v_portfolio_summary | none in this file | No current production caller. A later import would have been an unguarded service read. | No bypass added. Not a cron, webhook, or script. The factory check still applies if this file is imported later. |
| `src/lib/dal/resolvePrincipal.ts` | user-reachable library | user_roles | session getUser | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/executive/executiveBriefService.ts` | user-reachable library | schema lifecycle/pms, connections, v_cashbox_audit, verification_tasks | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/finance/certifiedClientSettlementAdapter.ts` | user-reachable library | schema lifecycle, entity_property_associations, management_relationship | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/finance/certifiedStrMonthlySettlementAdapter.ts` | unwired | (client only; relations are in a callee) | none in this file | No current production caller. A later import would have been an unguarded service read. | No bypass added. Not a cron, webhook, or script. The factory check still applies if this file is imported later. |
| `src/lib/finance/computeFinancialPosition.ts` | user-reachable library | schema finance, claim_templates, v_cashbox_audit | requireStaffCompanyPermission at the call site | Call site already refused a missing staff role or membership. Other readers of the same client did not. | Kept the call-site check. createServiceClient now repeats it before opening the service connection. |
| `src/lib/finance/evaluateClaim.ts` | user-reachable library | schema finance/statements, claim_templates, evidence_links, statement_events, v_cashbox_audit | requireStaffCompanyPermission at the call site | Call site already refused a missing staff role or membership. Other readers of the same client did not. | Kept the call-site check. createServiceClient now repeats it before opening the service connection. |
| `src/lib/finance/evaluateDecision.ts` | user-reachable library | schema finance, claim_templates | requireStaffCompanyPermission at the call site | Call site already refused a missing staff role or membership. Other readers of the same client did not. | Kept the call-site check. createServiceClient now repeats it before opening the service connection. |
| `src/lib/finance/logDecision.ts` | user-reachable library | schema finance, decision_log, position_score_deltas | requireStaffCompanyPermission at the call site | Call site already refused a missing staff role or membership. Other readers of the same client did not. | Kept the call-site check. createServiceClient now repeats it before opening the service connection. |
| `src/lib/finance/ownerLevelPaymentAdapter.ts` | user-reachable library | schema finance, v_owner_level_payment_conflicts, v_owner_level_payments | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/identity/identityResolverService.ts` | user-reachable library | schema lifecycle, entity_identity, jj_relationships, management_relationship, rpc resolve_party_id | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/identity/partyResolverService.ts` | user-reachable library | rpc resolve_party_canonical, rpc resolve_party_id | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/identity/propertyResolverService.ts` | user-reachable library | rpc resolve_property_canonical | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/legacy/staffRentalContracts.ts` | action | properties, rental_contracts | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/legacy/staffViewActions.ts` | action | (client only; relations are in a callee) | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/lifecycle/partnerAuthService.ts` | user-reachable library | schema lifecycle, entity_identity, investor_auth, partner_entry | session getUser | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/lifecycle/partnerStatementService.ts` | user-reachable library | schema lifecycle, capital_event, entity_identity, ownership_period, partner_entry, v_partner_investment_statement | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/lifecycle/timelineService.ts` | user-reachable library | schema lifecycle, capital_event, entity_identity, ownership_period, partner_entry, v_partner_investment_statement, verification_tasks | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/money/moneyPositionService.ts` | user-reachable library | v_money_position | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/nav/resolveFrameUser.ts` | user-reachable library | user_roles | session getUser | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/billingActions.ts` | action | schema statements, rpc allocate_payment, rpc apply_correction_case, rpc apply_reclassification_correction, rpc fifo_allocate_payment, rpc get_report_preferences, rpc open_correction_case, rpc set_report_preferences, rpc toggle_draft_line_inclusion, rpc transition_correction_case, statement_series | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/brokerageActions.ts` | action | schema lifecycle, rpc create_brokerage_obligation, rpc update_brokerage_status | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/brokerageAdapter.ts` | unwired | schema lifecycle, rpc get_contract_brokerage, rpc get_property_brokerages | none in this file | No current production caller. A later import would have been an unguarded service read. | No bypass added. Not a cron, webhook, or script. The factory check still applies if this file is imported later. |
| `src/lib/owners/createOwnerAction.ts` | action | schema lifecycle, rpc create_owner_draft, user_roles | session getUser | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/depositActions.ts` | action | schema lifecycle, rpc record_deposit_event | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/depositAdapter.ts` | user-reachable library | schema lifecycle, rpc get_deposit_history | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/managementFeeActions.ts` | action | schema lifecycle, rpc generate_management_fee_obligation, rpc offset_management_fee_from_rent | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/managementFeeAdapter.ts` | user-reachable library | schema lifecycle, rpc get_property_management_fees | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/ownerAuditAdapter.ts` | user-reachable library | rpc get_owner_statement_snapshots, rpc resolve_party_id | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/ownerFinancialAdapter.ts` | user-reachable library | schema lifecycle/statements, rpc get_correction_cases, rpc get_correction_events, rpc get_draft_lines_for_transactions, rpc get_payment_allocations, rpc get_report_preferences, rpc get_sent_entries_for_transactions, v_occupancy_position | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/ownerPortfolioAdapter.ts` | user-reachable library | (client only; relations are in a callee) | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/ownerReservationAdapter.ts` | user-reachable library | (client only; relations are in a callee) | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/ownerServiceEngagementAdapter.ts` | user-reachable library | schema lifecycle, property_definitions, rpc get_entity_associated_properties, rpc get_entity_service_engagements | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/ownerSettlementAdapter.ts` | user-reachable library | settlement_temporal_transitions, v_contact_settlement_summary | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/ownerStrAuditAdapter.ts` | user-reachable library | schema lifecycle, property_definitions, service_engagements | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/ownerStrCockpit.ts` | user-reachable library | (client only; relations are in a callee) | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/ownerWorkspaceService.ts` | user-reachable library | schema statements, rpc get_owner_financial_summary, statement_events, statement_series, upcoming_events | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/rentalContractActions.ts` | action | schema lifecycle, rpc create_rental_contract, rpc update_rental_contract | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/rentalContractAdapter.ts` | user-reachable library | schema lifecycle, rpc get_engagement_rental_contracts, rpc get_property_rental_contracts | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/rentObligationActions.ts` | action | schema lifecycle, rpc allocate_rent_payment, rpc create_rent_term, rpc generate_rent_obligations, rpc reverse_rent_allocation | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/rentPositionAdapter.ts` | user-reachable library | schema lifecycle, rent_obligations, rent_terms, rpc get_property_rent_position | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/serviceEngagementActions.ts` | action | schema lifecycle, rpc create_service_engagement, rpc update_service_engagement, service_engagements | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/strStatementPdfScopeServer.ts` | user-reachable library | (client only; relations are in a callee) | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/tenantChargeActions.ts` | action | schema lifecycle, rpc create_tenant_charge_obligation, rpc set_statement_presentation_override, rpc update_tenant_charge_status | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/tenantChargeAdapter.ts` | user-reachable library | schema lifecycle, rpc get_contract_tenant_charges, rpc get_outstanding_tenant_charges, rpc get_property_tenant_charges, rpc resolve_statement_presentation | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/tenantSettlementActions.ts` | action | schema lifecycle, rpc compute_tenant_settlement, rpc create_closing_statement, rpc update_settlement_status | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/tenantSettlementAdapter.ts` | unwired | schema lifecycle, rpc get_closing_statement, rpc get_contract_closing_position, rpc get_contract_settlement_runs | none in this file | No current production caller. A later import would have been an unguarded service read. | No bypass added. Not a cron, webhook, or script. The factory check still applies if this file is imported later. |
| `src/lib/owners/utilityActions.ts` | action | schema lifecycle, rpc record_meter_reading | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/owners/utilityAdapter.ts` | unwired | schema lifecycle, rpc get_applicable_utility_rates, rpc get_meter_readings, rpc get_property_utility_meters, rpc get_tenant_utility_obligations | none in this file | No current production caller. A later import would have been an unguarded service read. | No bypass added. Not a cron, webhook, or script. The factory check still applies if this file is imported later. |
| `src/lib/ownership/orchestrator.ts` | user-reachable library | entity_registry, partnership_ownership | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/ownership/ownershipService.ts` | user-reachable library | entity_registry, partnership_ownership | requireStaffCompanyPermission at the call site | Call site already refused a missing staff role or membership. Other readers of the same client did not. | Kept the call-site check. createServiceClient now repeats it before opening the service connection. |
| `src/lib/partner-settlement/adapters/cashboxReader.ts` | user-reachable library | v_anastasia_clearing, v_cashbox_audit | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/partner-settlement/adapters/ownerScopeReader.ts` | user-reachable library | contact_properties | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/partner-settlement/adapters/ownershipReader.ts` | user-reachable library | schema lifecycle, entity_identity, ownership_period | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/partner-settlement/adapters/propertyReader.ts` | user-reachable library | property_definitions | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/partner-settlement/adapters/receivablesReader.ts` | user-reachable library | v_money_position | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/partner-settlement/adapters/transactionsReader.ts` | user-reachable library | transaction_exclusions, transactions | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/partner-settlement/external-partner/externalPartnerTransactionsSource.ts` | user-reachable library | transactions | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/partner-settlement/partnerReportBService.ts` | user-reachable library | v_jj_company_pl | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/report/clientAccount/loadClientAccountReport.ts` | unwired | schema lifecycle, entity_identity, transactions | none in this file | No current production caller. A later import would have been an unguarded service read. | No bypass added. Not a cron, webhook, or script. The factory check still applies if this file is imported later. |
| `src/lib/report/fetchReport.ts` | user-reachable library | (client only; relations are in a callee) | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/report/str/ownerStrStatementService.ts` | user-reachable library | (client only; relations are in a callee) | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/revintel/revenueIntelligenceService.ts` | unwired | schema revintel, recommendation | none in this file | No current production caller. A later import would have been an unguarded service read. | No bypass added. Not a cron, webhook, or script. The factory check still applies if this file is imported later. |
| `src/lib/statements/statementAuthService.ts` | user-reachable library | schema lifecycle, entity_identity, jj_staff_config, partner_entry | authenticateStatementUser (staff row, no membership); session getUser | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/statements/statementBuilderService.ts` | user-reachable library | schema lifecycle, ownership_period | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/statements/statementContextResolver.ts` | user-reachable library | schema lifecycle, entity_identity, management_relationship, partner_entry | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/statements/statementLifecycleActions.ts` | action | schema statements, rpc add_draft_line, rpc create_statement_draft, rpc remove_draft_line, rpc send_statement, rpc set_draft_status | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/transactions/correctionWorkspaceActions.ts` | action | schema statements, correction_applied_transactions, correction_cases, transaction_exclusions, transactions | authenticateStatementUser (staff row, no membership) | Staff lookup did not require company membership, and the staff row was read with the service client. | Draft: await createServiceClient(), which now requires staff and membership first. |
| `src/lib/transactions/resolveBoundCorrectionSeries.ts` | user-reachable library | schema lifecycle/statements, management_relationship, statement_series | none in this file | An authenticated caller who reached this function could read company rows with no staff or membership check. | Draft: await createServiceClient(), which now requires staff and membership first. |

## Fail-closed test results

Recorded from the suites on this draft. Nothing was applied to a database. A domain test that mocks `createServiceClient` does not prove the staff and membership guard, so those tests are not listed as coverage.

`serviceClientFailClosed` is `src/__tests__/security/serviceClientFailClosed.test.ts` (6 cases). The throwaway file is `src/__tests__/security/directServiceClientsCompanyGate.throwaway.test.ts` (14 cases). The throwaway suite runs only when `JJ_THROWAWAY_PG` points at local throwaway Postgres. The default Jest run leaves it skipped. Both suites passed on this draft: the 6 cases inside Jest, and the 14 cases against throwaway Postgres. No Supabase project was contacted.

### serviceClientFailClosed (6)

1. **Factory source.** In `createServiceClient`, `await requireStaffCompanyPermission()` appears before `rawServiceClient()`. Every production caller (more than 40 files, tests excluded) uses `await createServiceClient()` on a non-comment line. This scan is what covers a reader that no direct test calls.
2. **No staff role.** `createServiceClient()` throws `BLOCKED_BY_MISSING_PERMISSION`. No new `createClient` call uses the service key.
3. **Membership false.** `createServiceClient()` throws `BLOCKED_BY_MISSING_PERMISSION`. The factory is the only call.
4. **Membership null.** Same throw. The factory is the only call.
5. **Unauthenticated.** Session user is null. `createServiceClient()` throws `BLOCKED_BY_MISSING_PERMISSION`. No new `createClient` call uses the service key.
6. **`resolveFrameUser()`.** With no staff role it resolves to null and opens no service connection. This is the direct runtime case for `src/lib/nav/resolveFrameUser.ts`.

Cases 2–5 call the factory, not each reader. A reader that only obtains company data through that factory hits the same refusal, because the permission await is before `rawServiceClient()`.

### Throwaway Postgres (14)

Local throwaway database only. The three data paths are CEO `fetchAll` (`src/app/(app)/page.tsx`), `fetchOwnershipForProperty` (`src/lib/ownership/ownershipService.ts`), and `loadFinanceDecision` (the decision page). That load calls `computeFinancialPosition` and `evaluateDecision`. Both call `evaluateClaim`. `logDecision` is the execute action and is not called by this load.

1. **One active company.** The resolver returns company A. CEO returns the four views. Ownership is 50, not 100. The decision load returns a position. Reads sent are the four `v_*` views, then `entity_registry` and `partnership_ownership`, then `claim_templates` and `v_cashbox_audit` among the decision reads.
2. **Zero active companies.** The three paths return no data and send no read.
3. **Sole company inactive.** The three paths return no data and send no read.
4. **Second active company.** Every company-wide relation is refused with `BLOCKED_BY_COMPANY_CONTEXT` before it is sent. The three paths return no data and send no read.
5. **Unlisted relation.** `transactions` and `position_score_deltas` throw `BLOCKED_BY_UNGATED_RELATION` even when the resolver would allow the company. Nothing is sent.
6. **Resolver finding.** `access.resolve_service_read_company` does not mention `is_company_member` or `user_roles`. A user id is refused for a member and for a non-member, as `service_role` and as `authenticated`.
7. **Staff and member.** The three paths return data. The session mock records no `schema()` call.
8. **Public membership wrapper.** `requireStaffCompanyPermission.ts` does not contain `schema('access')` or `schema("access")`. `public.is_company_member` is not security definer, and its body calls `access.is_company_member`. `fetchAll` returns no error and records no `schema()` call.
9. **Staff, not a member.** `BLOCKED_BY_MISSING_PERMISSION`. No data and no relation read. No `schema()` call.
10. **Member, not staff.** Same closed result.
11. **Inactive staff.** Same closed result. The user is also a company member.
12. **RPC error.** `EXECUTE` on `public.require_jj_staff(text[])` is revoked from `authenticated` for the case, then granted again. Same closed result.
13. **Unauthenticated.** Same closed result.
14. **`finance.is_active_jj_staff`.** The installed body is the migration body (it reads `jj_staff_config` and `is_active`). It is true only for active staff. The app does not call this helper. `finance` is not a PostgREST schema.

The same three paths are also driven with mocks, not throwaway Postgres, by `directServiceClientsCompanyGate.behavior.test.ts` (one company, resolver throw / null / undefined / empty, staff+non-member, member+non-staff, inactive staff, RPC error, unauthenticated) and by `directServiceClientsCompanyGate.serviceKey.test.ts` (missing service key does not use the anon key; null or undefined company id returns no dashboard data, throws from ownership, and sends no read; the decision path is blocked before a relation read).

### Coverage of the 70 user-reachable readers

User-reachable is 6 page/route + 16 action + 48 library. The factory source scan (case 1) plus the factory refusals (cases 2–5) apply to all 70. A row below names a direct test only when that test imports the reader, or the page that calls it, and runs it. `loadFinanceDecision` does not call `logDecision`.

Where the direct-test cell says "No direct test", the factory guard is the coverage: case 1 requires `await createServiceClient()` on every non-comment production call, and `createServiceClient` awaits `requireStaffCompanyPermission()` before `rawServiceClient()`. Cases 2–5 show that factory throws `BLOCKED_BY_MISSING_PERMISSION` for no staff role, membership false, membership null, and an unauthenticated session, and the no-staff and unauthenticated cases open no service connection. "No test file names this module" means no test file contains that module path or its basename as an import. That absence does not leave the reader unguarded.

### page/route (6)

| Path | Direct test |
|---|---|
| `src/app/(app)/finance/external-partner/avi/operations/page.tsx` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/app/(app)/owners/[slug]/page.tsx` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/app/(app)/owners/[slug]/report/pdf/route.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/app/(app)/owners/[slug]/statement/ltr/page.tsx` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/app/(app)/owners/new/page.tsx` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/app/(app)/page.tsx` | behavior `fetchAll`; serviceKey CEO page; throwaway `fetchAll` |

### action (16)

| Path | Direct test |
|---|---|
| `src/lib/auth/reportAuthorization.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/legacy/staffRentalContracts.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/legacy/staffViewActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/billingActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/brokerageActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/createOwnerAction.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/owners/depositActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/managementFeeActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/rentalContractActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/rentObligationActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/serviceEngagementActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/tenantChargeActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/tenantSettlementActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/owners/utilityActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/statements/statementLifecycleActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/transactions/correctionWorkspaceActions.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |

### user-reachable library (48)

| Path | Direct test |
|---|---|
| `src/lib/ceo/companyDataService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/dal/resolvePrincipal.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/executive/executiveBriefService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/finance/certifiedClientSettlementAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/finance/computeFinancialPosition.ts` | `loadFinanceDecision` in behavior, serviceKey, and throwaway; source `.from()` check in `directServiceClientsCompanyGate.test.ts` |
| `src/lib/finance/evaluateClaim.ts` | called from `computeFinancialPosition` and `evaluateDecision` during that load; source `.from()` check in `directServiceClientsCompanyGate.test.ts` |
| `src/lib/finance/evaluateDecision.ts` | `loadFinanceDecision` in behavior, serviceKey, and throwaway (it calls `evaluateClaim`); source `.from()` check in `directServiceClientsCompanyGate.test.ts` |
| `src/lib/finance/logDecision.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/finance/ownerLevelPaymentAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/identity/identityResolverService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/identity/partyResolverService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/identity/propertyResolverService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/lifecycle/partnerAuthService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/lifecycle/partnerStatementService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/lifecycle/timelineService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/money/moneyPositionService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/nav/resolveFrameUser.ts` | serviceClientFailClosed case 6 (`resolveFrameUser`) |
| `src/lib/owners/depositAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/managementFeeAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/ownerAuditAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/ownerFinancialAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/ownerPortfolioAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/ownerReservationAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/ownerServiceEngagementAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/ownerSettlementAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/ownerStrAuditAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/ownerStrCockpit.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/ownerWorkspaceService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/rentalContractAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/owners/rentPositionAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/owners/strStatementPdfScopeServer.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/owners/tenantChargeAdapter.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/ownership/orchestrator.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/ownership/ownershipService.ts` | behavior, serviceKey, throwaway, and the ownership describe in `directServiceClientsCompanyGate.test.ts` |
| `src/lib/partner-settlement/adapters/cashboxReader.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/partner-settlement/adapters/ownerScopeReader.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/partner-settlement/adapters/ownershipReader.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/partner-settlement/adapters/propertyReader.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/partner-settlement/adapters/receivablesReader.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/partner-settlement/adapters/transactionsReader.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/partner-settlement/external-partner/externalPartnerTransactionsSource.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/partner-settlement/partnerReportBService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/report/fetchReport.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/report/str/ownerStrStatementService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/statements/statementAuthService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/statements/statementBuilderService.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. No test file names this module. |
| `src/lib/statements/statementContextResolver.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |
| `src/lib/transactions/resolveBoundCorrectionSeries.ts` | No direct test. Factory scan (case 1) plus factory cases 2–5. |

## Proven migration order

Recorded only. Nothing in this list was applied. `cursor/isolation-a-nodep-plus-slice-b-merge-draft` is based on `cursor/isolation-direct-service-clients-a-nodep`. The Slice B column map is in `src/lib/auth/serviceRoleCompanyGate.ts`. GateMode stays `filter` | `verify` | `refuse`. The wide set stays disjoint from the filtered map. A non-empty company id is still required. The factory still awaits staff and membership before `rawServiceClient()`. The typescript-eslint plugin is not on that line. The later combined draft's apply order is `docs/planning/combined_apply_order_2026-10-03.md`.

1. Slice A `20260930220000` (`client_entity_company_isolation`). The guard requires `supabase_migrations.schema_migrations` count exactly 193, version `20260930200000` present once, version `20260930220000` absent, no duplicate versions, and the sole-company checks in that file. That SQL is reference only. It is not under `supabase/migrations` on this branch.
2. `create_owner_draft` `20261003130000`. This is not `lifecycle.create_owner_draft` in `supabase/migrations/20260810_001_pr4_wizard_foundation.sql`. The `20261003130000` file is not on this branch.
3. `supabase/migrations/20261003170000_public_is_company_member_wrapper.sql`. Draft wrapper. Not applied.
4. The Slice B app column map (`SERVICE_ROLE_COMPANY_COLUMNS`). Code only. Not a migration. `entity_identity` and `management_relationship` filter on `operating_company_id`. `parties` filters on `company_id`. Those columns are usable only after Slice A. This file does not apply Slice A.
5. `PROPOSAL_20261003160000` only when a second company must be writable. That file is not on this branch. Not applied.

The security head `90b8c063` (`cursor/security-hardening-drafts-2026-10-03`) is merged on `cursor/isolation-nodep-slice-b-plus-security-draft`. `restrictedStaffActions.ts` awaits `createServiceClient()` after the staff check, so company membership is required. Capital upsert still requires an active ceo, an active superadmin staff role, or an active `user_roles` superadmin. The combined apply order is `docs/planning/combined_apply_order_2026-10-03.md`. That note keeps the wrapper with the database migrations, before the app deploy. Nothing in that order was applied.

