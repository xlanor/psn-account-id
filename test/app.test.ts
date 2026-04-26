import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";

import { createApp } from "../src/app.js";
import { metricsRegistry } from "../src/metrics.js";
import type { AccountLookupService } from "../src/types.js";

const clientHeaders = {
  "X-Client-Information": "chiaki-ng-1.0.0"
};

const withServer = async (
  lookupService: AccountLookupService,
  options: {
    maxConcurrentLookups?: number;
    rateLimitMaxRequests?: number;
    rateLimitWindowSeconds?: number;
    trustProxy?: boolean;
  },
  run: (baseUrl: string) => Promise<void>
) => {
  const app = createApp({
    cacheTtlSeconds: 60,
    lookupService,
    maxConcurrentLookups: options.maxConcurrentLookups ?? 10,
    rateLimitMaxRequests: options.rateLimitMaxRequests ?? 100,
    rateLimitWindowSeconds: options.rateLimitWindowSeconds ?? 60,
    trustProxy: options.trustProxy ?? false
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  }
};

test("GET /api/psn/account-id returns 400 when client information header is missing", async () => {
  await withServer(
    {
      lookup: async () => {
        throw new Error("Should not be called");
      }
    },
    {},
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`
      );
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(
        body.error,
        'Missing required header "X-Client-Information". Expected "akira-{version}" or "chiaki-ng-{version}".'
      );
    }
  );
});

test("GET /api/psn/account-id returns 400 when client information header is invalid", async () => {
  await withServer(
    {
      lookup: async () => {
        throw new Error("Should not be called");
      }
    },
    {},
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`,
        {
          headers: {
            "X-Client-Information": "other-client-1.0.0"
          }
        }
      );
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(
        body.error,
        'Invalid "X-Client-Information" header. Expected "akira-{version}" or "chiaki-ng-{version}".'
      );
    }
  );
});

test("GET /api/psn/account-id returns 400 when username is missing", async () => {
  await withServer(
    {
      lookup: async () => {
        throw new Error("Should not be called");
      }
    },
    {},
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/psn/account-id`, {
        headers: clientHeaders
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(
        body.error,
        'Missing required query parameter "username".'
      );
    }
  );
});

test("GET /api/psn/account-id returns the cached lookup payload", async () => {
  await withServer(
    {
      lookup: async () => ({
        onlineId: "xelnia",
        accountId: "962157895908076652",
        npId: "eGVsbmlhQGM2LnVz",
        base64AccountId: "bCxwM4JFWg0=",
        hexAccountId: "6c2c703382455a0d",
        resolvedBy: "profile",
        cached: true
      })
    },
    {},
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`,
        {
          headers: clientHeaders
        }
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-cache"), "HIT");
      assert.equal(body.accountId, "962157895908076652");
      assert.equal(body.base64AccountId, "bCxwM4JFWg0=");
      assert.equal(body.hexAccountId, "6c2c703382455a0d");
    }
  );
});

test("GET /metrics exposes per-client lookup counters", async () => {
  metricsRegistry.resetMetrics();

  await withServer(
    {
      lookup: async () => ({
        onlineId: "xelnia",
        accountId: "962157895908076652",
        npId: "eGVsbmlhQGM2LnVz",
        base64AccountId: "bCxwM4JFWg0=",
        hexAccountId: "6c2c703382455a0d",
        resolvedBy: "profile",
        cached: false
      })
    },
    {},
    async (baseUrl) => {
      const lookupResponse = await fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`,
        {
          headers: clientHeaders
        }
      );
      const metricsResponse = await fetch(`${baseUrl}/metrics`);
      const metricsText = await metricsResponse.text();

      assert.equal(lookupResponse.status, 200);
      assert.equal(metricsResponse.status, 200);
      assert.match(
        metricsText,
        /psn_api_lookup_requests_total\{client_name="chiaki-ng",status_code="200",resolved_by="profile",cache="miss"\} 1/
      );
      assert.match(
        metricsText,
        /psn_api_http_requests_total\{route="account_id_lookup",method="GET",status_code="200",client_name="chiaki-ng"\} 1/
      );
    }
  );
});

test("GET /api/psn/account-id rejects requests when concurrency is exhausted", async () => {
  let releaseLookup!: () => void;
  let signalLookupStarted!: () => void;

  const lookupStarted = new Promise<void>((resolve) => {
    signalLookupStarted = resolve;
  });
  const pendingLookup = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });

  await withServer(
    {
      lookup: async () => {
        signalLookupStarted();
        await pendingLookup;

        return {
          onlineId: "xelnia",
          accountId: "962157895908076652",
          npId: "eGVsbmlhQGM2LnVz",
          base64AccountId: "bCxwM4JFWg0=",
          hexAccountId: "6c2c703382455a0d",
          resolvedBy: "profile" as const,
          cached: false
        };
      }
    },
    {
      maxConcurrentLookups: 1
    },
    async (baseUrl) => {
      const firstRequest = fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`,
        {
          headers: clientHeaders
        }
      );
      await lookupStarted;
      const secondRequest = await fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`,
        {
          headers: clientHeaders
        }
      );
      const secondBody = await secondRequest.json();
      releaseLookup();
      const firstResponse = await firstRequest;

      assert.equal(firstResponse.status, 200);
      assert.equal(secondRequest.status, 503);
      assert.equal(secondBody.error, "Server is busy. Try again shortly.");
    }
  );
});

test("GET /api/psn/account-id rate limits repeated requests from the same IP", async () => {
  await withServer(
    {
      lookup: async () => ({
        onlineId: "xelnia",
        accountId: "962157895908076652",
        npId: "eGVsbmlhQGM2LnVz",
        base64AccountId: "bCxwM4JFWg0=",
        hexAccountId: "6c2c703382455a0d",
        resolvedBy: "profile",
        cached: false
      })
    },
    {
      rateLimitMaxRequests: 1,
      rateLimitWindowSeconds: 60
    },
    async (baseUrl) => {
      const firstResponse = await fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`,
        {
          headers: clientHeaders
        }
      );
      const secondResponse = await fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`,
        {
          headers: clientHeaders
        }
      );
      const secondBody = await secondResponse.json();

      assert.equal(firstResponse.status, 200);
      assert.equal(secondResponse.status, 429);
      assert.equal(secondBody.error, "Rate limit exceeded.");
      assert.equal(secondResponse.headers.get("retry-after"), "60");
    }
  );
});
