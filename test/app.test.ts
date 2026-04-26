import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";

import { createApp } from "../src/app.js";
import type { AccountLookupService } from "../src/types.js";

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

test("GET /api/psn/account-id returns 400 when username is missing", async () => {
  await withServer(
    {
      lookup: async () => {
        throw new Error("Should not be called");
      }
    },
    {},
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/psn/account-id`);
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
        base64AccountId: "eGVsbmlhQGM2LnVz",
        resolvedBy: "profile",
        cached: true
      })
    },
    {},
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-cache"), "HIT");
      assert.equal(body.accountId, "962157895908076652");
      assert.equal(body.base64AccountId, "eGVsbmlhQGM2LnVz");
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
          base64AccountId: "eGVsbmlhQGM2LnVz",
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
        `${baseUrl}/api/psn/account-id?username=xelnia`
      );
      await lookupStarted;
      const secondRequest = await fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`,
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
        base64AccountId: "eGVsbmlhQGM2LnVz",
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
        `${baseUrl}/api/psn/account-id?username=xelnia`
      );
      const secondResponse = await fetch(
        `${baseUrl}/api/psn/account-id?username=xelnia`
      );
      const secondBody = await secondResponse.json();

      assert.equal(firstResponse.status, 200);
      assert.equal(secondResponse.status, 429);
      assert.equal(secondBody.error, "Rate limit exceeded.");
      assert.equal(secondResponse.headers.get("retry-after"), "60");
    }
  );
});
