#!/usr/bin/env bash
# Build POS + sync stack to IONOS VPS and start production Docker Compose.
#
# Prerequisites:
#   - SSH: ssh root@217.154.53.60 works from this machine
#   - DNS A record → 217.154.53.60 for POS_DOMAIN
#   - Shared MinIO reachable at S3_ENDPOINT (s3.storage.inventivelab.bd)
#   - deploy/.env filled (copy from deploy/.env.example)
#
# Usage:
#   ./scripts/deploy-to-vps.sh          # reads VPS_PASSWORD from deploy/.env
#   VPS_HOST=217.154.53.60 ./scripts/deploy-to-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VPS_HOST="${VPS_HOST:-217.154.53.60}"
VPS_USER="${VPS_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/krunch-pos}"
USE_PASSWORD_SSH=0

ENV_FILE="${ROOT}/deploy/.env"
ENV_EXAMPLE="${ROOT}/deploy/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing deploy/.env — copy deploy/.env.example and set passwords/secrets."
  echo "  cp deploy/.env.example deploy/.env"
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

# deploy/.env may override VPS_* (see deploy/.env.example)
VPS_HOST="${VPS_HOST:-217.154.53.60}"
VPS_USER="${VPS_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/krunch-pos}"

for var in POS_DOMAIN POSTGRES_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY; do
  if [[ -z "${!var:-}" ]] || [[ "${!var}" == change-me* ]]; then
    echo "Set ${var} in deploy/.env before deploying."
    exit 1
  fi
done

# Storage uses the shared MinIO on the VPS (no local MinIO container).
export S3_ACCESS_KEY S3_SECRET_KEY S3_ENDPOINT
export CORS_ORIGIN="${CORS_ORIGIN:-https://${POS_DOMAIN}}"

vps_ssh() {
  local cmd="$1"
  local quoted_cmd
  quoted_cmd="$(printf '%q' "$cmd")"
  if [[ "${USE_PASSWORD_SSH}" == "1" ]]; then
    export VPS_REMOTE_CMD="$quoted_cmd"
    expect -f - <<'EXPECT_EOF'
set timeout 3600
log_user 1
spawn ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -o PreferredAuthentications=password -o PubkeyAuthentication=no $env(VPS_USER)@$env(VPS_HOST) bash -lc $env(VPS_REMOTE_CMD)
expect {
  -re "(?i)password:" { send "$env(VPS_PASSWORD)\r"; exp_continue }
  eof
}
catch wait result
exit [lindex $result 3]
EXPECT_EOF
  else
    ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=30 "${VPS_USER}@${VPS_HOST}" "bash -lc ${quoted_cmd}"
  fi
}

vps_rsync() {
  if [[ "${USE_PASSWORD_SSH}" == "1" ]]; then
    local quoted
    quoted="$(printf ' %q' "$@")"
    expect -c "
      set timeout 3600
      log_user 1
      spawn rsync -az --delete -e \"ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -o PreferredAuthentications=password -o PubkeyAuthentication=no\"${quoted}
      expect {
        -re \"(?i)password:\" { send \"${VPS_PASSWORD}\r\"; exp_continue }
        eof
      }
      catch wait result
      exit [lindex \$result 3]
    "
  else
    rsync -az --delete -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=30" "$@"
  fi
}

echo "==> Checking SSH to ${VPS_USER}@${VPS_HOST}"
if ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${VPS_USER}@${VPS_HOST}" 'echo ok' >/dev/null 2>&1; then
  echo "    Using SSH key auth"
elif [[ -n "${VPS_PASSWORD:-}" ]]; then
  USE_PASSWORD_SSH=1
  export VPS_USER VPS_HOST VPS_PASSWORD
  echo "    Using password auth (VPS_PASSWORD)"
  if ! vps_ssh 'echo ok' >/dev/null 2>&1; then
    echo "SSH password auth failed."
    exit 1
  fi
else
  echo ""
  echo "SSH failed (no key on this machine for the VPS)."
  echo "Set VPS_PASSWORD in deploy/.env, or run:"
  echo "  VPS_PASSWORD='your-root-password' ./scripts/deploy-to-vps.sh"
  echo ""
  echo "Or install from IONOS web console:"
  echo "  curl -fsSL https://raw.githubusercontent.com/SaifIvnaAlam/krunch-pos/main/scripts/install-on-vps.sh | bash"
  echo ""
  echo "Or add your Mac SSH key to /root/.ssh/authorized_keys on the VPS."
  exit 1
