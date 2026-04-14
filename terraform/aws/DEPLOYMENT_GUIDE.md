# Observability Stack — EKS Production Deployment Guide

Step-by-step checklist for deploying the Observability Stack to AWS EKS with TLS, WAF, DNS, and anonymous auth.

## Prerequisites

- AWS CLI configured with admin-level access
- Terraform >= 1.5
- kubectl
- A Route53 hosted zone for your domain
- Repository cloned: `git clone https://github.com/opensearch-project/observability-stack.git`

## 1. Bootstrap State Backend

Create an S3 bucket and DynamoDB table for Terraform state storage. This only needs to be done once per AWS account.

```bash
cd terraform/aws/bootstrap
terraform init
terraform apply \
  -var="bucket_name=observability-stack-tfstate-<ACCOUNT_ID>" \
  -var="region=<REGION>"
```

This creates:
- S3 bucket — KMS encrypted, versioned, public access blocked
- DynamoDB table `observability-stack-tf-lock` — for state locking

## 2. Configure S3 Backend

Edit `terraform/aws/main.tf` — uncomment the `backend "s3"` block and fill in your values:

```hcl
terraform {
  backend "s3" {
    bucket         = "observability-stack-tfstate-<ACCOUNT_ID>"
    key            = "<DEPLOY_REGION>/observability-stack/terraform.tfstate"
    region         = "<BOOTSTRAP_REGION>"
    dynamodb_table = "observability-stack-tf-lock"
    encrypt        = true
  }
}
```

> **Multi-region:** The S3 bucket is shared across regions. The `key` path includes the region so each deployment gets its own state file. The `region` field is where the bucket lives (bootstrap region), not the deployment region.

## 3. Configure Deployment Variables

```bash
cd terraform/aws
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
region           = "us-east-1"
cluster_name     = "obs-stack-use1"          # Keep short — used in IAM role names
domain           = "<subdomain>.<zone>"       # Must be ≤ 64 chars (ACM limit)
route53_zone_id  = "<ZONE_ID>"
anonymous_auth   = true                       # Read-only access without login
enable_waf       = true                       # Rate limiting: 2000 req/5min/IP
enable_examples  = true                       # Example agent services
enable_otel_demo = true                       # OTel Demo microservices (~2GB extra)
node_count       = 3
```

**Domain length limit:** ACM certificates require the domain name to be ≤ 64 characters. Use short subdomain prefixes (e.g., `a.`, `obs.`) if your zone name is long.

**Cluster name:** Used as a prefix for IAM roles (global). Use a region-specific suffix (e.g., `obs-stack-use1`, `obs-stack-usw2`) to avoid conflicts when deploying to multiple regions.

## 4. Deploy

```bash
cd terraform/aws
terraform init
terraform plan -out=tfplan    # Review before applying
terraform apply "tfplan"
```

**Estimated time:** 15–20 minutes. EKS cluster creation is the bottleneck.

**What gets created:**

| Resource | Details |
|----------|---------|
| VPC | 3 AZs, public/private subnets, NAT gateway |
| EKS cluster | Managed node group, EBS CSI driver |
| AWS LB Controller | Manages ALB lifecycle |
| external-dns | Creates Route53 records from ingress annotations |
| ACM certificate | DNS-validated via Route53 |
| WAF | Rate limiting with 429 response |
| Helm release | Full observability stack with all overlays |
| DNS record | Custom domain → ALB |

## 5. Configure kubectl

```bash
aws eks update-kubeconfig --name <CLUSTER_NAME> --region <REGION>
kubectl get pods -n observability-stack
```

All pods should be Running, init job should be Completed. With OTel Demo + examples enabled, expect ~42 pods.

## 6. Verify

