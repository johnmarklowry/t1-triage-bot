# Implementation Plan: Adopt Standardized ORM (Prisma)

**Branch**: `010-prisma-orm` | **Date**: 2025-11-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-prisma-orm/spec.md`

## Summary

Adopt Prisma as the standardized ORM for PostgreSQL. Replace bespoke SQL in repositories with Prisma Client, and manage schema changes via Prisma Migrate. Provide reliable, audited migrations in CI/CD and Railway deploys, plus a simple local DX: generate, migrate, seed.

## Technical Context

**Language/Version**: Node.js 18+ (CommonJS)  
**Primary Dependencies**: Prisma CLI and Client (`prisma`, `@prisma/client`), PostgreSQL  
**Storage**: PostgreSQL (Railway production), developer local Postgres  
**Testing**: Supertest for integration; manual verification via `/test` routes; Prisma migrate diff/drift checks  
**Target Platform**: Railway (NIXPACKS) for deploy, macOS dev machines  
**Project Type**: Single backend app (Express + Slack Bolt)  
**Performance Goals**: No regression vs current pg usage; migrations under 10% deploy time overhead  
**Constraints**: No secrets in VCS; Railway deploy must run migrations before app start; maintain fallback if DB unavailable  
**Scale/Scope**: Current bot usage; moderate tables (< 15), low concurrency; future extensibility

## Constitution Check

- I. Slack API Compliance: N/A (no Slack API changes).  
- II. Code Maintainability: Prisma introduces a typed client, reduces hand-rolled SQL; code organization: `repositories/*` use Prisma.  
- III. Error Handling & Resilience: Prisma errors wrapped with contextual logs; startup validates DB connectivity and migration status.  
- IV. Security & Configuration: Add `DATABASE_URL` docs to `env.example`; no secrets in repo.  
- V. Documentation & Testing: Add `prisma/` docs; commands in README/quickstart; test route to validate DB connectivity.

**Compliance Status**: ✅ Compliant

## Project Structure

### Documentation (this feature)

```text
specs/010-prisma-orm/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── orm-commands.md
    └── repository-adapter.md
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma            # Prisma schema (datasource + generator + models)
└── migrations/              # Prisma Migrate history (auto-created by CLI)

repositories/
├── *.js                     # Switch to Prisma Client internally

scripts/
└── prisma-seed.js           # Optional seed script (if needed)
```

**Structure Decision**: Introduce `prisma/` folder and migrate repositories to use Prisma Client. Keep Express/Slack structure unchanged.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | — | — |
