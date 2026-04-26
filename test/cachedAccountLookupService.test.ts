import assert from "node:assert/strict";
import test from "node:test";

import { CachedAccountLookupService } from "../src/services/cachedAccountLookupService.js";
import type { AccountLookupResult } from "../src/types.js";

const mockResult: AccountLookupResult = {
  onlineId: "xelnia",
  accountId: "962157895908076652",
  npId: "eGVsbmlhQGM2LnVz",
  base64AccountId: "bCxwM4JFWg0=",
  hexAccountId: "6c2c703382455a0d",
  resolvedBy: "profile"
};

test("caches lookups by normalized username", async () => {
  let callCount = 0;

  const service = new CachedAccountLookupService(
    {
      lookupByUsername: async () => {
        callCount += 1;
        return mockResult;
      }
    },
    { ttlMs: 60_000 }
  );

  const firstLookup = await service.lookup("Xelnia");
  const secondLookup = await service.lookup("xelnia");

  assert.equal(callCount, 1);
  assert.equal(firstLookup.cached, false);
  assert.equal(secondLookup.cached, true);
});

test("deduplicates in-flight lookups for the same username", async () => {
  let callCount = 0;
  let resolveLookup!: (result: AccountLookupResult) => void;

  const pendingLookup = new Promise<AccountLookupResult>((resolve) => {
    resolveLookup = resolve;
  });

  const service = new CachedAccountLookupService(
    {
      lookupByUsername: async () => {
        callCount += 1;
        return pendingLookup;
      }
    },
    { ttlMs: 60_000 }
  );

  const firstLookup = service.lookup("xelnia");
  const secondLookup = service.lookup("XELNIA");

  resolveLookup(mockResult);

  const [firstResult, secondResult] = await Promise.all([
    firstLookup,
    secondLookup
  ]);

  assert.equal(callCount, 1);
  assert.equal(firstResult.cached, false);
  assert.equal(secondResult.cached, false);
});
