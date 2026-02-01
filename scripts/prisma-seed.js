#!/usr/bin/env node
/* Seed environment-specific disciplines using Prisma */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma-client');

function resolveAppEnv() {
  const env = process.env.APP_ENV || process.env.ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'production' : 'staging');
  return env.toLowerCase();
}

function loadDisciplinesData(appEnv) {
  // Prefer explicit staging file; default to disciplines.json for production if available
  const stagingPath = path.join(__dirname, '..', 'disciplines.staging.json');
  const prodPath = path.join(__dirname, '..', 'disciplines.json');

  let filePath = prodPath;
  if (appEnv === 'staging') {
    filePath = stagingPath;
  } else if (!fs.existsSync(prodPath) && fs.existsSync(stagingPath)) {
    // Fallback if prod file missing
    filePath = stagingPath;
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`[seed] Disciplines file not found for env=${appEnv}. Tried: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

async function upsertDisciplines(appEnv, data) {
  const roles = Object.keys(data);
  let count = 0;

  // Ensure Discipline model/table exists; fail with clear message otherwise
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    if (e.message && e.message.includes('DATABASE_URL')) {
      throw new Error(
        `[seed] DATABASE_URL environment variable is not set. ` +
        `Please set DATABASE_URL in your .env file or environment. ` +
        `See env.example for configuration options.`
      );
    }
    throw new Error(`[seed] Database not reachable: ${e.message}`);
  }

  // Check if discipline table exists
  try {
    await prisma.$queryRaw`SELECT 1 FROM discipline LIMIT 1`;
  } catch (e) {
    if (e.message && (e.message.includes('does not exist') || e.message.includes('relation') && e.message.includes('discipline'))) {
      throw new Error(
        `[seed] The 'discipline' table does not exist in the database.\n` +
        `This table should be created by Prisma migrations.\n\n` +
        `To fix this, run migrations:\n` +
        `  npx prisma migrate deploy    # For production/staging\n` +
        `  npx prisma migrate dev       # For development (creates migration if needed)\n\n` +
        `Original error: ${e.message}`
      );
    }
    throw e;
  }

  for (const role of roles) {
    const entries = Array.isArray(data[role]) ? data[role] : [];

    for (const entry of entries) {
      const name = entry.name || entry.discipline || role;
      // Upsert by (name, env) logical key
      await prisma.discipline.upsert({
        where: {
          // Composite unique assumed: name_env or fallback to cuid if schema differs
          // If your schema uses a different unique constraint, adjust accordingly
          name_env: { name, env: appEnv },
        },
        update: {
          name,
          env: appEnv,
        },
        create: {
          name,
          env: appEnv,
        },
      });
      count += 1;
    }
  }
  return count;
}

function isForceSeed() {
  return process.env.FORCE_SEED === '1' || process.env.FORCE_SEED === 'true';
}

(async () => {
  const appEnv = resolveAppEnv();
  console.log(`[seed] APP_ENV resolved to: ${appEnv}`);

  try {
    if (appEnv === 'staging' && !isForceSeed()) {
      try {
        const count = await prisma.discipline.count();
        if (count > 0) {
          console.log('[seed] Staging already has disciplines, skipping.');
          process.exit(0);
        }
      } catch (e) {
        // DB/table may not exist yet - continue to upsert (will fail with clear message)
      }
    }

    const data = loadDisciplinesData(appEnv);
    const count = await upsertDisciplines(appEnv, data);
    console.log(`[seed] Upserted ${count} disciplines for env=${appEnv}`);
    process.exit(0);
  } catch (err) {
    console.error('[seed] Failed:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
