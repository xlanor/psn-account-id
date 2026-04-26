import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type PsnApiRuntimeModule = typeof import("psn-api");

const psnApiRuntime = require("psn-api") as PsnApiRuntimeModule;

export const exchangeAccessCodeForAuthTokens =
  psnApiRuntime.exchangeAccessCodeForAuthTokens;
export const exchangeNpssoForAccessCode =
  psnApiRuntime.exchangeNpssoForAccessCode;
export const exchangeRefreshTokenForAuthTokens =
  psnApiRuntime.exchangeRefreshTokenForAuthTokens;
export const getProfileFromUserName = psnApiRuntime.getProfileFromUserName;
export const makeUniversalSearch = psnApiRuntime.makeUniversalSearch;

