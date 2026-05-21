#!/bin/sh
set -e
cd /app/packages/database-schema
npx prisma migrate deploy
cd /app/apps/api
exec node dist/main.js
