#!/usr/bin/env bash
# Run on the VPS as root (or via: ssh root@HOST 'bash -s' < scripts/setup-vps-minio.sh)
set -euo pipefail

cd /root

if ! grep -q '^MINIO_ROOT_USER=' .env 2>/dev/null; then
  echo "MINIO_ROOT_USER=krunch" >> .env
  echo "MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)" >> .env
fi

# shellcheck disable=SC1091
set -a && source .env && set +a

cat > /root/docker-compose.yaml <<'YAML'
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - N8N_RUNNERS_ENABLED=true
      - NODE_ENV=production
      - N8N_SECURE_COOKIE=false
      - GENERIC_TIMEZONE=${GENERIC_TIMEZONE}
      - TZ=${GENERIC_TIMEZONE}
    volumes:
      - n8n_data:/home/node/.n8n
      - ./local-files:/files

  minio:
    image: minio/minio:latest
    restart: always
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data

  minio-init:
    image: minio/mc:latest
    depends_on:
      - minio
    restart: "no"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    entrypoint: >
      /bin/sh -c "
      sleep 8;
      mc alias set local http://minio:9000 $$MINIO_ROOT_USER $$MINIO_ROOT_PASSWORD;
      mc mb --ignore-existing local/krunch-pos;
      mc anonymous set none local/krunch-pos;
      echo MinIO buckets ready;
      "

volumes:
  n8n_data:
  minio_data:
YAML

docker compose pull minio minio-init
docker compose up -d
docker compose ps

cat > /root/minio-credentials.txt <<CREDS
# Krunch POS object storage (MinIO)
S3_ENDPOINT=http://217.154.53.60:9000
S3_CONSOLE=http://217.154.53.60:9001
S3_BUCKET=krunch-pos
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY=${MINIO_ROOT_USER}
S3_SECRET_KEY=${MINIO_ROOT_PASSWORD}
CREDS

chmod 600 /root/minio-credentials.txt
echo "Credentials written to /root/minio-credentials.txt"
cat /root/minio-credentials.txt
