#!/usr/bin/env bash
# Refresh the LOCAL sandbox DB with a fresh copy of PRODUCTION data.
#
# Safe for production: it only runs pg_dump (read-only) inside the prod
# Postgres container over SSH, downloads the dump, and restores it into the
# local Docker Postgres (docker-compose.localdb.yml). Production is never
# modified.
#
# Usage:
#   ./scripts/restore-prod-dump-local.sh
#
# Reads VPS_* and POSTGRES_* from deploy/.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ROOT}/deploy/.env"
[[ -f "$ENV_FILE" ]] || { echo "Missing deploy/.env"; exit 1; }
# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

VPS_HOST="${VPS_HOST:?set VPS_HOST in deploy/.env}"
VPS_USER="${VPS_USER:-root}"
PROD_PG_CONTAINER="${PROD_PG_CONTAINER:-krunch-pos-postgres-1}"
LOCAL_PG_CONTAINER="${LOCAL_PG_CONTAINER:-krunch-localdb-postgres}"
DUMP_LOCAL="${ROOT}/db-dumps/krunch_prod.dump"

SSH_OPTS=(-o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no)
ssh_cmd() { sshpass -p "${VPS_PASSWORD}" ssh "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_HOST}" "$@"; }

echo "==> Dumping production (read-only) from ${PROD_PG_CONTAINER}"
ssh_cmd "docker exec -e PGPASSWORD='${POSTGRES_PASSWORD}' ${PROD_PG_CONTAINER} pg_dump -U '${POSTGRES_USER}' -Fc --no-owner --no-privileges '${POSTGRES_DB}' > /tmp/krunch_prod.dump"

echo "==> Downloading dump"
mkdir -p "${ROOT}/db-dumps"
sshpass -p "${VPS_PASSWORD}" scp "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_HOST}:/tmp/krunch_prod.dump" "${DUMP_LOCAL}"
ssh_cmd "rm -f /tmp/krunch_prod.dump"

echo "==> Ensuring local stack is up"
docker compose -f docker-compose.localdb.yml up -d >/dev/null

echo "==> Restoring into local DB (clean, so this is repeatable)"
docker exec -e PGPASSWORD=krunch "${LOCAL_PG_CONTAINER}" \
  pg_restore -U krunch -d krunch --clean --if-exists --no-owner --no-privileges /dumps/krunch_prod.dump

echo "==> Row counts (local):"
docker exec -e PGPASSWORD=krunch "${LOCAL_PG_CONTAINER}" \
  psql -U krunch -d krunch -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

echo ""
echo "Done. pgAdmin: http://localhost:5051   |   psql: postgresql://krunch:krunch@localhost:5434/krunch"
