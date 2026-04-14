# ============================================================================
# TLS — ACM certificate (only when domain is configured)
# ============================================================================

data "aws_route53_zone" "this" {
  count   = local.enable_tls ? 1 : 0
  zone_id = var.route53_zone_id
}

resource "aws_acm_certificate" "dashboards" {
  count = local.enable_tls ? 1 : 0

  domain_name       = var.domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.enable_tls ? {
    for dvo in aws_acm_certificate.dashboards[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60

  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "dashboards" {
  count = local.enable_tls ? 1 : 0

  certificate_arn         = aws_acm_certificate.dashboards[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ============================================================================
# WAF — Rate limiting (opt-in)
# ============================================================================

resource "aws_wafv2_web_acl" "rate_limit" {
  count = var.enable_waf ? 1 : 0

  name  = "${var.cluster_name}-rate-limit"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit"
    priority = 1

    action {
      block {
        custom_response {
          response_code            = 429
          custom_response_body_key = "rate-limited"
        }
      }
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.cluster_name}-rate-limit"
    }
  }

  custom_response_body {
    key          = "rate-limited"
    content      = "{\"error\": \"Rate limit exceeded. Try again in 5 minutes.\"}"
    content_type = "APPLICATION_JSON"
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.cluster_name}-waf"
  }
}

# ============================================================================
# Observability Stack — Helm release
# ============================================================================

resource "kubernetes_namespace" "observability" {
  metadata {
    name = "observability-stack"
  }

  depends_on = [module.eks]
}

resource "helm_release" "observability_stack" {
  name      = "obs-stack"
  chart     = "${path.module}/../../charts/observability-stack"
  namespace = kubernetes_namespace.observability.metadata[0].name

  timeout         = 900
  wait            = true
  wait_for_jobs   = true
  cleanup_on_fail = true

  values = concat(
    [file("${path.module}/values-eks.yaml")],
    var.anonymous_auth ? [file("${path.module}/../../charts/observability-stack/values-anonymous-auth.yaml")] : []
  )

  # --- TLS / Domain (conditional) ---
  dynamic "set" {
    for_each = local.enable_tls ? [1] : []
    content {
      name  = "opensearch-dashboards.ingress.hosts[0].host"
      value = var.domain
    }
  }
  dynamic "set" {
    for_each = local.enable_tls ? [1] : []
    content {
      name  = "opensearch-dashboards.ingress.annotations.alb\\.ingress\\.kubernetes\\.io/listen-ports"
      value = "[{\"HTTPS\":443}]"
    }
  }
  dynamic "set" {
    for_each = local.enable_tls ? [1] : []
    content {
      name  = "opensearch-dashboards.ingress.annotations.alb\\.ingress\\.kubernetes\\.io/certificate-arn"
      value = aws_acm_certificate.dashboards[0].arn
    }
  }
  dynamic "set" {
    for_each = local.enable_tls ? [1] : []
    content {
      name  = "opensearch-dashboards.ingress.annotations.alb\\.ingress\\.kubernetes\\.io/ssl-redirect"
      value = "443"
      type  = "string"
    }
  }
  dynamic "set" {
    for_each = local.enable_tls ? [1] : []
    content {
      name  = "opensearch-dashboards.ingress.annotations.external-dns\\.alpha\\.kubernetes\\.io/hostname"
      value = var.domain
    }
  }

  # --- WAF (conditional) ---
  dynamic "set" {
    for_each = var.enable_waf ? [1] : []
    content {
      name  = "opensearch-dashboards.ingress.annotations.alb\\.ingress\\.kubernetes\\.io/wafv2-acl-arn"
      value = aws_wafv2_web_acl.rate_limit[0].arn
    }
  }

  # --- Examples (conditional) ---
  set {
    name  = "examples.enabled"
    value = var.enable_examples ? "true" : "false"
  }

  # --- OTel Demo (conditional) ---
  set {
    name  = "opentelemetry-demo.enabled"
    value = var.enable_otel_demo ? "true" : "false"
  }

  # --- Custom password (conditional) ---
  dynamic "set_sensitive" {
    for_each = var.opensearch_password != "" ? [1] : []
    content {
      name  = "opensearchPassword"
      value = var.opensearch_password
    }
  }

  depends_on = [
    helm_release.aws_lb_controller,
  ]
}
