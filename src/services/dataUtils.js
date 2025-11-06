/**
 * dataUtils.js
 * Centralized data operations for the triage rotation app.
 * Updated to use PostgreSQL database with backward compatibility
 */
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

// Import database repositories
const { 
  UsersRepository, 
  SprintsRepository, 
  CurrentStateRepository, 
  OverridesRepository 
} = require('../../db/repository');

// Environment detection
const IS_STAGING = process.env.TRIAGE_ENV === 'staging' || process.env.NODE_ENV === 'staging';

// Define file paths for persisted JSON data (kept for backup/compatibility)
const CURRENT_STATE_FILE = path.join(__dirname, "../../data", "currentState.json");
const SPRINTS_FILE = path.join(__dirname, "../../data", "sprints.json");
const DISCIPLINES_STAGING_FILE = path.join(__dirname, "../../data", "disciplines.staging.json");
const DISCIPLINES_FILE = path.join(__dirname, "../../data", "disciplines.json");
const OVERRIDES_FILE = path.join(__dirname, "../../data", "overrides.json");

// Configuration for dual-write mode (can be disabled after validation)
const DUAL_WRITE_MODE = process.env.DUAL_WRITE_MODE !== 'false';
const USE_DATABASE = process.env.USE_DATABASE !== 'false';

/**
 * Format a date consistently using Pacific Time
 */
function formatPTDate(dateStr, formatStr = 'ddd MM/DD/YYYY') {
  return dayjs.tz(`${dateStr}T00:00:00`, "America/Los_Angeles").format(formatStr);
}

/**
 * Parse a date string consistently as midnight PT
 */
function parsePTDate(dateStr) {
  return dayjs.tz(`${dateStr}T00:00:00`, "America/Los_Angeles");
}

/**
 * Get today's date in Pacific Time, at start of day
 */
function getTodayPT() {
  return dayjs().tz("America/Los_Angeles").startOf("day");
}

/**
 * Generic function to load JSON from a file (legacy support)
 */
function loadJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err);
    return null;
  }
}

/**
 * Generic function to save JSON to a file (legacy support)
 */
function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    console.log(`[saveJSON] ${filePath} updated successfully.`);
    return true;
  } catch (err) {
    console.error(`[saveJSON] Error writing ${filePath}:`, err);
    return false;
  }
}

/**
 * Get all sprints from database
 */
async function readSprints() {
  if (!USE_DATABASE) {
    const sprints = loadJSON(SPRINTS_FILE);
    if (!Array.isArray(sprints)) {
      console.error('[readSprints] Invalid sprints data: not an array');
      return [];
    }
    return sprints;
  }

  try {
    const sprints = await SprintsRepository.getAll();
    return sprints.map(sprint => ({
      sprintName: sprint.sprintName,
      startDate: sprint.startDate,
      endDate: sprint.endDate
    }));
  } catch (error) {
    console.error('[readSprints] Database error:', error);
    // Fallback to JSON if database fails
    const sprints = loadJSON(SPRINTS_FILE);
    return Array.isArray(sprints) ? sprints : [];
  }
}

/**
 * Get all disciplines from database
 */
