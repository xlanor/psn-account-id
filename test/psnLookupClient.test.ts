import assert from "node:assert/strict";
import test from "node:test";

import { LookupNotFoundError } from "../src/errors.js";
import { PsnLookupClient } from "../src/psn/psnLookupClient.js";

const authorizationProvider = {
  getAuthorization: async () => ({
    accessToken: "token"
  })
};

test("returns accountId and npId from the profile endpoint when available", async () => {
  const client = new PsnLookupClient(authorizationProvider, {
    getProfileFromUserName: async () => ({
      profile: {
        onlineId: "xelnia",
        accountId: "962157895908076652",
        npId: "eGVsbmlhQGM2LnVz",
        avatarUrls: [],
        plus: 1,
        aboutMe: "",
        languagesUsed: ["en"],
        trophySummary: {
          level: 1,
          progress: 0,
          earnedTrophies: {
            bronze: 0,
            silver: 0,
            gold: 0,
            platinum: 0
          }
        },
        isOfficiallyVerified: false,
        personalDetail: {
          firstName: "",
          lastName: "",
          profilePictureUrls: []
        },
        personalDetailSharing: "shared",
        personalDetailSharingRequestMessageFlag: false,
        primaryOnlineStatus: "offline",
        presences: [],
        friendRelation: "no",
        requestMessageFlag: false,
        blocking: false,
        following: false,
        consoleAvailability: {
          availabilityStatus: "offline"
        }
      }
    }),
    makeUniversalSearch: async () => {
      throw new Error("Should not be called");
    }
  });

  const result = await client.lookupByUsername("xelnia");

  assert.deepEqual(result, {
    onlineId: "xelnia",
    accountId: "962157895908076652",
    npId: "eGVsbmlhQGM2LnVz",
    base64AccountId: "eGVsbmlhQGM2LnVz",
    resolvedBy: "profile"
  });
});

test("falls back to universal search when the profile endpoint fails", async () => {
  const client = new PsnLookupClient(authorizationProvider, {
    getProfileFromUserName: async () => {
      throw new Error("legacy profile unavailable");
    },
    makeUniversalSearch: async () => ({
      prefix: "xel",
      suggestions: [],
      fallbackQueried: false,
      domainResponses: [
        {
          domain: "SocialAllAccounts",
          domainTitle: "Accounts",
          domainTitleMessageId: "accounts",
          zeroState: false,
          univexId: "1",
          facetOptions: [],
          next: "",
          totalResultCount: 1,
          results: [
            {
              id: "1",
              type: "socialAccount",
              score: 1,
              socialMetadata: {
                accountId: "962157895908076652",
                country: "US",
                language: "en",
                onlineId: "xelnia",
                isPsPlus: true,
                isOfficiallyVerified: false,
                avatarUrl: "https://example.com/avatar.png",
                verifiedUserName: "",
                highlights: {
                  onlineId: ["xelnia"]
                }
              }
            }
          ]
        }
      ]
    })
  });

  const result = await client.lookupByUsername("xelnia");

  assert.deepEqual(result, {
    onlineId: "xelnia",
    accountId: "962157895908076652",
    npId: null,
    base64AccountId: null,
    resolvedBy: "search"
  });
});

test("throws LookupNotFoundError when no exact username match exists", async () => {
  const client = new PsnLookupClient(authorizationProvider, {
    getProfileFromUserName: async () => {
      throw new Error("legacy profile unavailable");
    },
    makeUniversalSearch: async () => ({
      prefix: "xel",
      suggestions: [],
      fallbackQueried: false,
      domainResponses: [
        {
          domain: "SocialAllAccounts",
          domainTitle: "Accounts",
          domainTitleMessageId: "accounts",
          zeroState: false,
          univexId: "1",
          facetOptions: [],
          next: "",
          totalResultCount: 1,
          results: [
            {
              id: "1",
              type: "socialAccount",
              score: 1,
              socialMetadata: {
                accountId: "962157895908076652",
                country: "US",
                language: "en",
                onlineId: "xelnia-alt",
                isPsPlus: true,
                isOfficiallyVerified: false,
                avatarUrl: "https://example.com/avatar.png",
                verifiedUserName: "",
                highlights: {
                  onlineId: ["xelnia-alt"]
                }
              }
            }
          ]
        }
      ]
    })
  });

  await assert.rejects(
    () => client.lookupByUsername("xelnia"),
    LookupNotFoundError
  );
});
