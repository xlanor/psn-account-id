export type LookupResolutionSource = "profile" | "search";

export interface AccountLookupResult {
  onlineId: string;
  accountId: string | null;
  npId: string | null;
  base64AccountId: string | null;
  hexAccountId: string | null;
  resolvedBy: LookupResolutionSource;
}

export interface CachedAccountLookupResult extends AccountLookupResult {
  cached: boolean;
}

export interface AccountLookupClient {
  lookupByUsername(username: string): Promise<AccountLookupResult>;
}

export interface AccountLookupService {
  lookup(username: string): Promise<CachedAccountLookupResult>;
}
