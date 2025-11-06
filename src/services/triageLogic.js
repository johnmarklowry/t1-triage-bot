/********************************
 * triageLogic.js
 * Updated with deduplication and validation
 ********************************/
const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

// Import functions and constants from dataUtils.js
const {
  readCurrentState,
  saveCurrentState,
  readOverrides,
  getSprintUsers: dataUtilsGetSprintUsers,
  findCurrentSprint: dataUtilsFindCurrentSprint,
  findNextSprint: dataUtilsFindNextSprint,
  formatPTDate,
  parsePTDate,
  getTodayPT,
  refreshCurrentState
} = require("./dataUtils");

const { notifyUser, notifyAdmins, updateOnCallUserGroup, updateChannelTopic } = require("../utils/slackNotifier");

// Define discipline-specific fallback IDs (if a discipline list is empty)
const FALLBACK_USERS = {
  account:  "U70RLDSL9",  // Megan Miller - fallback for "account"
  producer: "U081U8XP1",  // Matt Mitchell - fallback for "producer"
  po:       "UA4K27ELX",  // John Mark Lowry - fallback for "po"
  uiEng:    "U2SKVLZPF",  // Frank Tran - fallback for "uiEng"
  beEng:    "UTSQ413T6",  // Lyle Stockmoe - fallback for "beEng"
};

// Initialize currentState from file at startup
let currentState = readCurrentState();
console.log("[INIT] Loaded current state:", currentState);

/* ======================================
   Utility Functions: Sprints & Users
   ====================================== */

/**
 * findCurrentSprint: determines which sprint is active (today).
 */
async function findCurrentSprint() {
  return dataUtilsFindCurrentSprint();
}

/**
 * findNextSprint: returns the next sprint (index+1) if it exists.
 */
async function findNextSprint(currentIndex) {
  return dataUtilsFindNextSprint(currentIndex);
}

/**
 * loadOverrides: Reads overrides from overrides.json.
 */
function loadOverrides() {
  return readOverrides();
}

/**
 * getSprintUsers: For a given sprintIndex, returns the Slack user for each discipline.
 */
async function getSprintUsers(sprintIndex) {
  return dataUtilsGetSprintUsers(sprintIndex);
}

/**
 * rolesToArray: converts a roles object to an array of unique Slack user IDs.
 * Now includes deduplication to prevent multiple notifications
 */
function rolesToArray(roles) {
  const userIds = Object.values(roles).filter(Boolean);
  // Remove duplicates
  return [...new Set(userIds)];
}

/**
 * diffRoles: compares old vs. new roles.
 * Returns an array of { role, oldUser, newUser } for roles that have changed.
 */
function diffRoles(oldRoles, newRoles) {
  const changes = [];
  for (let role of ["account", "producer", "po", "uiEng", "beEng"]) {
    if (oldRoles[role] !== newRoles[role]) {
      changes.push({
        role,
        oldUser: oldRoles[role],
        newUser: newRoles[role],
      });
    }
  }
  return changes;
}

/**
 * dedupedNotifyUsers: Send notifications to a list of users, but deduplicate first
 */
async function dedupedNotifyUsers(userIds, message) {
  const uniqueUsers = [...new Set(userIds.filter(Boolean))];
  console.log(`[dedupedNotifyUsers] Notifying ${uniqueUsers.length} unique users`);
  
  for (let userId of uniqueUsers) {
    await notifyUser(userId, message);
  }
}

/* ===============================
   5PM LOGIC
   =============================== */

/**
 * run5pmCheck:
 *  - If today (in PT) is the same *day* as sprint.endDate (in PT),
 *    send a "heads up" message to old roles and new roles for tomorrow's shift.
 */
