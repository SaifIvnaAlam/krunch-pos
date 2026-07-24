# Agent instructions

Before doing anything in this repo, read **[CONTEXT.md](./CONTEXT.md)**. It is
the source of truth for what this app is, the code layout, the in-progress
database re-architecture (JSON blobs → relational tables, money as integer
minor units), the current working state, local-dev setup, and the DB safety
rules.

Key rules (details in CONTEXT.md):

- Prisma schema (`packages/database-schema/prisma/schema.prisma`) is the source
  of truth for the database.
- Money is stored as integer minor units (`*Minor`); `Branch.currency` is the
  ISO 4217 code. Never use floats for money.
- Do not run the root `db:migrate` / `db:push` against production; they tunnel
  to the VPS. Work against the local sandbox DB on port 5434.
- The relational migration is additive; keep the legacy JSON columns as the
  rollback path until the production cutover is complete.

Always-on agent rules (also in `.cursor/rules/`):

- **Ponytail** (`.cursor/skills/ponytail`) — laziest correct solution; no
  speculative code; delete retired UI paths instead of leaving dead navigation.
- **DRY** (`.cursor/skills/dry-refactoring`) — reuse existing helpers; extract
  on the second real call site; use jscpd when hunting clones.
