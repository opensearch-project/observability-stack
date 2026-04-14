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
# Derived
# ============================================================================

locals {
  enable_tls = var.domain != "" && var.route53_zone_id != ""
}