async function run5pmCheck() {
  try {
    const currentSprint = await findCurrentSprint();
    if (!currentSprint) {
      console.log("[5PM] No current sprint found for today.");
      return;
    }

    // Interpret today's date in Pacific Time
    const todayPT = getTodayPT();

    // Also interpret the sprint's endDate in Pacific Time
    const sprintEndPT = parsePTDate(currentSprint.endDate);

    // If the current PT date is exactly the same calendar day as the sprint's end date
    if (todayPT.isSame(sprintEndPT, "day")) {
      const nextSprint = await findNextSprint(currentSprint.index);
      if (!nextSprint) {
        console.log("[5PM] No next sprint found; schedule might end here.");
        return;
      }

      const oldRoles = await getSprintUsers(currentSprint.index);
      const newRoles = await getSprintUsers(nextSprint.index);

      // Notify old roles that their shift ends tomorrow (deduplicated)
      await dedupedNotifyUsers(
        rolesToArray(oldRoles), 
        "Heads up: your #lcom-bug-triage shift ends tomorrow at 8AM PT."
      );
      
      // Notify new roles they start tomorrow (deduplicated)
      await dedupedNotifyUsers(
        rolesToArray(newRoles),
        "You start #lcom-bug-triage duty tomorrow at 8AM PT. Good luck!"
      );
    }
  } catch (err) {
    console.error("[5PM Check] Error:", err);
    await notifyAdmins(`[5PM Check] Error: ${err.message}`);
  }
}

/**
 * run8amCheck:
 *  - If sprint index changed, finalize old roles & enable new roles.
 *  - If same sprint, check for mid-cycle changes.
 */
async function run8amCheck() {
  try {
    console.log("[8AM] Starting 8AM check");
    
    // First, refresh current state to ensure consistency
    const stateUpdated = refreshCurrentState();
    if (stateUpdated) {
      console.log("[8AM] State was refreshed due to inconsistencies");
      // Reload the current state after refresh
      currentState = readCurrentState();
    }
    
    const currentSprint = await findCurrentSprint();
    console.log("[8AM] Current sprint:", currentSprint ? 
                 `Index ${currentSprint.index} (${currentSprint.sprintName})` : 
                 "No sprint found");
    
    if (!currentSprint) {
      console.log("[8AM] No current sprint found for today.");
      return;
    }

    // Track now in PT for logging
    const nowPT = dayjs().tz("America/Los_Angeles");
    console.log(`[8AM] Running 8AM check at ${nowPT.format('YYYY-MM-DD HH:mm:ss')} PT`);

    const oldIndex = currentState.sprintIndex;
    console.log(`[8AM] Current state sprint index: ${oldIndex}`);
    console.log(`[8AM] Found current sprint index: ${currentSprint.index}`);
    console.log(`[8AM] Sprint transition check: ${currentSprint.index !== oldIndex ? "TRANSITION NEEDED" : "NO TRANSITION NEEDED"}`);

    // If the newly found sprint index is different from what we had in state,
    // we switch over to the new sprint's roles.
    if (currentSprint.index !== oldIndex) {
      console.log(`[8AM] Sprint transition detected: ${oldIndex} -> ${currentSprint.index}`);
      
      const oldRoles = {
        account: currentState.account,
        producer: currentState.producer,
        po: currentState.po,
        uiEng: currentState.uiEng,
        beEng: currentState.beEng,
      };
      const newRoles = await getSprintUsers(currentSprint.index);

      // Notify old roles (deduplicated)
      await dedupedNotifyUsers(
        rolesToArray(oldRoles),
        "Your #lcom-bug-triage rotation is now complete. Thank you!"
      );
      
      // Notify new roles (deduplicated)
      await dedupedNotifyUsers(
        rolesToArray(newRoles),
        "You are now on #lcom-bug-triage duty. Good luck!"
      );

      // Update Slack group and topic with deduplicated user list
      const newUserArray = rolesToArray(newRoles);
      await updateOnCallUserGroup(newUserArray);
      await updateChannelTopic(newUserArray);

      // Update currentState and persist
      currentState = {
        sprintIndex: currentSprint.index,
        ...newRoles,
      };
      saveCurrentState(currentState);

      console.log(`[8AM] Transitioned from sprint ${oldIndex} to ${currentSprint.index}.`);
    } else {
      console.log(`[8AM] No sprint transition: staying with sprint index ${oldIndex}`);
      
      // If we're in the same sprint, check if any roles changed mid-cycle (overrides, etc.)
      const newRoles = await getSprintUsers(oldIndex);
      const changes = diffRoles(currentState, newRoles);

      if (changes.length > 0) {
        console.log("[8AM] Mid-cycle changes detected:", changes);
        
        // Collect unique users who need to be notified
        const usersToRemove = new Set();
        const usersToAdd = new Set();
        
        for (let c of changes) {
          if (c.oldUser) usersToRemove.add(c.oldUser);
          if (c.newUser) usersToAdd.add(c.newUser);
        }
        
        // Remove users who are both being removed and added (role swap)
        for (let user of usersToAdd) {
          if (usersToRemove.has(user)) {
            usersToRemove.delete(user);
            usersToAdd.delete(user);
            // Notify them about role change
            await notifyUser(user, `Your triage role has changed mid-sprint.`);
          }
        }
        
        // Notify removed users
        for (let user of usersToRemove) {
          await notifyUser(user, `You have been removed from triage duty mid-sprint.`);
        }
        
        // Notify added users
        for (let user of usersToAdd) {
          await notifyUser(user, `You have been added to triage duty mid-sprint.`);
        }

        // Update Slack group and topic with deduplicated user list
        const newUserArray = rolesToArray(newRoles);
        await updateOnCallUserGroup(newUserArray);
        await updateChannelTopic(newUserArray);

        // Update currentState and persist
        currentState = {
          sprintIndex: oldIndex,
          ...newRoles,
        };
        saveCurrentState(currentState);
      } else {
        console.log("[8AM] No mid-cycle changes detected.");
      }
    }
  } catch (err) {
    console.error("[8AM Check] Error:", err);
    await notifyAdmins(`[8AM Check] Error: ${err.message}`);
  }
}

