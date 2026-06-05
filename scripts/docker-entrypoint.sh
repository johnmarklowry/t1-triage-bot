#!/bin/sh
set -e

echo "[entrypoint] Ensuring DATABASE_URL is configured..."
node -e "require('./lib/databaseUrl').ensureDatabaseUrl();"

if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] DATABASE_URL is not set and POSTGRES_* components are incomplete."
  exit 1
fi

echo "[entrypoint] Running Prisma migrations..."
npx prisma migrate deploy

echo "[entrypoint] Starting triage bot..."
exec node server.js
