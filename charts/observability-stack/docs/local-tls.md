# Local Development with TLS

Test the full Gateway API + TLS flow locally on kind without a cloud provider.

## Prerequisites

- [kind](https://kind.sigs.k8s.io/) cluster running
- [Envoy Gateway](https://gateway.envoyproxy.io/) installed
- [mkcert](https://github.com/FiloSottile/mkcert) for locally-trusted certificates

## Setup

### 1. Install mkcert and create a local CA

```bash
brew install mkcert        # macOS
mkcert -install            # adds local CA to system trust store (needs sudo on macOS)
```

This creates a Certificate Authority on your machine. Any cert signed by it
will be trusted by your browser and curl — no warnings, green lock.

### 2. Generate a certificate

```bash
mkcert dashboards.local localhost 127.0.0.1
```

Creates `dashboards.local+2.pem` (cert) and `dashboards.local+2-key.pem` (key)
in the current directory, valid for all three names.

### 3. Add DNS entry

```bash
echo "127.0.0.1 dashboards.local" | sudo tee -a /etc/hosts
```

### 4. Install Envoy Gateway

```bash
helm install eg oci://docker.io/envoyproxy/gateway-helm \
  --version v1.3.2 \
  -n envoy-gateway-system --create-namespace

kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
EOF
```

### 5. Create TLS secret and install the stack

```bash
kubectl create namespace observability

kubectl -n observability create secret tls dashboards-tls \
  --cert=dashboards.local+2.pem \
  --key=dashboards.local+2-key.pem

helm install obs-stack charts/observability-stack \
  --namespace observability \
  --set gateway.enabled=true \
  --set gateway.host=dashboards.local \
  --set gateway.tls.secretName=dashboards-tls
```

### 6. Access Dashboards

Port-forward the Envoy proxy:

```bash
kubectl port-forward -n envoy-gateway-system \
  svc/$(kubectl get svc -n envoy-gateway-system -o name | grep obs-stack) \
  8443:443
```

Open https://dashboards.local:8443 — green lock, no warnings.

## How it works

```
Browser → https://dashboards.local:8443
       → port-forward to Envoy Gateway pod
       → Envoy terminates TLS (using mkcert cert from K8s secret)
       → HTTPRoute forwards to opensearch-dashboards:5601
       → OSD responds
```

mkcert certs are trusted because `mkcert -install` added a local CA to your
system trust store. This is development-only — never use mkcert certs in production.

## Production

For production, replace mkcert with:
- **cert-manager + Let's Encrypt** — automated, free, real certs
- **AWS ACM** — if using AWS Gateway API Controller
- **Any CA-signed cert** — load into a K8s TLS secret
