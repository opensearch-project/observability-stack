#!/usr/bin/env bash
# Upload k6 scripts to the load generator EC2 and optionally run a test.
#
# Usage:
#   ./run-remote.sh                          # upload scripts only
#   ./run-remote.sh 500                      # upload + run with 500 VUs
#   ./run-remote.sh 1000 api-queries-alb.js  # upload + run specific script
#
# Prerequisites:
#   - terraform apply in load-testing/terraform/
#   - EC2 key pair configured (or use SSM)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Get EC2 IP from terraform
cd "$SCRIPT_DIR/terraform"
IP=$(terraform output -raw public_ip 2>/dev/null)
KEY_NAME=$(terraform output -raw ssh_command 2>/dev/null | grep -oP '(?<=-i )\S+' || echo "")

if [[ -z "$IP" ]]; then
  echo "❌ No load generator running. Run: cd terraform && terraform apply"
  exit 1
fi

echo "📤 Uploading k6 scripts to $IP..."
SSH_OPTS="-o StrictHostKeyChecking=no"
[[ -n "$KEY_NAME" ]] && SSH_OPTS="$SSH_OPTS -i $KEY_NAME"

scp $SSH_OPTS -r "$SCRIPT_DIR/k6/" "ec2-user@${IP}:/home/ec2-user/k6/"
echo "✅ Scripts uploaded"

TARGET_VUS="${1:-}"
SCENARIO="${2:-api-queries-alb.js}"

if [[ -n "$TARGET_VUS" ]]; then
  TARGET_URL=$(terraform output -raw run_test 2>/dev/null | grep -oP '(?<=DASHBOARDS_URL=)\S+' || echo "")
  echo ""
  echo "🚀 Running k6 with $TARGET_VUS VUs ($SCENARIO)..."
  echo "   Target: $TARGET_URL"
  echo ""
  ssh $SSH_OPTS "ec2-user@${IP}" \
    "cd /home/ec2-user/k6 && source .env 2>/dev/null; k6 run --env TARGET_VUS=$TARGET_VUS scenarios/$SCENARIO"
fi
