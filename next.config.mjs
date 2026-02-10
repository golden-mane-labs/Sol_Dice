/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Suppress hydration warnings caused by browser extensions
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Experimental features to help with hydration
  experimental: {
    optimizePackageImports: ['react-qrcode-logo'],
  },
};

export default nextConfig;
