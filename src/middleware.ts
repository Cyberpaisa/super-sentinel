import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { RateLimiterMemory } from 'rate-limiter-flexible';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Rate limiter setup
 * Uses Upstash Redis if configured (persists across deploys/cold starts),
 * falls back to in-memory rate limiting for development.
 */
const useUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

// Upstash rate limiters (production)
const upstashLimiters = useUpstash
  ? {
      default: new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(100, '60 s'),
        prefix: 'rl:default',
      }),
      register: new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(5, '3600 s'),
        prefix: 'rl:register',
      }),
    }
  : null;

// In-memory fallback (development / no Redis configured)
const memoryLimiters = {
  default: new RateLimiterMemory({ points: 100, duration: 60 }),
  register: new RateLimiterMemory({ points: 5, duration: 3600 }),
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
 * Apply rate limiting using Upstash or in-memory fallback
 * Returns null if allowed, or a 429 response if rate limited
 */
async function applyRateLimit(
  clientIp: string,
  isRegistration: boolean
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
  const limiterType = isRegistration ? 'register' : 'default';

  if (upstashLimiters) {
    const limiter = upstashLimiters[limiterType];
    const result = await limiter.limit(clientIp);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetSeconds: Math.ceil((result.reset - Date.now()) / 1000),
    };
  }

  // Fallback to in-memory
  const limiter = memoryLimiters[limiterType];
  const key = `${clientIp}_${limiterType}`;
  try {
    const result = await limiter.consume(key);
    return {
      allowed: true,
      remaining: result.remainingPoints,
      resetSeconds: Math.ceil(result.msBeforeNext / 1000),
    };
  } catch (rateLimiterRes) {
    const res = rateLimiterRes as { msBeforeNext: number };
    return {
      allowed: false,
      remaining: 0,
      resetSeconds: Math.ceil(res.msBeforeNext / 1000),
    };
  }
}

/**
 * Middleware for Supabase auth session refresh and rate limiting
 * Runs on every request to keep the session alive
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const clientIp = getClientIp(request);

  // Apply rate limiting for API routes (skip health endpoints)
  let remaining: string | null = null;
  let reset: string | null = null;

  if (pathname.startsWith('/api') && !shouldSkipRateLimit(pathname)) {
    const rateLimitResult = await applyRateLimit(
      clientIp,
      isRegistrationEndpoint(pathname)
    );

    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult.resetSeconds);
    }

    remaining = String(rateLimitResult.remaining);
    reset = String(rateLimitResult.resetSeconds);
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Add rate limit headers to response
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
          // Re-add security + rate limit headers after recreating response
          response.headers.set('X-Content-Type-Options', 'nosniff');
          response.headers.set('X-Frame-Options', 'DENY');
          response.headers.set('X-XSS-Protection', '1; mode=block');
          response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
          response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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
