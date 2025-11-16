# ORM Commands Contract

## Required Commands

- Generate Client
  - `npx prisma generate`

- Validate Schema
  - `npx prisma validate`

- Format Schema
  - `npx prisma format`

- Create Migration (dev only)
  - `npx prisma migrate dev --name <change>`

- Deploy Migrations (CI/CD & Railway)
  - `npx prisma migrate deploy`

- Drift Detection (optional CI)
  - `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url "$DATABASE_URL"`

## Deployment Integration

- Railway `startCommand`: run `prisma migrate deploy` before starting the app

## Environment

- Requires `DATABASE_URL` set for all commands that touch the DB
