/**
 * @module lib/auth/sanitizeReturnPath
 * @description Validates and sanitizes a return-path URL parameter to prevent open redirects.
 *
 * Used by:
 * - middleware.ts — when building the `next` param for login redirect
 * - login/page.tsx — when reading the `next` param after successful login
 *
 * Security rules:
 * - Accept only same-origin internal paths
 * - Path must begin with exactly one `/`
 * - Reject `//example.com` (protocol-relative URLs)
 * - Reject absolute URLs (http://, https://, etc.)
 * - Reject alternate schemes (javascript:, data:, etc.)
 * - Reject encoded external redirects (%2F%2F...)
 * - Reject control characters
 * - Fall back to the default route on any violation
 */

const DEFAULT_PATH = '/'

/**
 * Sanitize a return path to prevent open redirects.
 *
 * @param path - The raw `next` parameter value (may be null/undefined)
 * @param fallback - Fallback path if validation fails (default: '/')
 * @returns A safe internal path starting with exactly one '/'
 */
export function sanitizeReturnPath(
  path: string | null | undefined,
  fallback: string = DEFAULT_PATH,
): string {
  if (!path || typeof path !== 'string') return fallback

  // Decode once to catch encoded attacks (%2F%2F → //)
  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return fallback
  }

  // Reject control characters (ASCII 0-31, 127)
  if (/[\x00-\x1f\x7f]/.test(decoded)) return fallback

  // Reject absolute URLs with scheme (http:, https:, javascript:, data:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(decoded)) return fallback

  // Reject protocol-relative URLs (//example.com)
  if (decoded.startsWith('//')) return fallback

  // Must start with exactly one /
  if (!decoded.startsWith('/')) return fallback

  // Also check the raw value for the same attacks (double-encoded)
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(path)) return fallback
  if (path.startsWith('//')) return fallback
  if (!path.startsWith('/')) return fallback

  // Reject backslash (IE compat: /\evil.com)
  if (path.includes('\\') || decoded.includes('\\')) return fallback

  // The path is safe — return the original (not decoded) to preserve encoding
  return path
}
