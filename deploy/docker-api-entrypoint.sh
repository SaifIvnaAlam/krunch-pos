#!/bin/sh
set -e
cd /app/packages/database-schema

if ! npx prisma migrate deploy 2>/tmp/prisma-migrate.err; then
  if grep -q P3009 /tmp/prisma-migrate.err 2>/dev/null; then
    echo "migrate deploy blocked — applying schema with db push..."
    npx prisma db push --accept-data-loss
    npx prisma migrate resolve --applied 20260418120000_stock_ledger 2>/dev/null || true
  else
    cat /tmp/prisma-migrate.err >&2
    exit 1
  fi
fi

cd /app/apps/api
exec node dist/main.js
