/**
 * Chromium executable resolution for Avi PDF export.
 * No live Chrome launch. No settlement math.
 */
import {
  AVI_PDF_BASE_CHROME_ARGS,
  AVI_PDF_CHROME_UNAVAILABLE,
  AVI_PDF_LOCAL_LINUX_CHROME_CANDIDATES,
  resolveAviPdfLaunchOptions,
} from '@/lib/partner-settlement/external-partner/aviPdfChrome'

describe('resolveAviPdfLaunchOptions', () => {
  it('uses explicit CHROME_PATH over PUPPETEER_EXECUTABLE_PATH and serverless', async () => {
    const loadChromium = jest.fn(async () => ({
      args: ['--single-process'],
      executablePath: async () => '/var/task/chromium',
      headless: true as const,
    }))
    const launch = await resolveAviPdfLaunchOptions({
      env: {
        CHROME_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        PUPPETEER_EXECUTABLE_PATH: '/tmp/other-chrome',
        VERCEL: '1',
      },
      exists: () => false,
      loadChromium,
    })
    expect(launch.executablePath).toBe(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    )
    expect(launch.args).toEqual([...AVI_PDF_BASE_CHROME_ARGS])
    expect(loadChromium).not.toHaveBeenCalled()
  })

  it('uses explicit PUPPETEER_EXECUTABLE_PATH when CHROME_PATH is unset', async () => {
    const launch = await resolveAviPdfLaunchOptions({
      env: {
        PUPPETEER_EXECUTABLE_PATH: '/opt/chrome/chrome',
        VERCEL: '1',
      },
      exists: () => false,
      loadChromium: async () => {
        throw new Error('chromium should not load')
      },
    })
    expect(launch.executablePath).toBe('/opt/chrome/chrome')
    expect(launch.args).toEqual([...AVI_PDF_BASE_CHROME_ARGS])
  })

  it('Vercel/serverless uses @sparticuz/chromium executablePath and args', async () => {
    const executablePath = jest.fn(async () => '/var/task/chromium')
    const launch = await resolveAviPdfLaunchOptions({
      env: { VERCEL: '1' },
      exists: () => false,
      loadChromium: async () => ({
        args: ['--single-process', '--no-sandbox'],
        executablePath,
        headless: 'shell',
      }),
    })
    expect(executablePath).toHaveBeenCalledTimes(1)
    expect(launch.executablePath).toBe('/var/task/chromium')
    expect(launch.headless).toBe('shell')
    expect(launch.args).toEqual([
      '--single-process',
      '--no-sandbox',
      '--disable-gpu',
      '--font-render-hinting=none',
    ])
  })

  it('AWS Lambda serverless also uses @sparticuz/chromium', async () => {
    const launch = await resolveAviPdfLaunchOptions({
      env: { AWS_LAMBDA_FUNCTION_NAME: 'avi-pdf' },
      exists: () => false,
      loadChromium: async () => ({
        args: ['--hide-scrollbars'],
        executablePath: async () => '/tmp/chromium',
      }),
    })
    expect(launch.executablePath).toBe('/tmp/chromium')
    expect(launch.args).toEqual(['--hide-scrollbars', ...AVI_PDF_BASE_CHROME_ARGS])
  })

  it('local Linux uses an existing candidate path only after exists check', async () => {
    const launch = await resolveAviPdfLaunchOptions({
      env: {},
      exists: (candidatePath) => candidatePath === '/usr/bin/chromium',
    })
    expect(AVI_PDF_LOCAL_LINUX_CHROME_CANDIDATES).toContain('/usr/bin/chromium')
    expect(launch.executablePath).toBe('/usr/bin/chromium')
    expect(launch.args).toEqual([...AVI_PDF_BASE_CHROME_ARGS])
  })

  it('does not use /usr/bin/google-chrome unless that file exists', async () => {
    await expect(
      resolveAviPdfLaunchOptions({
        env: {},
        exists: () => false,
      }),
    ).rejects.toThrow(AVI_PDF_CHROME_UNAVAILABLE)
  })

  it('missing executable fails closed without leaking env or paths', async () => {
    try {
      await resolveAviPdfLaunchOptions({
        env: {
          SECRET_TOKEN: 'leak-me',
          VERCEL: '1',
        },
        exists: () => false,
        loadChromium: async () => ({
          args: ['--single-process'],
          executablePath: async () => '',
        }),
      })
      throw new Error('expected fail-closed')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      const message = err instanceof Error ? err.message : ''
      expect(message).toBe(AVI_PDF_CHROME_UNAVAILABLE)
      expect(message).not.toMatch(/SECRET_TOKEN|leak-me|\/usr\/bin|CHROME_PATH|PUPPETEER/i)
    }
  })

  it('explicit caller executablePath wins over CHROME_PATH', async () => {
    const launch = await resolveAviPdfLaunchOptions({
      explicitExecutablePath: '/tmp/explicit-chrome',
      env: { CHROME_PATH: '/tmp/env-chrome' },
      exists: () => false,
    })
    expect(launch.executablePath).toBe('/tmp/explicit-chrome')
  })
})
