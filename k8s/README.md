# Kubernetes Manifests

These manifests target a single-pod deployment behind Istio ingress.

They intentionally do **not** restrict source IP ranges, because this API is intended for OSS client applications. Instead, the controls are:

- Istio host/path/method allowlisting
- Istio request timeout and retries disabled
- Istio local ingress rate limiting
- App-side per-IP rate limiting
- App-side concurrency cap and PSN upstream timeout

## Files

- `deployment.yaml`: app deployment with secret-backed `PSN_NPSSO`
- `service.yaml`: ClusterIP service
- `virtualservice.yaml`: public route with short timeout and no retries
- `authorizationpolicy.yaml`: only allows `GET /health` and `GET /api/psn/account-id`
- `envoyfilter-local-rate-limit.yaml`: coarse local rate limiting on the ingress gateway
- `externalsecret.yaml`: example ESO sync for `PSN_NPSSO`

## Required edits

Before applying, update these placeholders:

- `api.example.com`
- `istio-system/public-gateway`
- `ghcr.io/your-org/psn-account-lookup-api:latest`
- `your-secret-store`
- `default` namespace references if you deploy elsewhere
- ingress gateway labels if your gateway does not use `app: istio-ingressgateway`
- the Envoy virtual host name in `envoyfilter-local-rate-limit.yaml`
  - commonly `api.example.com:80` for plain HTTP
  - commonly `api.example.com:443` for TLS

## Apply

```bash
kubectl apply -f k8s/externalsecret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/virtualservice.yaml
kubectl apply -f k8s/authorizationpolicy.yaml
kubectl apply -f k8s/envoyfilter-local-rate-limit.yaml
```
