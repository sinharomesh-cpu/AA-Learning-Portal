import { NextResponse, type NextRequest } from 'next/server';
import { isTestEnvironment, TEST_ACCESS_USER } from '@/config/testEnv';

/**
 * Password gate for the hosted test environment only (OC-57). Everywhere else this lets every
 * request through untouched. Uses the browser's built-in sign-in box (HTTP Basic), so it works
 * before any AA Pro account exists.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function proxy(request: NextRequest) {
  if (!isTestEnvironment(process.env)) return NextResponse.next();
  const expected = process.env.AA_TEST_ACCESS_PASSWORD ?? '';
  const header = request.headers.get('authorization') ?? '';
  if (expected && header.startsWith('Basic ')) {
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(':');
    if (
      sep > 0 &&
      constantTimeEqual(decoded.slice(0, sep), TEST_ACCESS_USER) &&
      constantTimeEqual(decoded.slice(sep + 1), expected)
    ) {
      return NextResponse.next();
    }
  }
  return new NextResponse('AA Pro test environment: sign-in required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="AA Pro test environment", charset="UTF-8"',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export const config = {
  // Everything except Next.js build assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
