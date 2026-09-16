/**
 * Gate: /preview/avi-certified-compose is never allowed in Production.
 */
jest.mock('@/lib/supabaseConfig', () => ({
  isSupabaseConfigured: jest.fn(),
}))

import { isSupabaseConfigured } from '@/lib/supabaseConfig'
import { isAviCertifiedComposePreviewAllowed } from '@/lib/partner-settlement/external-partner/aviComposePreviewGate'

const isConfigured = isSupabaseConfigured as jest.MockedFunction<typeof isSupabaseConfigured>

function envWith(
  nodeEnv: 'development' | 'production' | 'test',
): NodeJS.ProcessEnv {
  return { ...process.env, NODE_ENV: nodeEnv }
}

describe('isAviCertifiedComposePreviewAllowed', () => {
  afterEach(() => {
    isConfigured.mockReset()
  })

  it('blocks in production even when Supabase keys are missing', () => {
    isConfigured.mockReturnValue(false)
    expect(isAviCertifiedComposePreviewAllowed(envWith('production'))).toBe(false)
  })

  it('blocks in production when Supabase is configured', () => {
    isConfigured.mockReturnValue(true)
    expect(isAviCertifiedComposePreviewAllowed(envWith('production'))).toBe(false)
  })

  it('allows non-production only when Supabase is unconfigured', () => {
    isConfigured.mockReturnValue(false)
    expect(isAviCertifiedComposePreviewAllowed(envWith('development'))).toBe(true)

    isConfigured.mockReturnValue(true)
    expect(isAviCertifiedComposePreviewAllowed(envWith('development'))).toBe(false)
  })
})
