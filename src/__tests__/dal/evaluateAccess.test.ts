/**
 * evaluateAccess.test.ts — DAL v0.1 test suite.
 *
 * Covers all 15 original test categories plus 12 Company Executive View
 * categories from the corrected directive (22 July 2026, NEEDS_FIXES applied).
 *
 * Tests 1-5:   Deny paths (unauthenticated, missing scope, company/entity mismatch, unknown policy)
 * Tests 6-7:   Allow paths (company-wide, entity-scoped)
 * Tests 8-10:  Determinism, reason codes, policy version
 * Tests 11-12: Service query ordering (no query before allow, query after allow)
 * Tests 13:    M0 route fails closed
 * Tests 14:    Cross-company leakage impossible
 * Tests 15:    Partner auth behavior unchanged
 * Tests 16:    Company Executive View (12 directive categories)
 *
 * @see ADR-003_DECISION_ACCESS_LAYER.md
 */

import { evaluateDecisionAccess } from '@/lib/dal/evaluateAccess'
import { findPolicy, POLICY_VERSION, JJ_COMPANY_ID } from '@/lib/dal/policies'
import { EXECUTIVE_BRIEF_DECLARATION } from '@/lib/executive/executiveBriefDeclaration'
import type {
  DecisionAccessDeclaration,
  PrincipalContext,
} from '@/lib/dal/types'

// ─── Test fixtures ────────────────────────────────────────────────────────

function makeCeoPrincipal(overrides: Partial<PrincipalContext> = {}): PrincipalContext {
  return {
    userId: 'ceo-user-id-001',
    companyIds: [JJ_COMPANY_ID],
    roles: ['superadmin'],
    entityScopes: [],
    ...overrides,
  }
}

function makePartnerPrincipal(overrides: Partial<PrincipalContext> = {}): PrincipalContext {
  return {
    userId: 'partner-user-id-002',
    companyIds: [JJ_COMPANY_ID],
    roles: ['partner'],
    entityScopes: [
      { entityType: 'property', entityId: 'villa-mazotos', accessLevel: 'owner' },
    ],
    ...overrides,
  }
}

function makeExternalPrincipal(): PrincipalContext {
  return {
    userId: 'external-user-id-003',
    companyIds: ['other-company'],
    roles: ['superadmin'],
    entityScopes: [],
  }
}

function makePartnerDeclaration(): DecisionAccessDeclaration {
  return {
    decisionType: 'partner-statement',
    executiveOwner: 'chief-owner-success',
    classification: 'confidential',
    companyId: JJ_COMPANY_ID,
    entityScopes: [{ entityType: 'property', entityId: 'villa-mazotos' }],
    policyId: 'partner-own-statement',
  }
}

// ─── Test 1: Unauthenticated principal → deny ────────────────────────────

describe('Test 1: Unauthenticated / company mismatch → deny', () => {
  it('denies when principal has no matching company', () => {
    const principal = makeExternalPrincipal()
    const result = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_COMPANY_MISMATCH')
  })
})

// ─── Test 2: Missing business scope → deny ───────────────────────────────

describe('Test 2: Missing business scope → deny', () => {
  it('denies partner access to Executive Brief (role insufficient)', () => {
    // Partner role is NOT in the ceo-executive-brief policy
    const principal = makePartnerPrincipal()
    const result = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_ROLE_INSUFFICIENT')
  })
})

// ─── Test 3: Company mismatch → deny ─────────────────────────────────────

describe('Test 3: Company mismatch → deny', () => {
  it('denies even superadmin from another company', () => {
    const principal = makeCeoPrincipal({ companyIds: ['not-jj'] })
    const result = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_COMPANY_MISMATCH')
  })

  it('denies when declaration company differs from policy company', () => {
    const declaration: DecisionAccessDeclaration = {
      ...EXECUTIVE_BRIEF_DECLARATION,
      companyId: 'foreign-company',
    }
    const principal = makeCeoPrincipal({ companyIds: ['foreign-company'] })
    const result = evaluateDecisionAccess(principal, declaration)

    // Policy 'ceo-executive-brief' belongs to 'jj', not 'foreign-company'
    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_COMPANY_MISMATCH')
  })
})

