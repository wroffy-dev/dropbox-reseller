/**
 * HSTS, only where it is both meaningful and safe.
 *
 * The header instructs browsers to refuse plain HTTP for this host for two
 * years, and `includeSubDomains` extends that to every subdomain. Sent from a
 * development server on localhost it can make a developer's other local
 * projects unreachable over http — a confusing, persistent, browser-level
 * problem that no code change fixes.
 *
 * Azure Container Apps terminates TLS in front of the container and serves the
 * app over HTTPS, so production gets the header and local development does not.
 * `preload` is deliberately omitted: submitting a domain to the HSTS preload
 * list is effectively irreversible and is the site owner's decision, not a
 * default.
 */
const hstsHeader =
  process.env.NODE_ENV === 'production'
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains',
        },
      ]
    : [];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // The build fails on lint errors — a conditional hook should never ship.
  eslint: { ignoreDuringBuilds: false },
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'nodemailer'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Deny framing outright — nothing here is meant to be embedded.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          ...hstsHeader,
        ],
      },
      {
        // Uploaded files are served as-is, so stop the browser guessing a type
        // and never let one render as a document in the site's origin.
        source: '/uploads/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Content-Disposition', value: 'inline' },
          { key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
