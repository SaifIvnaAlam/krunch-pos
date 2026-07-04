# Production deploy (VPS)

Hosts **Postgres** and the **Nest API** on the VPS. TLS + routing are handled by the **shared host Caddy** (systemd) already serving OneSign and n8n on 80/443 — Krunch plugs into it via `deploy/krunch.caddy` (imported from `/etc/caddy/conf.d`), so nothing evicts the other apps. The API is published on `127.0.0.1:3001`, the POS build is served from `deploy/pos-static`, and object storage uses the **shared MinIO** on the VPS (`s3.storage.inventivelab.bd`) — this stack runs no Caddy or MinIO container of its own.

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

Point this **A record** to your VPS IP (`194.164.91.252`):

| Host | Example |
|------|---------|
| POS | `steakandmarrow.inventivelab.bd` |

S3 (`s3.storage.inventivelab.bd`) is the shared MinIO and is already configured.

Wait until `dig steakandmarrow.inventivelab.bd +short` returns the VPS IP.

## One-time setup

1. Copy env and edit secrets:

   ```bash
   cp deploy/.env.example deploy/.env
   ```

   Set at minimum:

   - `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
   - `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (shared MinIO)
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
- Syncs the repo to `/opt/krunch-pos` on the server
- Runs `docker compose -f deploy/docker-compose.prod.yml up -d --build`
- Installs `deploy/krunch.caddy` into the shared host Caddy (`/etc/caddy/conf.d`) and **reloads it gracefully** — OneSign + n8n stay up
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
  ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no root@194.164.91.252 bash -s
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
scp /tmp/krunch.sql root@194.164.91.252:/tmp/
ssh root@194.164.91.252 'cd /opt/krunch-pos/deploy && source .env && docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < /tmp/krunch.sql'
```

(Adjust DB name/user if you changed them from the example.)

## Architecture

```
Internet → shared host Caddy :443 (also serves OneSign + n8n)
  steakandmarrow.inventivelab.bd → deploy/pos-static (React build) + /api/* → 127.0.0.1:3001
  s3.storage.inventivelab.bd     → MinIO :9000 (bucket: krunch-pos)
api (container :3000) → published on 127.0.0.1:3001
postgres (internal)   ← api
```