async function readDisciplines() {
  if (!USE_DATABASE) {
    // Prefer staging file if in staging and it exists
    const sourceFile = (IS_STAGING && fs.existsSync(DISCIPLINES_STAGING_FILE))
      ? DISCIPLINES_STAGING_FILE
      : DISCIPLINES_FILE;
    const disciplines = loadJSON(sourceFile) || {};
    
    // Validate that no user appears in multiple disciplines
    const allUsers = new Map(); // userId -> discipline
    const duplicates = [];
    
    for (const [discipline, users] of Object.entries(disciplines)) {
      if (!Array.isArray(users)) continue;
      
      for (const user of users) {
        if (allUsers.has(user.slackId)) {
          duplicates.push({
            userId: user.slackId,
            name: user.name,
            disciplines: [allUsers.get(user.slackId), discipline]
          });
        } else {
          allUsers.set(user.slackId, discipline);
        }
      }
    }
    
    if (duplicates.length > 0) {
      console.error('[readDisciplines] WARNING: Users found in multiple disciplines:', duplicates);
    }
    
    return disciplines;
  }

  try {
    const disciplines = await UsersRepository.getDisciplines();
    
    // Validate that no user appears in multiple disciplines
    const allUsers = new Map();
    const duplicates = [];
    
    for (const [discipline, users] of Object.entries(disciplines)) {
      for (const user of users) {
        if (allUsers.has(user.slackId)) {
          duplicates.push({
            userId: user.slackId,
            name: user.name,
            disciplines: [allUsers.get(user.slackId), discipline]
          });
        } else {
          allUsers.set(user.slackId, discipline);
        }
      }
    }
    
    if (duplicates.length > 0) {
      console.error('[readDisciplines] WARNING: Users found in multiple disciplines:', duplicates);
    }
    
    return disciplines;
  } catch (error) {
    console.error('[readDisciplines] Database error:', error);
    // Fallback to JSON if database fails
    const sourceFile = (IS_STAGING && fs.existsSync(DISCIPLINES_STAGING_FILE))
      ? DISCIPLINES_STAGING_FILE
      : DISCIPLINES_FILE;
    return loadJSON(sourceFile) || {};
  }
}

/**
 * Get the current state from database
 */
async function readCurrentState() {
  if (!USE_DATABASE) {
    const state = loadJSON(CURRENT_STATE_FILE);
    if (!state) {
      return {
        sprintIndex: null,
        account: null,
        producer: null,
        po: null,
        uiEng: null,
        beEng: null
      };
    }
    return state;
  }

  try {
    const state = await CurrentStateRepository.get();
    return state;
  } catch (error) {
    console.error('[readCurrentState] Database error:', error);
    // Fallback to JSON if database fails
    const state = loadJSON(CURRENT_STATE_FILE);
    return state || {
      sprintIndex: null,
      account: null,
      producer: null,
      po: null,
      uiEng: null,
      beEng: null
    };
  }
}

/**
 * Save the current state to database
 */
async function saveCurrentState(state) {
  // Validate no duplicate users in the state
  const users = [state.account, state.producer, state.po, state.uiEng, state.beEng]
    .filter(Boolean);
  const uniqueUsers = new Set(users);
  
  if (users.length !== uniqueUsers.size) {
    console.error('[saveCurrentState] WARNING: Duplicate users detected in state:', state);
    const userCounts = {};
    users.forEach(u => {
      userCounts[u] = (userCounts[u] || 0) + 1;
    });
    const duplicates = Object.entries(userCounts)
      .filter(([_, count]) => count > 1)
      .map(([userId, count]) => ({ userId, count }));
    console.error('[saveCurrentState] Duplicate users:', duplicates);
  }

  if (USE_DATABASE) {
    try {
      await CurrentStateRepository.update(state, 'dataUtils');
      
      // Dual-write to JSON if enabled
      if (DUAL_WRITE_MODE) {
        saveJSON(CURRENT_STATE_FILE, state);
      }
      
      return true;
    } catch (error) {
      console.error('[saveCurrentState] Database error:', error);
      // Fallback to JSON if database fails
      return saveJSON(CURRENT_STATE_FILE, state);
    }
  }

  return saveJSON(CURRENT_STATE_FILE, state);
}

/**
 * Read overrides from database
 */
async function readOverrides() {
  if (!USE_DATABASE) {
    return loadJSON(OVERRIDES_FILE) || [];
  }

  try {
    const overrides = await OverridesRepository.getAll();
    return overrides.map(override => ({
      sprintIndex: override.sprintIndex,
      role: override.role,
      originalSlackId: override.originalSlackId,
      newSlackId: override.newSlackId,
      newName: override.newName,
      requestedBy: override.requestedBy,
      approved: override.approved,
      approvedBy: override.approvedBy,
      approvalTimestamp: override.approvalTimestamp,
      timestamp: override.timestamp
    }));
  } catch (error) {
    console.error('[readOverrides] Database error:', error);
    // Fallback to JSON if database fails
    return loadJSON(OVERRIDES_FILE) || [];
  }
}

/**
 * Save overrides to database
 */
