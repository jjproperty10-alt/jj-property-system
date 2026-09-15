/**
 * Staff print HTML fetch for PDF — cookie/bypass forwarding; no secrets logged.
 */
jest.mock('server-only', () => ({}))

import { fetchAviStaffPrintHtml } from '@/lib/partner-settlement/external-partner/aviStaffPrintFetch'

describe('fetchAviStaffPrintHtml', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('forwards Cookie and bypass header/query and accepts certified HTML', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      expect(url).toContain('x-vercel-protection-bypass=secret')
      const headers = new Headers(init?.headers)
      expect(headers.get('Cookie')).toBe('sb=1; _vercel_jwt=v')
      expect(headers.get('x-vercel-protection-bypass')).toBe('secret')
      return new Response('<div data-testid="avi-report-certified">ok</div>', { status: 200 })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchAviStaffPrintHtml({
      printUrl: 'https://preview.example/finance/external-partner/avi/print?lang=he',
      cookieHeader: 'sb=1; _vercel_jwt=v',
      env: { VERCEL_AUTOMATION_BYPASS_SECRET: 'secret' },
    })
    expect(result).toEqual({
      ok: true,
      html: '<div data-testid="avi-report-certified">ok</div>',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns staged failure when print HTML lacks certified marker', async () => {
    global.fetch = jest.fn(async () => new Response('<html>login</html>', { status: 200 })) as unknown as typeof fetch
    const result = await fetchAviStaffPrintHtml({
      printUrl: 'https://preview.example/print',
      cookieHeader: null,
      env: {},
    })
    expect(result).toEqual({ ok: false, stage: 'print_missing_certified' })
  })

  it('returns staged HTTP failure without throwing', async () => {
    global.fetch = jest.fn(async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
    const result = await fetchAviStaffPrintHtml({
      printUrl: 'https://preview.example/print',
      cookieHeader: 'a=1',
      env: {},
    })
    expect(result).toEqual({ ok: false, stage: 'print_http_401' })
  })
})
