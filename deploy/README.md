# Production deploy (VPS)

Hosts **Postgres**, **Nest API**, **POS (static)**, and **MinIO** on one server with **Caddy** (HTTPS on 80/443).

## DNS (required)

Point these **A records** to your VPS IP (`217.154.53.60`):

| Host | Example |
|------|---------|
| POS | `steakandmarrow.inteventivelab.bd` |
| S3 API | `s3.steakandmarrow.inteventivelab.bd` |
| MinIO console | `s3-console.steakandmarrow.inteventivelab.bd` |

Wait until `dig steakandmarrow.inteventivelab.bd +short` returns the VPS IP.

## One-time setup

1. Copy env and edit secrets:

   ```bash
   cp deploy/.env.example deploy/.env
   ```

   Generate JWT secrets:

   ```bash
   openssl rand -hex 32   # JWT_ACCESS_SECRET
   openssl rand -hex 32   # JWT_REFRESH_SECRET
   ```

   Use the same `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` as on the VPS today (from `/root/.env`) so existing uploads keep working.

2. Deploy from your Mac (SSH key must work):

   ```bash
   chmod +x scripts/deploy-to-vps.sh
   ./scripts/deploy-to-vps.sh
   ```

This script:

- Builds the terminal with `VITE_API_URL=https://<POS_DOMAIN>/api/v1`
- Stops the old `/root/docker-compose.yaml` (frees port 80)
- Syncs the repo to `/opt/krunch-pos` on the server
- Runs `docker compose -f deploy/docker-compose.prod.yml up -d --build`
- Runs Prisma migrate + seed

## Manual commands on the server

```bash
cd /opt/krunch-pos/deploy
docker compose -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.prod.yml --env-file .env logs -f api
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Re-seed:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec api sh -c 'cd /app/packages/database-schema && npx prisma db seed'
```

## Optional n8n

```bash
docker compose -f docker-compose.prod.yml --env-file .env --profile n8n up -d
```

## Migrate data from local Postgres

Dump on Mac (with local DB running):

```bash
docker exec krunch-pos-postgres pg_dump -U postgres postgres > /tmp/krunch.sql
```

Restore on VPS:

```bash
scp /tmp/krunch.sql root@217.154.53.60:/tmp/
ssh root@217.154.53.60 'cd /opt/krunch-pos/deploy && source .env && docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < /tmp/krunch.sql'
```

(Adjust DB name/user if you changed them from the example.)

## Architecture

```
Internet → Caddy :443
  steakandmarrow.*     → /srv/pos (React build) + /api/* → api:3000
  s3.*                 → minio:9000
  s3-console.*         → minio:9001
postgres (internal)    ← api
```