async function saveOverrides(overrides) {
  if (USE_DATABASE) {
    try {
      // Note: This is a simplified implementation
      // In practice, you'd want to handle individual override operations
      // rather than replacing the entire list
      console.warn('[saveOverrides] Bulk override save not fully implemented for database');
      
      // Dual-write to JSON if enabled
      if (DUAL_WRITE_MODE) {
        saveJSON(OVERRIDES_FILE, overrides);
      }
      
      return true;
    } catch (error) {
      console.error('[saveOverrides] Database error:', error);
      // Fallback to JSON if database fails
      return saveJSON(OVERRIDES_FILE, overrides);
    }
  }

  return saveJSON(OVERRIDES_FILE, overrides);
}

/**
 * Find the current sprint based on today's date (in Pacific Time)
 */
async function findCurrentSprint() {
  if (!USE_DATABASE) {
    const sprints = await readSprints();
    const today = getTodayPT();

    for (let i = 0; i < sprints.length; i++) {
      const { sprintName, startDate, endDate } = sprints[i];
      const sprintStart = parsePTDate(startDate);
      const sprintEnd = parsePTDate(endDate);
      
      if (
        (today.isAfter(sprintStart) || today.isSame(sprintStart, 'day')) &&
        (today.isBefore(sprintEnd) || today.isSame(sprintEnd, 'day'))
      ) {
        return { index: i, sprintName, startDate, endDate };
      }
    }
    return null;
  }

  try {
    const currentSprint = await SprintsRepository.getCurrentSprint();
    return currentSprint;
  } catch (error) {
    console.error('[findCurrentSprint] Database error:', error);
    // Fallback to JSON logic
    const sprints = await readSprints();
    const today = getTodayPT();

    for (let i = 0; i < sprints.length; i++) {
      const { sprintName, startDate, endDate } = sprints[i];
      const sprintStart = parsePTDate(startDate);
      const sprintEnd = parsePTDate(endDate);
      
      if (
        (today.isAfter(sprintStart) || today.isSame(sprintStart, 'day')) &&
        (today.isBefore(sprintEnd) || today.isSame(sprintEnd, 'day'))
      ) {
        return { index: i, sprintName, startDate, endDate };
      }
    }
    return null;
  }
}

/**
 * Find the next sprint after a given index
 */
async function findNextSprint(currentIndex) {
  if (!USE_DATABASE) {
    const sprints = await readSprints();
    if (currentIndex + 1 < sprints.length) {
      const next = sprints[currentIndex + 1];
      return { index: currentIndex + 1, ...next };
    }
    return null;
  }

  try {
    const nextSprint = await SprintsRepository.getNextSprint(currentIndex);
    return nextSprint;
  } catch (error) {
    console.error('[findNextSprint] Database error:', error);
    // Fallback to JSON logic
    const sprints = await readSprints();
    if (currentIndex + 1 < sprints.length) {
      const next = sprints[currentIndex + 1];
      return { index: currentIndex + 1, ...next };
    }
    return null;
  }
}

/**
 * Get user for a specific sprint and role, handling overrides
 */
async function getUserForSprintAndRole(sprintIndex, role, disciplines, overrides) {
  // Check for an approved override first
  const override = overrides.find(o =>
    o.sprintIndex === sprintIndex &&
    o.role === role &&
    o.approved === true
  );
  
  if (override) {
    console.log(`[getUserForSprintAndRole] Found override for ${role} sprint ${sprintIndex}: ${override.newSlackId}`);
    return override.newSlackId;
  }
  
  // Fall back to regular rotation
  const roleList = disciplines[role] || [];
  if (roleList.length === 0) {
    console.warn(`[getUserForSprintAndRole] No users in ${role} discipline`);
    const fallbacks = getFallbackUsers();
    return fallbacks[role] || null; // In staging, this will be null to avoid assigning real users
  }
  
  const userObj = roleList[sprintIndex % roleList.length];
  if (userObj && userObj.slackId) return userObj.slackId;
  const fallbacks = getFallbackUsers();
  return fallbacks[role] || null;
}

