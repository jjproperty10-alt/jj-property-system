/**
 * Share route: valid HMAC opens the certified report; anything else 404s.
 * No session required. No Avi user. Staff chrome must not wrap this page.
 */
jest.mock('server-only', () => ({}))

const notFoundMock = jest.fn(() => { throw new Error('NOT_FOUND') })
jest.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (u: string) => { throw new Error('REDIRECT:' + u) },
}))

const buildMock = jest.fn()
jest.mock('@/lib/partner-settlement/external-partner/buildAviExternalPartnerReport', () => ({
  buildAviExternalPartnerReport: () => buildMock(),
}))

jest.mock('@/components/finance/ExternalPartnerAviReportView', () => ({
  ExternalPartnerAviReportView: (props: { audience?: string }) =>
    `audience:${props.audience ?? 'staff'}`,
}))
jest.mock('@/components/finance/AviReportPrintButton', () => ({
  AviReportPrintButton: () => null,
}))
jest.mock('@/components/ds', () => ({
  PageShell: (props: { children: unknown }) => props.children,
}))

import Page from '@/app/share/avi-external-partner/[token]/page'
import { signAviShareToken } from '@/lib/partner-settlement/external-partner/aviShareToken'
import { VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT } from '@/lib/partner-settlement/external-partner'
import * as fs from 'fs'
import * as path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const SNAP = {
  snapshotVersion: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.version,
  snapshotSha256: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.sha256,
}

function certifiedReport() {
  return {
    status: 'certified' as const,
    snapshot: {
      propertyName: 'Villa Mazotos' as const,
      cutoffDate: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.cutoffDate,
      approvedRowCount: 202,
      version: SNAP.snapshotVersion,
      sha256: SNAP.snapshotSha256,
    },
  }
}

beforeEach(() => {
  notFoundMock.mockClear()
  buildMock.mockReset()
  buildMock.mockResolvedValue(certifiedReport())
})

describe('Avi share route', () => {
  it('invalid token → notFound, report NOT built', async () => {
    await expect(Page({ params: { token: 'not-valid' } })).rejects.toThrow('NOT_FOUND')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('expired token → notFound, report NOT built', async () => {
    const signed = signAviShareToken({
      ...SNAP,
      now: new Date('2026-01-01T00:00:00.000Z'),
      ttlSeconds: 1,
    })
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    await expect(
      Page({ params: { token: signed.token } }),
    ).rejects.toThrow('NOT_FOUND')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('valid token builds the certified report for the partner audience', async () => {
    const signed = signAviShareToken(SNAP)
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    const el = await Page({ params: { token: signed.token } })
    const html = renderToStaticMarkup(el as React.ReactElement)
    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(notFoundMock).not.toHaveBeenCalled()
    expect(html).toContain('audience:partner')
    expect(html).toContain('data-avi-share-root')
  })

  it('uncertified report → notFound', async () => {
    const signed = signAviShareToken(SNAP)
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    buildMock.mockResolvedValue({ status: 'failed', failures: ['x'] })
    await expect(Page({ params: { token: signed.token } })).rejects.toThrow('NOT_FOUND')
  })

  it('lives outside the (app) OperatingFrame', () => {
    const sharePage = 'src/app/share/avi-external-partner/[token]/page.tsx'
    expect(sharePage.startsWith('src/app/(app)')).toBe(false)
    expect(fs.existsSync(path.join(process.cwd(), sharePage))).toBe(true)
    const text = fs.readFileSync(path.join(process.cwd(), sharePage), 'utf8')
    expect(text).toContain("audience=\"partner\"")
    expect(text).toContain('verifyAviShareToken')
    expect(text).not.toContain('authenticateStatementUser')
    expect(text).not.toContain('@react-pdf')
    expect(text).not.toContain('OperatingFrame')
  })
})

describe('Avi share middleware allowlist', () => {
  it('allows /share/avi-external-partner without a session', () => {
    const text = fs.readFileSync(path.join(process.cwd(), 'src/middleware.ts'), 'utf8')
    expect(text).toContain("'/share/avi-external-partner'")
  })
})
