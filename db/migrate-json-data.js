/**
 * db/migrate-json-data.js
 * One-time migration script to import existing JSON files into database
 */
const fs = require('fs');
const path = require('path');
const { UsersRepository, SprintsRepository, CurrentStateRepository, OverridesRepository } = require('./repository');

// Environment detection for staging
const IS_STAGING = process.env.TRIAGE_ENV === 'staging' || process.env.NODE_ENV === 'staging';

const SPRINTS_FILE = path.join(__dirname, '..', 'data', 'sprints.json');
// Prefer a staging-specific disciplines file when in staging
const DISCIPLINES_FILE = (() => {
  const stagingPath = path.join(__dirname, '..', 'config', 'disciplines.staging.json');
  if (IS_STAGING && fs.existsSync(stagingPath)) {
    console.log(`[MIGRATION] Using staging disciplines file: ${stagingPath}`);
    return stagingPath;
  }
  return path.join(__dirname, '..', 'config', 'disciplines.json');
})();
const CURRENT_STATE_FILE = path.join(__dirname, '..', 'data', 'currentState.json');
const OVERRIDES_FILE = path.join(__dirname, '..', 'data', 'overrides.json');

/**
 * Load JSON data from file
 */
function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[MIGRATION] File not found: ${filePath}`);
      return null;
    }
    
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`[MIGRATION] Error loading ${filePath}:`, error);
    return null;
  }
}

/**
 * Migrate sprints data
 */
async function migrateSprints() {
  console.log('[MIGRATION] Migrating sprints...');
  
  const sprints = loadJSON(SPRINTS_FILE);
  if (!sprints || !Array.isArray(sprints)) {
    console.log('[MIGRATION] No sprints data to migrate');
    return;
  }
  
  for (const sprint of sprints) {
    try {
      await SprintsRepository.addSprint(
        sprint.sprintName,
        sprint.startDate,
        sprint.endDate,
        sprints.indexOf(sprint),
        'migration-script'
      );
      console.log(`[MIGRATION] Migrated sprint: ${sprint.sprintName}`);
    } catch (error) {
      console.error(`[MIGRATION] Error migrating sprint ${sprint.sprintName}:`, error);
    }
  }
  
  console.log(`[MIGRATION] Migrated ${sprints.length} sprints`);
}

/**
 * Migrate disciplines data
 */
async function migrateDisciplines() {
  console.log('[MIGRATION] Migrating disciplines...');
  
  const disciplines = loadJSON(DISCIPLINES_FILE);
  if (!disciplines || typeof disciplines !== 'object') {
    console.log('[MIGRATION] No disciplines data to migrate');
    return;
  }
  
  let totalUsers = 0;
  
  for (const [discipline, users] of Object.entries(disciplines)) {
    if (!Array.isArray(users)) continue;
    
    for (const user of users) {
      try {
        await UsersRepository.addUser(
          user.slackId,
          user.name,
          discipline,
          'migration-script'
        );
        totalUsers++;
        console.log(`[MIGRATION] Migrated user: ${user.name} (${discipline})`);
      } catch (error) {
        console.error(`[MIGRATION] Error migrating user ${user.name}:`, error);
      }
    }
  }
  
  console.log(`[MIGRATION] Migrated ${totalUsers} users across ${Object.keys(disciplines).length} disciplines`);
}

/**
 * Migrate current state data
 */
async function migrateCurrentState() {
  console.log('[MIGRATION] Migrating current state...');
  
  const currentState = loadJSON(CURRENT_STATE_FILE);
  if (!currentState) {
    console.log('[MIGRATION] No current state data to migrate');
    return;
  }
  
  try {
    await CurrentStateRepository.update(currentState, 'migration-script');
    console.log('[MIGRATION] Migrated current state:', currentState);
  } catch (error) {
    console.error('[MIGRATION] Error migrating current state:', error);
  }
}

/**
 * Migrate overrides data
 */
async function migrateOverrides() {
  console.log('[MIGRATION] Migrating overrides...');
  
  const overrides = loadJSON(OVERRIDES_FILE);
  if (!overrides || !Array.isArray(overrides)) {
    console.log('[MIGRATION] No overrides data to migrate');
    return;
  }
  
  for (const override of overrides) {
    try {
      await OverridesRepository.addOverride({
        sprintIndex: override.sprintIndex,
        role: override.role,
        originalSlackId: override.originalSlackId,
        newSlackId: override.newSlackId,
        newName: override.newName,
        requestedBy: override.requestedBy,
        approved: override.approved
      }, 'migration-script');
      
      console.log(`[MIGRATION] Migrated override: ${override.role} sprint ${override.sprintIndex}`);
    } catch (error) {
      console.error(`[MIGRATION] Error migrating override:`, error);
    }
  }
  
  console.log(`[MIGRATION] Migrated ${overrides.length} overrides`);
}

/**
 * Run the complete migration
 */
async function runMigration() {
  try {
    console.log('[MIGRATION] Starting JSON data migration...');
    
    // Migrate in order to respect foreign key constraints
    await migrateSprints();
    await migrateDisciplines();
    await migrateCurrentState();
    await migrateOverrides();
    
    console.log('[MIGRATION] JSON data migration completed successfully');
    
  } catch (error) {
    console.error('[MIGRATION] Migration failed:', error);
    throw error;
  }
}

/**
 * Validate migration results
 */
async function validateMigration() {
  console.log('[MIGRATION] Validating migration results...');
  
  try {
    const disciplines = await UsersRepository.getDisciplines();
    const sprints = await SprintsRepository.getAll();
    const currentState = await CurrentStateRepository.get();
    const overrides = await OverridesRepository.getAll();
    
    console.log('[MIGRATION] Validation results:');
    console.log(`  - Disciplines: ${Object.keys(disciplines).length} disciplines`);
    console.log(`  - Sprints: ${sprints.length} sprints`);
    console.log(`  - Current state: sprint ${currentState.sprintIndex}`);
    console.log(`  - Overrides: ${overrides.length} overrides`);
    
    return true;
  } catch (error) {
    console.error('[MIGRATION] Validation failed:', error);
    return false;
  }
}

module.exports = {
  runMigration,
  validateMigration
};

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => validateMigration())
    .then(() => {
      console.log('[MIGRATION] Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[MIGRATION] Migration failed:', error);
      process.exit(1);
    });
}



