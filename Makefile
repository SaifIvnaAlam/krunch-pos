.PHONY: all dev build test clean generate-clients install db-migrate db-seed

all: install db-migrate db-seed generate-clients build

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

dev-admin:
	cd apps/admin && npm run dev

# ── Build ─────────────────────────────────────────────────
build:
	npx turbo run build

build-win:
	cd apps/terminal-win && dotnet build -c Release

build-qt:
	cd apps/terminal-qt && cmake --build build --config Release

build-ios:
	cd apps/ios && xcodebuild -scheme UniversalPOS -configuration Release -sdk iphoneos

# ── OpenAPI Client Generation ─────────────────────────────
generate-openapi:
	cd apps/api && npm run generate:openapi

generate-clients: generate-openapi
	nswag openapi2csclient \
		/input:openapi.json \
		/output:apps/terminal-win/src/Generated/ApiClient.cs \
		/namespace:TerminalWin.Generated
	openapi-generator generate -i openapi.json \
		-g cpp-qt-client \
		-o apps/terminal-qt/src/generated
	openapi-generator generate -i openapi.json \
		-g swift5 \
		-o apps/ios/Sources/Generated

# ── Test ──────────────────────────────────────────────────
test:
	npx turbo run test

test-api:
	cd apps/api && npm run test

test-win:
	cd apps/terminal-win && dotnet test

test-qt:
	cd apps/terminal-qt && ctest --test-dir build

test-ios:
	cd apps/ios && xcodebuild test -scheme UniversalPOS -destination 'platform=iOS Simulator,name=iPad Pro'

test-all: test test-win test-qt test-ios

# ── Clean ─────────────────────────────────────────────────
clean:
	rm -rf node_modules
	rm -rf apps/*/node_modules
	rm -rf packages/*/node_modules
	rm -rf apps/api/dist
	rm -rf apps/admin/.next
	rm -rf apps/terminal-win/bin apps/terminal-win/obj
	rm -rf apps/terminal-qt/build
	rm -rf openapi.json
