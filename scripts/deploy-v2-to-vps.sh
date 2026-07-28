#!/usr/bin/env bash
# Deploy the SHADOW relational app to /opt/krunch-pos-v2.
# HARD GUARDS: never writes to /opt/krunch-pos, never touches docker-compose.prod.yml
# or /etc/caddy/conf.d/krunch.caddy (production).
#
# Usage:
#   ./scripts/deploy-v2-to-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ROOT}/deploy/.env.v2"
COMPOSE_FILE="docker-compose.v2.yml"
CADDY_FILE="krunch-v2.caddy"
REQUIRED_REMOTE="/opt/krunch-pos-v2"
FORBIDDEN_REMOTE="/opt/krunch-pos"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing deploy/.env.v2 — create it from deploy/.env with v2 domain/secrets."
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

VPS_HOST="${VPS_HOST:?}"
VPS_USER="${VPS_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:?}"
POS_DOMAIN="${POS_DOMAIN:?}"

if [[ "$REMOTE_DIR" != "$REQUIRED_REMOTE" ]]; then
  echo "REFUSING: REMOTE_DIR must be ${REQUIRED_REMOTE} (got ${REMOTE_DIR})."
  exit 1
fi
if [[ "$REMOTE_DIR" == "$FORBIDDEN_REMOTE" ]]; then
  echo "REFUSING: would overwrite production path ${FORBIDDEN_REMOTE}."
  exit 1
fi
if [[ "$POS_DOMAIN" == "steakandmarrow.inventivelab.bd" ]]; then
  echo "REFUSING: POS_DOMAIN is production."
  exit 1
fi
if [[ "$POS_DOMAIN" != "v2-steakandmarrow.inventivelab.bd" ]]; then
  echo "REFUSING: unexpected POS_DOMAIN=${POS_DOMAIN}"
  exit 1
fi

USE_PASSWORD_SSH=0
export VPS_USER VPS_HOST VPS_PASSWORD

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
  echo "    Using password auth"
  vps_ssh 'echo ok' >/dev/null
else
  echo "SSH failed — set VPS_PASSWORD in deploy/.env.v2"
  exit 1
fi

echo "==> Preflight: confirm production containers still present (will not stop them)"
vps_ssh 'docker ps --format "{{.Names}}" | grep -E "^krunch-pos-(api|postgres)-1$" | wc -l | grep -q 2'

echo "==> Building POS for https://${POS_DOMAIN}/api/v1"
export VITE_API_URL="https://${POS_DOMAIN}/api/v1"
export VITE_DEFAULT_BRANCH_ID="${VITE_DEFAULT_BRANCH_ID:-a0000000-0000-4000-8000-000000000001}"
export VITE_DEFAULT_TERMINAL_ID="${VITE_DEFAULT_TERMINAL_ID:-terminal-v2-001}"
# Preview URLs must hit this stack's /api/v1/media (MediaAsset lives in v2 DB).
# s3.storage…/media is proxied to prod API only — wrong DB → broken images.
export VITE_MEDIA_PUBLIC_BASE_URL="${VITE_MEDIA_PUBLIC_BASE_URL:-https://${POS_DOMAIN}/api/v1/media}"
npm run build -w terminal

rm -rf "${ROOT}/deploy/pos-static"
cp -R "${ROOT}/apps/terminal/dist" "${ROOT}/deploy/pos-static"

echo "==> Ensuring host Caddy imports conf.d (prod sites stay)"
vps_ssh 'mkdir -p /etc/caddy/conf.d; grep -qF "import /etc/caddy/conf.d/*.caddy" /etc/caddy/Caddyfile || printf "\nimport /etc/caddy/conf.d/*.caddy\n" >> /etc/caddy/Caddyfile'

echo "==> Syncing to ${REMOTE_DIR} only"
vps_ssh "mkdir -p ${REMOTE_DIR}"
vps_rsync \
  --exclude node_modules \
  --exclude .git \
  --exclude apps/terminal \
  --exclude deploy/.env \
  --exclude db-dumps \
  "${ROOT}/" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

echo "==> Writing deploy/.env (v2) on server"
vps_rsync "${ENV_FILE}" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/deploy/.env"

echo "==> Starting SHADOW stack (compose project krunch-pos-v2)"
vps_ssh "cd ${REMOTE_DIR}/deploy && docker compose -f ${COMPOSE_FILE} --env-file .env up -d --build --remove-orphans"

echo "==> Publishing ONLY krunch-v2.caddy (prod krunch.caddy untouched)"
vps_ssh "test -f /etc/caddy/conf.d/krunch.caddy && install -D -m 0644 ${REMOTE_DIR}/deploy/${CADDY_FILE} /etc/caddy/conf.d/${CADDY_FILE} && caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy"

echo "==> Waiting for v2 API health on :3002"
for i in $(seq 1 40); do
  if vps_ssh "curl -fsS http://127.0.0.1:3002/api/v1/health | grep -q ok"; then
    echo "    healthy"
    break
  fi
  sleep 3
done

echo "==> Migrating + seeding SHADOW database only"
vps_ssh "cd ${REMOTE_DIR} && set -a && . deploy/.env && set +a && docker compose -f deploy/${COMPOSE_FILE} --env-file deploy/.env exec -T api sh -c 'cd /app/packages/database-schema && npx prisma migrate deploy && npx prisma db seed'" || {
  echo "Migrate/seed reported an error — check v2 api logs (prod untouched)."
}

echo "==> Postflight: prod still up"
vps_ssh 'curl -fsS http://127.0.0.1:3001/api/v1/health | grep -q ok && docker ps --format "{{.Names}}" | grep -q "^krunch-pos-api-1$"'

echo ""
echo "=== Shadow v2 deployed (production untouched) ==="
echo "  POS:   https://${POS_DOMAIN}"
echo "  API:   https://${POS_DOMAIN}/api/v1/health"
echo "  Prod:  https://steakandmarrow.inventivelab.bd (unchanged)"
echo ""
