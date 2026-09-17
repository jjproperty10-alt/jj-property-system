import { assertTaskTransition, canTransitionTask, isTerminalTaskStatus } from '../stateMachine'

describe('ops task state machine', () => {
  it('allows documented transitions', () => {
    expect(canTransitionTask('transaction_draft', 'received', 'needs_information')).toBe(true)
    expect(canTransitionTask('transaction_draft', 'received', 'ready')).toBe(true)
    expect(canTransitionTask('transaction_draft', 'needs_information', 'ready')).toBe(true)
    expect(canTransitionTask('transaction_draft', 'ready', 'awaiting_approval')).toBe(true)
    expect(canTransitionTask('account_query', 'ready', 'completed')).toBe(true)
    expect(canTransitionTask('email_review', 'ready', 'completed')).toBe(true)
    expect(canTransitionTask('transaction_draft', 'awaiting_approval', 'executing')).toBe(true)
    expect(canTransitionTask('transaction_draft', 'executing', 'completed')).toBe(true)
    expect(canTransitionTask('transaction_draft', 'executing', 'failed')).toBe(true)
    expect(canTransitionTask('report_draft', 'ready', 'cancelled')).toBe(true)
  })

  it('rejects undocumented and terminal reopen transitions', () => {
    expect(canTransitionTask('transaction_draft', 'completed', 'executing')).toBe(false)
    expect(canTransitionTask('transaction_draft', 'cancelled', 'ready')).toBe(false)
    expect(canTransitionTask('transaction_draft', 'failed', 'executing')).toBe(false)
    expect(canTransitionTask('transaction_draft', 'awaiting_approval', 'completed')).toBe(false)
    expect(canTransitionTask('transaction_draft', 'ready', 'completed')).toBe(false)
    expect(canTransitionTask('transaction_draft', 'received', 'executing')).toBe(false)
    expect(isTerminalTaskStatus('completed')).toBe(true)
    expect(isTerminalTaskStatus('failed')).toBe(true)
    expect(isTerminalTaskStatus('cancelled')).toBe(true)
    expect(isTerminalTaskStatus('ready')).toBe(false)
    expect(() => assertTaskTransition('transaction_draft', 'failed', 'executing')).toThrow(
      /transition rejected/,
    )
  })
})
