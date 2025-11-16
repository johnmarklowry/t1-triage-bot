#!/usr/bin/env node
/* Seed environment-specific disciplines using Prisma */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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
    throw new Error(`[seed] Database not reachable: ${e.message}`);
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

(async () => {
  const appEnv = resolveAppEnv();
  console.log(`[seed] APP_ENV resolved to: ${appEnv}`);

  try {
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
