import { requireStaffCompanyPermission } from '@/lib/auth/requireStaffCompanyPermission'
import { computeFinancialPosition } from '@/lib/finance/computeFinancialPosition'
import { evaluateDecision } from '@/lib/finance/evaluateDecision'

export async function requireDecisionSessionUser() {
  const { userId } = await requireStaffCompanyPermission()
  return { id: userId }
}

export async function loadFinanceDecision(params: {
  entityId: string
  entityType: string
  periodStart: Date
  periodEnd: Date
  decisionType: string
}) {
  await requireStaffCompanyPermission()
  const [position, decision] = await Promise.all([
    computeFinancialPosition(params),
    evaluateDecision(params),
  ])
  return { position, decision }
}
