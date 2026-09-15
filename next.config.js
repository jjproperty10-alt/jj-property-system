/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
    outputFileTracingIncludes: {
      '/owners/[slug]/report/pdf': ['./public/fonts/**'],
      '/finance/external-partner/avi/pdf': [
        './node_modules/@sparticuz/chromium/**',
        './node_modules/puppeteer-core/**',
        './public/fonts/**',
      ],
      '/preview/avi-certified-compose/pdf': [
        './node_modules/@sparticuz/chromium/**',
        './node_modules/puppeteer-core/**',
        './public/fonts/**',
      ],
    },
  },
}

module.exports = nextConfig
