import express from "express";

import { LookupNotFoundError } from "./errors.js";
import { createClientInformationMiddleware } from "./middleware/clientInformation.js";
import { createIpRateLimitMiddleware } from "./middleware/ipRateLimit.js";
import { metricsHandler, metricsMiddleware } from "./metrics.js";
import { securityHeadersMiddleware } from "./middleware/securityHeaders.js";
import type { AccountLookupService } from "./types.js";
import { logError } from "./utils/logError.js";
import { ConcurrencyGate } from "./utils/concurrencyGate.js";

interface CreateAppOptions {
  cacheTtlSeconds: number;
  lookupService: AccountLookupService;
  maxConcurrentLookups: number;
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
  trustProxy: boolean;
}

const getUsernameFromQuery = (
  query: Record<string, unknown>
): string | undefined => {
  const rawValue = query.username ?? query.onlineId;

  if (typeof rawValue !== "string") {
    return undefined;
  }

  return rawValue.trim();
};

export const createApp = ({
  cacheTtlSeconds,
  lookupService,
  maxConcurrentLookups,
  rateLimitMaxRequests,
  rateLimitWindowSeconds,
  trustProxy
}: CreateAppOptions) => {
  const app = express();
  const concurrencyGate = new ConcurrencyGate(maxConcurrentLookups);
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  app.use(securityHeadersMiddleware);
  app.use(metricsMiddleware);

  app.use(
    createIpRateLimitMiddleware({
      maxRequests: rateLimitMaxRequests,
      windowMs: rateLimitWindowSeconds * 1000
    })
  );

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/metrics", metricsHandler);

  app.use("/api/psn/account-id", createClientInformationMiddleware());

  app.get("/api/psn/account-id", async (request, response) => {
    const username = getUsernameFromQuery(
      request.query as Record<string, unknown>
    );
    let acquiredConcurrencySlot = false;

    if (!username) {
      response.status(400).json({
        error: 'Missing required query parameter "username".'
      });
      return;
    }

    if (username.length > 64) {
      response.status(400).json({
        error: 'Query parameter "username" must be 64 characters or fewer.'
      });
      return;
    }

    try {
      acquiredConcurrencySlot = concurrencyGate.tryAcquire();

      if (!acquiredConcurrencySlot) {
        response.status(503).json({
          error: "Server is busy. Try again shortly."
        });
        return;
      }

      const result = await lookupService.lookup(username);

      response.setHeader("Cache-Control", `private, max-age=${cacheTtlSeconds}`);
      response.setHeader("X-Cache", result.cached ? "HIT" : "MISS");
      response.locals.cacheStatus = result.cached ? "hit" : "miss";
      response.locals.resolvedBy = result.resolvedBy;
      response.json(result);
    } catch (error) {
      if (error instanceof LookupNotFoundError) {
        response.status(error.statusCode).json({
          error: error.message
        });
        return;
      }

      logError(
        "PSN lookup failed",
        {
          clientName:
            typeof response.locals.clientName === "string"
              ? response.locals.clientName
              : "unknown",
          path: request.path,
          username
        },
        error
      );

      response.status(502).json({
        error: "PSN lookup failed."
      });
    } finally {
      if (acquiredConcurrencySlot) {
        concurrencyGate.release();
      }
    }
  });

  return app;
};
