/**
 * clear-audit-logs.js
 * Script to clear all records from the audit_logs table
 * 
 * Usage:
 *   node scripts/clear-audit-logs.js
 *   DATABASE_URL="postgresql://..." node scripts/clear-audit-logs.js
 */

const { Pool } = require('pg');
require('dotenv').config();

// Get DATABASE_URL from command line argument or environment variable
const databaseUrl = process.argv[2] || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Error: DATABASE_URL not provided');
  console.error('Usage: node scripts/clear-audit-logs.js [DATABASE_URL]');
  console.error('Or set DATABASE_URL environment variable');
  process.exit(1);
}

async function clearAuditLogs() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') || databaseUrl.includes('amazonaws') 
      ? { rejectUnauthorized: false } 
      : false
  });

  try {
    console.log('Connecting to database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✓ Database connection successful\n');

    // Get current count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
    const currentCount = parseInt(countResult.rows[0].count);
    console.log(`Current audit logs count: ${currentCount}`);

    if (currentCount === 0) {
      console.log('✓ Audit logs table is already empty. Nothing to clear.');
      await pool.end();
      return;
    }

    // Clear the table
    console.log('\nClearing audit logs table...');
    const deleteResult = await pool.query('DELETE FROM audit_logs');
    console.log(`✓ Deleted ${deleteResult.rowCount} record(s) from audit_logs`);

    // Reset the sequence (optional, but ensures clean numbering)
    console.log('Resetting sequence...');
    await pool.query('ALTER SEQUENCE audit_logs_id_seq RESTART WITH 1');
    console.log('✓ Sequence reset to 1');

    // Verify the table is empty
    const verifyResult = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
    const finalCount = parseInt(verifyResult.rows[0].count);
    console.log(`\nFinal audit logs count: ${finalCount}`);

    if (finalCount === 0) {
      console.log('✓ Audit logs table cleared successfully!');
    } else {
      console.error('✗ Error: Table should be empty but contains', finalCount, 'records');
      process.exit(1);
    }

  } catch (error) {
    console.error('✗ Error clearing audit logs:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\nDatabase connection closed');
  }
}

// Run the script
clearAuditLogs()
  .then(() => {
    console.log('\n✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Script failed:', error.message);
    process.exit(1);
  });



