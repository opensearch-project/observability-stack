---
title: Deploy to Cloud
---

The Observability Stack runs locally via Docker Compose out of the box. When you're ready to move to the cloud, you have two paths:

| | Kubernetes | Managed Services |
|---|---|---|
| **What you run** | Same OSS components | Cloud-native equivalents |
| **Infrastructure** | You manage the cluster | Provider manages |
| **Portability** | Any K8s cluster | Provider-specific |
| **Scaling** | Manual / HPA | Built-in auto-scaling |

## Component mapping

| Local (Docker Compose) | AWS Managed Service |
|------------------------|---------------------|
| OpenSearch | [Amazon OpenSearch Service](https://aws.amazon.com/opensearch-service/) |
| Prometheus | [Amazon Managed Service for Prometheus](https://aws.amazon.com/prometheus/) |
| OTel Collector → Data Prepper | [Amazon OpenSearch Ingestion (OSIS)](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/ingestion.html) |
| OpenSearch Dashboards | [OpenSearch Service Dashboards](https://aws.amazon.com/opensearch-service/features/dashboards/) |

:::note
Kubernetes (Helm) deployment documentation is coming soon. The [Helm chart](https://github.com/opensearch-project/observability-stack/tree/main/helm) is available in the repository today.
:::

## Available deployment options

- [AWS Managed Services](/docs/deploy/aws/) — Deploy using Amazon OpenSearch Service, Amazon Managed Prometheus, and OSIS
