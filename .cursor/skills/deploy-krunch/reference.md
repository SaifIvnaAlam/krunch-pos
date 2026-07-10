# Deploy Krunch — reference

Read this only when you need exact commands, env vars, or troubleshooting. Keep `SKILL.md` as the workflow source of truth.

## Key paths

| Path | Role |
|------|------|
| `scripts/deploy-to-vps.sh` | Primary Mac → VPS deploy |
| `deploy/docker-compose.prod.yml` | Postgres + API + `bucket-init` |
| `deploy/docker-api-entrypoint.sh` | `prisma migrate deploy` then API start |
| `deploy/krunch.caddy` | Shared host Caddy site config |
| `deploy/.env` | Secrets (gitignored) |
| `deploy/.env.example` | Template |
| `deploy/README.md` | Human runbook |

## Required `deploy/.env` vars

Script refuses to run if missing or still `change-me*`:

- `POS_DOMAIN`
- `POSTGRES_PASSWORD`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`

SSH / deploy:

- `VPS_HOST` (authoritative; overrides script default)
- `VPS_USER` (default `root`)
- `VPS_PASSWORD` (if no SSH key)
- `REMOTE_DIR` (default `/opt/krunch-pos`)

First-deploy seed:

- `SEED_OWNER_PASSWORD` (required for production seed)
- `SEED_OWNER_EMAIL`, `SEED_OWNER_NAME` (optional defaults)

## Validate commands

```bash
npm run lint
npm run test
npm run build
```

DB-related local check (dev DB only):

```bash
npm run db:generate
```

## Deploy command

```bash
npm run deploy:vps
# equivalent: bash scripts/deploy-to-vps.sh
```

Override host/password for one run:

```bash
VPS_HOST=... VPS_PASSWORD='...' npm run deploy:vps
```

### What the script does (order)

1. Source `deploy/.env`, validate secrets
2. SSH key auth, else password via `expect`
3. `npm run build -w terminal` with `VITE_API_URL=https://${POS_DOMAIN}/api/v1`
4. Copy dist → `deploy/pos-static`
5. Ensure Caddy imports `/etc/caddy/conf.d/*.caddy`
6. Rsync repo → `/opt/krunch-pos` (excludes `node_modules`, `.git`, `apps/terminal`)
7. Rsync `deploy/.env`
8. `docker compose -f docker-compose.prod.yml --env-file .env up -d --build --remove-orphans`
9. Install `krunch.caddy`, `caddy validate`, `systemctl reload caddy`
10. Sync Postgres password + restart API
11. Poll in-container `/api/v1/health` (up to 40×3s)
12. `prisma db seed` (idempotent)

### DB migrations

Automatic on API container start via entrypoint:

```bash
npx prisma migrate deploy
```

P3009 fallback (entrypoint only): `prisma db push --accept-data-loss` + `migrate resolve` for a known migration. Prefer fixing migration history over relying on this.

Manual on server if needed:

```bash
cd /opt/krunch-pos/deploy
docker compose -f docker-compose.prod.yml --env-file .env exec -T api sh -c \
  'cd /app/packages/database-schema && npx prisma migrate deploy'
```

### S3 / MinIO

- Shared MinIO on VPS (`S3_ENDPOINT`, typically `https://s3.storage.inventivelab.bd`)
- Every compose up runs `bucket-init` (`mc mb --ignore-existing`)
- POS static is **not** synced to S3

One-time MinIO setup (only if storage is broken / new VPS):

```bash
ssh root@$VPS_HOST 'bash -s' < scripts/setup-vps-public-minio.sh
ssh root@$VPS_HOST 'bash -s' < scripts/configure-minio-cors.sh
```

## Verify commands

Load domain without printing secrets:

```bash
set -a && source deploy/.env && set +a

curl -sfS "https://${POS_DOMAIN}/api/v1/health"
curl -sfS "https://${POS_DOMAIN}/api/v1/health/ready"
curl -sfS -o /dev/null -w "%{http_code}\n" "https://${POS_DOMAIN}/"
```

Expect:

- Health: JSON with `status` containing `ok`
- Ready: success (DB + Redis-disabled + storage)
- UI: `200`

Auth smoke (optional):

```bash
curl -sfS -X POST "https://${POS_DOMAIN}/api/v1/auth/login/restaurants" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${SEED_OWNER_EMAIL}\"}"
```

## Git push rules

- Push only after validate + deploy + verify all pass
- Never stage `deploy/.env` or `deploy/CREDENTIALS.local.md`
- Prefer branch `main` for alignment with `vps-update-from-main.sh` / install scripts
- `git push -u origin HEAD` — no `--force`

## Troubleshooting

**API crash-loop / P1000 Postgres auth:**

```bash
cat scripts/vps-fix-postgres-password.sh | ssh root@$VPS_HOST bash -s
```

**Container status / logs:**

```bash
ssh root@$VPS_HOST 'cd /opt/krunch-pos/deploy && docker compose -f docker-compose.prod.yml --env-file .env ps'
ssh root@$VPS_HOST 'cd /opt/krunch-pos/deploy && docker compose -f docker-compose.prod.yml --env-file .env logs --tail=200 api'
```

**DNS:**

```bash
dig "${POS_DOMAIN}" +short   # must match VPS IP
```

**SSH:** key in `/root/.ssh/authorized_keys`, or set `VPS_PASSWORD` in `deploy/.env`.

## Architecture (short)

```
Internet → shared host Caddy :443
  ${POS_DOMAIN}
    /api/* → 127.0.0.1:3001 (api)
    /*     → /opt/krunch-pos/deploy/pos-static
  s3.storage.inventivelab.bd
    /media/* → API
    /*       → MinIO :9000
api → postgres (Docker network)
bucket-init → ensures S3_BUCKET on MinIO
```

## Do not use for this skill

- `scripts/vps-update-from-main.sh` — pulls remote `main`, skips unpushed local work
- Force push / `--no-verify`
- Committing secrets
- Running production migrate/push from the laptop against prod DB URLs
