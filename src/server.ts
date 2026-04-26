import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { PsnAuthManager } from "./psn/psnAuthManager.js";
import { PsnLookupClient } from "./psn/psnLookupClient.js";
import { CachedAccountLookupService } from "./services/cachedAccountLookupService.js";

const config = readConfig();

if (!config.psnNpsso && !config.psnRefreshToken) {
  throw new Error("Set PSN_NPSSO or PSN_REFRESH_TOKEN before starting the API.");
}

const authManager = new PsnAuthManager(config);
const lookupClient = new PsnLookupClient(
  authManager,
  undefined,
  config.requestTimeoutMs
);
const lookupService = new CachedAccountLookupService(lookupClient, {
  ttlMs: config.cacheTtlSeconds * 1000
});

const app = createApp({
  cacheTtlSeconds: config.cacheTtlSeconds,
  lookupService,
  maxConcurrentLookups: config.maxConcurrentLookups,
  rateLimitMaxRequests: config.rateLimitMaxRequests,
  rateLimitWindowSeconds: config.rateLimitWindowSeconds,
  trustProxy: config.trustProxy
});

app.listen(config.port, () => {
  console.log(`PSN lookup API listening on port ${config.port}`);
});
