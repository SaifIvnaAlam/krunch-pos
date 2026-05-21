#!/usr/bin/env bash
# Create deploy/.env from example with generated JWT secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/deploy/.env"
EX="${ROOT}/deploy/.env.example"

if [[ -f "$OUT" ]]; then
  echo "deploy/.env already exists — not overwriting."
  exit 0
fi

cp "$EX" "$OUT"
ACCESS="$(openssl rand -hex 32)"
REFRESH="$(openssl rand -hex 32)"
PGPASS="$(openssl rand -hex 16)"

replace() {
  local key="$1" val="$2"
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^${key}=.*|${key}=${val}|" "$OUT"
  else
    sed -i "s|^${key}=.*|${key}=${val}|" "$OUT"
  fi
}
replace JWT_ACCESS_SECRET "$ACCESS"
replace JWT_REFRESH_SECRET "$REFRESH"
replace POSTGRES_PASSWORD "$PGPASS"

echo "Created deploy/.env"
echo "Edit MinIO credentials (match /root/.env on VPS) and ACME_EMAIL, then run: ./scripts/deploy-to-vps.sh"
