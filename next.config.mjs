/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Externalize heavy server-side packages so they aren't bundled per-route
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-d1',
    'bcryptjs',
  ],
}

export default nextConfig
