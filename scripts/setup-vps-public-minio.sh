#!/usr/bin/env bash
# Expose MinIO on IONOS-friendly ports (80 = S3 API, 8443 = console).
# Run: ssh root@217.154.53.60 'bash -s' < scripts/setup-vps-public-minio.sh
set -euo pipefail

cd /root
set -a
# shellcheck disable=SC1091
source .env
set +a

cat > /root/docker-compose.yaml <<YAML
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
      - GENERIC_TIMEZONE=\${GENERIC_TIMEZONE}
      - TZ=\${GENERIC_TIMEZONE}
    volumes:
      - n8n_data:/home/node/.n8n
      - ./local-files:/files

  minio:
    image: minio/minio:latest
    restart: always
    command: server /data --console-address ":9001"
    ports:
      # Public (IONOS default-open ports): API on 80, console on 8443
      - "80:9000"
      - "8443:9001"
      # Optional direct access (open in IONOS firewall if needed)
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: \${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: \${MINIO_ROOT_PASSWORD}
      MINIO_SERVER_URL: http://217.154.53.60
      MINIO_BROWSER_REDIRECT_URL: http://217.154.53.60:8443
      MINIO_API_CORS_ALLOW_ORIGIN: "*"
    volumes:
      - minio_data:/data

  minio-init:
    image: minio/mc:latest
    depends_on:
      - minio
    restart: "no"
    environment:
      MINIO_ROOT_USER: \${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: \${MINIO_ROOT_PASSWORD}
    entrypoint: >
      /bin/sh -c "
      sleep 8;
      mc alias set local http://minio:9000 \$\$MINIO_ROOT_USER \$\$MINIO_ROOT_PASSWORD;
      mc mb --ignore-existing local/krunch-pos;
      mc anonymous set none local/krunch-pos;
      echo MinIO buckets ready;
      "

volumes:
  n8n_data:
  minio_data:
YAML

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8443/tcp
ufw allow 9000/tcp
ufw allow 9001/tcp
ufw allow 5678/tcp
ufw --force enable

docker compose up -d minio minio-init

cat > /root/minio-credentials.txt <<CREDS
# Krunch POS object storage (public via IONOS default ports)
S3_ENDPOINT=http://217.154.53.60
S3_CONSOLE=http://217.154.53.60:8443
S3_BUCKET=krunch-pos
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY=${MINIO_ROOT_USER}
S3_SECRET_KEY=${MINIO_ROOT_PASSWORD}
CREDS
chmod 600 /root/minio-credentials.txt

echo ""
echo "=== Public URLs ==="
echo "S3 API:    http://217.154.53.60"
echo "Console:   http://217.154.53.60:8443"
echo ""
echo "If still blocked, open ports in IONOS: Menu > Server & Cloud > Network > Firewall Policies"
echo "Allow TCP 80, 8443, 9000, 9001"
echo ""
docker compose ps minio
curl -sf --max-time 3 http://127.0.0.1/minio/health/live && echo "Local health: OK" || echo "Local health: check logs"