/* =================================
   Helper: Force a given sprintIndex
   (manual override if needed)
   ================================= */
async function setCurrentSprintState(sprintIndex) {
  try {
    const roles = await getSprintUsers(sprintIndex);
    currentState = {
      sprintIndex,
      ...roles,
    };
    
    // Update with deduplicated user list
    const userArray = rolesToArray(roles);
    await updateOnCallUserGroup(userArray);
    await updateChannelTopic(userArray);
    
    saveCurrentState(currentState);
    console.log(`[setCurrentSprintState] State set for sprint index ${sprintIndex}.`, currentState);
  } catch (err) {
    console.error("[setCurrentSprintState] Error:", err);
    await notifyAdmins(`[setCurrentSprintState] Error: ${err.message}`);
  }
}

/**
 * runImmediateRotation():
 *  1) Finds the current sprint based on today's date.
 *  2) If old roles exist, notifies them they're off.
 *  3) Sets new roles, notifies them with date range.
 *  4) Updates the Slack user group and channel topic, then saves state.
 */
async function runImmediateRotation() {
  try {
    const currentSprint = await findCurrentSprint();
    if (!currentSprint) {
      console.log("[Immediate Rotation] No current sprint found for today.");
      return;
    }

    const oldRoles = {
      account: currentState.account,
      producer: currentState.producer,
      po: currentState.po,
      uiEng: currentState.uiEng,
      beEng: currentState.beEng,
    };
    const hadOldState = currentState.sprintIndex !== null;
    const newRoles = await getSprintUsers(currentSprint.index);

    if (hadOldState) {
      // Notify old users (deduplicated)
      await dedupedNotifyUsers(
        rolesToArray(oldRoles),
        "You have been taken off triage duty. Thank you!"
      );
    }

    // Format dates consistently
    const startStr = formatPTDate(currentSprint.startDate, 'MM/DD/YYYY');
    const endStr = formatPTDate(currentSprint.endDate, 'MM/DD/YYYY');
    
    // Notify new users (deduplicated)
    await dedupedNotifyUsers(
      rolesToArray(newRoles),
      `You are now on call for #lcom-bug-triage from ${startStr} to ${endStr}. Good luck!`
    );
    
    // Update with deduplicated user list
    const newUserArray = rolesToArray(newRoles);
    await updateOnCallUserGroup(newUserArray);
    await updateChannelTopic(newUserArray);

    currentState = {
      sprintIndex: currentSprint.index,
      ...newRoles,
    };
    saveCurrentState(currentState);
    console.log("[Immediate Rotation] Updated to sprint index:", currentSprint.index, currentState);
  } catch (err) {
    console.error("[Immediate Rotation] Error:", err);
    await notifyAdmins(`[Immediate Rotation] Error: ${err.message}`);
  }
}

/**
 * Force a sprint transition for testing purposes.
 * This simulates what happens during a sprint transition at 8am.
 * @param {number} newSprintIndex - The new sprint index to transition to
 * @param {boolean} mockNotifications - Whether to mock notifications (default: true)
 * @returns {Object} - Results of the transition
 */
