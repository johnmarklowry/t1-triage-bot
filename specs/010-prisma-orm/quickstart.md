# Quickstart: Prisma ORM Adoption

## Prerequisites

- Node 18+
- PostgreSQL (local) or Railway database URL
- `DATABASE_URL` set in environment

## Setup

1. Install packages:
   - `npm i @prisma/client`
   - `npm i -D prisma`
2. Initialize Prisma:
   - `npx prisma init` (creates `prisma/` and `.env` if not present)
3. Define models in `prisma/schema.prisma`

## Local Development

- Generate client: `npx prisma generate`
- Create migration: `npx prisma migrate dev --name init`
- Run app: `npm start`

## Deployment (Railway)

- Ensure `DATABASE_URL` is configured in Railway
- Ensure start command runs migrations first:
  - `npx prisma migrate deploy && npm start`
- Monitor logs for migration apply output

## Validation

- Drift check (optional):
  - `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url "$DATABASE_URL"`

## Troubleshooting

- Schema errors: `npx prisma validate`
- Connection issues: verify `DATABASE_URL` and SSL settings
