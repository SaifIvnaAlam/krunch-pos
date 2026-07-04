#!/usr/bin/env bash
# Run ON the VPS as root (IONOS web console or SSH):
#   curl -fsSL https://raw.githubusercontent.com/SaifIvnaAlam/krunch-pos/main/scripts/vps-update-from-main.sh | bash
#
# Pulls latest main, rebuilds API + POS, runs seed (idempotent).
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/krunch-pos}"
BRANCH="${KRUNCH_BRANCH:-main}"

if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  echo "Repo not found at ${INSTALL_DIR}. Run scripts/install-on-vps.sh first."
  exit 1
fi

cd "$INSTALL_DIR"
echo "==> Pulling ${BRANCH}"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

ENV_FILE="${INSTALL_DIR}/deploy/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE}"
  exit 1
fi

# shellcheck disable=SC1091
set -a && source "$ENV_FILE" && set +a

echo "==> Building POS for https://${POS_DOMAIN}"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 -s | tr -d v)" -lt 20 ]]; then
  docker run --rm -v "${INSTALL_DIR}:/app" -w /app \
    -e VITE_API_URL="https://${POS_DOMAIN}/api/v1" \
    -e VITE_DEFAULT_BRANCH_ID=a0000000-0000-4000-8000-000000000001 \
    -e VITE_DEFAULT_TERMINAL_ID=terminal-prod-001 \
    node:20-bookworm-slim bash -c "npm ci && npm run build -w terminal"
else
  export VITE_API_URL="https://${POS_DOMAIN}/api/v1"
  export VITE_DEFAULT_BRANCH_ID=a0000000-0000-4000-8000-000000000001
  export VITE_DEFAULT_TERMINAL_ID=terminal-prod-001
  npm ci
  npm run build -w terminal
fi

rm -rf deploy/pos-static
cp -R apps/terminal/dist deploy/pos-static

echo "==> Ensuring host Caddy imports Krunch site config (OneSign + n8n stay up)"
mkdir -p /etc/caddy/conf.d
grep -qF "import /etc/caddy/conf.d/*.caddy" /etc/caddy/Caddyfile \
  || printf "\nimport /etc/caddy/conf.d/*.caddy\n" >> /etc/caddy/Caddyfile

echo "==> Rebuilding and restarting stack"
cd deploy
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo "==> Publishing Krunch site through the shared host Caddy (graceful reload)"
install -D -m 0644 "${INSTALL_DIR}/deploy/krunch.caddy" /etc/caddy/conf.d/krunch.caddy
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy

echo "==> Waiting for API"
for _ in $(seq 1 40); do
  if docker compose -f docker-compose.prod.yml --env-file .env exec -T api node -e \
    "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.text()).then(t=>process.exit(t.includes('ok')?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 3
done

echo "==> Seeding database (new users, idempotent)"
docker compose -f docker-compose.prod.yml --env-file .env exec -T api sh -c \
  'cd /app/packages/database-schema && npx prisma db seed' || true

echo ""
echo "Updated. POS: https://${POS_DOMAIN}"
echo "Test: curl -sS -X POST https://${POS_DOMAIN}/api/v1/auth/login/restaurants -H 'Content-Type: application/json' -d '{\"email\":\"alam.saifivn@gmail.com\"}'"
