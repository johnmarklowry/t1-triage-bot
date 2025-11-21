#!/usr/bin/env node
/* Seed users data using Prisma from disciplines.json */

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
    throw new Error(`[seed-users] Disciplines file not found for env=${appEnv}. Tried: ${filePath}`);
  }
  
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

async function upsertUsers(disciplines) {
  let totalUsers = 0;
  let errors = [];

  // Ensure database is reachable
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    if (e.message && e.message.includes('DATABASE_URL')) {
      throw new Error(
        `[seed-users] DATABASE_URL environment variable is not set. ` +
        `Please set DATABASE_URL in your .env file or environment. ` +
        `See env.example for configuration options.`
      );
    }
    throw new Error(`[seed-users] Database not reachable: ${e.message}`);
  }

  // Check if users table exists
  try {
    await prisma.$queryRaw`SELECT 1 FROM users LIMIT 1`;
  } catch (e) {
    if (e.message && (e.message.includes('does not exist') || (e.message.includes('relation') && e.message.includes('users')))) {
      throw new Error(
        `[seed-users] The 'users' table does not exist in the database.\n` +
        `This table should be created by Prisma migrations.\n\n` +
        `To fix this, run migrations:\n` +
        `  npx prisma migrate deploy    # For production/staging\n` +
        `  npx prisma migrate dev       # For development (creates migration if needed)\n\n` +
        `Original error: ${e.message}`
      );
    }
    throw e;
  }

  // Iterate through each discipline
  for (const [discipline, users] of Object.entries(disciplines)) {
    if (!Array.isArray(users)) {
      console.warn(`[seed-users] Skipping ${discipline}: not an array`);
      continue;
    }

    console.log(`[seed-users] Processing ${discipline} discipline (${users.length} user(s))...`);

    for (const user of users) {
      try {
        // Extract user data - handle different formats
        const slackId = user.slackId || user.slack_id;
        const name = user.name;

        if (!slackId || !name) {
          errors.push(`${discipline}/${name || 'unknown'}: Missing slackId or name`);
          continue;
        }

        // Upsert user using Prisma
        // Note: User model has unique constraint on [slackId, discipline]
        // So the same user can be in multiple disciplines (separate records)
        await prisma.user.upsert({
          where: {
            slackId_discipline: {
              slackId: slackId,
              discipline: discipline,
            },
          },
          update: {
            name: name,
            updatedAt: new Date(),
          },
          create: {
            slackId: slackId,
            name: name,
            discipline: discipline,
          },
        });
        
        totalUsers++;
        console.log(`[seed-users] ✓ Upserted user: ${name} (${discipline}) - ${slackId}`);
      } catch (error) {
        const errorMsg = `${discipline}/${user.name || 'unknown'}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`[seed-users] ✗ Error: ${errorMsg}`);
      }
    }
  }

  if (errors.length > 0) {
    console.warn(`[seed-users] Completed with ${errors.length} error(s):`);
    errors.forEach(err => console.warn(`  - ${err}`));
  }

  return { totalUsers, errors: errors.length, disciplines: Object.keys(disciplines).length };
}

(async () => {
  const appEnv = resolveAppEnv();
  console.log(`[seed-users] Starting user seeding for env=${appEnv}...`);

  try {
    const disciplines = loadDisciplinesData(appEnv);
    console.log(`[seed-users] Loaded disciplines: ${Object.keys(disciplines).join(', ')}`);

    const result = await upsertUsers(disciplines);
    console.log(`[seed-users] ✓ Successfully upserted ${result.totalUsers} user(s) across ${result.disciplines} discipline(s)`);
    
    if (result.errors > 0) {
      console.warn(`[seed-users] ⚠ ${result.errors} user(s) had errors`);
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('[seed-users] Failed:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();

