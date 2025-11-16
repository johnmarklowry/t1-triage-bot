# Research: Prisma ORM Adoption

## Decisions

- Decision: Use Prisma ORM (Prisma Client + Prisma Migrate)
  - Rationale: Strong DX, type-safe client, robust migrations with history and drift detection
  - Alternatives: Knex (lower-level), Sequelize (older API), raw `pg` (manual migrations) — rejected due to weaker typing or higher maintenance

- Decision: Migration Execution Strategy
  - Rationale: Run `prisma migrate deploy` on Railway before app start via `railway.json` `startCommand`
  - Alternatives: In-app migrate-on-boot — rejected to avoid app startup race conditions

- Decision: Destructive Change Policy (FR-011)
  - Rationale: Require manual approval and backup for production before applying destructive migrations
  - Policy: In production, destructive migrations must be reviewed, a DB snapshot/backup created, and rollout plan documented

- Decision: Target Engines/Versions (FR-012)
  - Rationale: Ensure parity across environments
  - Engines: PostgreSQL >= 13 (production Railway), local PostgreSQL >= 13

- Decision: Ownership (FR-013)
  - Rationale: Clear DRI for migration lifecycle
  - Ownership: Feature author generates migration; reviewer (peer) approves PR; ops confirms production readiness

## Best Practices

- Use `prisma format` and `prisma validate` in CI
- Prefer explicit relation names and `onDelete` behavior
- Keep seed data idempotent; use environment guards
- Document `DATABASE_URL` format and SSL options for Railway

## Implementation Notes

- Add `@prisma/client` runtime dep and `prisma` dev dep
- Initialize schema with existing tables (introspection or manual model definitions)
- Migrate repositories gradually: wrap legacy calls behind adapters if needed
