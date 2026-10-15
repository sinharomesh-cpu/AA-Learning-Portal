import type { NextConfig } from 'next';
import { demoGateError, isHostedDemo } from './src/config/demoGate';
import { isTestEnvironment, testEnvGateError } from './src/config/testEnv';

// Demo mode (OC-27 / D-39) never reaches a real production build. The only exception is the
// owner-approved hosted demo preview (OC-34), which needs AA_HOSTED_DEMO=true as well and
// must have no real-service settings. See src/config/demoGate.ts.
const gateError = demoGateError(process.env) ?? testEnvGateError(process.env);
if (gateError) throw new Error(gateError);
const hostedDemo = isHostedDemo(process.env);
const testEnvironment = isTestEnvironment(process.env);

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera and microphone stay off until the AI classroom phase enables the microphone deliberately.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // The demo preview and the test environment must not appear in search engines.
  ...(hostedDemo || testEnvironment ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The common-password list is read from disk by the server (OC-35); make sure every server
  // route's trace includes it on hosted deployments.
  outputFileTracingIncludes: {
    '/**': ['./src/server/auth/data/common-passwords.txt'],
  },
  // The development indicator badge overlaps the phone bottom navigation.
  devIndicators: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
