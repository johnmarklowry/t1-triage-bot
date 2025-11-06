/**
 * db/remove-test-users.js
 * Script to remove test users from staging database during development
 */
const { query } = require('../connection');

/**
 * Remove all test users from the database
 */
async function removeTestUsers() {
  try {
    // First, reset current state to avoid foreign key conflicts
    console.log('🔄 Resetting current state...');
    await query(`
      UPDATE current_state 
      SET sprint_index = NULL, 
          account_slack_id = NULL, 
          producer_slack_id = NULL, 
          po_slack_id = NULL, 
          ui_eng_slack_id = NULL, 
          be_eng_slack_id = NULL
      WHERE id = 1
    `);
    console.log('✅ Current state reset to default');
    
    // Then remove users
    console.log('🗑️  Removing test users from staging database...');
    const result = await query('DELETE FROM users');
    console.log(`✅ Removed ${result.rowCount} users from the database`);
    
    // Remove overrides
    console.log('🗑️  Removing overrides...');
    const overrideResult = await query('DELETE FROM overrides');
    console.log(`✅ Removed ${overrideResult.rowCount} overrides from the database`);
    
    // Finally, remove sprints (now that current_state doesn't reference them)
    console.log('🗑️  Removing test sprints...');
    const sprintResult = await query('DELETE FROM sprints');
    console.log(`✅ Removed ${sprintResult.rowCount} sprints from the database`);
    
    console.log('🎉 Database cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error removing test users:', error);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    await removeTestUsers();
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

// Run the script if executed directly
if (require.main === module) {
  main();
}

module.exports = { removeTestUsers };
