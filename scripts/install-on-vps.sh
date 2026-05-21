#!/usr/bin/env bash
# Run ON the VPS as root (IONOS console or SSH).
# Installs /opt/krunch-pos from GitHub and starts the production stack.
#
#   curl -fsSL https://raw.githubusercontent.com/SaifIvnaAlam/krunch-pos/main/scripts/install-on-vps.sh | bash
#
# Or after cloning:
#   bash scripts/install-on-vps.sh
set -euo pipefail

REPO="${KRUNCH_REPO:-https://github.com/SaifIvnaAlam/krunch-pos.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/krunch-pos}"
BRANCH="${KRUNCH_BRANCH:-main}"

if [[ ! -f "${INSTALL_DIR}/deploy/docker-compose.prod.yml" ]]; then
  apt-get update -qq
  apt-get install -y -qq git ca-certificates curl
  command -v docker >/dev/null || {
    curl -fsSL https://get.docker.com | sh
  }
  mkdir -p "$(dirname "$INSTALL_DIR")"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    git -C "$INSTALL_DIR" fetch origin && git -C "$INSTALL_DIR" checkout "$BRANCH" && git -C "$INSTALL_DIR" pull
  else
    rm -rf "$INSTALL_DIR"
    git clone --branch "$BRANCH" --depth 1 "$REPO" "$INSTALL_DIR"
  fi
fi

cd "$INSTALL_DIR"

# Stop legacy stack on port 80
if [[ -f /root/docker-compose.yaml ]]; then
  (cd /root && docker compose down 2>/dev/null) || true
fi

# deploy/.env: reuse /root MinIO creds + generate secrets if missing
ENV_FILE="${INSTALL_DIR}/deploy/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp deploy/.env.example "$ENV_FILE"
  if [[ -f /root/.env ]]; then
    # shellcheck disable=SC1091
    source /root/.env
    [[ -n "${MINIO_ROOT_USER:-}" ]] && sed -i "s|^MINIO_ROOT_USER=.*|MINIO_ROOT_USER=${MINIO_ROOT_USER}|" "$ENV_FILE"
    [[ -n "${MINIO_ROOT_PASSWORD:-}" ]] && sed -i "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}|" "$ENV_FILE"
    sed -i "s|^S3_ACCESS_KEY=.*|S3_ACCESS_KEY=${MINIO_ROOT_USER}|" "$ENV_FILE"
    sed -i "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=${MINIO_ROOT_PASSWORD}|" "$ENV_FILE"
  fi
  sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 32)|" "$ENV_FILE"
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" "$ENV_FILE"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" "$ENV_FILE"
  echo "Created $ENV_FILE — set ACME_EMAIL and domain names if needed."
fi

# shellcheck disable=SC1091
set -a && source "$ENV_FILE" && set +a
for v in MINIO_ROOT_PASSWORD JWT_ACCESS_SECRET POSTGRES_PASSWORD; do
  if [[ "${!v}" == change-me* ]]; then
    echo "Edit $ENV_FILE ($v still placeholder)."
    exit 1
  fi
done

# Build POS on server (Node 20 via Docker one-off if node missing)
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 -s | tr -d v)" -lt 20 ]]; then
  echo "==> Building POS via Node container"
  docker run --rm -v "${INSTALL_DIR}:/app" -w /app/apps/terminal \
    -e VITE_API_URL="https://${POS_DOMAIN}/api/v1" \
    -e VITE_SEEDED_ADMIN_EMAIL=owner@universalpos.local \
    -e VITE_DEFAULT_BRANCH_ID=a0000000-0000-4000-8000-000000000001 \
    -e VITE_DEFAULT_TERMINAL_ID=terminal-prod-001 \
    node:20-bookworm-slim bash -c "npm ci && npm run build"
else
  export VITE_API_URL="https://${POS_DOMAIN}/api/v1"
  export VITE_SEEDED_ADMIN_EMAIL=owner@universalpos.local
  export VITE_DEFAULT_BRANCH_ID=a0000000-0000-4000-8000-000000000001
  export VITE_DEFAULT_TERMINAL_ID=terminal-prod-001
  npm ci
  npm run build -w terminal
fi

rm -rf deploy/pos-static
cp -R apps/terminal/dist deploy/pos-static

cd deploy
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo "Waiting for API..."
for _ in $(seq 1 40); do
  if docker compose -f docker-compose.prod.yml --env-file .env exec -T api node -e \
    "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.text()).then(t=>process.exit(t.includes('ok')?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 3
done

docker compose -f docker-compose.prod.yml --env-file .env exec -T api sh -c \
  'cd /app/packages/database-schema && npx prisma db seed' || true

SERVER_IP="$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
if ! getent ahostsv4 "${POS_DOMAIN}" 2>/dev/null | grep -q .; then
  echo ""
  echo "WARNING: DNS for ${POS_DOMAIN} is not pointing here yet."
  echo "Add A records → ${SERVER_IP} for:"
  echo "  ${POS_DOMAIN}"
  echo "  ${S3_DOMAIN}"
  echo "  ${S3_CONSOLE_DOMAIN}"
  echo "HTTPS (Let's Encrypt) will fail until DNS propagates."
fi

echo ""
echo "Deployed. POS: https://${POS_DOMAIN}"
