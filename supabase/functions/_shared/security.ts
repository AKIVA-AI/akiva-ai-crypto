/**
 * Shared security utilities for Edge Functions
 *
 * This module provides:
 * - Secure CORS headers with origin validation
 * - Authentication helpers
 * - Rate limiting (in-memory + optional Redis)
 * - Role-based access control
 */

// Production domains - configure via ALLOWED_ORIGINS env var or add here
const ENV_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',').map(s => s.trim()) ?? [];
const ALLOWED_ORIGINS = [
  ...ENV_ORIGINS,
  // Add custom production domains here
];

// Allowed origin patterns (for dynamic subdomains)
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/.*\.lovable\.app$/,
  /^https:\/\/.*\.lovableproject\.com$/,
];

// Development origins (only in dev mode)
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitConfig {
  maxRequests: number;      // Maximum requests per window
  windowMs: number;         // Window size in milliseconds
  keyPrefix?: string;       // Prefix for rate limit key
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;          // Unix timestamp when limit resets
  retryAfter?: number;      // Seconds until retry (if blocked)
}

// In-memory rate limit store (resets on cold start - acceptable for edge functions)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Default rate limit configs by endpoint type
export const RATE_LIMITS = {
  // Trading operations - stricter limits
  trading: { maxRequests: 30, windowMs: 60000, keyPrefix: 'trade' },     // 30/min
  // Read operations - more generous
  read: { maxRequests: 100, windowMs: 60000, keyPrefix: 'read' },        // 100/min
  // Validation - moderate limits
  validate: { maxRequests: 10, windowMs: 60000, keyPrefix: 'validate' }, // 10/min
  // Kill switch - very strict
  killSwitch: { maxRequests: 5, windowMs: 60000, keyPrefix: 'kill' },    // 5/min
  // Arbitrage scanning
  arbitrage: { maxRequests: 20, windowMs: 60000, keyPrefix: 'arb' },     // 20/min
} as const;

/**
 * Check rate limit for a user/IP
 * Returns whether the request is allowed and remaining quota
 */
export function checkRateLimit(
  identifier: string,  // userId or IP
  config: RateLimitConfig
): RateLimitResult {
  const key = `${config.keyPrefix || 'default'}:${identifier}`;
  const now = Date.now();

  // Get or create bucket
  let bucket = rateLimitStore.get(key);

  // Reset if window expired
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + config.windowMs };
    rateLimitStore.set(key, bucket);
  }

  // Check if over limit
  if (bucket.count >= config.maxRequests) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfter,
    };
  }

  // Increment and allow
  bucket.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - bucket.count,
    resetAt: bucket.resetAt,
  };
}

/**
 * Create rate limit response headers
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.resetAt.toString(),
    ...(result.retryAfter ? { 'Retry-After': result.retryAfter.toString() } : {}),
  };
}

/**
 * Rate limit middleware - returns error response if blocked
 */
export function rateLimitMiddleware(
  identifier: string,
  config: RateLimitConfig,
  corsHeaders: Record<string, string>
): Response | null {
  const result = checkRateLimit(identifier, config);

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: result.retryAfter,
        message: `Too many requests. Please wait ${result.retryAfter} seconds.`,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          ...rateLimitHeaders(result),
          'Content-Type': 'application/json',
        },
      }
    );
  }

  return null; // Request allowed
}

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (now >= bucket.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Get secure CORS headers based on request origin
 */
export function getSecureCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const isDev = Deno.env.get('ENVIRONMENT') !== 'production';
  const allowedOrigins = isDev ? [...ALLOWED_ORIGINS, ...DEV_ORIGINS] : ALLOWED_ORIGINS;

  // Check if origin is allowed (exact match or pattern match)
  let origin = allowedOrigins[0]; // Default to first allowed origin

  if (requestOrigin) {
    // Check exact match first
    if (allowedOrigins.includes(requestOrigin)) {
      origin = requestOrigin;
    } else {
      // Check pattern match
      for (const pattern of ALLOWED_ORIGIN_PATTERNS) {
        if (pattern.test(requestOrigin)) {
          origin = requestOrigin;
          break;
        }
      }
    }
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

/**
 * Permissive CORS for truly public endpoints (webhooks, public data)
 */
export const publicCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Validate JWT and extract user
 */
export async function validateAuth(
  supabase: any,
  authHeader: string | null
): Promise<{ user: any; error?: string }> {
  if (!authHeader) {
    return { user: null, error: 'Missing authorization header' };
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }
  
  return { user };
}

/**
 * Check if user has required role
 */
export async function checkRole(
  supabase: any,
  userId: string,
  requiredRoles: string[]
): Promise<{ hasRole: boolean; userRole?: string }> {
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', requiredRoles);
  
  if (!roleData || roleData.length === 0) {
    return { hasRole: false };
  }
  
  return { hasRole: true, userRole: roleData[0].role };
}
