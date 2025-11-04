#!/usr/bin/env node
// Clears all rows from the users table on the configured DATABASE_URL
const { query, closePool } = require('../db/connection');

async function clearUsers() {
  if (!process.env.DATABASE_URL) {
    console.error('[clear-users] DATABASE_URL is not set');
    process.exit(1);
  }

  try {
    console.log('[clear-users] Connecting to database...');
    // Disable referential checks if any (not required with current schema)
    console.log('[clear-users] Deleting all users...');
    await query('DELETE FROM users');
    console.log('[clear-users] Users table cleared successfully');
  } catch (err) {
    console.error('[clear-users] Error clearing users:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

clearUsers();








