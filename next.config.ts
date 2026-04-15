import type { NextConfig } from 'next'
// @ts-expect-error next-pwa型定義なし
import withPWA from 'next-pwa'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})(nextConfig)
