/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@skillforge/shared-types'],
  experimental: {
    typedRoutes: true,
  },
  async rewrites() {
    const assessmentApi = process.env.ASSESSMENT_API ?? 'http://localhost:4001';
    return [
      { source: '/api/assessment/:path*', destination: `${assessmentApi}/:path*` },
    ];
  },
};

export default nextConfig;
