#!/usr/bin/env node
/**
 * setup-database.js
 * Database setup script for Railway deployment
 * Runs migrations and populates data from JSON files
 */
const { runMigrations } = require('./db/migrate');
const { runMigration: migrateJsonData } = require('./db/migrate-json-data');

async function setupDatabase() {
  console.log('[SETUP] Starting database setup...');
  
  // Check if we're in a Railway environment
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.DATABASE_URL;
  console.log(`[SETUP] Environment: ${isRailway ? 'Railway' : 'Local'}`);
  
  // Warn if using custom migrations when Prisma is available
  const usePrismaMigrations = process.env.USE_PRISMA_MIGRATIONS !== 'false';
  if (usePrismaMigrations) {
    console.warn('[SETUP] WARNING: Custom migrations are disabled. Use Prisma Migrate instead.');
    console.warn('[SETUP] Set USE_PRISMA_MIGRATIONS=false to enable custom migrations.');
    return;
  }
  
  try {
    // Step 1: Run schema migrations
    console.log('[SETUP] Running schema migrations...');
    await runMigrations();
    console.log('[SETUP] Schema migrations completed');
    
    // Step 2: Check if we have JSON files to migrate
    const fs = require('fs');
    const path = require('path');
    
    const jsonFiles = [
      'sprints.json',
      'disciplines.json', 
      'currentState.json',
      'overrides.json'
    ];
    
    const hasJsonFiles = jsonFiles.some(file => fs.existsSync(path.join(__dirname, file)));
    
    if (hasJsonFiles) {
      console.log('[SETUP] Found JSON files, migrating data...');
      await migrateJsonData();
      console.log('[SETUP] JSON data migration completed');
    } else {
      console.log('[SETUP] No JSON files found, skipping data migration');
      console.log('[SETUP] Database will start with empty tables');
    }
    
    console.log('[SETUP] Database setup completed successfully!');
    
  } catch (error) {
    console.error('[SETUP] Database setup failed:', error);
    
    // Always continue - let the server handle graceful degradation
    console.error('[SETUP] Continuing with JSON fallback mode...');
    // Don't exit - let the application start with fallback
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('[SETUP] Setup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[SETUP] Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupDatabase };
