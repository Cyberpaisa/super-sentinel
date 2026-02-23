import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { RateLimiterMemory } from 'rate-limiter-flexible';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Rate limiters configuration
 * @see docs/backend/authentication.md
 */
const rateLimiters = {
  // Default: 100 requests per minute per IP
  default: new RateLimiterMemory({
    points: 100,
    duration: 60,
  }),
  // Registration: 5 requests per hour per IP (stricter)
  register: new RateLimiterMemory({
    points: 5,
    duration: 3600,
  }),
  // Heartbeat: 10 requests per minute per IP (A1 fix — prevent balance monitoring abuse)
  heartbeat: new RateLimiterMemory({
    points: 10,
    duration: 60,
  }),
  // Quick-check: 30 requests per minute per IP (A2 fix — prevent free-tier abuse)
  quickCheck: new RateLimiterMemory({
    points: 30,
    duration: 60,
  }),
};

/**
 * Get client IP from request headers
 */
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  return '127.0.0.1';
}

/**
 * Check if the path should skip rate limiting
 */
function shouldSkipRateLimit(pathname: string): boolean {
  const skipPaths = ['/api/v1/health', '/api/health', '/_next', '/favicon.ico'];
  return skipPaths.some((path) => pathname.startsWith(path));
}

/**
 * Check if the path is a registration endpoint
 */
function isRegistrationEndpoint(pathname: string): boolean {
  return pathname.includes('/register') || pathname.includes('/signup');
}

/**
 * Select the appropriate rate limiter for a given path.
 * Stricter limits for free/public endpoints to prevent abuse.
 */
function selectRateLimiter(pathname: string): { limiter: RateLimiterMemory; key: string } {
  if (pathname.includes('/heartbeat')) {
    return { limiter: rateLimiters.heartbeat, key: 'heartbeat' };
  }
  if (pathname.includes('/quick-check')) {
    return { limiter: rateLimiters.quickCheck, key: 'quickCheck' };
  }
  if (isRegistrationEndpoint(pathname)) {
    return { limiter: rateLimiters.register, key: 'register' };
  }
  return { limiter: rateLimiters.default, key: 'default' };
}

/**
 * Create rate limit exceeded response
 */
function rateLimitResponse(retryAfter: number): NextResponse {
  const body = {
    data: null,
    error: {
      message: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  };

  return NextResponse.json(body, {
    status: 429,
    headers: {
      'Retry-After': String(Math.ceil(retryAfter)),
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': '0',
    },
  });
}

/**
 * Middleware for Supabase auth session refresh and rate limiting
 * Runs on every request to keep the session alive
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const clientIp = getClientIp(request);

  // Apply rate limiting for API routes (skip health endpoints)
  if (pathname.startsWith('/api') && !shouldSkipRateLimit(pathname)) {
    try {
      const { limiter, key } = selectRateLimiter(pathname);
      const limiterKey = `${clientIp}_${key}`;
      const rateLimitRes = await limiter.consume(limiterKey);

      // Add rate limit headers to successful responses later
      const remainingPoints = rateLimitRes.remainingPoints;
      const msBeforeNext = rateLimitRes.msBeforeNext;

      // Store rate limit info in headers for the response
      request.headers.set('X-RateLimit-Remaining', String(remainingPoints));
      request.headers.set(
        'X-RateLimit-Reset',
        String(Math.ceil(msBeforeNext / 1000))
      );
    } catch (rateLimiterRes) {
      // Rate limit exceeded
      const res = rateLimiterRes as { msBeforeNext: number };
      return rateLimitResponse(res.msBeforeNext / 1000);
    }
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Add rate limit headers to response
  const remaining = request.headers.get('X-RateLimit-Remaining');
  const reset = request.headers.get('X-RateLimit-Reset');
  if (remaining) {
    response.headers.set('X-RateLimit-Remaining', remaining);
  }
  if (reset) {
    response.headers.set('X-RateLimit-Reset', reset);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          // Re-add rate limit headers after recreating response
          if (remaining) {
            response.headers.set('X-RateLimit-Remaining', remaining);
          }
          if (reset) {
            response.headers.set('X-RateLimit-Reset', reset);
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
