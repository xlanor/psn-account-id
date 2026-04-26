# PSN Account Lookup API

Small HTTP API that wraps [`psn-api`](https://github.com/achievements-app/psn-api) and resolves a PSN username to:

- `accountId`: Sony's numeric account identifier
- `npId`: the base64-encoded legacy identifier returned by the profile endpoint

## Requirements

- Node.js 20+
- A valid PSN auth secret:
  - `PSN_NPSSO`, or
  - `PSN_REFRESH_TOKEN`

Using `PSN_NPSSO` is enough for normal use. The server will exchange it for access and refresh tokens internally and refresh them as needed.

## Install

```bash
npm install
```

## Run

```bash
cp .env.example .env
npm run dev
```

Or build and run:

```bash
npm run build
npm start
```

## Docker

Build:

```bash
docker build -t psn-account-lookup-api .
```

Run:

```bash
docker run --rm -p 3000:3000 \
  -e PSN_NPSSO=your-npsso-token \
  -e RATE_LIMIT_MAX_REQUESTS=30 \
  -e RATE_LIMIT_WINDOW_SECONDS=60 \
  -e MAX_CONCURRENT_LOOKUPS=25 \
  psn-account-lookup-api
```

If you already have a refresh token, you can use `PSN_REFRESH_TOKEN` instead of `PSN_NPSSO`.

## Image Publishing

GitHub Actions publishes a GHCR image on git tag pushes using [.github/workflows/publish-ghcr.yml](/Users/jingkai/Documents/projects/psn-api/.github/workflows/publish-ghcr.yml).

The published image name is:

```text
ghcr.io/<github-owner>/<github-repo>
```

For Kubernetes, use a pinned release tag such as `v1.2.3`, not `latest`.

## Kubernetes

Starter Kubernetes and Istio manifests are in [k8s/README.md](/Users/jingkai/Documents/projects/psn-api/k8s/README.md). They assume:

- a single pod
- Istio ingress
- no source IP allowlisting
- ESO-backed `PSN_NPSSO`

The Istio layer is scoped to host, method, and path, with short request timeouts and local ingress rate limiting.

## Endpoint

`GET /api/psn/account-id?username=<onlineId>`

Required request header:

```text
X-Client-Information: akira-<version>
```

or

```text
X-Client-Information: chiaki-ng-<version>
```

Example:

```bash
curl \
  -H "X-Client-Information: chiaki-ng-1.0.0" \
  "https://api.example.com/api/psn/account-id?username=xelnia"
```

Example response when the legacy profile lookup succeeds:

```json
{
  "onlineId": "xelnia",
  "accountId": "962157895908076652",
  "npId": "eGVsbmlhQGM2LnVz",
  "base64AccountId": "bCxwM4JFWg0=",
  "hexAccountId": "6c2c703382455a0d",
  "resolvedBy": "profile",
  "cached": false
}
```

`base64AccountId` is the Chiaki-compatible base64 encoding of the numeric `accountId`. `hexAccountId` is the same identifier in hex form for Save Wizard style usage. `npId` is returned separately when the legacy profile endpoint is available.

If the legacy profile endpoint is unavailable for that user, the service falls back to PSN universal search. In that case `accountId`, `base64AccountId`, and `hexAccountId` are still returned, but `npId` will be `null`.

## Metrics

The service also exposes Prometheus-format metrics at:

```text
GET /metrics
```

This is intended for cluster-internal scraping, not public ingress exposure.

Useful metrics include:

- `psn_api_http_requests_total`
- `psn_api_http_request_duration_seconds`
- `psn_api_lookup_requests_total`
- `psn_api_rate_limited_requests_total`
- `psn_api_concurrency_rejected_requests_total`

Client traffic is labeled by `client_name`, which is derived from `X-Client-Information` and currently resolves to `akira`, `chiaki-ng`, or `unknown`.

## Cache

- In-memory TTL cache keyed by normalized username
- TTL is controlled with `PSN_LOOKUP_CACHE_TTL_SECONDS`
- Responses include `X-Cache: HIT` or `X-Cache: MISS`

## Rate Limiting

- In-memory fixed-window rate limiting by client IP
- `RATE_LIMIT_WINDOW_SECONDS` controls the window size
- `RATE_LIMIT_MAX_REQUESTS` controls requests allowed per IP in that window
- Returns HTTP `429` when the limit is exceeded
- Set `TRUST_PROXY=true` when running behind a reverse proxy so Express uses forwarded client IPs

## Hardening

- Minimal security headers on every response
- Required `X-Client-Information` header for public lookup requests
- Upstream PSN lookup timeout controlled by `PSN_LOOKUP_TIMEOUT_MS`
- Global in-process concurrency cap controlled by `MAX_CONCURRENT_LOOKUPS`
- Browser access is not opened with CORS headers by default