> **Note:** DNS propagation takes 1–2 minutes after deploy. If curl returns `HTTP: 000`, wait and retry. See [Troubleshooting](#troubleshooting) for DNS cache issues.

### TLS

```bash
curl -s -o /dev/null -w "HTTP: %{http_code}, SSL: %{ssl_verify_result}\n" \
  https://<DOMAIN>/api/status
```

Expected: `HTTP: 401, SSL: 0` (401 = auth required without cookies, SSL 0 = valid cert)

### Anonymous Access

Open in browser — should load without login:

```
https://<DOMAIN>
```

Or via curl with cookie jar (anonymous auth uses a cookie-based flow):

```bash
curl -s -L -c /tmp/cookies -b /tmp/cookies -o /dev/null -w "HTTP: %{http_code}\n" \
  https://<DOMAIN>/app/home
```

Expected: `HTTP: 200`

### Admin Access

Default credentials are `admin` / `My_password_123!@#`. If you set a custom password via `opensearchPassword`, use that instead.

```bash
curl -s -u admin:'My_password_123!@#' -o /dev/null -w "HTTP: %{http_code}\n" \
  https://<DOMAIN>/api/status
```

Expected: `HTTP: 200`

### Anonymous Write Blocked

```bash
curl -s -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" -H "osd-xsrf: true" \
  https://<DOMAIN>/api/saved_objects/dashboard/test \
  -d '{"attributes":{"title":"test"}}'
```

Expected: `HTTP 403: Forbidden`

### WAF

```bash
kubectl get ingress -n observability-stack \
  -o jsonpath='{.items[0].metadata.annotations.alb\.ingress\.kubernetes\.io/wafv2-acl-arn}'
```

Expected: WAF ACL ARN present.

## 7. Operational Commands

```bash
# View component logs
kubectl logs -n observability-stack deploy/obs-stack-opensearch-dashboards --tail=50
kubectl logs -n observability-stack deploy/obs-stack-data-prepper --tail=50
kubectl logs -n observability-stack deploy/obs-stack-opentelemetry-collector --tail=50

# OpenSearch cluster health
kubectl exec -n observability-stack opensearch-cluster-master-0 -- \
  curl -sk -u admin:'My_password_123!@#' 'https://localhost:9200/_cluster/health?pretty'

# Send telemetry via port-forward
kubectl port-forward -n observability-stack \
  svc/obs-stack-opentelemetry-collector 4317:4317 4318:4318
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

## Troubleshooting

### DNS not resolving after deploy

external-dns creates the Route53 record ~1 minute after the ALB is provisioned. If curl returns `HTTP: 000`:

1. Check external-dns logs: `kubectl logs -n kube-system deploy/external-dns --tail=20`
2. Verify the record exists: `dig +short <DOMAIN>`
3. Flush local DNS cache: `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder` (macOS)

### ACM certificate not validating

The certificate uses DNS validation via Route53. Check status:

```bash
aws acm list-certificates --region <REGION> \
  --query 'CertificateSummaryList[?DomainName==`<DOMAIN>`].[Status]' --output text
```

If `PENDING_VALIDATION`, check that the CNAME validation record exists in Route53.

### Pods stuck in Pending

Usually means nodes don't have enough resources. Check:

```bash
kubectl describe pod <POD_NAME> -n observability-stack | grep -A5 Events
kubectl get nodes -o custom-columns=NAME:.metadata.name,CPU:.status.allocatable.cpu,MEM:.status.allocatable.memory
```

## Cost Estimate

| Resource | Hourly | Daily |
|----------|--------|-------|
| EKS control plane | $0.10 | $2.40 |
| 3x m5.xlarge (on-demand) | $0.576 | $13.82 |
| NAT gateway | $0.045 | $1.08 |
| ALB | $0.0225 | $0.54 |
| EBS volumes | — | ~$3.60 |
| **Total** | **~$0.75** | **~$21** |

Costs vary by region. Use the [AWS Pricing Calculator](https://calculator.aws/) for accurate estimates.

## Teardown

```bash
cd terraform/aws
terraform destroy
```

To also remove the state backend (only after all deployments are destroyed):

```bash
cd terraform/aws/bootstrap
# Remove prevent_destroy from main.tf first, then:
terraform destroy \
  -var="bucket_name=observability-stack-tfstate-<ACCOUNT_ID>" \
  -var="region=<REGION>"
```
