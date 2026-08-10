/**
 * UUID validation utility for Owner Workspace.
 *
 * Extracted from createOwnerAction.ts because Next.js requires all exported
 * functions in 'use server' files to be async. This pure validation helper
 * is synchronous by nature.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value)
}
