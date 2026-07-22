/**
 * @module executive/executiveBriefDeclaration
 * @description Decision Access Declaration for the Executive Brief.
 *
 * DAL-1: The Executive (Chief of Staff) classifies. DAL authorizes.
 * DAL-5: The Chief of Staff does NOT decide who sees the Executive Brief.
 *        DAL policy 'ceo-executive-brief' makes that decision.
 *
 * The Executive Brief is an internal, restricted decision:
 * - Contains partner capital positions (cashbox balances)
 * - Contains PMS connection status (operational infrastructure)
 * - Contains verification task status (pending business decisions)
 *
 * Only the CEO (superadmin) should see this. Partners must not see
 * internal operational data — they have their own partner-facing views.
 *
 * @see ADR-003_DECISION_ACCESS_LAYER.md
 * @see executiveBriefService.ts — produces the brief data
 */

import type { DecisionAccessDeclaration } from '../dal/types'
import { JJ_COMPANY_ID } from '../dal/policies'

/**
 * The Executive Brief is a company-wide, restricted decision.
 * Company-wide = no entity scoping (CEO sees all properties).
 * Restricted = only roles in the 'ceo-executive-brief' policy have access.
 */
export const EXECUTIVE_BRIEF_DECLARATION: DecisionAccessDeclaration = {
  decisionType: 'executive-brief',
  executiveOwner: 'chief-of-staff',
  classification: 'restricted',
  companyId: JJ_COMPANY_ID,
  entityScopes: [], // company-wide — no entity scoping
  policyId: 'ceo-executive-brief',
}
