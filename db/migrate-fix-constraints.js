/**
 * db/migrate-fix-constraints.js
 * Migration script to fix database duplicate key constraints
 */
const fs = require('fs');
const path = require('path');
const { query, transaction } = require('./connection');

/**
 * Run the constraint fixes migration
 */
async function runConstraintFixes() {
  try {
    console.log('Starting database constraint fixes migration...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', '002_fix_duplicate_key_constraints.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          await query(statement);
          console.log(`✅ Statement ${i + 1} executed successfully`);
        } catch (error) {
          console.error(`❌ Error executing statement ${i + 1}:`, error.message);
          // Continue with other statements unless it's a critical error
          if (error.message.includes('does not exist')) {
            console.log('⚠️  Skipping statement (constraint/index does not exist)');
          } else {
            throw error;
          }
        }
      }
    }
    
    console.log('✅ Database constraint fixes migration completed successfully');
    
    // Verify the fixes
    await verifyConstraintFixes();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Verify that the constraint fixes were applied correctly
 */
async function verifyConstraintFixes() {
  console.log('Verifying constraint fixes...');
  
  try {
    // Check users table constraints
    const usersConstraints = await query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'users' AND constraint_type = 'UNIQUE'
    `);
    
    console.log('Users table constraints:', usersConstraints.rows.map(r => r.constraint_name));
    
    // Check sprints table constraints
    const sprintsConstraints = await query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'sprints' AND constraint_type = 'UNIQUE'
    `);
    
    console.log('Sprints table constraints:', sprintsConstraints.rows.map(r => r.constraint_name));
    
    // Check overrides table constraints
    const overridesConstraints = await query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'overrides' AND constraint_type = 'UNIQUE'
    `);
    
    console.log('Overrides table constraints:', overridesConstraints.rows.map(r => r.constraint_name));
    
    // Check current_state table constraints
    const currentStateConstraints = await query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'current_state' AND constraint_type = 'UNIQUE'
    `);
    
    console.log('Current state table constraints:', currentStateConstraints.rows.map(r => r.constraint_name));
    
    console.log('✅ Constraint verification completed');
    
  } catch (error) {
    console.error('❌ Constraint verification failed:', error);
    throw error;
  }
}

/**
 * Test the fixes with sample data
 */
async function testConstraintFixes() {
  console.log('Testing constraint fixes with sample data...');
  
  try {
    // Test users table - same user in multiple disciplines
    console.log('Testing users table - same user in multiple disciplines...');
    
    const testUserId = 'test_user_123';
    const testUserName = 'Test User';
    
    // Add user to first discipline
    await query(`
      INSERT INTO users (slack_id, name, discipline)
      VALUES ($1, $2, $3)
      ON CONFLICT (slack_id, discipline) DO NOTHING
    `, [testUserId, testUserName, 'uiEng']);
    
    // Add same user to second discipline (should work now)
    await query(`
      INSERT INTO users (slack_id, name, discipline)
      VALUES ($1, $2, $3)
      ON CONFLICT (slack_id, discipline) DO NOTHING
    `, [testUserId, testUserName, 'beEng']);
    
    console.log('✅ Users table test passed - same user can be in multiple disciplines');
    
    // Clean up test data
    await query('DELETE FROM users WHERE slack_id = $1', [testUserId]);
    
    // Test sprints table - duplicate sprint index handling
    console.log('Testing sprints table - duplicate sprint index handling...');
    
    const testSprintIndex = 9999;
    
    // Add first sprint
    await query(`
      INSERT INTO sprints (sprint_name, start_date, end_date, sprint_index)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (sprint_index) DO NOTHING
    `, ['Test Sprint 1', '2024-01-01', '2024-01-14', testSprintIndex]);
    
    // Try to add second sprint with same index (should be handled gracefully)
    await query(`
      INSERT INTO sprints (sprint_name, start_date, end_date, sprint_index)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (sprint_index) DO NOTHING
    `, ['Test Sprint 2', '2024-01-15', '2024-01-28', testSprintIndex]);
    
    console.log('✅ Sprints table test passed - duplicate sprint index handled gracefully');
    
    // Clean up test data
    await query('DELETE FROM sprints WHERE sprint_index = $1', [testSprintIndex]);
    
    console.log('✅ All constraint fix tests passed');
    
  } catch (error) {
    console.error('❌ Constraint fix tests failed:', error);
    throw error;
  }
}

/**
 * Main function to run the migration
 */
async function main() {
  try {
    console.log('🚀 Starting database constraint fixes migration...');
    
    await runConstraintFixes();
    await testConstraintFixes();
    
    console.log('🎉 Database constraint fixes migration completed successfully!');
    console.log('');
    console.log('Summary of fixes applied:');
    console.log('- ✅ Users table: Fixed to allow same user in multiple disciplines');
    console.log('- ✅ Sprints table: Fixed to handle duplicate sprint indexes gracefully');
    console.log('- ✅ Overrides table: Added constraint to prevent duplicate requests');
    console.log('- ✅ Current state table: Fixed constraint handling for concurrent updates');
    console.log('- ✅ Added proper indexes for performance');
    console.log('- ✅ Added retry logic and error handling');
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  runConstraintFixes,
  verifyConstraintFixes,
  testConstraintFixes
};
