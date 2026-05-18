#!/usr/bin/env bash
# Run on the VPS as root (or: ssh root@217.154.53.60 'bash -s' < scripts/open-vps-storage-ports.sh)
set -euo pipefail

echo "Opening MinIO ports in UFW (host firewall)..."
ufw allow 22/tcp comment 'SSH'
ufw allow 9000/tcp comment 'MinIO S3 API'
ufw allow 9001/tcp comment 'MinIO console'
ufw allow 5678/tcp comment 'n8n' 2>/dev/null || true
ufw --force enable
ufw status numbered

echo ""
echo "MinIO docker ports:"
docker ps --filter name=minio --format 'table {{.Names}}\t{{.Ports}}'

echo ""
echo "IMPORTANT: Also open TCP 9000 and 9001 in your cloud provider firewall"
echo "(e.g. IONOS → Server → Network → Firewall policies)."
echo "Test from your laptop:"
echo "  curl http://217.154.53.60:9000/minio/health/live"
