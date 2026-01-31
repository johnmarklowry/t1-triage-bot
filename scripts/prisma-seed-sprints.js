#!/usr/bin/env node
/* Seed sprints data using Prisma */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma-client');

function loadSprintsData() {
  const sprintsPath = path.join(__dirname, '..', 'sprints.json');
  
  if (!fs.existsSync(sprintsPath)) {
    throw new Error(`[seed-sprints] Sprints file not found: ${sprintsPath}`);
  }
  
  const raw = fs.readFileSync(sprintsPath, 'utf8');
  const data = JSON.parse(raw);
  
  // Handle both array and object formats
  if (Array.isArray(data)) {
    return data;
  }
  
  // If it's an object, try to extract an array
  if (typeof data === 'object' && data.sprints) {
    return data.sprints;
  }
  
  throw new Error('[seed-sprints] Invalid sprints.json format. Expected array or object with "sprints" property.');
}

async function upsertSprints(sprints) {
  let count = 0;
  let errors = [];

  // Ensure database is reachable
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    if (e.message && e.message.includes('DATABASE_URL')) {
      throw new Error(
        `[seed-sprints] DATABASE_URL environment variable is not set. ` +
        `Please set DATABASE_URL in your .env file or environment. ` +
        `See env.example for configuration options.`
      );
    }
    throw new Error(`[seed-sprints] Database not reachable: ${e.message}`);
  }

  // Check if sprints table exists
  try {
    await prisma.$queryRaw`SELECT 1 FROM sprints LIMIT 1`;
  } catch (e) {
    if (e.message && (e.message.includes('does not exist') || (e.message.includes('relation') && e.message.includes('sprints')))) {
      throw new Error(
        `[seed-sprints] The 'sprints' table does not exist in the database.\n` +
        `This table should be created by Prisma migrations.\n\n` +
        `To fix this, run migrations:\n` +
        `  npx prisma migrate deploy    # For production/staging\n` +
        `  npx prisma migrate dev       # For development (creates migration if needed)\n\n` +
        `Original error: ${e.message}`
      );
    }
    throw e;
  }

  for (let i = 0; i < sprints.length; i++) {
    const sprint = sprints[i];
    try {
      // Extract sprint data - handle different formats
      const sprintName = sprint.sprintName || sprint.name || sprint.sprint_name || `Sprint ${i + 1}`;
      const startDate = sprint.startDate || sprint.start_date;
      const endDate = sprint.endDate || sprint.end_date;
      const sprintIndex = sprint.sprintIndex !== undefined ? sprint.sprintIndex : (sprint.sprint_index !== undefined ? sprint.sprint_index : i);

      if (!startDate || !endDate) {
        errors.push(`Sprint ${i + 1}: Missing startDate or endDate`);
        continue;
      }

      // Upsert sprint using Prisma
      await prisma.sprint.upsert({
        where: {
          sprintIndex: sprintIndex,
        },
        update: {
          sprintName: sprintName,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          updatedAt: new Date(),
        },
        create: {
          sprintName: sprintName,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          sprintIndex: sprintIndex,
        },
      });
      
      count += 1;
      console.log(`[seed-sprints] ✓ Upserted sprint: ${sprintName} (index: ${sprintIndex})`);
    } catch (error) {
      const errorMsg = `Sprint ${i + 1}: ${error.message}`;
      errors.push(errorMsg);
      console.error(`[seed-sprints] ✗ Error: ${errorMsg}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`[seed-sprints] Completed with ${errors.length} error(s):`);
    errors.forEach(err => console.warn(`  - ${err}`));
  }

  return { count, errors: errors.length };
}

function resolveAppEnv() {
  const env = process.env.APP_ENV || process.env.ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'production' : 'staging');
  return env.toLowerCase();
}

function isForceSeed() {
  return process.env.FORCE_SEED === '1' || process.env.FORCE_SEED === 'true';
}

(async () => {
  const appEnv = resolveAppEnv();
  console.log('[seed-sprints] Starting sprint seeding...');

  try {
    if (appEnv === 'staging' && !isForceSeed()) {
      try {
        const count = await prisma.sprint.count();
        if (count > 0) {
          console.log('[seed-sprints] Staging already has sprints, skipping.');
          process.exit(0);
        }
      } catch (e) {
        // DB/table may not exist yet - continue to upsert (will fail with clear message)
      }
    }

    const sprints = loadSprintsData();
    console.log(`[seed-sprints] Loaded ${sprints.length} sprint(s) from sprints.json`);

    const result = await upsertSprints(sprints);
    console.log(`[seed-sprints] ✓ Successfully upserted ${result.count} sprint(s)`);
    
    if (result.errors > 0) {
      console.warn(`[seed-sprints] ⚠ ${result.errors} sprint(s) had errors`);
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('[seed-sprints] Failed:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();

