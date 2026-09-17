import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..', '..')
const OPS_DIR = path.join(ROOT, 'src', 'lib', 'ops')
const SQL = path.join(ROOT, 'supabase', 'migrations', '20260919120000_ops_agent_core.sql')

function collect(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const abs = path.join(dir, name)
    return fs.statSync(abs).isDirectory() ? collect(abs) : [abs]
  })
}

function read(abs: string): string {
  return fs.readFileSync(abs, 'utf8')
}

describe('ops agent core source audit', () => {
  const files = [...collect(OPS_DIR), SQL]
  const blob = files.map(read).join('\n')

  it('does not import or call posting, service-role writes, providers, AI, or Storage', () => {
    expect(blob).not.toMatch(/approveAndPostAgentTransactionDraft/)
    expect(blob).not.toMatch(/approve_and_post_agent_transaction_draft/)
    expect(blob).not.toMatch(/from\(\s*['"]transactions['"]\s*\)\s*\.insert/)
    expect(blob).not.toMatch(/createServiceClient/)
    expect(blob).not.toMatch(/googleapis|gmail|nodemailer|imap/i)
    expect(blob).not.toMatch(/twilio|whatsapp-cloud|meta\.com/)
    expect(blob).not.toMatch(/\bfetch\s*\(/)
    expect(blob).not.toMatch(/openai|anthropic|@ai-sdk/)
    expect(blob).not.toMatch(/storage\.from\(|upload\(/)
    expect(blob).not.toMatch(/from 'zod'|from "zod"/)
    expect(blob).not.toMatch(/INSERT INTO public\.transactions/i)
  })

  it('does not add secrets or production URLs', () => {
    expect(blob).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./)
    expect(blob).not.toMatch(/sk_live_|ghp_|github_pat_/)
    expect(blob).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/)
  })
})
