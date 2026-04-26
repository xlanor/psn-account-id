import * as psnApi from "psn-api";
import type {
  ProfileFromUserNameResponse,
  SocialAccountResult,
  UniversalSearchResponse
} from "psn-api";

import { LookupNotFoundError } from "../errors.js";
import type { AccountLookupClient, AccountLookupResult } from "../types.js";
import type { AuthorizationProvider } from "./psnAuthManager.js";

interface PsnLookupDependencies {
  getProfileFromUserName: (
    authorization: Awaited<ReturnType<AuthorizationProvider["getAuthorization"]>>,
    userName: string
  ) => Promise<ProfileFromUserNameResponse>;
  makeUniversalSearch: (
    authorization: Awaited<ReturnType<AuthorizationProvider["getAuthorization"]>>,
    searchTerm: string,
    domain: "SocialAllAccounts"
  ) => Promise<UniversalSearchResponse<SocialAccountResult>>;
}

const defaultDependencies: PsnLookupDependencies = {
  getProfileFromUserName: psnApi.getProfileFromUserName,
  makeUniversalSearch: psnApi.makeUniversalSearch
};

const normalizeUsername = (username: string): string =>
  username.trim().toLowerCase();

const isExactOnlineIdMatch = (candidate: string, requested: string): boolean =>
  normalizeUsername(candidate) === normalizeUsername(requested);

export class PsnLookupClient implements AccountLookupClient {
  constructor(
    private readonly authorizationProvider: AuthorizationProvider,
    private readonly deps: PsnLookupDependencies = defaultDependencies,
    private readonly requestTimeoutMs = 10_000
  ) {}

  async lookupByUsername(username: string): Promise<AccountLookupResult> {
    const trimmedUsername = username.trim();
    const authorization = await this.authorizationProvider.getAuthorization();

    try {
      const profileResponse = await this.withTimeout(
        this.deps.getProfileFromUserName(authorization, trimmedUsername),
        "PSN profile lookup timed out."
      );

      return this.fromProfile(profileResponse);
    } catch {
      const searchResponse = await this.withTimeout(
        this.deps.makeUniversalSearch(
          authorization,
          trimmedUsername,
          "SocialAllAccounts"
        ),
        "PSN universal search timed out."
      );
      const fallbackResult = this.findExactSearchMatch(
        searchResponse,
        trimmedUsername
      );

      if (!fallbackResult) {
        throw new LookupNotFoundError(trimmedUsername);
      }

      return {
        onlineId: fallbackResult.socialMetadata.onlineId,
        accountId: fallbackResult.socialMetadata.accountId,
        npId: null,
        base64AccountId: null,
        resolvedBy: "search"
      };
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    message: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(message));
          }, this.requestTimeoutMs);
        })
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private fromProfile(
    profileResponse: ProfileFromUserNameResponse
  ): AccountLookupResult {
    return {
      onlineId: profileResponse.profile.onlineId,
      accountId: profileResponse.profile.accountId,
      npId: profileResponse.profile.npId,
      base64AccountId: profileResponse.profile.npId,
      resolvedBy: "profile"
    };
  }

  private findExactSearchMatch(
    searchResponse: UniversalSearchResponse<SocialAccountResult>,
    username: string
  ): SocialAccountResult | undefined {
    for (const domainResponse of searchResponse.domainResponses) {
      const exactMatch = domainResponse.results.find((result) =>
        isExactOnlineIdMatch(result.socialMetadata.onlineId, username)
      );

      if (exactMatch) {
        return exactMatch;
      }
    }

    return undefined;
  }
}
