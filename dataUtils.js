/**
 * dataUtils.js
 * Centralized data operations for the triage rotation app.
 * This replaces the functions previously in googleSheets.js with local JSON file operations.
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
 * This standardizes date formatting across the application
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {string} formatStr - Output format string (default: 'ddd MM/DD/YYYY')
 * @returns {string} Formatted date string
 */
function formatPTDate(dateStr, formatStr = 'ddd MM/DD/YYYY') {
  // Ensure consistent handling by explicitly setting date to midnight PT
  return dayjs.tz(`${dateStr}T00:00:00`, "America/Los_Angeles").format(formatStr);
}

/**
 * Parse a date string consistently as midnight PT
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {object} Dayjs object set to midnight PT on specified date
 */
function parsePTDate(dateStr) {
  return dayjs.tz(`${dateStr}T00:00:00`, "America/Los_Angeles");
}

/**
 * Get today's date in Pacific Time, at start of day
 * @returns {object} Dayjs object for today at midnight PT
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
 * Returns array of sprint objects with sprintName, startDate, endDate
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
 * Get all disciplines from disciplines.json
 * Returns an object with role keys and arrays of user objects
 */
function readDisciplines() {
  return loadJSON(DISCIPLINES_FILE) || {};
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
 * Returns { index, sprintName, startDate, endDate } or null if none found
 */
function findCurrentSprint() {
  const sprints = readSprints();
  // Use Pacific Time explicitly for the server's "today"
  const today = getTodayPT();

  for (let i = 0; i < sprints.length; i++) {
    const { sprintName, startDate, endDate } = sprints[i];
    // Convert sprint dates to Pacific Time for comparison
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
 * Gets the user mapping for a specific sprint index
 * Handles overrides if they exist
 */
function getSprintUsers(sprintIndex) {
  const disciplines = readDisciplines();
  const overrides = readOverrides();
  
  // Define fallback users if needed
  const FALLBACK_USERS = {
    account:  "U70RLDSL9",  // Megan Miller - fallback for "account"
    producer: "U081U8XP1",  // Matt Mitchell - fallback for "producer"
    po:       "UA4K27ELX",  // John Mark Lowry - fallback for "po"
    uiEng:    "U2SKVLZPF",  // Frank Tran - fallback for "uiEng"
    beEng:    "UTSQ413T6",  // Lyle Stockmoe - fallback for "beEng"
  };

  function pickUser(list, role) {
    // Check for an approved override for this sprint and role.
    const override = overrides.find(o =>
      o.sprintIndex === sprintIndex &&
      o.role === role &&
      o.approved === true
    );
    if (override) {
      return override.newSlackId;
    }
    // Fallback to default rotation.
    if (!list || list.length === 0) {
      return FALLBACK_USERS[role] || "UA4K27ELX";
    }
    const userObj = list[sprintIndex % list.length];
    return (userObj && userObj.slackId) ? userObj.slackId : FALLBACK_USERS[role];
  }

  return {
    account: pickUser(disciplines.account, "account"),
    producer: pickUser(disciplines.producer, "producer"),
    po: pickUser(disciplines.po, "po"),
    uiEng: pickUser(disciplines.uiEng, "uiEng"),
    beEng: pickUser(disciplines.beEng, "beEng"),
  };
}

/**
 * Get upcoming sprints from today onward.
 */
function getUpcomingSprints() {
  const allSprints = readSprints();
  const today = getTodayPT();
  
  // Filter sprints with startDate >= today
  return allSprints.filter(sprint => {
    const sprintStart = parsePTDate(sprint.startDate);
    return sprintStart.isAfter(today) || sprintStart.isSame(today, 'day');
  });
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
  
  // File path constants
  CURRENT_STATE_FILE,
  SPRINTS_FILE,
  DISCIPLINES_FILE,
  OVERRIDES_FILE
};