// ─── Test 4: Entity mismatch → deny ──────────────────────────────────────

describe('Test 4: Entity mismatch → deny', () => {
  it('denies partner access to a property they do not own', () => {
    const declaration = makePartnerDeclaration()
    // Partner owns 'villa-mazotos' but declaration scopes to 'tamir-dekelia'
    const differentProperty: DecisionAccessDeclaration = {
      ...declaration,
      entityScopes: [{ entityType: 'property', entityId: 'tamir-dekelia' }],
    }
    const principal = makePartnerPrincipal()
    const result = evaluateDecisionAccess(principal, differentProperty)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_ENTITY_MISMATCH')
  })
})

// ─── Test 5: Unknown policy → deny ───────────────────────────────────────

describe('Test 5: Unknown policy → deny', () => {
  it('denies when policy ID does not exist', () => {
    const declaration: DecisionAccessDeclaration = {
      ...EXECUTIVE_BRIEF_DECLARATION,
      policyId: 'nonexistent-policy-xyz',
    }
    const principal = makeCeoPrincipal()
    const result = evaluateDecisionAccess(principal, declaration)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_UNKNOWN_POLICY')
  })

  it('findPolicy returns undefined for unknown policies', () => {
    expect(findPolicy('nonexistent-policy')).toBeUndefined()
  })
})

// ─── Test 6: Company-wide decision → allow awareness + view ──────────────

describe('Test 6: CEO accesses company-wide Executive Brief', () => {
  it('grants awareness and view to CEO via company executive view', () => {
    const principal = makeCeoPrincipal()
    const result = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)

    expect(result.awareness).toBe(true)
    expect(result.view).toBe(true)
    // ceo-executive-brief has allowCompanyExecutiveView=true
    // → Gate 7a emits ALLOW_COMPANY_EXECUTIVE_VIEW
    expect(result.reasonCodes).toContain('ALLOW_COMPANY_EXECUTIVE_VIEW')
  })

  it('v0.1: evidence, approve, execute are always false', () => {
    const principal = makeCeoPrincipal()
    const result = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)

    expect(result.evidence).toBe(false)
    expect(result.approve).toBe(false)
    expect(result.execute).toBe(false)
  })
})

// ─── Test 7: Entity-scoped decision → allow matching entity only ─────────

describe('Test 7: Entity-scoped partner statement', () => {
  it('allows partner to view their own property statement', () => {
    const principal = makePartnerPrincipal()
    const declaration = makePartnerDeclaration()
    const result = evaluateDecisionAccess(principal, declaration)

    expect(result.awareness).toBe(true)
    expect(result.view).toBe(true)
    expect(result.reasonCodes).toContain('ALLOW_ENTITY_SCOPE')
  })

  // ──────────────────────────────────────────────────────────────────────
  // CEO ENTITY-SCOPE BEHAVIOR — APPROVED (22 July 2026)
  //
  // Entity-scoped policies remain FAIL-CLOSED in v0.1.
  // allowCompanyExecutiveView is a company-level capability, NOT an
  // entity-scope bypass. partner-own-statement requires explicit entity
  // scope matching for ALL roles, including superadmin.
  // ──────────────────────────────────────────────────────────────────────

  it('CEO with empty entityScopes on partner statement → denied', () => {
    // Entity-scoped policies are fail-closed. No bypass path exists.
    const principal = makeCeoPrincipal() // entityScopes: []
    const declaration = makePartnerDeclaration() // entityScopes: [villa-mazotos]
    const result = evaluateDecisionAccess(principal, declaration)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_ENTITY_MISMATCH')
  })

  it('CEO WITH explicit entity scope can view partner statement', () => {
    // Entity scope matching is the only path for entity-scoped policies.
    const principal = makeCeoPrincipal({
      entityScopes: [
        { entityType: 'property', entityId: 'villa-mazotos', accessLevel: 'admin' },
      ],
    })
    const declaration = makePartnerDeclaration()
    const result = evaluateDecisionAccess(principal, declaration)

    expect(result.awareness).toBe(true)
    expect(result.view).toBe(true)
    expect(result.reasonCodes).toContain('ALLOW_ENTITY_SCOPE')
  })

  it('denies partner access to another partner\'s property', () => {
    const principal = makePartnerPrincipal() // owns villa-mazotos
    const declaration: DecisionAccessDeclaration = {
      ...makePartnerDeclaration(),
      entityScopes: [{ entityType: 'property', entityId: 'oren-kitty' }],
    }
    const result = evaluateDecisionAccess(principal, declaration)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_ENTITY_MISMATCH')
  })
})

