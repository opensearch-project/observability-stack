# AGENTS.md — Load Testing Procedures

This document captures the exact procedures for reproducing load tests against the Observability Stack Helm deployment. Designed for AI coding assistants to execute without prior context.

## Repository Context

- Load testing files live in `load-testing/` at the repository root
- Helm chart is at `charts/observability-stack/`
- Terraform for EKS cluster is at `terraform/aws/`
- Terraform for EC2 load generator is at `load-testing/terraform/`
- Results are tracked in `load-testing/RESULTS.md`, sizing in `load-testing/SIZING.md`

## Prerequisites

Before running load tests, you need:

1. **An EKS cluster** with the Helm chart deployed (see `terraform/aws/` for provisioning)
2. **An EC2 load generator** in the same VPC as the cluster (see `load-testing/terraform/`)
3. **AWS CLI** configured with appropriate permissions (SSM, EKS, EC2)
4. **kubectl** configured to access the EKS cluster

### Environment Variables

Set these before running any commands:

```bash
export INSTANCE_ID="<ec2-instance-id>"        # EC2 load generator instance
export CLUSTER_NAME="<eks-cluster-name>"       # EKS cluster name
export NAMESPACE="<helm-namespace>"            # Namespace where chart is installed
export RELEASE_NAME="<helm-release-name>"      # Helm release name
export DASHBOARDS_URL="<dashboards-endpoint>"  # ALB or ingress URL for OSD
export AWS_REGION="<aws-region>"               # AWS region
export OSD_USER="admin"                        # OpenSearch Dashboards username
export OSD_PASSWORD="<password>"               # OpenSearch Dashboards password
```

## Procedures

### 1. Provision the EC2 Load Generator

```bash
cd load-testing/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your VPC, subnet, and target URL
terraform init && terraform apply
```

The instance comes with k6 pre-installed. Access is via SSM only (no SSH key required).

### 2. Upload k6 Scripts to EC2

```bash
SCRIPT=$(cat load-testing/k6/scenarios/api-queries-alb.js | base64)
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[\"echo '$SCRIPT' | base64 -d > /home/ec2-user/k6/scenarios/api-queries-alb.js\"]" \
  --region "$AWS_REGION" --output text --query 'Command.CommandId'
```

### 3. Run a Load Test

```bash
VUS=1000        # Peak virtual users
TEST_NUM=001    # Test number for result tracking

CMD_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[\"cd /home/ec2-user/k6 && k6 run --env TARGET_VUS=$VUS --env DASHBOARDS_URL=$DASHBOARDS_URL --env OSD_USER=$OSD_USER --env OSD_PASSWORD='$OSD_PASSWORD' scenarios/api-queries-alb.js 2>&1 | tee results/test-${TEST_NUM}.log\"]" \
  --timeout-seconds 1200 \
  --region "$AWS_REGION" \
  --output text --query 'Command.CommandId')
echo "Command: $CMD_ID"
```

### 4. Monitor During Test

```bash
# Check test status
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION" --query 'Status' --output text

# Monitor OpenSearch nodes
kubectl exec -n "$NAMESPACE" opensearch-cluster-master-0 -- curl -sk -u "$OSD_USER:$OSD_PASSWORD" \
  'https://localhost:9200/_cat/nodes?h=name,heap.percent,cpu,load_1m,search.query_total,search.query_current'

# Thread pool pressure
kubectl exec -n "$NAMESPACE" opensearch-cluster-master-0 -- curl -sk -u "$OSD_USER:$OSD_PASSWORD" \
  'https://localhost:9200/_cat/thread_pool/search?v&h=name,node_name,active,queue,rejected'

# Hot threads (what's consuming CPU)
kubectl exec -n "$NAMESPACE" opensearch-cluster-master-0 -- curl -sk -u "$OSD_USER:$OSD_PASSWORD" \
  'https://localhost:9200/_nodes/hot_threads?threads=3'

# JVM and OS stats
kubectl exec -n "$NAMESPACE" opensearch-cluster-master-0 -- curl -sk -u "$OSD_USER:$OSD_PASSWORD" \
  'https://localhost:9200/_nodes/stats/jvm,os?pretty'
```

### 5. Retrieve Results

SSM truncates long output. Always read from the log file:

```bash
RESULT_CMD=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[\"tail -35 /home/ec2-user/k6/results/test-${TEST_NUM}.log\"]" \
  --region "$AWS_REGION" --output text --query 'Command.CommandId')
sleep 5
aws ssm get-command-invocation --command-id "$RESULT_CMD" --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION" --query 'StandardOutputContent' --output text
```

