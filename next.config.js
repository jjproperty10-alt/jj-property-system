/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      '/owners/[slug]/report/pdf': ['./public/fonts/**'],
      '/finance/external-partner/avi/pdf': ['./public/fonts/**'],
      '/preview/avi-certified-compose/pdf': ['./public/fonts/**'],
    },
  },
}

module.exports = nextConfig
