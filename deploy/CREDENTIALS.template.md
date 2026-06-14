# Production credentials template

Copy to **`deploy/CREDENTIALS.local.md`** (gitignored) and fill in real values.

```bash
cp deploy/CREDENTIALS.template.md deploy/CREDENTIALS.local.md
```

| What | Where to store |
|------|----------------|
| VPS SSH password, DB, JWT, MinIO | `deploy/.env` |
| Portal user emails/passwords | `deploy/CREDENTIALS.local.md` + Prisma seed |
| Public URLs & runbook | `deploy/README.md` |

## Quick deploy

```bash
cp deploy/.env.example deploy/.env   # first time only — then edit secrets
npm run deploy:vps
```

Requires `VPS_PASSWORD` (or SSH key) in `deploy/.env`. See `deploy/CREDENTIALS.local.md` on a configured machine for the full reference.
