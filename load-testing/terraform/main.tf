# Load Generator EC2 — same VPC as EKS, hits ALB end-to-end.
#
# Usage:
#   terraform init && terraform apply
#   # Then from your laptop:
#   ../run-remote.sh 1000

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  default = "us-west-2"
}

variable "vpc_id" {
  type = string
}

variable "subnet_id" {
  description = "Public subnet in the same VPC"
  type        = string
}

variable "target_url" {
  description = "ALB URL for OpenSearch Dashboards"
  type        = string
}

variable "opensearch_user" {
  default = "admin"
}

variable "opensearch_password" {
  default = "My_password_123!@#"
}

variable "instance_type" {
  default = "m5.xlarge"
}

# --- IAM role for SSM access (no SSH key needed) ---
resource "aws_iam_role" "load_generator" {
  name_prefix = "load-test-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.load_generator.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "load_generator" {
  name_prefix = "load-test-"
  role        = aws_iam_role.load_generator.name
}

# --- Security Group ---
resource "aws_security_group" "load_generator" {
  name_prefix = "load-test-"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "load-test-generator" }
}

# --- Latest AL2023 AMI ---
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "state"
    values = ["available"]
  }
}

# --- EC2 Instance ---
resource "aws_instance" "load_generator" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [aws_security_group.load_generator.id]
  iam_instance_profile        = aws_iam_instance_profile.load_generator.name
  associate_public_ip_address = true

  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail

    # Install k6
    curl -sL https://github.com/grafana/k6/releases/download/v1.0.0/k6-v1.0.0-linux-amd64.tar.gz | tar xz -C /usr/local/bin --strip-components=1 k6-v1.0.0-linux-amd64/k6

    # Write env config
    mkdir -p /home/ec2-user/k6/scenarios /home/ec2-user/k6/results
    cat > /home/ec2-user/k6/.env <<'ENVEOF'
    export DASHBOARDS_URL="${var.target_url}"
    export OSD_USER="${var.opensearch_user}"
    export OSD_PASSWORD='${var.opensearch_password}'
    ENVEOF

    chown -R ec2-user:ec2-user /home/ec2-user/k6
    echo "✅ Load generator ready" > /home/ec2-user/k6/STATUS
  EOF

  root_block_device {
    volume_size = 30
  }

  tags = {
    Name      = "load-test-generator"
    Project   = "observability-stack"
    ManagedBy = "terraform"
  }
}

output "instance_id" {
  value = aws_instance.load_generator.id
}

output "ssm_command" {
  value = "aws ssm start-session --target ${aws_instance.load_generator.id} --region ${var.region}"
}

output "upload_command" {
  value = "aws ssm start-session --target ${aws_instance.load_generator.id} --region ${var.region} --document-name AWS-StartInteractiveCommand --parameters command='cat > /home/ec2-user/k6/scenarios/api-queries-alb.js'"
}
