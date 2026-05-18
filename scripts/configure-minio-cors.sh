#!/usr/bin/env bash
# Enable browser uploads (PUT to presigned URLs) on community MinIO.
#
# Open-source MinIO does NOT support `mc cors set` on buckets (you may see
# "decoding xml: EOF"). Use the global env var instead:
#   MINIO_API_CORS_ALLOW_ORIGIN
#
# Run from your machine:
#   ssh root@217.154.53.60 'bash -s' < scripts/configure-minio-cors.sh
set -euo pipefail

cd /root
set -a
# shellcheck disable=SC1091
source .env
set +a

COMPOSE=/root/docker-compose.yaml

if [[ ! -f "$COMPOSE" ]]; then
  echo "Missing $COMPOSE — run scripts/setup-vps-public-minio.sh first." >&2
  exit 1
fi

if ! grep -q 'MINIO_API_CORS_ALLOW_ORIGIN' "$COMPOSE"; then
  sed -i '/MINIO_BROWSER_REDIRECT_URL/a\      MINIO_API_CORS_ALLOW_ORIGIN: "*"' "$COMPOSE"
  echo "Added MINIO_API_CORS_ALLOW_ORIGIN to docker-compose.yaml"
else
  echo "MINIO_API_CORS_ALLOW_ORIGIN already present in docker-compose.yaml"
fi

echo "Recreating MinIO to apply CORS env..."
docker compose up -d --force-recreate minio
sleep 5

ORIGIN="${CORS_TEST_ORIGIN:-http://localhost:5173}"
echo "Checking CORS preflight (Origin: $ORIGIN)..."
HDRS=$(curl -sI -X OPTIONS "http://127.0.0.1/" \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type" 2>/dev/null | tr -d '\r' || true)

if echo "$HDRS" | grep -qi 'access-control-allow-origin'; then
  echo "CORS OK — Access-Control-Allow-Origin header returned."
else
  echo "WARN: No Access-Control-Allow-Origin in OPTIONS response."
  echo "MinIO may still be starting, or the env var name differs on your image version."
  echo "Headers received:"
  echo "$HDRS" | head -15
fi

docker compose run --rm --no-deps --entrypoint /bin/sh minio-init -c "
  sleep 2
  mc alias set local http://minio:9000 \"${MINIO_ROOT_USER}\" \"${MINIO_ROOT_PASSWORD}\"
  mc ls local/krunch-pos
"

echo ""
echo "Done. Do not use 'mc cors set' on community MinIO — it will fail with decoding xml: EOF."
echo "Browser uploads use global CORS via MINIO_API_CORS_ALLOW_ORIGIN=\"*\"."
