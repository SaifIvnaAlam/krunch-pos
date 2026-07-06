.PHONY: all dev build test clean generate-openapi install db-migrate db-seed

all: install db-migrate db-seed build

install:
	npm install

# ── Database ──────────────────────────────────────────────
db-migrate:
	cd packages/database-schema && npx prisma migrate deploy

db-seed:
	cd packages/database-schema && npx prisma db seed

db-generate:
	cd packages/database-schema && npx prisma generate

# ── Dev Servers ───────────────────────────────────────────
dev:
	npx turbo run dev --parallel

dev-api:
	cd apps/api && npm run dev

dev-terminal:
	cd apps/terminal && npm run dev

# ── Build ─────────────────────────────────────────────────
build:
	npx turbo run build

# ── OpenAPI ───────────────────────────────────────────────
generate-openapi:
	cd apps/api && npm run generate:openapi

# ── Test ──────────────────────────────────────────────────
test:
	npx turbo run test

test-api:
	cd apps/api && npm run test

# ── Clean ─────────────────────────────────────────────────
clean:
	rm -rf node_modules
	rm -rf apps/*/node_modules
	rm -rf packages/*/node_modules
	rm -rf apps/api/dist
	rm -rf apps/terminal/dist
	rm -rf openapi.json
