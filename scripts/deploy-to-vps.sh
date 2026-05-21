#!/usr/bin/env bash
# Build POS + sync stack to IONOS VPS and start production Docker Compose.
#
# Prerequisites:
#   - SSH: ssh root@217.154.53.60 works from this machine
#   - DNS A records → 217.154.53.60 for POS_DOMAIN, S3_DOMAIN, S3_CONSOLE_DOMAIN
#   - deploy/.env filled (copy from deploy/.env.example)
#
# Usage:
#   ./scripts/deploy-to-vps.sh
#   VPS_HOST=217.154.53.60 VPS_USER=root ./scripts/deploy-to-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VPS_HOST="${VPS_HOST:-217.154.53.60}"
VPS_USER="${VPS_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/krunch-pos}"
SSH=(ssh -o BatchMode=yes "${VPS_USER}@${VPS_HOST}")
RSYNC=(rsync -az --delete)

ENV_FILE="${ROOT}/deploy/.env"
ENV_EXAMPLE="${ROOT}/deploy/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing deploy/.env — copy deploy/.env.example and set passwords/secrets."
  echo "  cp deploy/.env.example deploy/.env"
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

for var in POS_DOMAIN S3_DOMAIN POSTGRES_PASSWORD MINIO_ROOT_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  if [[ -z "${!var:-}" ]] || [[ "${!var}" == change-me* ]]; then
    echo "Set ${var} in deploy/.env before deploying."
    exit 1
  fi
done

# MinIO API keys default to root user when omitted
if [[ -z "${S3_ACCESS_KEY:-}" ]]; then
  S3_ACCESS_KEY="${MINIO_ROOT_USER}"
fi
if [[ -z "${S3_SECRET_KEY:-}" ]]; then
  S3_SECRET_KEY="${MINIO_ROOT_PASSWORD}"
fi
export S3_ACCESS_KEY S3_SECRET_KEY
export S3_ENDPOINT="${S3_ENDPOINT:-https://${S3_DOMAIN}}"
export CORS_ORIGIN="${CORS_ORIGIN:-https://${POS_DOMAIN}}"

echo "==> Checking SSH to ${VPS_USER}@${VPS_HOST}"
if ! "${SSH[@]}" 'echo ok' >/dev/null 2>&1; then
  echo ""
  echo "SSH failed (no key on this machine for the VPS)."
  echo "Option A — IONOS web console as root, run:"
  echo "  curl -fsSL https://raw.githubusercontent.com/SaifIvnaAlam/krunch-pos/main/scripts/install-on-vps.sh | bash"
  echo ""
  echo "Option B — Add your Mac SSH key to the server, then re-run this script:"
  echo "  cat ~/.ssh/id_ed25519.pub   # paste into /root/.ssh/authorized_keys on the VPS"
  exit 1
fi

echo "==> Building POS for https://${POS_DOMAIN}"
export VITE_API_URL="https://${POS_DOMAIN}/api/v1"
export VITE_SEEDED_ADMIN_EMAIL="${VITE_SEEDED_ADMIN_EMAIL:-owner@universalpos.local}"
export VITE_DEFAULT_BRANCH_ID="${VITE_DEFAULT_BRANCH_ID:-a0000000-0000-4000-8000-000000000001}"
export VITE_DEFAULT_TERMINAL_ID="${VITE_DEFAULT_TERMINAL_ID:-terminal-prod-001}"
npm run build -w terminal

rm -rf "${ROOT}/deploy/pos-static"
cp -R "${ROOT}/apps/terminal/dist" "${ROOT}/deploy/pos-static"

echo "==> Stopping legacy /root compose (frees port 80 for Caddy)"
"${SSH[@]}" 'if [ -f /root/docker-compose.yaml ]; then cd /root && docker compose down 2>/dev/null || true; fi'

echo "==> Syncing to ${REMOTE_DIR}"
"${SSH[@]}" "mkdir -p ${REMOTE_DIR}"
"${RSYNC[@]}" \
  --exclude node_modules \
  --exclude .git \
  --exclude apps/terminal \
  --exclude apps/admin \
  "${ROOT}/" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

echo "==> Writing deploy/.env on server"
"${RSYNC[@]}" "${ENV_FILE}" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/deploy/.env"

echo "==> Starting stack"
"${SSH[@]}" "cd ${REMOTE_DIR}/deploy && docker compose -f docker-compose.prod.yml --env-file .env up -d --build"

echo "==> Waiting for API health"
for i in $(seq 1 40); do
  if "${SSH[@]}" "docker compose -f ${REMOTE_DIR}/deploy/docker-compose.prod.yml --env-file ${REMOTE_DIR}/deploy/.env exec -T api node -e \"fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.text()).then(t=>process.exit(t.includes('ok')?0:1)).catch(()=>process.exit(1))\"" 2>/dev/null; then
    break
  fi
  sleep 3
done

echo "==> Seeding database (idempotent — safe to re-run)"
"${SSH[@]}" "cd ${REMOTE_DIR} && set -a && . deploy/.env && set +a && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T api sh -c 'cd /app/packages/database-schema && npx prisma db seed'" || {
  echo "Seed failed or already applied — check logs if this is the first deploy."
}

echo ""
echo "=== Deployed ==="
echo "  POS:        https://${POS_DOMAIN}"
echo "  API:        https://${POS_DOMAIN}/api/v1/health"
echo "  S3:         https://${S3_DOMAIN}"
echo "  S3 console: https://${S3_CONSOLE_DOMAIN}"
echo ""
echo "Sign in: owner@universalpos.local / Owner123! (from seed)"
echo "Optional n8n: ssh ${VPS_USER}@${VPS_HOST} 'cd ${REMOTE_DIR}/deploy && docker compose -f docker-compose.prod.yml --env-file .env --profile n8n up -d'"
