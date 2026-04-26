import type { RequestHandler } from "express";

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const getClientIp = (ip: string | undefined, fallbackIp?: string): string =>
  ip || fallbackIp || "unknown";

export const createIpRateLimitMiddleware = ({
  maxRequests,
  windowMs
}: RateLimitOptions): RequestHandler => {
  const buckets = new Map<string, Bucket>();

  return (request, response, next) => {
    const now = Date.now();
    const clientIp = getClientIp(request.ip, request.socket.remoteAddress);
    const existingBucket = buckets.get(clientIp);
    const bucket =
      existingBucket && now < existingBucket.resetAt
        ? existingBucket
        : {
            count: 0,
            resetAt: now + windowMs
          };

    bucket.count += 1;
    buckets.set(clientIp, bucket);

    const remainingRequests = Math.max(maxRequests - bucket.count, 0);

    response.setHeader("X-RateLimit-Limit", String(maxRequests));
    response.setHeader("X-RateLimit-Remaining", String(remainingRequests));
    response.setHeader(
      "X-RateLimit-Reset",
      String(Math.ceil(bucket.resetAt / 1000))
    );

    if (bucket.count > maxRequests) {
      response.setHeader(
        "Retry-After",
        String(Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1))
      );
      response.status(429).json({
        error: "Rate limit exceeded."
      });
      return;
    }

    if (buckets.size > 10_000) {
      for (const [key, value] of buckets) {
        if (now >= value.resetAt) {
          buckets.delete(key);
        }
      }
    }

    next();
  };
};
