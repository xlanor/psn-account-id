import client from "prom-client";
import type { RequestHandler } from "express";

import { parseClientInformation } from "./middleware/clientInformation.js";

const register = new client.Registry();

client.collectDefaultMetrics({
  register
});

const httpRequestsTotal = new client.Counter({
  name: "psn_api_http_requests_total",
  help: "Total HTTP requests handled by the service.",
  labelNames: ["route", "method", "status_code", "client_name"] as const,
  registers: [register]
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "psn_api_http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["route", "method", "status_code", "client_name"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register]
});

const lookupRequestsTotal = new client.Counter({
  name: "psn_api_lookup_requests_total",
  help: "Lookup request outcomes for the account lookup endpoint.",
  labelNames: [
    "client_name",
    "status_code",
    "resolved_by",
    "cache"
  ] as const,
  registers: [register]
});

const rateLimitedRequestsTotal = new client.Counter({
  name: "psn_api_rate_limited_requests_total",
  help: "Requests rejected by the in-app IP rate limiter.",
  labelNames: ["route", "client_name"] as const,
  registers: [register]
});

const concurrencyRejectedRequestsTotal = new client.Counter({
  name: "psn_api_concurrency_rejected_requests_total",
  help: "Requests rejected because the global lookup concurrency cap was exhausted.",
  labelNames: ["client_name"] as const,
  registers: [register]
});

const normalizeRoute = (path: string): string => {
  if (path === "/api/psn/account-id") {
    return "account_id_lookup";
  }

  if (path === "/health") {
    return "health";
  }

  if (path === "/metrics") {
    return "metrics";
  }

  return "other";
};

const getClientName = (headerValue: string | undefined): string => {
  const parsed = parseClientInformation(headerValue);
  return parsed?.clientName ?? "unknown";
};

export const metricsMiddleware: RequestHandler = (request, response, next) => {
  const startedAt = process.hrtime.bigint();

  response.on("finish", () => {
    const clientName = getClientName(request.header("x-client-information"));
    const route = normalizeRoute(request.path);
    const statusCode = String(response.statusCode);
    const durationSeconds =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

    httpRequestsTotal.inc({
      route,
      method: request.method,
      status_code: statusCode,
      client_name: clientName
    });

    httpRequestDurationSeconds.observe(
      {
        route,
        method: request.method,
        status_code: statusCode,
        client_name: clientName
      },
      durationSeconds
    );

    if (route === "account_id_lookup") {
      lookupRequestsTotal.inc({
        client_name: clientName,
        status_code: statusCode,
        resolved_by:
          typeof response.locals.resolvedBy === "string"
            ? response.locals.resolvedBy
            : "none",
        cache:
          typeof response.locals.cacheStatus === "string"
            ? response.locals.cacheStatus
            : "none"
      });
    }

    if (response.statusCode === 429) {
      rateLimitedRequestsTotal.inc({
        route,
        client_name: clientName
      });
    }

    if (route === "account_id_lookup" && response.statusCode === 503) {
      concurrencyRejectedRequestsTotal.inc({
        client_name: clientName
      });
    }
  });

  next();
};

export const metricsHandler: RequestHandler = async (_request, response) => {
  response.setHeader("Content-Type", register.contentType);
  response.send(await register.metrics());
};

export { register as metricsRegistry };