fi

echo "==> Building POS for ${VITE_API_URL:-https://${POS_DOMAIN}/api/v1}"
export VITE_API_URL="${VITE_API_URL:-https://${POS_DOMAIN}/api/v1}"
export VITE_DEFAULT_BRANCH_ID="${VITE_DEFAULT_BRANCH_ID:-a0000000-0000-4000-8000-000000000001}"
export VITE_DEFAULT_TERMINAL_ID="${VITE_DEFAULT_TERMINAL_ID:-terminal-prod-001}"
export VITE_MEDIA_PUBLIC_BASE_URL="${VITE_MEDIA_PUBLIC_BASE_URL:-https://s3.storage.inventivelab.bd/media}"
npm run build -w terminal

rm -rf "${ROOT}/deploy/pos-static"
cp -R "${ROOT}/apps/terminal/dist" "${ROOT}/deploy/pos-static"

echo "==> Ensuring host Caddy imports Krunch site config (OneSign + n8n stay up)"
vps_ssh 'mkdir -p /etc/caddy/conf.d; grep -qF "import /etc/caddy/conf.d/*.caddy" /etc/caddy/Caddyfile || printf "\nimport /etc/caddy/conf.d/*.caddy\n" >> /etc/caddy/Caddyfile'

echo "==> Syncing to ${REMOTE_DIR}"
vps_ssh "mkdir -p ${REMOTE_DIR}"
vps_rsync \
  --exclude node_modules \
  --exclude .git \
  --exclude apps/terminal \
  "${ROOT}/" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

echo "==> Writing deploy/.env on server"
vps_rsync "${ENV_FILE}" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/deploy/.env"

echo "==> Starting stack (removing the old dedicated Caddy/MinIO containers if present)"
vps_ssh "cd ${REMOTE_DIR}/deploy && docker compose -f docker-compose.prod.yml --env-file .env up -d --build --remove-orphans"

echo "==> Publishing Krunch site through the shared host Caddy (graceful reload)"
vps_ssh "install -D -m 0644 ${REMOTE_DIR}/deploy/krunch.caddy /etc/caddy/conf.d/krunch.caddy && caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy"

echo "==> Syncing Postgres password with deploy/.env (volume may keep an older password)"
vps_ssh "cd ${REMOTE_DIR}/deploy && set -a && . ./.env && set +a && docker compose -f docker-compose.prod.yml exec -T postgres psql -U \${POSTGRES_USER} -d \${POSTGRES_DB} -c \"ALTER USER \${POSTGRES_USER} WITH PASSWORD '\${POSTGRES_PASSWORD}';\"" || true
vps_ssh "cd ${REMOTE_DIR}/deploy && docker compose -f docker-compose.prod.yml --env-file .env restart api" || true

echo "==> Waiting for API health"
for i in $(seq 1 40); do
  if vps_ssh "docker compose -f ${REMOTE_DIR}/deploy/docker-compose.prod.yml --env-file ${REMOTE_DIR}/deploy/.env exec -T api node -e \"fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.text()).then(t=>process.exit(t.includes('ok')?0:1)).catch(()=>process.exit(1))\"" 2>/dev/null; then
    break
  fi
  sleep 3
done

echo "==> Seeding database (idempotent — safe to re-run)"
vps_ssh "cd ${REMOTE_DIR} && set -a && . deploy/.env && set +a && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T api sh -c 'cd /app/packages/database-schema && npx prisma db seed'" || {
  echo "Seed failed or already applied — check logs if this is the first deploy."
}

echo ""
echo "=== Deployed ==="
echo "  POS:        https://${POS_DOMAIN}"
echo "  API:        https://${POS_DOMAIN}/api/v1/health"
echo "  S3:         ${S3_ENDPOINT} (shared MinIO, bucket ${S3_BUCKET:-krunch-pos})"
echo ""
echo "Sign in with your restaurant email at https://${POS_DOMAIN}"
echo "Optional n8n: ssh ${VPS_USER}@${VPS_HOST} 'cd ${REMOTE_DIR}/deploy && docker compose -f docker-compose.prod.yml --env-file .env --profile n8n up -d'"
