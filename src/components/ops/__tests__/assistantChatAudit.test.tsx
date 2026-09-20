import fs from 'fs'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { AssistantChat } from '@/components/ops/AssistantChat'
import { MIC_PRIVACY_LABEL } from '@/lib/ops/assistant/speechTranscript'

jest.mock('@/lib/ops/assistant/opsConversationActions', () => ({
  submitAssistantInbound: jest.fn(),
  createAssistantTransactionDraft: jest.fn(),
  listOpsConversation: jest.fn(),
}))
jest.mock('@/lib/ops/assistant/clientCashSettlementActions', () => ({
  previewClientCashSettlement: jest.fn(),
  executeClientCashSettlement: jest.fn(),
  listClientSettlementEntities: jest.fn(),
  readClientSettlementBalance: jest.fn(),
  listPartnerFundingActors: jest.fn(),
  previewPartnerFundedClientSettlement: jest.fn(),
  executePartnerFundedClientSettlement: jest.fn(),
}))

const ROOT = path.join(__dirname, '..', '..', '..', '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('assistant source audit and confirmation UI', () => {
  const chat = read('src/components/ops/AssistantChat.tsx')
  const actions = read('src/lib/ops/assistant/opsConversationActions.ts')
  const page = read('src/app/(app)/assistant/page.tsx')

  it('does not write public.transactions or auto-create drafts', () => {
    expect(chat).toContain('createAssistantTransactionDraft')
    expect(chat).toContain('data-testid="assistant-create-draft"')
    expect(chat).not.toMatch(/useEffect\([\s\S]{0,200}onCreateDraft/)
    expect(actions).toContain('createAgentTransactionDraft')
    expect(actions).not.toContain('approveAndPostAgentTransactionDraft')
    expect(actions).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
    expect(actions).not.toContain('createServiceClient')
    expect(page).toContain('authenticateStatementUser')
  })

  it('has no AI, audio upload, gmail, or whatsapp send', () => {
    const blob = chat + actions + page
    expect(blob).not.toMatch(/openai|anthropic|@ai-sdk/)
    expect(blob).not.toMatch(/MediaRecorder|getUserMedia/)
    expect(blob).not.toMatch(/googleapis|nodemailer/)
    expect(blob).not.toMatch(/schema\('finance'\)/)
    expect(chat).toContain('MIC_PRIVACY_LABEL')
    expect(chat).toContain('צור טיוטה')
    expect(chat).toContain('שנה פרטים')
    expect(chat).toContain('בטל')
    expect(chat).toContain('עסקה חדשה')
    expect(chat).toContain('resetForNewProposal')
  })

  it('renders review labels in markup', () => {
    const html = renderToStaticMarkup(
      <AssistantChat staffPayerName="Yossi" catalog={[]} initialConversationId={null} />,
    )
    expect(html).toContain('JJ Assistant / העוזר שלי')
    expect(html).toContain('הכנת טיוטת עסקה')
    expect(html).toContain('assistant-input')
    expect(html).toContain('Start microphone')
    expect(html).toContain('עסקה חדשה')
  })

  it('records cash only from the confirmation button, never from Send', () => {
    expect(chat).toContain('executeClientCashSettlement')
    expect(chat).toContain('executePartnerFundedClientSettlement')
    expect(chat).toContain('data-testid="assistant-record-cash"')
    expect(chat).toContain('רשום תשלום')
    expect(chat).toContain('CASH_SUMMARY_TITLE')
    expect(chat).toContain('PERSONAL_SUMMARY_TITLE')
    expect(chat).toContain('FUNDING_QUESTION')
    expect(chat).not.toMatch(/sendBody\([\s\S]{0,400}executeClientCashSettlement/)
    expect(chat).not.toMatch(/sendBody\([\s\S]{0,400}executePartnerFundedClientSettlement/)
    expect(chat).not.toMatch(/useEffect\([\s\S]{0,200}onRecordCash/)
    expect(chat).not.toMatch(/staffPayerName[\s\S]{0,80}PARTNER_PERSONAL/)
    const cashActions = read('src/lib/ops/assistant/clientCashSettlementActions.ts')
    expect(cashActions).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
    expect(cashActions).not.toContain('createServiceClient')
    expect(cashActions).not.toMatch(/service_role/)
    expect(cashActions).toContain('preview_client_cash_settlement')
    expect(cashActions).toContain('execute_client_cash_settlement')
    expect(cashActions).toContain('preview_partner_funded_client_settlement')
    expect(cashActions).toContain('execute_partner_funded_client_settlement')
    expect(cashActions).toContain('list_partner_funding_actors')
    expect(chat).toContain('התשלום נרשם')
    expect(chat).toContain('/owners')
    expect(chat).toContain('יתרת הדוח לא אומתה')
  })

  it('keeps createAgentTransactionDraft as the only draft path', () => {
    const collector = read('src/lib/ops/assistant/transactionDraftCollector.ts')
    const dates = read('src/lib/ops/assistant/cyprusDate.ts')
    const turn = read('src/lib/ops/assistant/transactionTurn.ts')
    const blob = chat + actions + page + collector + dates + turn
    expect(blob).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
    expect(blob).not.toContain('createServiceClient')
    expect(blob).not.toContain('approveAndPostAgentTransactionDraft')
    expect(blob).not.toMatch(/openai|anthropic|@ai-sdk/)
    expect(blob).not.toMatch(/MediaRecorder|getUserMedia/)
    expect(collector).not.toMatch(/\bfetch\s*\(/)
    expect(dates).not.toMatch(/\bfetch\s*\(/)
    expect(turn).not.toMatch(/\bfetch\s*\(/)
    expect(actions).toContain('createAgentTransactionDraft')
    expect(collector).toContain('extractClientCharge')
  })
})
