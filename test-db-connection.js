// Quick test to verify database connection and run migrations
require('./loadEnv').loadEnv();
const { query } = require('./db/connection');
const { runMigrations } = require('./db/migrate');

async function test() {
  try {
    console.log('[TEST] Connecting to database...');
    const result = await query('SELECT NOW() as current_time');
    console.log('[TEST] Database connected:', result.rows[0]);
    
    console.log('[TEST] Running migrations...');
    await runMigrations();
    console.log('[TEST] Migrations completed successfully!');
    
    console.log('[TEST] All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('[TEST] Failed:', error);
    process.exit(1);
  }
}

test();
