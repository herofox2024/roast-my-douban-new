import { env } from '$env/dynamic/private';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { RequestEvent } from '@sveltejs/kit';

export const LIMIT_CONFIG = {
  MAX_REQUESTS_PER_DAY: 3,
};

const TRUST_X_FORWARDED_FOR = env.TRUST_X_FORWARDED_FOR === 'true';

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export function getClientIp(request: Request): string {
  const headers = request.headers;
  const trustedForwardedIp = headers.get('cf-connecting-ip')
    || headers.get('x-vercel-forwarded-for')
    || headers.get('x-real-ip');

  if (trustedForwardedIp) return trustedForwardedIp;

  if (TRUST_X_FORWARDED_FOR) {
    const xForwardedFor = headers.get('x-forwarded-for');
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim();
    }
  }

  return 'unknown';
}

export async function checkRateLimit(
  request: Request, limitCount: number, prefix: string): Promise<Response | null> {
  const clientIp = getClientIp(request);

  if (clientIp !== 'unknown') {
    const ratelimit = new Ratelimit({
      redis: redis,
      limiter: Ratelimit.fixedWindow(limitCount, '24 h'),
      analytics: false,
      ephemeralCache: new Map(),
      prefix: prefix,
    });

    const identifier = clientIp;

    try {
      const { success, limit, remaining } = await ratelimit.limit(identifier);
      if (!success) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded',
            message: '请求过于频繁，请 24 小时后再试，或填写你自己的 API Key'
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': remaining.toString()
            }
          });
      }
    } catch (err) {
      console.error('[RateLimit] Redis Error (Allowing Request):', err);
      return null;
    }
  }

  return null;
}


export function withRateLimit(
  handler: (event: RequestEvent) => Promise<Response>
) {
  return async (event: RequestEvent) => {
    // Check if user provided API keys to bypass rate limit
    try {
      const cloned = event.request.clone();
      const body = await cloned.json();
      if (body?.apiKeys && (body.apiKeys.google || body.apiKeys.deepseek || body.apiKeys.qwen || body.apiKeys.chatgpt)) {
        // Bypass rate limit for supporters
        return handler(event);
      }
    } catch (e) {
      // ignore json parse error, proceed to rate limit
    }

    const limitRes = await checkRateLimit(
      event.request,
      LIMIT_CONFIG.MAX_REQUESTS_PER_DAY,
      '@rmd/ratelimit'
    );
    if (limitRes) {
      return limitRes;
    }
    return handler(event);
  };
}

