#!/usr/bin/env bash
# Run on VPS: align Postgres role password with deploy/.env (fixes P1000 after .env overwrite).
set -euo pipefail
cd /opt/krunch-pos/deploy
set -a
# shellcheck disable=SC1091
. ./.env
set +a
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "ALTER USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';"
docker compose -f docker-compose.prod.yml restart api
sleep 15
docker compose -f docker-compose.prod.yml ps api
docker compose -f docker-compose.prod.yml logs api --tail 20
