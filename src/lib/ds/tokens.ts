/**
 * JJ Property 10 — Design System 2035
 * Token Exports (TypeScript)
 *
 * These are the TypeScript-side counterparts of the CSS custom properties
 * defined in src/styles/design-system.css.
 *
 * Use cases:
 * - Tailwind className generation (STATUS_CLASSES, MONEY_SIZE_CLASSES)
 * - Tests that assert on token values
 * - Non-Tailwind inline style fallbacks (JJ_COLORS, JJ_RADIUS, JJ_SHADOWS)
 *
 * The CSS file is always the canonical runtime source. These exports
 * exist for type-safety and programmatic use, not as a runtime replacement.
 */

// ── Colors ────────────────────────────────────────────────────────────────────

export const JJ_COLORS = {
  // Foundation
  navy:          '#0f1729',
  navy800:       '#1a2744',
  navy700:       '#243359',

  // Surfaces
  surface:       '#ffffff',
  surfaceSubtle: '#f8f9fb',
  surfaceMuted:  '#f1f3f7',

  // Borders
  border:        '#e4e7ed',
  borderSubtle:  '#eff1f5',

  // Text
  textPrimary:   '#0f1729',
  textSecondary: '#4b5568',
  textMuted:     '#9ca3af',
  textInverse:   '#ffffff',

  // Accent / Brand
  accent:        '#2563eb',
  accentLight:   '#dbeafe',

  // Semantic
  positive:      '#059669',
  positiveLight: '#d1fae5',
  attention:     '#d97706',
  attentionLight:'#fef3c7',
  critical:      '#e11d48',
  criticalLight: '#ffe4e6',
  pending:       '#7c3aed',
  pendingLight:  '#ede9fe',
} as const

export type JJColorKey = keyof typeof JJ_COLORS

// ── Border Radius ─────────────────────────────────────────────────────────────

export const JJ_RADIUS = {
  sm:   '0.5rem',
  md:   '0.75rem',
  lg:   '1rem',
  xl:   '1.25rem',
  full: '9999px',
} as const

export type JJRadiusKey = keyof typeof JJ_RADIUS

// ── Shadows ───────────────────────────────────────────────────────────────────

export const JJ_SHADOWS = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
} as const

export type JJShadowKey = keyof typeof JJ_SHADOWS

// ── Status Badge Class Map ────────────────────────────────────────────────────
//
// Tailwind class bundles keyed by semantic status.
// IMPORTANT: These classes must be used as complete strings (not concatenated)
// so Tailwind's purge scanner can detect them at build time.

export const STATUS_CLASSES = {
  active:    {
    bg:     'bg-emerald-50',
    text:   'text-emerald-700',
    border: 'border-emerald-200',
    dot:    'bg-emerald-500',
  },
  pending:   {
    bg:     'bg-violet-50',
    text:   'text-violet-700',
    border: 'border-violet-200',
    dot:    'bg-violet-500',
  },
  confirmed: {
    bg:     'bg-blue-50',
    text:   'text-blue-700',
    border: 'border-blue-200',
    dot:    'bg-blue-500',
  },
  attention: {
    bg:     'bg-amber-50',
    text:   'text-amber-700',
    border: 'border-amber-200',
    dot:    'bg-amber-500',
  },
  critical:  {
    bg:     'bg-rose-50',
    text:   'text-rose-700',
    border: 'border-rose-200',
    dot:    'bg-rose-500',
  },
  unknown:   {
    bg:     'bg-gray-50',
    text:   'text-gray-500',
    border: 'border-gray-200',
    dot:    'bg-gray-400',
  },
  completed: {
    bg:     'bg-emerald-50',
    text:   'text-emerald-700',
    border: 'border-emerald-200',
    dot:    'bg-emerald-500',
  },
} as const satisfies Record<string, { bg: string; text: string; border: string; dot: string }>

export type StatusToken = keyof typeof STATUS_CLASSES

// ── Attention Banner Class Map ────────────────────────────────────────────────

export const BANNER_CLASSES = {
  info:    {
    wrapper: 'bg-blue-50 border border-blue-200',
    icon:    'text-blue-500',
    title:   'text-blue-900',
    desc:    'text-blue-700',
  },
  warning: {
    wrapper: 'bg-amber-50 border border-amber-200',
    icon:    'text-amber-500',
    title:   'text-amber-900',
    desc:    'text-amber-700',
  },
  error:   {
    wrapper: 'bg-rose-50 border border-rose-200',
    icon:    'text-rose-500',
    title:   'text-rose-900',
    desc:    'text-rose-700',
  },
  success: {
    wrapper: 'bg-emerald-50 border border-emerald-200',
    icon:    'text-emerald-500',
    title:   'text-emerald-900',
    desc:    'text-emerald-700',
  },
} as const satisfies Record<string, { wrapper: string; icon: string; title: string; desc: string }>

export type BannerType = keyof typeof BANNER_CLASSES

// ── AiActivityCard Status ─────────────────────────────────────────────────────
//
// CRITICAL: 'pending_approval' must NEVER use green/success colors.
// Distinct from 'completed' — different visual weight and color.

export const AI_ACTIVITY_CLASSES = {
  completed:        {
    badge:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
    dot:        'bg-emerald-500',
    label:      'Completed',
  },
  pending_approval: {
    badge:      'bg-amber-50 text-amber-700 border border-amber-200',
    dot:        'bg-amber-400',
    label:      'Pending Approval',
  },
  blocked:          {
    badge:      'bg-rose-50 text-rose-700 border border-rose-200',
    dot:        'bg-rose-500',
    label:      'Blocked',
  },
} as const satisfies Record<string, { badge: string; dot: string; label: string }>

export type AiActivityStatus = keyof typeof AI_ACTIVITY_CLASSES

// ── MoneyValue Size → Tailwind class ─────────────────────────────────────────

export const MONEY_SIZE_CLASSES = {
  sm: 'text-sm font-medium',
  md: 'text-base font-semibold',
  lg: 'text-xl font-bold',
  xl: 'text-3xl font-bold',
} as const satisfies Record<string, string>

export type MoneySizeToken = keyof typeof MONEY_SIZE_CLASSES

// ── PageShell max-width map ───────────────────────────────────────────────────

export const PAGE_MAX_WIDTH = {
  md:   'max-w-2xl',
  lg:   'max-w-4xl',
  xl:   'max-w-6xl',
  full: 'max-w-full',
} as const satisfies Record<string, string>

export type PageMaxWidth = keyof typeof PAGE_MAX_WIDTH
