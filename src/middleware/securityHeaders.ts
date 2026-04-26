import type { RequestHandler } from "express";

export const securityHeadersMiddleware: RequestHandler = (
  _request,
  response,
  next
) => {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-site");
  response.setHeader(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), microphone=()"
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");

  next();
};