async function forceSprintTransition(newSprintIndex, mockNotifications = true) {
  console.log(`[forceSprintTransition] Starting: oldIndex=${currentState.sprintIndex}, newIndex=${newSprintIndex}`);
  
  // Store original notification functions if mocking
  let originalNotifyUser, originalNotifyAdmins, originalUpdateGroup, originalUpdateTopic;
  const notifications = [];
  
  if (mockNotifications) {
    originalNotifyUser = require('../utils/slackNotifier').notifyUser;
    originalNotifyAdmins = require('../utils/slackNotifier').notifyAdmins;
    originalUpdateGroup = require('../utils/slackNotifier').updateOnCallUserGroup;
    originalUpdateTopic = require('../utils/slackNotifier').updateChannelTopic;
    
    // Replace with mock functions
    require('../utils/slackNotifier').notifyUser = (userId, text) => {
      notifications.push({ type: 'user', userId, text });
      console.log(`[MOCK] Notify user ${userId}: ${text}`);
      return Promise.resolve();
    };
    
    require('../utils/slackNotifier').notifyAdmins = (text) => {
      notifications.push({ type: 'admin', text });
      console.log(`[MOCK] Notify admins: ${text}`);
      return Promise.resolve();
    };
    
    require('../utils/slackNotifier').updateOnCallUserGroup = (userIds) => {
      notifications.push({ type: 'group', userIds });
      console.log(`[MOCK] Update user group with: ${userIds.join(', ')}`);
      return Promise.resolve();
    };
    
    require('../utils/slackNotifier').updateChannelTopic = (userIds) => {
      notifications.push({ type: 'topic', userIds });
      console.log(`[MOCK] Update channel topic with: ${userIds}`);
      return Promise.resolve();
    };
  }
  
  try {
    const oldIndex = currentState.sprintIndex;
    const oldRoles = {
      account: currentState.account,
      producer: currentState.producer,
      po: currentState.po,
      uiEng: currentState.uiEng,
      beEng: currentState.beEng,
    };
    
    // Get the new sprint users
    const newRoles = await getSprintUsers(newSprintIndex);

    // Notify old roles (deduplicated)
    await dedupedNotifyUsers(
      rolesToArray(oldRoles),
      "Your triage rotation is now complete. Thank you!"
    );
    
    // Notify new roles (deduplicated)
    await dedupedNotifyUsers(
      rolesToArray(newRoles),
      "You are now on triage duty. Good luck!"
    );

    // Update Slack group and topic with deduplicated user list
    const newUserArray = rolesToArray(newRoles);
    await require('../utils/slackNotifier').updateOnCallUserGroup(newUserArray);
    await require('../utils/slackNotifier').updateChannelTopic(newUserArray);
    
    // Update currentState and persist
    currentState = {
      sprintIndex: newSprintIndex,
      ...newRoles,
    };
    saveCurrentState(currentState);
    
    console.log(`[forceSprintTransition] Completed transition from ${oldIndex} to ${newSprintIndex}`);
    
    return {
      success: true,
      oldIndex, 
      newIndex: newSprintIndex,
      oldRoles,
      newRoles,
      notifications: mockNotifications ? notifications : null
    };
  } catch (err) {
    console.error("[forceSprintTransition] Error:", err);
    return {
      success: false,
      error: err.message,
      notifications: mockNotifications ? notifications : null
    };
  } finally {
    // Restore original notification functions if mocking
    if (mockNotifications) {
      require('../utils/slackNotifier').notifyUser = originalNotifyUser;
      require('../utils/slackNotifier').notifyAdmins = originalNotifyAdmins;
      require('../utils/slackNotifier').updateOnCallUserGroup = originalUpdateGroup;
      require('../utils/slackNotifier').updateChannelTopic = originalUpdateTopic;
    }
  }
}

/**
 * getCurrentState: returns the in-memory currentState.
 */
function getCurrentState() {
  return currentState;
}

/* =========================
   Exported Functions
   ========================= */
module.exports = {
  run5pmCheck,
  run8amCheck,
  runImmediateRotation,
  setCurrentSprintState,
  getCurrentState,
  forceSprintTransition
};