### 6. Record Results

Create `load-testing/results/NNN-description.md` with:
- Start/end timestamps (UTC)
- Configuration at time of test (replicas, resources, node count)
- k6 summary (p50, p90, p95, max, error rate, req/s)
- Cluster observations during test (CPU, heap, thread pool, queue depths)
- Root cause analysis of any bottlenecks
- Next steps

Update `load-testing/RESULTS.md` index table and bottleneck progression.
Update `load-testing/SIZING.md` if capacity estimates change.

### 7. Apply Configuration Changes

```bash
# Deploy with updated values
helm upgrade "$RELEASE_NAME" charts/observability-stack \
  -n "$NAMESPACE" --reuse-values

# Or override specific values
helm upgrade "$RELEASE_NAME" charts/observability-stack \
  -n "$NAMESPACE" --reuse-values \
  --set opensearch.replicas=3
```

### 8. Scale EKS Nodes

```bash
NODEGROUP=$(aws eks list-nodegroups --cluster-name "$CLUSTER_NAME" \
  --region "$AWS_REGION" --query 'nodegroups[0]' --output text)
aws eks update-nodegroup-config \
  --cluster-name "$CLUSTER_NAME" \
  --nodegroup-name "$NODEGROUP" \
  --scaling-config minSize=2,maxSize=5,desiredSize=4 \
  --region "$AWS_REGION"
```

### 9. Manage EC2 Load Generator

```bash
# Create (from load-testing/terraform/)
cd load-testing/terraform && terraform init && terraform apply

# Destroy when done
terraform destroy

# SSM session (interactive shell)
aws ssm start-session --target "$INSTANCE_ID" --region "$AWS_REGION"
```

## k6 Script Details

See [README.md](README.md) for the full test plan, scenario descriptions, and methodology.

### api-queries-alb.js — Quick Reference

The primary load test script. Hits OpenSearch Dashboards through the ALB/ingress with a mix of PPL queries (50%), DSL search (20%), saved objects (15%), and service map queries (15%).

Key env vars:
- `TARGET_VUS` — peak virtual users (default 200)
- `DASHBOARDS_URL` — ALB/ingress endpoint
- `OSD_USER` / `OSD_PASSWORD` — credentials

Ramp stages: 0→25%→50%→100% (hold 3min) →0 over 15 minutes.

### Known Script Issues
- Console proxy path (`/api/console/proxy?path=...&method=POST`) returns 400 for some queries — needs investigation
- Prometheus queries not yet routed through OSD (datasource proxy path TBD)
- `insecureSkipTLSVerify: true` required in options block (not per-request)
- Auth uses manual `Authorization: Basic <base64>` header via `k6/encoding` module

## Key Learnings

### Bottleneck Discovery Order

These were discovered progressively during load testing and are documented in `load-testing/results/`:

1. **OSD (100m CPU)** — Node.js single-threaded, saturates immediately. Fix: 3 replicas, 2 CPU each.
2. **OpenSearch (single node, 4 vCPU)** — 99% CPU, search queue depth 34. Fix: 3 data nodes.
3. **Uneven shard distribution** — default indices have 1 primary shard, load concentrates on 2 of 3 nodes. Fix: increase replica count or reindex with more shards.
4. **Data volume** (not yet tested) — 7-day data projected to reduce capacity ~40%.

### Important Gotchas
- `kubectl port-forward` is NOT a valid load test path — it bottlenecks at the tunnel, not the cluster. Always use an EC2 instance in the same VPC hitting the ALB/ingress.
- OSD workspace IDs differ between internal cluster access and external port-forward. The init script uses the internal workspace ID.
- The opensearch-dashboards Helm subchart uses `replicaCount` not `replicas` for scaling.
- OpenSearch `singleNode: true` must be set to `false` when scaling to multiple nodes.
- SSM command output is truncated for long-running tests. Always `tee` to a log file and read from there.

## File Structure

See [README.md](README.md) for the full directory layout.

## Next Steps (Pending)

1. **Fix shard distribution** — increase replica count on span/log indices so all nodes serve searches equally
2. **Run 300 VU test** — validate the "good experience" threshold estimate
3. **7-day data test** — let OTel Demo run for a week, then re-run 1000 VU test
4. **Dedicated search nodes** — set up remote store (S3) + search node role for production config
5. **Prometheus load** — route PromQL through OSD to test single-pod Prometheus under concurrent dashboard users
6. **WAF testing** — enable WAF on ALB, measure throughput impact
7. **Browser tests** — run k6 browser module for real Chromium sessions
