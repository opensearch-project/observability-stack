# ============================================================================
# No required variables. Just `terraform apply` for a working stack.
# Add domain + route53_zone_id when ready for TLS/DNS.
# ============================================================================

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "observability-stack"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.32"
}

variable "node_instance_type" {
  description = "EC2 instance type for EKS nodes"
  type        = string
  default     = "m5.xlarge"
}

variable "node_count" {
  description = "Number of EKS worker nodes"
  type        = number
  default     = 3
}

# ============================================================================
# TLS / DNS — optional. Set both to enable HTTPS + custom domain.
# ============================================================================

variable "domain" {
  description = "Domain name for OpenSearch Dashboards (e.g. obs.example.com). Leave empty for plain HTTP on ALB."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID. Required when domain is set."
  type        = string
  default     = ""
}

# ============================================================================
# Security — off by default for initial smoke test
# ============================================================================

variable "enable_waf" {
  description = "Enable WAF rate limiting on the ALB (2000 req/5min/IP)"
  type        = bool
  default     = false
}

variable "anonymous_auth" {
  description = "Enable anonymous read-only access to OpenSearch Dashboards (for public demos)"
  type        = bool
  default     = false
}

variable "opensearch_password" {
  description = "OpenSearch admin password. Leave empty to use chart default."
  type        = string
  default     = ""
  sensitive   = true
}

variable "enable_examples" {
  description = "Deploy example agent services (weather-agent, travel-planner, canary)"
  type        = bool
  default     = false
}

variable "enable_otel_demo" {
  description = "Deploy OpenTelemetry Demo microservices (~2GB additional memory)"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default = {
    Project   = "observability-stack"
    ManagedBy = "terraform"
  }
}

# ============================================================================
# OpenSearch sizing
# ============================================================================

variable "opensearch_replicas" {
  description = "Number of OpenSearch nodes (StatefulSet replicas). 3 is the production minimum."
  type        = number
  default     = 3
}

variable "opensearch_storage_size" {
  description = "Per-node OpenSearch PVC size. Total cluster storage is opensearch_replicas times this value."
  type        = string
  default     = "100Gi"
}

variable "opensearch_storage_class" {
  description = "EBS storage class for OpenSearch PVCs."
  type        = string
  default     = "gp2"
}

variable "opensearch_node_memory" {
  description = "Per-node OpenSearch container memory. The chart sets requests equal to limits."
  type        = string
  default     = "4Gi"
}

variable "opensearch_jvm_heap" {
  description = "OpenSearch JVM heap, roughly 50% of opensearch_node_memory, max 31g. JVM size syntax, e.g. '2g' or '512m'."
  type        = string
  default     = "2g"
  validation {
    # JVM -Xms/-Xmx syntax (k/m/g), not Kubernetes 'Gi'.
    condition     = can(regex("^[0-9]+[kmg]$", var.opensearch_jvm_heap))
    error_message = "Use JVM size syntax like '2g' or '512m', not '2Gi'."
  }
}

# ============================================================================
# Cortex sizing
# ============================================================================

variable "cortex_storage_size" {
  description = "Cortex PVC size."
  type        = string
  default     = "50Gi"
}

variable "cortex_storage_class" {
  description = "EBS storage class for the Cortex PVC."
  type        = string
  default     = "gp2"
}

# ============================================================================
# Data Prepper sizing
# ============================================================================

variable "data_prepper_memory" {
  description = "Data Prepper container memory request and limit. Default matches the subchart."
  type        = string
  default     = "1Gi"
}

variable "data_prepper_jvm_heap" {
  description = "Data Prepper JVM heap, roughly 75% of data_prepper_memory. JVM size syntax, e.g. '512m'. Empty leaves the JVM default."
  type        = string
  default     = ""
  validation {
    condition     = var.data_prepper_jvm_heap == "" || can(regex("^[0-9]+[kmg]$", var.data_prepper_jvm_heap))
    error_message = "Use JVM size syntax like '2g' or '512m', not '2Gi'."
  }
}

variable "data_prepper_trace_flush_interval" {
  description = "Seconds the otel_traces processor buffers spans before computing traceGroup. Higher values raise Data Prepper heap; lower values can mark late-arriving spans as separate traces."
  type        = number
  default     = 180
}

# ============================================================================
# Derived
# ============================================================================

locals {
  enable_tls = var.domain != "" && var.route53_zone_id != ""
}
