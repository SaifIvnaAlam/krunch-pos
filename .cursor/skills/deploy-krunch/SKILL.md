---
name: deploy-krunch
description: >-
  Validate local changes, deploy Krunch POS to the production VPS (code, DB
  migrations, S3/MinIO bucket init), verify the live deployment, then push to
  git only if everything succeeds. Use when the user says /deploy-krunch,
  deploy to production, deploy VPS, or ship Krunch.
disable-model-invocation: true
---

# Deploy Krunch

Production deploy for this repo: validate → VPS deploy → verify → git push.

**Hard gates:** stop on any failure. Do not deploy if validation fails. Do not push if deploy or verify fails. Never force-push. Never commit secrets (`deploy/.env`, `deploy/CREDENTIALS.local.md`).

## Progress checklist

Copy and update as you go:

```
Deploy Krunch:
- [ ] 1. Preflight
- [ ] 2. Validate changes
- [ ] 3. Deploy to VPS
- [ ] 4. Verify production
- [ ] 5. Push to git
```

## Phase 1 — Preflight

Run from repo root.

1. Confirm workspace is `krunch-pos-1` (or this monorepo).
2. Require `deploy/.env` (gitignored). If missing:
   ```bash
   cp deploy/.env.example deploy/.env
   ```
   Tell the user to fill secrets, then stop.
3. Confirm required vars are set (not empty / not `change-me*`):
   `POS_DOMAIN`, `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
   `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
4. Inspect what will ship:
   ```bash
   git status
   git diff
   git log -5 --oneline
   ```
5. Classify the change set (affects later verify steps):
   - **Code** — apps/packages/scripts/deploy (always)
   - **DB** — `packages/database-schema/prisma/**` migrations or schema
   - **S3** — storage/media/S3 env, `bucket-init`, MinIO setup scripts, Caddy S3 routes

## Phase 2 — Validate changes

Prove the working tree is healthy before touching production.

1. Install if needed: `npm install` (only if `node_modules` missing or lockfile changed).
2. Lint: `npm run lint`
3. Tests: `npm run test`
4. Build (catches type/compile errors): `npm run build`
5. If DB schema/migrations changed, also run locally when Postgres is available:
   ```bash
   npm run db:generate
   ```
   Do **not** run destructive local migrate/push against production.

**On any failure:** fix or report; do not deploy.

Optional (when user asks for a quick ship and changes are tiny/docs-only): say what you are skipping and get explicit confirmation before continuing.

## Phase 3 — Deploy to VPS

Primary path (local machine → VPS via rsync + Docker):

```bash
npm run deploy:vps
```

This runs `scripts/deploy-to-vps.sh`, which:

1. Builds the terminal (`npm run build -w terminal`) with production Vite env
2. Copies `apps/terminal/dist` → `deploy/pos-static`
3. Rsyncs the repo to `/opt/krunch-pos` (excludes `node_modules`, `.git`, `apps/terminal`)
4. Syncs `deploy/.env` to the server
5. `docker compose -f docker-compose.prod.yml --env-file .env up -d --build --remove-orphans`
6. Installs/reloads shared host Caddy (`deploy/krunch.caddy`)
7. Syncs Postgres password + restarts API
8. Waits for in-container API health
9. Runs `prisma db seed` (idempotent)

**What happens automatically on deploy:**

| Concern | How |
|---------|-----|
| **Code** | rsync + Docker rebuild of API; POS static via Caddy |
| **DB** | `prisma migrate deploy` in `deploy/docker-api-entrypoint.sh` on API start |
| **S3** | `bucket-init` one-shot ensures `S3_BUCKET` exists on shared MinIO |

**S3 note:** POS static assets are **not** uploaded to S3 — Caddy serves `deploy/pos-static`. Only ensure MinIO/bucket when storage-related changes apply. One-time MinIO setup (rare): see [reference.md](reference.md).

**Do not** use `vps-update-from-main.sh` for this skill — that pulls GitHub `main` and would miss unpushed local changes. This skill deploys the local tree first, then pushes.

**On deploy script failure:** stop. Collect logs (see reference). Do not push.

## Phase 4 — Verify deployment

Source `POS_DOMAIN` / `S3_ENDPOINT` from `deploy/.env` (do not print secrets).

Run all of these; all must pass:

```bash
# Liveness — expect {"status":"ok",...}
curl -sfS "https://${POS_DOMAIN}/api/v1/health"

# Readiness — DB + storage checks
curl -sfS "https://${POS_DOMAIN}/api/v1/health/ready"

# POS UI — expect HTTP 200
curl -sfS -o /dev/null -w "%{http_code}\n" "https://${POS_DOMAIN}/"
```

If **DB** changes were in scope, confirm readiness is healthy (DB portion of `/health/ready`).

If **S3** changes were in scope, confirm readiness storage checks pass and optionally:

```bash
curl -sfS -o /dev/null -w "%{http_code}\n" "${S3_ENDPOINT}"
```

Optional auth smoke (only if `SEED_OWNER_EMAIL` is set; do not log passwords):

```bash
curl -sfS -X POST "https://${POS_DOMAIN}/api/v1/auth/login/restaurants" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${SEED_OWNER_EMAIL}\"}"
```

**On verify failure:** stop. Do not push. Suggest:

```bash
ssh root@$VPS_HOST 'cd /opt/krunch-pos/deploy && docker compose -f docker-compose.prod.yml --env-file .env ps'
ssh root@$VPS_HOST 'cd /opt/krunch-pos/deploy && docker compose -f docker-compose.prod.yml --env-file .env logs --tail=200 api'
```

## Phase 5 — Push to git

Only after phases 2–4 succeed.

1. Show status/diff again. Never stage `deploy/.env` or `deploy/CREDENTIALS.local.md`.
2. If there are uncommitted changes the user intends to ship:
   - Commit only if the user already asked to commit as part of this deploy, **or** ask once: commit then push?
   - Follow the repo commit protocol (HEREDOC message, no `--no-verify`, no amend unless rules allow).
3. Push current branch to `origin`:
   ```bash
   git push -u origin HEAD
   ```
4. Confirm:
   ```bash
   git status
   ```

Default remote: `origin` → `https://github.com/SaifIvnaAlam/krunch-pos.git`. Production update-from-main scripts expect **`main`**; if deploying from another branch, warn that VPS git-pull updates will not see this until merged to `main`.

## Final report

Reply with a short summary:

```markdown
## Deploy Krunch result
- Validate: pass/fail
- Deploy: pass/fail (`npm run deploy:vps`)
- Verify: health / ready / UI (and S3 if applicable)
- Git: committed? pushed? branch + remote
- URLs: POS + API health
- Stopped early?: reason (if any)
```

## Additional resources

- Commands, troubleshooting, env vars: [reference.md](reference.md)
- Human runbook: `deploy/README.md`
