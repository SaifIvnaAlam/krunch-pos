# Production deploy (VPS)

Hosts **Postgres**, **Nest API**, **POS (static)**, and **MinIO** on one server with **Caddy** (HTTPS on 80/443).

## Credentials & reference

| File | Purpose | Committed? |
|------|---------|------------|
| `deploy/.env` | All production secrets + VPS SSH | **No** (gitignored) |
| `deploy/.env.example` | Template with placeholders | Yes |
| `deploy/CREDENTIALS.local.md` | Human-readable URLs, portal users, runbook | **No** (gitignored) |
| `deploy/CREDENTIALS.template.md` | How to create the local reference file | Yes |

On a machine that already deployed once:

```bash
cp deploy/CREDENTIALS.template.md deploy/CREDENTIALS.local.md
# fill in from deploy/.env and team password manager
```

## DNS (required)

Point these **A records** to your VPS IP (`217.154.53.60`):

| Host | Example |
|------|---------|
| POS | `steakandmarrow.inventivelab.bd` |
| S3 API | `s3.steakandmarrow.inventivelab.bd` |
| MinIO console | `s3-console.steakandmarrow.inventivelab.bd` |

Wait until `dig steakandmarrow.inventivelab.bd +short` returns the VPS IP.

## One-time setup

1. Copy env and edit secrets:

   ```bash
   cp deploy/.env.example deploy/.env
   ```

   Set at minimum:

   - `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
   - `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
   - `VPS_PASSWORD` (root SSH password for IONOS VPS)

   Generate JWT secrets:

   ```bash
   openssl rand -hex 32   # JWT_ACCESS_SECRET
   openssl rand -hex 32   # JWT_REFRESH_SECRET
   ```

2. Create local credential reference (optional but recommended):

   ```bash
   cp deploy/CREDENTIALS.template.md deploy/CREDENTIALS.local.md
   ```

## Deploy from Mac

```bash
npm run deploy:vps
```

Or:

```bash
./scripts/deploy-to-vps.sh
```

The script reads **`deploy/.env`** automatically (`VPS_PASSWORD`, domains, secrets).

Override for one run:

```bash
VPS_PASSWORD=your-root-password ./scripts/deploy-to-vps.sh
```

This script:

- Builds the terminal with `VITE_API_URL=https://<POS_DOMAIN>/api/v1`
- Stops the old `/root/docker-compose.yaml` (frees port 80)
- Syncs the repo to `/opt/krunch-pos` on the server
- Runs `docker compose -f deploy/docker-compose.prod.yml up -d --build`
- Syncs Postgres role password with `deploy/.env` (avoids API crash-loop on re-deploy)
- Runs Prisma seed (portal users)

### Portal users (seeded)

Configured in `packages/database-schema/prisma/seed.ts`. Default production branch: **Steak & Marrow**.

Re-seed after deploy if needed — see manual commands below.

## Troubleshooting

**API container restarting (P1000 Postgres auth):**

```bash
# From Mac (password in deploy/.env):
cat scripts/vps-fix-postgres-password.sh | \
  ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no root@217.154.53.60 bash -s
```

**SSH without password:** add your Mac `~/.ssh/id_ed25519.pub` to `/root/.ssh/authorized_keys` on the VPS, then remove `VPS_PASSWORD` from `deploy/.env`.

## Manual commands on the server

```bash
cd /opt/krunch-pos/deploy
docker compose -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.prod.yml --env-file .env logs -f api
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Re-seed:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec -T api sh -c \
  'cd /app/packages/database-schema && npx prisma db seed'
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
