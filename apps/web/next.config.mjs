/** @type {import('next').NextConfig} */
//
// The old `/api/assessment/:path*` rewrite has been removed. It's now
// handled by the Route Handler at `app/api/assessment/[...path]/route.ts`,
// which reads the httpOnly `sf_access` cookie and forwards it as a Bearer
// token (the browser never sees the JWT).
//
// `ASSESSMENT_API` is still read at request time by the Route Handlers
// (see `lib/session-cookies.ts`), so the env var remains relevant even
// without a rewrite here.
//
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@skillforge/shared-types'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
