import type { NextConfig } from 'next';

// Demo mode (OC-27 / D-39) must never reach a production build.
// End-to-end tests therefore run against `next dev`, never against a demo-enabled production build.
if (process.env.NODE_ENV === 'production' && process.env.AA_DEMO_MODE === 'true') {
  throw new Error('AA_DEMO_MODE=true is not allowed in a production build.');
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera and microphone stay off until the AI classroom phase enables the microphone deliberately.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The development indicator badge overlaps the phone bottom navigation.
  devIndicators: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
