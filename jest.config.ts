import type { Config } from 'jest'

/**
 * Jest configuration for JJ Property 10.
 *
 * Scope: unit tests for pure utility functions and design-system components.
 *
 * moduleResolution is overridden to 'node' because tsconfig.json uses 'bundler'.
 * jsx is set to 'react-jsx' because tsconfig.json uses 'preserve' — ts-jest needs
 * a concrete JSX transform so .tsx test files can execute under Node.js.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^server-only$': '<rootDir>/jest.serverOnly.js',
    '^@react-pdf/renderer$': '<rootDir>/jest.reactPdfMock.js',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        moduleResolution: 'node',
        strict: true,
        // Tests run on Node (not the browser bundle): compile at ES2017 so native Set/Map
        // iteration and spreads are emitted. At the base 'es5' target, ts-jest downlevels
        // `for (const k of new Set([...]))` to a `.length` index loop that iterates 0 times.
        target: 'es2017',
        // Override 'preserve' so .tsx test files can run under Node.js
        jsx: 'react-jsx',
      },
    },
  },
  transformIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: ['src/lib/pdf/**/*.ts'],
}

export default config
