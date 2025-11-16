# Tasks: Adopt Standardized ORM (Prisma)

**Input**: Design documents from `/specs/010-prisma-orm/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by phase and user story to enable independent testing per story.

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Add Prisma deps in package.json: `@prisma/client` (deps), `prisma` (devDeps)
- [x] T002 Create `prisma/` directory and add `prisma/schema.prisma`
- [x] T003 Add npm scripts: `prisma:generate`, `prisma:migrate:dev`, `prisma:migrate:deploy` in `package.json`
- [x] T004 Ensure Railway start runs migrations: update `railway.json` to use `npx prisma migrate deploy && npm start`
- [x] T005 Add `DATABASE_URL` docs to `env.example` and verify `DATABASE_URL` is required at runtime

## Phase 2: Foundational (Blocking Prerequisites)

- [ ] T006 Define datasource and generator in `prisma/schema.prisma` (PostgreSQL + Prisma Client)
- [ ] T007 Model existing entities in `prisma/schema.prisma` per data-model.md (User, Discipline, Sprint, Assignment, Override, AuditLog, CronTriggerAudit, NotificationSnapshot)
- [ ] T008 Set FKs and onDelete behavior to match existing SQL (e.g., NotificationSnapshot.railwayTriggerId → SET NULL)
- [ ] T009 Create initial migration: `npx prisma migrate dev --name init`
- [ ] T010 Generate client: `npx prisma generate` and commit artifacts (not node_modules)

## Phase 3: User Story 1 (P1) — Reliable Schema Migrations

- [ ] T011 [US1] Add CI-ready command in `package.json`: `prisma:migrate:deploy`
- [ ] T012 [US1] Verify deployment: run `npx prisma migrate deploy` locally against a test DB
- [ ] T013 [US1] Add drift check command (optional): `prisma:migrate:diff` doc in `specs/010-prisma-orm/contracts/orm-commands.md`
- [ ] T014 [US1] Add startup verification path: log applied migrations count on boot in `server.js`
- [ ] T015 [US1] Update `DATABASE_SETUP.md` with Prisma migration workflow

## Phase 4: User Story 2 (P1) — Standardized Data Access Layer

- [ ] T016 [US2] Create `prismaClient.js` to instantiate and export Prisma Client
- [ ] T017 [US2] Refactor `repositories/notificationSnapshots.js` to use Prisma Client (reads/writes)
- [ ] T018 [US2] Refactor `db/repository.js` or adapters to delegate to Prisma (non-snapshot modules)
- [ ] T019 [US2] Map Prisma errors to domain errors with helpful messages
- [ ] T020 [US2] Verify type-safe fields on at least one repository function end-to-end

## Phase 5: User Story 3 (P2) — Local DX & Environment Parity

- [ ] T021 [US3] Add `npx prisma validate` and `npx prisma format` steps to local docs `quickstart.md`
- [ ] T022 [US3] Create optional seed script `scripts/prisma-seed.js` (idempotent)
- [ ] T023 [US3] Document full local flow in `specs/010-prisma-orm/quickstart.md` (generate, migrate, seed)
- [ ] T024 [US3] Add `/test/db/prisma-status` test route in `testRoutes.js` to report DB and client status

## Final Phase: Polish & Cross-Cutting

- [ ] T025 Add README section summarizing Prisma commands and workflows
- [ ] T026 Ensure `package.json` engines (Node >=18) and `.nvmrc` (18) align
- [ ] T027 Verify Railway env vars include `DATABASE_URL` and migrate deploy logs are visible
- [ ] T028 Review security: no secrets committed; `.env*` ignored; `env.example` complete

## Dependencies

- Phase 1 → Phase 2 → US1 → US2 → US3 → Polish

## Parallel Opportunities

- T016–T020 (US2 refactors) can proceed in parallel after US1 is complete
- T021–T024 (US3 docs/tests) can proceed in parallel after US1 is complete

## MVP Scope

- US1 (T011–T015): Reliable migrations in deploy pipeline
