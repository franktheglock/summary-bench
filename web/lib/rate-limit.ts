import { NextResponse } from "next/server";

type RateLimitConfig = {
  id: string;
  maxRequests: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  limited: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cloudflareIp = request.headers.get("cf-connecting-ip");

  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || cloudflareIp;
  if (ip) {
    return ip;
  }

  const userAgent = request.headers.get("user-agent")?.trim();
  return userAgent ? `ua:${userAgent}` : "anonymous";
}

function cleanupExpiredEntries(store: Map<string, RateLimitEntry>, now: number): void {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

function getStore(config: RateLimitConfig): Map<string, RateLimitEntry> {
  let store = stores.get(config.id);
  if (!store) {
    store = new Map<string, RateLimitEntry>();
    stores.set(config.id, store);
  }

  return store;
}

export function checkRateLimit(request: Request, config: RateLimitConfig): RateLimitResult {
  if (process.env.NODE_ENV !== "production") {
    const resetAt = Date.now() + config.windowMs;
    return {
      limited: false,
      remaining: config.maxRequests,
      resetAt,
      retryAfterSeconds: Math.ceil(config.windowMs / 1000),
    };
  }

  const now = Date.now();
  const key = getClientIdentifier(request);
  const store = getStore(config);

  cleanupExpiredEntries(store, now);

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + config.windowMs;
    store.set(key, {
      count: 1,
      resetAt,
    });

    return {
      limited: false,
      remaining: config.maxRequests - 1,
      resetAt,
      retryAfterSeconds: Math.ceil(config.windowMs / 1000),
    };
  }

  current.count += 1;
  store.set(key, current);

  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  return {
    limited: current.count > config.maxRequests,
    remaining: Math.max(0, config.maxRequests - current.count),
    resetAt: current.resetAt,
    retryAfterSeconds,
  };
}

export function createRateLimitResponse(result: RateLimitResult, message = "Too many requests.") {
  const response = NextResponse.json(
    {
      error: message,
      retry_after_seconds: result.retryAfterSeconds,
    },
    { status: 429 }
  );

  response.headers.set("Retry-After", String(result.retryAfterSeconds));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(result.resetAt));
  return response;
}