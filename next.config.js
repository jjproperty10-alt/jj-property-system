/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/owners/[slug]/report/pdf': ['./public/fonts/**'],
  },
}

module.exports = nextConfig
