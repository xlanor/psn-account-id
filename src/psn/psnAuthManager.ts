import * as psnApi from "psn-api";
import type { AuthorizationPayload, AuthTokensResponse } from "psn-api";

interface CachedAuthTokens extends AuthTokensResponse {
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

interface PsnAuthConfig {
  psnNpsso?: string;
  psnRefreshToken?: string;
}

interface PsnAuthDependencies {
  exchangeAccessCodeForAuthTokens: (
    accessCode: string
  ) => Promise<AuthTokensResponse>;
  exchangeNpssoForAccessCode: (npssoToken: string) => Promise<string>;
  exchangeRefreshTokenForAuthTokens: (
    refreshToken: string
  ) => Promise<AuthTokensResponse>;
}

const defaultDependencies: PsnAuthDependencies = {
  exchangeAccessCodeForAuthTokens: psnApi.exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode: psnApi.exchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens: psnApi.exchangeRefreshTokenForAuthTokens
};

export interface AuthorizationProvider {
  getAuthorization(): Promise<AuthorizationPayload>;
}

export class PsnAuthManager implements AuthorizationProvider {
  private cachedTokens?: CachedAuthTokens;
  private inFlightRefresh?: Promise<CachedAuthTokens>;

  constructor(
    private readonly config: PsnAuthConfig,
    private readonly deps: PsnAuthDependencies = defaultDependencies
  ) {}

  async getAuthorization(): Promise<AuthorizationPayload> {
    const tokens = await this.getValidTokens();

    return {
      accessToken: tokens.accessToken
    };
  }

  private async getValidTokens(): Promise<CachedAuthTokens> {
    if (this.cachedTokens && this.hasUsableAccessToken(this.cachedTokens)) {
      return this.cachedTokens;
    }

    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    this.inFlightRefresh = this.refreshTokens();

    try {
      this.cachedTokens = await this.inFlightRefresh;
      return this.cachedTokens;
    } finally {
      this.inFlightRefresh = undefined;
    }
  }

  private hasUsableAccessToken(tokens: CachedAuthTokens): boolean {
    return Date.now() < tokens.accessTokenExpiresAt - 60_000;
  }

  private hasUsableRefreshToken(tokens: CachedAuthTokens): boolean {
    return Date.now() < tokens.refreshTokenExpiresAt - 60_000;
  }

  private async refreshTokens(): Promise<CachedAuthTokens> {
    if (this.cachedTokens && this.hasUsableRefreshToken(this.cachedTokens)) {
      return this.toCachedTokens(
        await this.deps.exchangeRefreshTokenForAuthTokens(
          this.cachedTokens.refreshToken
        )
      );
    }

    if (this.config.psnRefreshToken) {
      return this.toCachedTokens(
        await this.deps.exchangeRefreshTokenForAuthTokens(
          this.config.psnRefreshToken
        )
      );
    }

    if (!this.config.psnNpsso) {
      throw new Error(
        "Missing PSN credentials. Set PSN_NPSSO or PSN_REFRESH_TOKEN."
      );
    }

    const accessCode = await this.deps.exchangeNpssoForAccessCode(
      this.config.psnNpsso
    );

    return this.toCachedTokens(
      await this.deps.exchangeAccessCodeForAuthTokens(accessCode)
    );
  }

  private toCachedTokens(tokens: AuthTokensResponse): CachedAuthTokens {
    const now = Date.now();

    return {
      ...tokens,
      accessTokenExpiresAt: now + tokens.expiresIn * 1000,
      refreshTokenExpiresAt: now + tokens.refreshTokenExpiresIn * 1000
    };
  }
}
