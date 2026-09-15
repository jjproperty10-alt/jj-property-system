/**
 * Fetch staff /print HTML for Avi PDF export (same deployment).
 * Forwards caller Cookie + optional Vercel automation bypass.
 * Never logs cookies, bypass secrets, or HTML.
 */
import 'server-only'

export type AviStaffPrintFetchResult =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly stage: string }

export async function fetchAviStaffPrintHtml(opts: {
  readonly printUrl: string
  readonly cookieHeader: string | null
  readonly env?: Readonly<Record<string, string | undefined>>
}): Promise<AviStaffPrintFetchResult> {
  const env = opts.env ?? process.env
  const headers: Record<string, string> = {
    Accept: 'text/html,application/xhtml+xml',
  }
  const cookie = opts.cookieHeader?.trim()
  if (cookie) {
    headers.Cookie = cookie
  }
  const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
  let url = opts.printUrl
  if (bypass) {
    headers['x-vercel-protection-bypass'] = bypass
    headers['x-vercel-set-bypass-cookie'] = 'true'
    const u = new URL(opts.printUrl)
    u.searchParams.set('x-vercel-protection-bypass', bypass)
    url = u.toString()
  }

  try {
    const res = await fetch(url, {
      headers,
      redirect: 'manual',
      cache: 'no-store',
    })
    if (res.status !== 200) {
      return { ok: false, stage: `print_http_${res.status}` }
    }
    const html = await res.text()
    if (!html.includes('data-testid="avi-report-certified"') && !html.includes('avi-report-certified')) {
      return { ok: false, stage: 'print_missing_certified' }
    }
    return { ok: true, html }
  } catch {
    return { ok: false, stage: 'print_fetch_error' }
  }
}
