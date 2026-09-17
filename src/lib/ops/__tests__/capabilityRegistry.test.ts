import {
  getCapability,
  isOpsCapabilityType,
  listCapabilities,
} from '../capabilityRegistry'
import { OPS_CAPABILITY_TYPES, OPS_PROHIBITED_ACTIONS } from '../types'

describe('ops capability registry', () => {
  it('registers exactly eight capabilities', () => {
    expect(OPS_CAPABILITY_TYPES).toHaveLength(8)
    expect(listCapabilities()).toHaveLength(8)
    expect(listCapabilities().map((c) => c.type)).toEqual([...OPS_CAPABILITY_TYPES])
  })

  it('rejects unknown capabilities', () => {
    expect(isOpsCapabilityType('transaction_draft')).toBe(true)
    expect(isOpsCapabilityType('autonomous_agent')).toBe(false)
    expect(() => getCapability('autonomous_agent')).toThrow(/unknown ops capability/)
  })

  it('keeps risk and approval policy deterministic', () => {
    expect(getCapability('account_query').requiresApproval).toBe(false)
    expect(getCapability('account_query').riskLevel).toBe('low')
    expect(getCapability('email_review').requiresApproval).toBe(false)
    expect(getCapability('transaction_draft').requiresApproval).toBe(true)
    expect(getCapability('transaction_draft').riskLevel).toBe('high')
    expect(getCapability('contract_draft').riskLevel).toBe('restricted')
    expect(getCapability('contract_draft').requiresApproval).toBe(true)
    expect(getCapability('transaction_draft')).toEqual(getCapability('transaction_draft'))
  })

  it('prohibits send, post, release, sign, delete, and canonical overwrite on every capability', () => {
    for (const type of OPS_CAPABILITY_TYPES) {
      const prohibited = getCapability(type).prohibitedActions
      for (const action of OPS_PROHIBITED_ACTIONS) {
        expect(prohibited).toContain(action)
      }
    }
  })

  it('exposes future handler names only', () => {
    expect(getCapability('message_draft').handler.name).toBe('handleMessageDraft')
    expect(getCapability('transaction_draft').handler.name).not.toMatch(/approveAndPost/)
  })
})
