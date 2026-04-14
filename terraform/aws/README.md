# Observability Stack — AWS EKS Deployment

Deploy the full observability stack to EKS in one command. Start with plain HTTP, add TLS/DNS when ready.

## What You Get

- EKS cluster with managed node group
- OpenSearch + Dashboards + Data Prepper + OTel Collector + Prometheus
- Internet-facing ALB (HTTP by default, HTTPS when domain is configured)
- Auto-generated OpenSearch credentials

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) configured with credentials
- ~15 minutes for initial deployment

## Quick Start

```bash
cd terraform/aws
terraform init
terraform apply
```

That's it. No config file needed. When complete (~15 min):

```bash
# Configure kubectl
eval $(terraform output -raw kubeconfig_command)

# Get the ALB URL
kubectl get ingress -n observability-stack

# Get the password
terraform output -raw opensearch_password
```

Open the ALB DNS name in your browser. Login: `admin` / `<password from above>`.

## Add TLS + Custom Domain

When the HTTP smoke test passes, add your domain:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Uncomment and set:
```hcl
domain          = "obs.example.com"
route53_zone_id = "Z0123456789ABCDEFGHIJ"
```

```bash
terraform apply
```

This adds:
- ACM certificate (auto-validated via DNS)
- HTTPS listener with SSL redirect
- Route53 DNS record via external-dns

## Add WAF Rate Limiting

```hcl
enable_waf = true
```

Adds a WAFv2 WebACL: 2000 requests per 5 minutes per IP, 429 response when exceeded.

## Send Telemetry

```bash
kubectl port-forward -n observability-stack svc/obs-stack-opentelemetry-collector 4317:4317 4318:4318 &
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
```

## Add OpenTelemetry Demo

To deploy the [OTel Demo](https://opentelemetry.io/docs/demo/) microservices app alongside the stack:

```bash
cd terraform/aws
helm upgrade obs-stack ../../charts/observability-stack -n observability-stack -f values-eks.yaml \
  --set opentelemetry-demo.enabled=true --no-hooks
```

Adds 20+ services generating realistic e-commerce telemetry (~2GB additional memory). All demo telemetry flows through the stack's OTel Collector — no duplicate backends.

## Destroy

```bash
terraform destroy
```

## All Variables

| Variable | Default | Description |
|---|---|---|
| `region` | `us-west-2` | AWS region |
| `cluster_name` | `observability-stack` | EKS cluster name |
| `node_instance_type` | `m5.xlarge` | Worker node type (4 vCPU, 16GB) |
| `node_count` | `2` | Number of workers |
| `domain` | `""` (disabled) | Custom domain — enables HTTPS |
| `route53_zone_id` | `""` (disabled) | Route53 zone — required with domain |
| `enable_waf` | `false` | WAF rate limiting |
| `anonymous_auth` | `false` | Public read-only access |
| `enable_examples` | `false` | Example agent services |
