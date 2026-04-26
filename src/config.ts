export interface AppConfig {
  maxConcurrentLookups: number;
  port: number;
  psnNpsso?: string;
  psnRefreshToken?: string;
  cacheTtlSeconds: number;
  requestTimeoutMs: number;
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
  trustProxy: boolean;
}

const parsePositiveInteger = (
  rawValue: string | undefined,
  fallback: number
): number => {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

export const readConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const trustProxy =
    env.TRUST_PROXY?.trim().toLowerCase() === "true" ||
    env.TRUST_PROXY === "1";

  return {
    maxConcurrentLookups: parsePositiveInteger(
      env.MAX_CONCURRENT_LOOKUPS,
      25
    ),
    port: parsePositiveInteger(env.PORT, 3000),
    psnNpsso: env.PSN_NPSSO?.trim() || undefined,
    psnRefreshToken: env.PSN_REFRESH_TOKEN?.trim() || undefined,
    cacheTtlSeconds: parsePositiveInteger(
      env.PSN_LOOKUP_CACHE_TTL_SECONDS,
      3600
    ),
    requestTimeoutMs: parsePositiveInteger(env.PSN_LOOKUP_TIMEOUT_MS, 10_000),
    rateLimitMaxRequests: parsePositiveInteger(env.RATE_LIMIT_MAX_REQUESTS, 30),
    rateLimitWindowSeconds: parsePositiveInteger(
      env.RATE_LIMIT_WINDOW_SECONDS,
      60
    ),
    trustProxy
  };
};