/**
 * Gets the user mapping for a specific sprint index
 * This is the single source of truth for who should be on call
 */
async function getSprintUsers(sprintIndex) {
  const disciplines = await readDisciplines();
  const overrides = await readOverrides();
  
  const FALLBACK_USERS = getFallbackUsers();

  const users = {
    account: await getUserForSprintAndRole(sprintIndex, "account", disciplines, overrides),
    producer: await getUserForSprintAndRole(sprintIndex, "producer", disciplines, overrides),
    po: await getUserForSprintAndRole(sprintIndex, "po", disciplines, overrides),
    uiEng: await getUserForSprintAndRole(sprintIndex, "uiEng", disciplines, overrides),
    beEng: await getUserForSprintAndRole(sprintIndex, "beEng", disciplines, overrides),
  };
  
  // Validate no duplicate users
  const userList = Object.values(users).filter(Boolean);
  const uniqueUsers = new Set(userList);
  
  if (userList.length !== uniqueUsers.size) {
    console.error('[getSprintUsers] WARNING: Duplicate users detected for sprint', sprintIndex);
    const userCounts = {};
    userList.forEach(u => {
      userCounts[u] = (userCounts[u] || 0) + 1;
    });
    const duplicates = Object.entries(userCounts)
      .filter(([_, count]) => count > 1);
    console.error('[getSprintUsers] Duplicates:', duplicates);
  }
  
  return users;
}

/**
 * Return environment-appropriate fallback user IDs per role.
 * In staging, disable real fallbacks by returning an empty map.
 */
function getFallbackUsers() {
  if (IS_STAGING) {
    return {}; // No real fallbacks in staging to avoid assigning production users
  }
  return {
    account:  "U70RLDSL9",  // Megan Miller
    producer: "U081U8XP1",  // Matt Mitchell
    po:       "UA4K27ELX",  // John Mark Lowry
    uiEng:    "U2SKVLZPF",  // Frank Tran
    beEng:    "UTSQ413T6",  // Lyle Stockmoe
  };
}

/**
 * Get upcoming sprints from today onward
 */
async function getUpcomingSprints() {
  const allSprints = await readSprints();
  const today = getTodayPT();
  
  return allSprints.filter(sprint => {
    const sprintStart = parsePTDate(sprint.startDate);
    return sprintStart.isAfter(today) || sprintStart.isSame(today, 'day');
  });
}

/**
 * Refresh the current state to ensure it matches calculated values
 * This ensures consistency between what's displayed and what's actual
 */
async function refreshCurrentState() {
  const current = await readCurrentState();
  if (current.sprintIndex === null) {
    console.log('[refreshCurrentState] No current sprint index set');
    return false;
  }
  
  // Get what the users SHOULD be based on calculation
  const calculatedUsers = await getSprintUsers(current.sprintIndex);
  
  // Check if they match current state
  let needsUpdate = false;
  const updates = [];
  
  ['account', 'producer', 'po', 'uiEng', 'beEng'].forEach(role => {
    if (current[role] !== calculatedUsers[role]) {
      needsUpdate = true;
      updates.push({
        role,
        from: current[role],
        to: calculatedUsers[role]
      });
    }
  });
  
  if (needsUpdate) {
    console.log('[refreshCurrentState] State needs update:', updates);
    const newState = {
      sprintIndex: current.sprintIndex,
      ...calculatedUsers
    };
    await saveCurrentState(newState);
    return true;
  }
  
  console.log('[refreshCurrentState] State is already up to date');
  return false;
}

module.exports = {
  // Core data operations
  loadJSON,
  saveJSON,
  readSprints,
  readDisciplines,
  readCurrentState,
  saveCurrentState,
  readOverrides,
  saveOverrides,
  
  // Date utilities
  formatPTDate,
  parsePTDate,
  getTodayPT,
  
  // Sprint-related functions
  findCurrentSprint,
  findNextSprint,
  getSprintUsers,
  getUpcomingSprints,
  refreshCurrentState,
  
  // File path constants
  CURRENT_STATE_FILE,
  SPRINTS_FILE,
  DISCIPLINES_FILE,
  OVERRIDES_FILE
};