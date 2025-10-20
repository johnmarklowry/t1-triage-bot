/**
 * db/migrate.js
 * Database migration runner
 */
const fs = require('fs');
const path = require('path');
const { query, transaction } = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Create migrations table if it doesn't exist
 */
async function createMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64)
    )
  `);
}

/**
 * Get list of executed migrations
 */
async function getExecutedMigrations() {
  const result = await query('SELECT filename FROM migrations ORDER BY id');
  return result.rows.map(row => row.filename);
}

/**
 * Get list of migration files
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();
}

/**
 * Execute a single migration file
 */
async function executeMigration(filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  
  console.log(`[MIGRATION] Executing ${filename}...`);
  
  await transaction(async (client) => {
    // Execute the migration SQL
    await client.query(sql);
    
    // Record the migration
    const checksum = require('crypto').createHash('md5').update(sql).digest('hex');
    await client.query(
      'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
      [filename, checksum]
    );
  });
  
  console.log(`[MIGRATION] Completed ${filename}`);
}

/**
 * Run all pending migrations
 */
async function runMigrations() {
  try {
    console.log('[MIGRATION] Starting migration process...');
    
    // Create migrations table
    await createMigrationsTable();
    
    // Get executed and available migrations
    const executed = await getExecutedMigrations();
    const available = getMigrationFiles();
    
    console.log(`[MIGRATION] Executed: ${executed.length}, Available: ${available.length}`);
    
    // Find pending migrations
    const pending = available.filter(file => !executed.includes(file));
    
    if (pending.length === 0) {
      console.log('[MIGRATION] No pending migrations');
      return;
    }
    
    console.log(`[MIGRATION] Running ${pending.length} pending migrations...`);
    
    // Execute each pending migration
    for (const filename of pending) {
      await executeMigration(filename);
    }
    
    console.log('[MIGRATION] All migrations completed successfully');
    
  } catch (error) {
    console.error('[MIGRATION] Migration failed:', error);
    throw error;
  }
}

/**
 * Get migration status
 */
async function getMigrationStatus() {
  await createMigrationsTable();
  const executed = await getExecutedMigrations();
  const available = getMigrationFiles();
  const pending = available.filter(file => !executed.includes(file));
  
  return {
    executed: executed.length,
    available: available.length,
    pending: pending.length,
    pendingMigrations: pending
  };
}

module.exports = {
  runMigrations,
  getMigrationStatus,
  executeMigration
};
