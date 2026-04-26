import { TtlCache } from "../cache/ttlCache.js";
import type {
  AccountLookupClient,
  AccountLookupResult,
  AccountLookupService,
  CachedAccountLookupResult
} from "../types.js";

const normalizeUsername = (username: string): string =>
  username.trim().toLowerCase();

interface CacheOptions {
  ttlMs: number;
}

export class CachedAccountLookupService implements AccountLookupService {
  private readonly cache = new TtlCache<string, AccountLookupResult>();
  private readonly inFlight = new Map<string, Promise<AccountLookupResult>>();

  constructor(
    private readonly client: AccountLookupClient,
    private readonly options: CacheOptions
  ) {}

  async lookup(username: string): Promise<CachedAccountLookupResult> {
    const key = normalizeUsername(username);
    const cached = this.cache.get(key);

    if (cached) {
      return {
        ...cached,
        cached: true
      };
    }

    const existingLookup = this.inFlight.get(key);

    if (existingLookup) {
      const result = await existingLookup;
      return {
        ...result,
        cached: false
      };
    }

    const lookupPromise = this.client
      .lookupByUsername(username)
      .then((result) => {
        this.cache.set(key, result, this.options.ttlMs);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, lookupPromise);

    const result = await lookupPromise;

    return {
      ...result,
      cached: false
    };
  }
}