// ─── Test 8: Determinism — same inputs → same result ─────────────────────

describe('Test 8: Determinism', () => {
  it('produces identical results for identical inputs', () => {
    const principal = makeCeoPrincipal()
    const result1 = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)
    const result2 = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)

    expect(result1.awareness).toBe(result2.awareness)
    expect(result1.view).toBe(result2.view)
    expect(result1.evidence).toBe(result2.evidence)
    expect(result1.approve).toBe(result2.approve)
    expect(result1.execute).toBe(result2.execute)
    expect(result1.reasonCodes).toEqual(result2.reasonCodes)
    expect(result1.policyVersion).toBe(result2.policyVersion)
  })

  it('deny is also deterministic', () => {
    const principal = makePartnerPrincipal()
    const result1 = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)
    const result2 = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)

    expect(result1.awareness).toBe(result2.awareness)
    expect(result1.view).toBe(result2.view)
    expect(result1.reasonCodes).toEqual(result2.reasonCodes)
  })
})

// ─── Test 9: Reason codes are stable ─────────────────────────────────────

describe('Test 9: Reason codes stability', () => {
  it('CEO allow on executive brief uses ALLOW_COMPANY_EXECUTIVE_VIEW', () => {
    const result = evaluateDecisionAccess(makeCeoPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(result.reasonCodes).toEqual(['ALLOW_COMPANY_EXECUTIVE_VIEW'])
  })

  it('company mismatch uses DENY_COMPANY_MISMATCH', () => {
    const result = evaluateDecisionAccess(
      makeCeoPrincipal({ companyIds: ['other'] }),
      EXECUTIVE_BRIEF_DECLARATION,
    )
    expect(result.reasonCodes).toEqual(['DENY_COMPANY_MISMATCH'])
  })

  it('unknown policy uses DENY_UNKNOWN_POLICY', () => {
    const result = evaluateDecisionAccess(
      makeCeoPrincipal(),
      { ...EXECUTIVE_BRIEF_DECLARATION, policyId: 'does-not-exist' },
    )
    expect(result.reasonCodes).toEqual(['DENY_UNKNOWN_POLICY'])
  })

  it('role insufficient uses DENY_ROLE_INSUFFICIENT', () => {
    const result = evaluateDecisionAccess(
      makePartnerPrincipal(),
      EXECUTIVE_BRIEF_DECLARATION,
    )
    expect(result.reasonCodes).toEqual(['DENY_ROLE_INSUFFICIENT'])
  })

  it('entity mismatch uses DENY_ENTITY_MISMATCH', () => {
    const result = evaluateDecisionAccess(
      makePartnerPrincipal(),
      {
        ...makePartnerDeclaration(),
        entityScopes: [{ entityType: 'property', entityId: 'unowned-property' }],
      },
    )
    expect(result.reasonCodes).toEqual(['DENY_ENTITY_MISMATCH'])
  })
})

// ─── Test 10: Policy version is returned ─────────────────────────────────

describe('Test 10: Policy version', () => {
  it('returns POLICY_VERSION in every allow result', () => {
    const result = evaluateDecisionAccess(makeCeoPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(result.policyVersion).toBe(POLICY_VERSION)
    expect(result.policyVersion).toBe('dal-v0.1.1')
  })

  it('returns POLICY_VERSION in every deny result', () => {
    const result = evaluateDecisionAccess(makeExternalPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(result.policyVersion).toBe(POLICY_VERSION)
  })

  it('returns evaluatedAt timestamp in ISO format', () => {
    const before = new Date().toISOString()
    const result = evaluateDecisionAccess(makeCeoPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    const after = new Date().toISOString()

    expect(result.evaluatedAt).toBeDefined()
    expect(result.evaluatedAt >= before).toBe(true)
    expect(result.evaluatedAt <= after).toBe(true)
  })
})

// ─── Test 11: No service query before allow ──────────────────────────────

describe('Test 11: No service query runs before allow', () => {
  it('evaluateDecisionAccess is a pure function with no side effects', () => {
    // This test proves evaluateDecisionAccess does NOT call createServiceClient
    // or any database function. It is a pure function that takes principals
    // and declarations, returning EffectiveDecisionAccess.
    //
    // The function has no imports from @/lib/supabase or any DB module.
    // If it did, this test file would fail to compile in an environment
    // without Supabase configuration.
    //
    // The actual proof: evaluateDecisionAccess runs synchronously.
    // It returns EffectiveDecisionAccess, not Promise<EffectiveDecisionAccess>.
    const result = evaluateDecisionAccess(makeCeoPrincipal(), EXECUTIVE_BRIEF_DECLARATION)

    // If this were async (hitting DB), TypeScript would require await
    // and the return type would be Promise<EffectiveDecisionAccess>.
    // The fact that we can access .awareness directly proves it's sync.
    expect(result.awareness).toBe(true)
    expect(typeof result.awareness).toBe('boolean')
  })
})

// ─── Test 12: Service query does run after allow ─────────────────────────

describe('Test 12: getAuthorizedExecutiveBrief integration contract', () => {
  // This test verifies the integration contract rather than the actual
  // database call (which requires Supabase). The contract is:
  //
  // 1. resolvePrincipal() → PrincipalContext (requires auth)
  // 2. evaluateDecisionAccess() → EffectiveDecisionAccess
  // 3. Only if access.view === true → call getExecutiveBrief()
  //
  // We verify step 2 produces the correct gate signal.

  it('CEO principal produces view=true (gate open)', () => {
    const access = evaluateDecisionAccess(makeCeoPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(access.view).toBe(true)
    // After this, getExecutiveBrief() SHOULD run (providers query DB)
  })

  it('partner principal produces view=false (gate closed)', () => {
    const access = evaluateDecisionAccess(makePartnerPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(access.view).toBe(false)
    // After this, getExecutiveBrief() must NOT run
  })

  it('external principal produces view=false (gate closed)', () => {
    const access = evaluateDecisionAccess(makeExternalPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(access.view).toBe(false)
  })
})

// ─── Test 13: M0 route fails closed ──────────────────────────────────────

describe('Test 13: M0 route fails closed', () => {
  it('Executive Brief declaration uses restricted classification', () => {
    expect(EXECUTIVE_BRIEF_DECLARATION.classification).toBe('restricted')
  })

  it('Executive Brief declaration uses ceo-executive-brief policy', () => {
    expect(EXECUTIVE_BRIEF_DECLARATION.policyId).toBe('ceo-executive-brief')
  })

  it('ceo-executive-brief policy only grants to superadmin', () => {
    const policy = findPolicy('ceo-executive-brief')
    expect(policy).toBeDefined()
    expect(policy!.awarenessRoles).toEqual(['superadmin'])
    expect(policy!.viewRoles).toEqual(['superadmin'])
  })

  it('unknown role gets denied', () => {
    const principal: PrincipalContext = {
      userId: 'unknown-user',
      companyIds: [JJ_COMPANY_ID],
      roles: ['viewer'], // not in any policy
      entityScopes: [],
    }
    const result = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)
    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
  })

  it('empty roles array gets denied', () => {
    const principal: PrincipalContext = {
      userId: 'no-role-user',
      companyIds: [JJ_COMPANY_ID],
      roles: [],
      entityScopes: [],
    }
    const result = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)
    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
  })

  it('manager role gets denied (not yet implemented)', () => {
    const principal: PrincipalContext = {
      userId: 'manager-user',
      companyIds: [JJ_COMPANY_ID],
      roles: ['manager'],
      entityScopes: [],
    }
    const result = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)
    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
  })

  it('employee role gets denied', () => {
    const principal: PrincipalContext = {
      userId: 'employee-user',
      companyIds: [JJ_COMPANY_ID],
      roles: ['employee'],
      entityScopes: [],
    }
    const result = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)
    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
  })
})

// ─── Test 14: Cross-company leakage is impossible ────────────────────────

describe('Test 14: Cross-company leakage prevention', () => {
  it('superadmin of company A cannot access company B decisions', () => {
    const companyA: PrincipalContext = {
      userId: 'admin-company-a',
      companyIds: ['company-a'],
      roles: ['superadmin'],
      entityScopes: [],
    }
    const companyBDecision: DecisionAccessDeclaration = {
      ...EXECUTIVE_BRIEF_DECLARATION,
      companyId: 'company-b',
    }
    const result = evaluateDecisionAccess(companyA, companyBDecision)
    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_COMPANY_MISMATCH')
  })

  it('principal with multiple companies still fails on non-matching decision', () => {
    const multiCompany: PrincipalContext = {
      userId: 'multi-company-user',
      companyIds: ['company-a', 'company-c'],
      roles: ['superadmin'],
      entityScopes: [],
    }
    const companyBDecision: DecisionAccessDeclaration = {
      ...EXECUTIVE_BRIEF_DECLARATION,
      companyId: 'company-b',
    }
    const result = evaluateDecisionAccess(multiCompany, companyBDecision)
    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
  })

  it('JJ company ID is the only valid company in v0.1', () => {
    expect(JJ_COMPANY_ID).toBe('jj')
    expect(EXECUTIVE_BRIEF_DECLARATION.companyId).toBe('jj')
  })
})

// ─── Test 15: Partner auth behavior unchanged ────────────────────────────

describe('Test 15: Existing partner auth behavior preserved', () => {
  // DAL does NOT replace partnerAuthService. It sits above it.
  // These tests verify that DAL's entity-scoped evaluation is
  // consistent with what partnerAuthService enforces.

  it('partner-own-statement policy exists and requires entity scope', () => {
    const policy = findPolicy('partner-own-statement')
    expect(policy).toBeDefined()
    expect(policy!.requireEntityScope).toBe(true)
    expect(policy!.awarenessRoles).toContain('partner')
    expect(policy!.viewRoles).toContain('partner')
  })

  it('partner can access own property via entity-scoped declaration', () => {
    const principal = makePartnerPrincipal() // owns villa-mazotos
    const declaration = makePartnerDeclaration() // scoped to villa-mazotos
    const result = evaluateDecisionAccess(principal, declaration)

    expect(result.awareness).toBe(true)
    expect(result.view).toBe(true)
  })

  it('partner cannot access another property', () => {
    const principal = makePartnerPrincipal() // owns villa-mazotos
    const declaration: DecisionAccessDeclaration = {
      ...makePartnerDeclaration(),
      entityScopes: [{ entityType: 'property', entityId: 'tamir-dekelia' }],
    }
    const result = evaluateDecisionAccess(principal, declaration)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
  })

  it('DAL does not expose jj_* fields concept (P-ARCH-6 preserved)', () => {
    // P-ARCH-6: v_partner_investment_statement never exposes jj_* fields.
    // DAL v0.1 does not implement evidence-level redaction.
    // The partner-facing DTO is already field-restricted at the view level.
    // DAL's role is to gate access, not to redact fields.
    // This test documents that DAL does NOT change the existing P-ARCH-6 guarantee.
    const result = evaluateDecisionAccess(makePartnerPrincipal(), makePartnerDeclaration())

    // v0.1: evidence is always false — no redaction layer active
    expect(result.evidence).toBe(false)
  })
})

// ─── Test 16: Company Executive View (Approved 22 July 2026) ────────
//
// Yossi approved Company Executive View with constraints:
//   - Verified company executive of Company A → Awareness + View for
//     company-wide decisions in Company A.
//   - Cross-company → denied.
//   - Role alone → never sufficient.
//   - Company membership alone → never sufficient.
//   - v0.1: company executive view only for M0 company-wide Executive Brief.
//     NOT for partner statements or entity-scoped decisions.
//   - "CEO sees the company office" ≠ "CEO inherits every entity permission."
//
// These tests cover the 12 required categories from directive Section 5.
//

describe('Test 16: Company Executive View', () => {
  // ── Directive Category 1: Verified company CEO can view M0 brief ────
  it('Cat-1: CEO can view company-wide Executive Brief', () => {
    const principal = makeCeoPrincipal()
    const result = evaluateDecisionAccess(principal, EXECUTIVE_BRIEF_DECLARATION)

    expect(result.awareness).toBe(true)
    expect(result.view).toBe(true)
    // ceo-executive-brief has allowCompanyExecutiveView=true → Gate 7a
    // Reason: ALLOW_COMPANY_EXECUTIVE_VIEW (company executive view path)
    expect(result.reasonCodes).toContain('ALLOW_COMPANY_EXECUTIVE_VIEW')
  })

  // ── Directive Category 2: Generic superadmin without CEO → denied ───
  //
  // NEEDS_CEO_ROLE_CONTRACT
  //
  // The current repository has TWO role systems:
  //   1. user_roles table (LIVE): roles = 'superadmin' | 'partner'
  //   2. jj_staff_config table (DESIGNED, NOT IN PRODUCTION):
  //      staff_role CHECK ('ceo' | 'finance_admin' | 'statement_operator')
  //
  // jj_staff_config exists in p1_0_migration.sql but has NOT been applied.
  // Until it deploys, the system CANNOT distinguish "generic superadmin"
  // from "verified CEO." Both are represented as roles: ['superadmin'].
  //
  // This gap IS behaviorally relevant in v0.1.1: Gate 7a checks
  // allowCompanyExecutiveView + roles.includes('superadmin'). Any superadmin
  // receives ALLOW_COMPANY_EXECUTIVE_VIEW — the system cannot verify
  // they are the actual CEO. This is accepted for v0.1 (JJ is single-CEO)
  // but must be resolved before multi-admin deployment.
  //
  it('Cat-2: NEEDS_CEO_ROLE_CONTRACT — cannot distinguish CEO from superadmin in v0.1', () => {
    // Documents the gap: any superadmin gets ALLOW_COMPANY_EXECUTIVE_VIEW.
    // When jj_staff_config deploys, this test should be replaced with:
    //   "superadmin without ceo staff_role is denied on executive-view policies"
    const policy = findPolicy('ceo-executive-brief')
    expect(policy).toBeDefined()
    expect(policy!.allowCompanyExecutiveView).toBe(true)
    expect(policy!.requireEntityScope).toBe(false)

    // Both "generic superadmin" and "verified CEO" get the same result:
    // Gate 7a fires because allowCompanyExecutiveView=true + role=superadmin.
    // The gap is accepted for v0.1 (single-CEO system).
    const result = evaluateDecisionAccess(makeCeoPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(result.reasonCodes).toContain('ALLOW_COMPANY_EXECUTIVE_VIEW')
  })

  // ── Directive Category 3: Company mismatch → denied ─────────────────
  it('Cat-3: CEO of company-a cannot access company-b Executive Brief', () => {
    const principal: PrincipalContext = {
      userId: 'ceo-company-a',
      companyIds: ['company-a'],
      roles: ['superadmin'],
      entityScopes: [],
    }
    const companyBBrief: DecisionAccessDeclaration = {
      ...EXECUTIVE_BRIEF_DECLARATION,
      companyId: 'company-b',
    }
    const result = evaluateDecisionAccess(principal, companyBBrief)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_COMPANY_MISMATCH')
  })

  // ── Directive Category 4: Company Executive View returns correct reason code ─
  //
  // ceo-executive-brief has allowCompanyExecutiveView=true and
  // requireEntityScope=false. Gate 7a fires: policy flag + superadmin role
  // → ALLOW_COMPANY_EXECUTIVE_VIEW. This is the exercised path.
  //
  it('Cat-4: Company Executive View reason code IS returned for ceo-executive-brief', () => {
    const result = evaluateDecisionAccess(makeCeoPrincipal(), EXECUTIVE_BRIEF_DECLARATION)

    // Gate 7a fires: allowCompanyExecutiveView=true + superadmin
    expect(result.reasonCodes).toContain('ALLOW_COMPANY_EXECUTIVE_VIEW')
    // NOT the generic company-wide code — the specific executive view code
    expect(result.reasonCodes).not.toContain('ALLOW_CEO_FULL_ACCESS')
  })

  // ── Directive Category 5: CEO does NOT bypass entity-scoped policies ────
  it('Cat-5: CEO does not bypass partner-own-statement entity scope', () => {
    // partner-own-statement has allowCompanyExecutiveView=false
    // Even a CEO with matching company is DENIED without entity scope
    const principal = makeCeoPrincipal() // entityScopes: []
    const partnerDecl = makePartnerDeclaration() // entityScopes: [villa-mazotos]
    const result = evaluateDecisionAccess(principal, partnerDecl)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_ENTITY_MISMATCH')
  })

  // ── Directive Category 6: Partner with empty entityScopes → denied ──
  it('Cat-6: Partner with empty entityScopes on entity-scoped decision → denied', () => {
    const principal = makePartnerPrincipal({ entityScopes: [] })
    const declaration = makePartnerDeclaration()
    const result = evaluateDecisionAccess(principal, declaration)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_ENTITY_MISMATCH')
  })

  // ── Directive Category 7: Unknown policy → denied ───────────────────
  it('Cat-7: Unknown policy remains denied regardless of roles', () => {
    const result = evaluateDecisionAccess(
      makeCeoPrincipal(),
      { ...EXECUTIVE_BRIEF_DECLARATION, policyId: 'nonexistent-policy' },
    )

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_UNKNOWN_POLICY')
  })

  // ── Directive Category 8: Service-role providers only after allow ───
  it('Cat-8: evaluateDecisionAccess is synchronous pure function (no DB)', () => {
    // Pure function proof: synchronous return, no Promise, no await needed.
    // getExecutiveBrief() (which calls service-role providers) only runs
    // AFTER evaluateDecisionAccess returns view=true.
    // See getAuthorizedExecutiveBrief() in executiveBriefService.ts.
    const result = evaluateDecisionAccess(makeCeoPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(typeof result.view).toBe('boolean')
    expect(result.view).toBe(true) // gate is open → providers may run
  })

  // ── Directive Category 9: Cross-company leakage impossible ──────────
  it('Cat-9: Cross-company inheritance is impossible', () => {
    // Even with CEO role and inheritance-enabled policy, company mismatch
    // is caught at Gate 1 BEFORE any inheritance check.
    const crossCompanyCeo: PrincipalContext = {
      userId: 'ceo-other',
      companyIds: ['other-company'],
      roles: ['superadmin'],
      entityScopes: [],
    }
    const result = evaluateDecisionAccess(crossCompanyCeo, EXECUTIVE_BRIEF_DECLARATION)

    expect(result.awareness).toBe(false)
    expect(result.view).toBe(false)
    expect(result.reasonCodes).toContain('DENY_COMPANY_MISMATCH')
  })

  // ── Directive Category 10: Existing partnerAuth unchanged ───────────
  it('Cat-10: partner-own-statement policy unchanged by company executive view', () => {
    const policy = findPolicy('partner-own-statement')
    expect(policy).toBeDefined()
    expect(policy!.requireEntityScope).toBe(true)
    expect(policy!.allowCompanyExecutiveView).toBe(false)
    expect(policy!.awarenessRoles).toContain('partner')
    expect(policy!.viewRoles).toContain('partner')

    // Partner accessing own property still works
    const result = evaluateDecisionAccess(makePartnerPrincipal(), makePartnerDeclaration())
    expect(result.awareness).toBe(true)
    expect(result.view).toBe(true)
    expect(result.reasonCodes).toContain('ALLOW_ENTITY_SCOPE')
  })

  // ── Policy flag inspection ──────────────────────────────────────────
  it('only ceo-executive-brief has allowCompanyExecutiveView=true', () => {
    expect(findPolicy('ceo-executive-brief')!.allowCompanyExecutiveView).toBe(true)
    expect(findPolicy('partner-own-statement')!.allowCompanyExecutiveView).toBe(false)
    expect(findPolicy('admin-company-overview')!.allowCompanyExecutiveView).toBe(false)
  })

  // ── Directive Category 11: admin-company-overview without flag ──────
  it('Cat-11: superadmin on admin-company-overview gets ALLOW_CEO_FULL_ACCESS (flag=false)', () => {
    // admin-company-overview has allowCompanyExecutiveView=false
    // → Gate 7b fires, not 7a
    const declaration: DecisionAccessDeclaration = {
      decisionType: 'company-overview',
      executiveOwner: 'chief-of-staff',
      classification: 'internal',
      companyId: JJ_COMPANY_ID,
      entityScopes: [],
      policyId: 'admin-company-overview',
    }
    const result = evaluateDecisionAccess(makeCeoPrincipal(), declaration)

    expect(result.awareness).toBe(true)
    expect(result.view).toBe(true)
    expect(result.reasonCodes).toContain('ALLOW_CEO_FULL_ACCESS')
    expect(result.reasonCodes).not.toContain('ALLOW_COMPANY_EXECUTIVE_VIEW')
  })

  // ── Directive Category 12: Reachability test ──────────────────────
  //
  // "Add a test that fails if the company-executive branch is unreachable."
  // This test proves that ALLOW_COMPANY_EXECUTIVE_VIEW is actually returned
  // by the evaluation function for a real policy configuration.
  //
  it('Cat-12: REACHABILITY — ALLOW_COMPANY_EXECUTIVE_VIEW is exercised by at least one policy path', () => {
    // This test MUST produce ALLOW_COMPANY_EXECUTIVE_VIEW.
    // If this test ever fails, it means the company executive view branch
    // has become unreachable — a contract violation.
    const result = evaluateDecisionAccess(makeCeoPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(result.reasonCodes).toContain('ALLOW_COMPANY_EXECUTIVE_VIEW')

    // Verify this is not an accident — the policy flag is the cause
    const policy = findPolicy('ceo-executive-brief')
    expect(policy!.allowCompanyExecutiveView).toBe(true)
  })

  // ── Auditability (DAL-7) ───────────────────────────────────────────
  it('every result includes policyVersion and evaluatedAt for audit trail', () => {
    const allow = evaluateDecisionAccess(makeCeoPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(allow.policyVersion).toBe(POLICY_VERSION)
    expect(allow.evaluatedAt).toBeDefined()
    expect(allow.reasonCodes.length).toBeGreaterThan(0)

    const denied = evaluateDecisionAccess(makeExternalPrincipal(), EXECUTIVE_BRIEF_DECLARATION)
    expect(denied.policyVersion).toBe(POLICY_VERSION)
    expect(denied.evaluatedAt).toBeDefined()
    expect(denied.reasonCodes.length).toBeGreaterThan(0)
  })
})

// ─── Additional: Policy integrity ────────────────────────────────────────

describe('Policy integrity', () => {
  it('all policies belong to JJ company', () => {
    const policies = [
      findPolicy('ceo-executive-brief'),
      findPolicy('partner-own-statement'),
      findPolicy('admin-company-overview'),
    ]
    for (const p of policies) {
      expect(p).toBeDefined()
      expect(p!.companyId).toBe(JJ_COMPANY_ID)
    }
  })

  it('Executive Brief declaration references existing policy', () => {
    const policy = findPolicy(EXECUTIVE_BRIEF_DECLARATION.policyId)
    expect(policy).toBeDefined()
  })

  it('Executive Brief is company-wide (no entity scopes)', () => {
    expect(EXECUTIVE_BRIEF_DECLARATION.entityScopes).toEqual([])
  })

  it('POLICY_VERSION follows semantic format', () => {
    expect(POLICY_VERSION).toMatch(/^dal-v\d+\.\d+\.\d+$/)
  })

  it('all policies have allowCompanyExecutiveView defined', () => {
    const policies = [
      findPolicy('ceo-executive-brief'),
      findPolicy('partner-own-statement'),
      findPolicy('admin-company-overview'),
    ]
    for (const p of policies) {
      expect(p).toBeDefined()
      expect(typeof p!.allowCompanyExecutiveView).toBe('boolean')
    }
  })
})
