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
    expect(chat).toContain('Create draft')
    expect(chat).toContain('Change details')
    expect(chat).toContain('Cancel')
  })

  it('renders review labels in markup', () => {
    const html = renderToStaticMarkup(
      <AssistantChat staffPayerName="Yossi" catalog={[]} initialConversationId={null} />,
    )
    expect(html).toContain('JJ Assistant / העוזר שלי')
    expect(html).toContain('הכנת טיוטת עסקה')
    expect(html).toContain('assistant-input')
    expect(html).toContain('Start microphone')
  })
})
