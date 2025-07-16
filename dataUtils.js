/**
 * dataUtils.js
 * Centralized data operations for the triage rotation app.
 * Updated with validation and consistency improvements
 */
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

// Define file paths for persisted JSON data
const CURRENT_STATE_FILE = path.join(__dirname, "currentState.json");
const SPRINTS_FILE = path.join(__dirname, "sprints.json");
const DISCIPLINES_FILE = path.join(__dirname, "disciplines.json");
const OVERRIDES_FILE = path.join(__dirname, "overrides.json");

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
 * Generic function to load JSON from a file
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
 * Generic function to save JSON to a file
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
 * Get all sprints from sprints.json
 */
function readSprints() {
  const sprints = loadJSON(SPRINTS_FILE);
  if (!Array.isArray(sprints)) {
    console.error('[readSprints] Invalid sprints data: not an array');
    return [];
  }
  return sprints;
}

/**
 * Get all disciplines from disciplines.json with validation
 */
function readDisciplines() {
  const disciplines = loadJSON(DISCIPLINES_FILE) || {};
  
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
    // You might want to notify admins here
  }
  
  return disciplines;
}

/**
 * Get the current state from currentState.json
 */
function readCurrentState() {
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

/**
 * Save the current state to currentState.json
 */
function saveCurrentState(state) {
  // Validate no duplicate users in the state
  const users = [state.account, state.producer, state.po, state.uiEng, state.beEng]
    .filter(Boolean);
  const uniqueUsers = new Set(users);
  
  if (users.length !== uniqueUsers.size) {
    console.error('[saveCurrentState] WARNING: Duplicate users detected in state:', state);
    // Find the duplicates
    const userCounts = {};
    users.forEach(u => {
      userCounts[u] = (userCounts[u] || 0) + 1;
    });
    const duplicates = Object.entries(userCounts)
      .filter(([_, count]) => count > 1)
      .map(([userId, count]) => ({ userId, count }));
    console.error('[saveCurrentState] Duplicate users:', duplicates);
  }
  
  return saveJSON(CURRENT_STATE_FILE, state);
}

/**
 * Read overrides from overrides.json
 */
function readOverrides() {
  return loadJSON(OVERRIDES_FILE) || [];
}

/**
 * Save overrides to overrides.json
 */
function saveOverrides(overrides) {
  return saveJSON(OVERRIDES_FILE, overrides);
}

/**
 * Find the current sprint based on today's date (in Pacific Time)
 */
function findCurrentSprint() {
  const sprints = readSprints();
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

/**
 * Find the next sprint after a given index
 */
function findNextSprint(currentIndex) {
  const sprints = readSprints();
  if (currentIndex + 1 < sprints.length) {
    const next = sprints[currentIndex + 1];
    return { index: currentIndex + 1, ...next };
  }
  return null;
}

/**
 * Get user for a specific sprint and role, handling overrides
 */
function getUserForSprintAndRole(sprintIndex, role, disciplines, overrides) {
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
    console.warn(`[getUserForSprintAndRole] No users in ${role} discipline, using fallback`);
    return FALLBACK_USERS[role] || null;
  }
  
  const userObj = roleList[sprintIndex % roleList.length];
  return userObj ? userObj.slackId : FALLBACK_USERS[role];
}

/**
 * Gets the user mapping for a specific sprint index
 * This is the single source of truth for who should be on call
 */
function getSprintUsers(sprintIndex) {
  const disciplines = readDisciplines();
  const overrides = readOverrides();
  
  const FALLBACK_USERS = {
    account:  "U70RLDSL9",  // Megan Miller
    producer: "U081U8XP1",  // Matt Mitchell
    po:       "UA4K27ELX",  // John Mark Lowry
    uiEng:    "U2SKVLZPF",  // Frank Tran
    beEng:    "UTSQ413T6",  // Lyle Stockmoe
  };

  const users = {
    account: getUserForSprintAndRole(sprintIndex, "account", disciplines, overrides),
    producer: getUserForSprintAndRole(sprintIndex, "producer", disciplines, overrides),
    po: getUserForSprintAndRole(sprintIndex, "po", disciplines, overrides),
    uiEng: getUserForSprintAndRole(sprintIndex, "uiEng", disciplines, overrides),
    beEng: getUserForSprintAndRole(sprintIndex, "beEng", disciplines, overrides),
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
 * Get upcoming sprints from today onward
 */
function getUpcomingSprints() {
  const allSprints = readSprints();
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
function refreshCurrentState() {
  const current = readCurrentState();
  if (current.sprintIndex === null) {
    console.log('[refreshCurrentState] No current sprint index set');
    return false;
  }
  
  // Get what the users SHOULD be based on calculation
  const calculatedUsers = getSprintUsers(current.sprintIndex);
  
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
    saveCurrentState(newState);
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