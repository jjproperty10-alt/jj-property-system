/**
 * Resolve a Chromium executable for Avi partner-report PDF export.
 * Presentation/runtime only — no settlement math.
 *
 * Selection order:
 * 1. Explicit caller path
 * 2. CHROME_PATH
 * 3. PUPPETEER_EXECUTABLE_PATH
 * 4. Vercel / AWS serverless → @sparticuz/chromium-min + remote pack
 * 5. Existing local Linux Chrome/Chromium (exists-checked)
 *
 * Fail closed if none exist. Never include env values, cookies, tokens,
 * or filesystem paths in the thrown error message.
 */
import { existsSync } from 'fs'

export const AVI_PDF_CHROME_UNAVAILABLE = 'Avi PDF Chromium executable is unavailable'

/**
 * Matching pack for @sparticuz/chromium-min@131.0.1.
 * Full @sparticuz/chromium binaries often exceed Vercel serverless size limits;
 * chromium-min downloads this pack to /tmp at runtime.
 */
export const AVI_PDF_SPARTICUZ_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'

export class AviPdfChromeUnavailableError extends Error {
  constructor() {
    super(AVI_PDF_CHROME_UNAVAILABLE)
    this.name = 'AviPdfChromeUnavailableError'
  }
}

/** Existing local Linux binaries — used only after existsSync. */
export const AVI_PDF_LOCAL_LINUX_CHROME_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
] as const

export const AVI_PDF_BASE_CHROME_ARGS = [
  '--no-sandbox',
  '--disable-gpu',
  '--font-render-hinting=none',
] as const

export type AviPdfLaunchOptions = {
  readonly executablePath: string
  readonly args: readonly string[]
  readonly headless: boolean | 'shell'
}

export type SparticuzChromiumLike = {
  readonly args: readonly string[]
  executablePath: (location?: string) => Promise<string>
  readonly headless?: boolean | 'shell'
  setGraphicsMode?: boolean
}

export type AviPdfChromeEnv = {
  readonly [key: string]: string | undefined
}

export type AviPdfChromeProbe = {
  readonly env?: AviPdfChromeEnv
  readonly explicitExecutablePath?: string | null
  readonly exists?: (candidatePath: string) => boolean
  readonly loadChromium?: () => Promise<SparticuzChromiumLike>
  /** Test-only override for the remote chromium pack URL. */
  readonly packUrl?: string
}

function configuredPath(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function isServerlessPdfRuntime(env: AviPdfChromeEnv): boolean {
  return Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.AWS_EXECUTION_ENV)
}

function mergeChromeArgs(
  serverlessArgs: readonly string[],
  extra: readonly string[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const arg of [...serverlessArgs, ...extra]) {
    if (!seen.has(arg)) {
      seen.add(arg)
      out.push(arg)
    }
  }
  return out
}

/**
 * Sparticuz only extracts Amazon-Linux shared libs when it detects Lambda via
 * AWS_EXECUTION_ENV / AWS_LAMBDA_JS_RUNTIME. Vercel is AL-compatible but omits
 * those vars, which yields chromium_launch failures. Set the hint on process.env
 * before the first @sparticuz/chromium-min import.
 */
export function ensureSparticuzVercelLambdaHint(
  env: AviPdfChromeEnv = process.env,
): void {
  if (!env.VERCEL && !process.env.VERCEL) return
  if (process.env.AWS_EXECUTION_ENV || process.env.AWS_LAMBDA_JS_RUNTIME) return
  const major = Number(String(process.versions.node).split('.')[0] || '20')
  process.env.AWS_LAMBDA_JS_RUNTIME = major >= 20 ? `nodejs${major}.x` : 'nodejs18.x'
}

async function defaultLoadChromium(): Promise<SparticuzChromiumLike> {
  ensureSparticuzVercelLambdaHint()
  const mod = (await import('@sparticuz/chromium-min')) as unknown as {
    default?: SparticuzChromiumLike
  } & SparticuzChromiumLike
  return mod.default ?? mod
}

function firstExistingLinuxChrome(
  exists: (candidatePath: string) => boolean,
): string | null {
  for (const candidate of AVI_PDF_LOCAL_LINUX_CHROME_CANDIDATES) {
    if (exists(candidate)) return candidate
  }
  return null
}

/**
 * Resolve launch options for puppeteer-core. Probe hooks are for tests only.
 */
export async function resolveAviPdfLaunchOptions(
  probe: AviPdfChromeProbe = {},
): Promise<AviPdfLaunchOptions> {
  const env = probe.env ?? process.env
  const exists = probe.exists ?? existsSync

  const explicit = configuredPath(probe.explicitExecutablePath ?? undefined)
  if (explicit) {
    return {
      executablePath: explicit,
      args: [...AVI_PDF_BASE_CHROME_ARGS],
      headless: true,
    }
  }

  const chromePath = configuredPath(env.CHROME_PATH)
  if (chromePath) {
    return {
      executablePath: chromePath,
      args: [...AVI_PDF_BASE_CHROME_ARGS],
      headless: true,
    }
  }

  const puppeteerPath = configuredPath(env.PUPPETEER_EXECUTABLE_PATH)
  if (puppeteerPath) {
    return {
      executablePath: puppeteerPath,
      args: [...AVI_PDF_BASE_CHROME_ARGS],
      headless: true,
    }
  }

  if (isServerlessPdfRuntime(env)) {
    ensureSparticuzVercelLambdaHint(env)
    const loadChromium = probe.loadChromium ?? defaultLoadChromium
    const chromium = await loadChromium()
    const packUrl = probe.packUrl ?? AVI_PDF_SPARTICUZ_PACK_URL
    const executablePath = await chromium.executablePath(packUrl)
    if (!configuredPath(executablePath)) {
      throw new AviPdfChromeUnavailableError()
    }
    return {
      executablePath,
      args: mergeChromeArgs(chromium.args, AVI_PDF_BASE_CHROME_ARGS),
      headless: chromium.headless ?? 'shell',
    }
  }

  const localLinux = firstExistingLinuxChrome(exists)
  if (localLinux) {
    return {
      executablePath: localLinux,
      args: [...AVI_PDF_BASE_CHROME_ARGS],
      headless: true,
    }
  }

  throw new AviPdfChromeUnavailableError()
}
