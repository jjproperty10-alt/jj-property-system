import type { Config } from 'jest'

/**
 * Jest configuration for JJ Property 10.
 *
 * Scope: unit tests for pure utility functions only (formatters, classifiers).
 * React-PDF renderer and Next.js page components are NOT in scope for this config.
 *
 * moduleResolution is overridden to 'node' here because tsconfig.json uses 'bundler'
 * (a Next.js/Vite-specific setting that ts-jest does not support).
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  moduleNameMapper: {
    // Support @/* path alias from tsconfig.json
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        // Override 'bundler' — ts-jest requires 'node' or 'node16'
        moduleResolution: 'node',
        // Keep strict mode from root tsconfig
        strict: true,
      },
    },
  },
  // Don't try to transform @react-pdf/renderer (ESM) — our tests don't import it
  transformIgnorePatterns: ['/node_modules/'],
  // Collect coverage from the lib/pdf folder
  collectCoverageFrom: ['src/lib/pdf/**/*.ts'],
}

export default config
