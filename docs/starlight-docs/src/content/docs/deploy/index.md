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

| Local (Docker Compose) | Kubernetes (Helm) | AWS Managed Service |
|------------------------|-------------------|---------------------|
| OpenSearch | OpenSearch (StatefulSet) | [Amazon OpenSearch Service](https://aws.amazon.com/opensearch-service/) |
| Prometheus | Prometheus (Deployment) | [Amazon Managed Service for Prometheus](https://aws.amazon.com/prometheus/) |
| OTel Collector → Data Prepper | OTel Collector → Data Prepper (Deployments) | [Amazon OpenSearch Ingestion (OSIS)](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/ingestion.html) |
| OpenSearch Dashboards | OpenSearch Dashboards (Deployment) | [OpenSearch UI](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/application.html) |

## Available deployment options

- [Kubernetes (Helm)](/docs/deploy/kubernetes/) — Deploy to any Kubernetes cluster using the umbrella Helm chart
- [AWS Managed Services](/docs/deploy/aws/) — Deploy using Amazon OpenSearch Service, Amazon Managed Prometheus, and OSIS
