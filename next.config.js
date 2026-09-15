/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
    outputFileTracingIncludes: {
      '/owners/[slug]/report/pdf': ['./public/fonts/**'],
      '/finance/external-partner/avi/pdf': ['./node_modules/@sparticuz/chromium/**'],
      '/preview/avi-certified-compose/pdf': ['./node_modules/@sparticuz/chromium/**'],
    },
  },
}

module.exports = nextConfig
