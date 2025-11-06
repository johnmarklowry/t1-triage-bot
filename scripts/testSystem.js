/**
 * testSystem.js
 * A testing system for triage rotation logic that allows simulation
 * of different dates and times without affecting real users.
 */
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const fs = require("fs");
const path = require("path");

dayjs.extend(utc);
dayjs.extend(timezone);

// Import functions and constants from dataUtils
const dataUtils = require("../src/services/dataUtils");
const { CURRENT_STATE_FILE, readCurrentState, saveCurrentState } = dataUtils;

// Define path for test logs
const TEST_LOG_FILE = path.join(__dirname, "test_simulation_log.txt");

// Import the functions we need to simulate
const triageLogic = require("../src/services/triageLogic");

// Import notification functions that we'll mock
const slackNotifier = require("../src/utils/slackNotifier");

// Store original functions for later restoration
const originalFunctions = {
  // Data utilities
  getTodayPT: dataUtils.getTodayPT,
  formatPTDate: dataUtils.formatPTDate,
  parsePTDate: dataUtils.parsePTDate,
  findCurrentSprint: dataUtils.findCurrentSprint,

  // Notification functions
  notifyUser: slackNotifier.notifyUser,
  notifyAdmins: slackNotifier.notifyAdmins,
  updateOnCallUserGroup: slackNotifier.updateOnCallUserGroup,
  updateChannelTopic: slackNotifier.updateChannelTopic,
};

// Storage for log entries
let logEntries = [];

/**
 * Mock notification functions that log instead of sending real notifications
 */
function mockNotifyUser(userId, text) {
  const logMsg = `[MOCK NOTIFICATION] To user ${userId}: ${text}`;
  console.log(logMsg);
  logEntries.push(logMsg);
  return Promise.resolve();
}

function mockNotifyAdmins(text) {
  const logMsg = `[MOCK NOTIFICATION] To admins: ${text}`;
  console.log(logMsg);
  logEntries.push(logMsg);
  return Promise.resolve();
}

function mockUpdateOnCallUserGroup(userIdsArray) {
  const logMsg = `[MOCK GROUP UPDATE] User group would update to: ${userIdsArray.join(
    ", "
  )}`;
  console.log(logMsg);
  logEntries.push(logMsg);
  return Promise.resolve();
}

function mockUpdateChannelTopic(newTopic) {
  const logMsg = `[MOCK TOPIC UPDATE] Channel topic would update to: ${newTopic}`;
  console.log(logMsg);
  logEntries.push(logMsg);
  return Promise.resolve();
}

/**
 * Create mock date utilities for a specific date
 */
function createMockDateUtils(simulatedDate) {
  // Parse the simulated date
  const targetDate = dayjs.tz(simulatedDate, "America/Los_Angeles");

  return {
    // Mock getTodayPT to return our simulated date
    mockGetTodayPT: () => {
      console.log(
        `[MOCK] Returning simulated date: ${targetDate.format(
          "YYYY-MM-DD HH:mm:ss Z"
        )}`
      );
      return targetDate.startOf("day");
    },

    // Keep the other date utilities the same
    mockParsePTDate: (dateStr) => {
      return originalFunctions.parsePTDate(dateStr);
    },

    mockFormatPTDate: (dateStr, formatStr = "ddd MM/DD/YYYY") => {
      return originalFunctions.formatPTDate(dateStr, formatStr);
    },

    // Override findCurrentSprint to use our mocked getTodayPT
    mockFindCurrentSprint: () => {
      const sprints = dataUtils.readSprints();
      const today = targetDate.startOf("day");
      console.log(
        `[MOCK] Finding sprint for mocked date: ${today.format("YYYY-MM-DD")}`
      );

      for (let i = 0; i < sprints.length; i++) {
        const { sprintName, startDate, endDate } = sprints[i];
        const sprintStart = dataUtils.parsePTDate(startDate);
        const sprintEnd = dataUtils.parsePTDate(endDate);

        const afterStart =
          today.isAfter(sprintStart) || today.isSame(sprintStart, "day");
        const beforeEnd =
          today.isBefore(sprintEnd) || today.isSame(sprintEnd, "day");

        console.log(
          `[MOCK] Testing sprint ${i} (${sprintName}): afterStart=${afterStart}, beforeEnd=${beforeEnd}`
        );

        if (afterStart && beforeEnd) {
          console.log(`[MOCK] Found matching sprint: ${i} (${sprintName})`);
          return { index: i, sprintName, startDate, endDate };
        }
      }

      console.log(
        `[MOCK] No matching sprint found for ${today.format("YYYY-MM-DD")}`
      );
      return null;
    },
  };
}

/**
 * Apply mocks by directly replacing functions
 */
function applyMocks(mockDateUtils, useRealNotifications = false) {
  // Replace date utilities
  dataUtils.getTodayPT = mockDateUtils.mockGetTodayPT;
  dataUtils.findCurrentSprint = mockDateUtils.mockFindCurrentSprint;

  // Replace notification functions unless real notifications are requested
  if (!useRealNotifications) {
    slackNotifier.notifyUser = mockNotifyUser;
    slackNotifier.notifyAdmins = mockNotifyAdmins;
    slackNotifier.updateOnCallUserGroup = mockUpdateOnCallUserGroup;
    slackNotifier.updateChannelTopic = mockUpdateChannelTopic;
  }
}

/**
 * Restore original functions
 */
function restoreOriginals() {
  // Restore data utilities
  dataUtils.getTodayPT = originalFunctions.getTodayPT;
  dataUtils.findCurrentSprint = originalFunctions.findCurrentSprint;

  // Restore notification functions
  slackNotifier.notifyUser = originalFunctions.notifyUser;
  slackNotifier.notifyAdmins = originalFunctions.notifyAdmins;
  slackNotifier.updateOnCallUserGroup = originalFunctions.updateOnCallUserGroup;
  slackNotifier.updateChannelTopic = originalFunctions.updateChannelTopic;
}

/**
 * Simulates a 5PM or 8AM check on a specific date without sending real notifications.
 * @param {string} dateStr - The date to simulate (YYYY-MM-DD)
 * @param {string} timeCheck - Either '5pm' or '8am'
 * @param {boolean} createBackup - Whether to back up currentState.json before testing
 * @param {boolean} useRealNotifications - Whether to send real notifications (default: false)
 * @returns {Object} - Log of operations that would have been performed
 */
async function simulateTimeCheck(
  dateStr,
  timeCheck = "8am",
  createBackup = true,
  useRealNotifications = false
) {
  // Reset log entries
  logEntries = [];
  logEntries.push(
    `[SIMULATION] ${timeCheck.toUpperCase()} check for ${dateStr}`
  );
  console.log(
    `\n[SIMULATION] Starting ${timeCheck.toUpperCase()} check for ${dateStr}`
  );

  // Back up the current state if requested
  if (createBackup) {
    const backupFile = CURRENT_STATE_FILE + ".bak";
    if (fs.existsSync(CURRENT_STATE_FILE)) {
      fs.copyFileSync(CURRENT_STATE_FILE, backupFile);
      logEntries.push(`Backed up ${CURRENT_STATE_FILE} to ${backupFile}`);
    }
  }

  // Create a simulated date based on the provided dateStr
  const simulatedDate = dayjs(dateStr).tz("America/Los_Angeles");
  if (!simulatedDate.isValid()) {
    throw new Error(`Invalid date: ${dateStr}`);
  }

  // For 5PM, we simulate the day at 5PM
  // For 8AM, we simulate the day at 8AM
  let targetTime;
  if (timeCheck.toLowerCase() === "5pm") {
    targetTime = simulatedDate.hour(17).minute(0).second(0).format();
  } else {
    targetTime = simulatedDate.hour(8).minute(0).second(0).format();
  }

  // Create mock date utilities
  const mockDateUtils = createMockDateUtils(targetTime);

  // Load the original state (for comparison later)
  const originalState = readCurrentState();
  logEntries.push(`Original state: sprintIndex = ${originalState.sprintIndex}`);

  try {
    // Apply mocks
    applyMocks(mockDateUtils, useRealNotifications);

    // Check what sprint would be current based on our simulated date
    const currentSprint = dataUtils.findCurrentSprint();
    if (!currentSprint) {
      logEntries.push(`No current sprint found for ${dateStr}`);
    } else {
      logEntries.push(
        `Current sprint: ${currentSprint.sprintName} (index: ${currentSprint.index})`
      );
    }

    // Run the appropriate check
    if (timeCheck.toLowerCase() === "5pm") {
      logEntries.push(`[SIMULATION] Running 5PM check for ${dateStr}`);
      await triageLogic.run5pmCheck();
    } else {
      logEntries.push(`[SIMULATION] Running 8AM check for ${dateStr}`);
      await triageLogic.run8amCheck();
    }

    // Check for state changes
    const newState = readCurrentState();
    if (newState.sprintIndex !== originalState.sprintIndex) {
      logEntries.push(
        `STATE CHANGED: sprintIndex from ${originalState.sprintIndex} to ${newState.sprintIndex}`
      );

      // Log the roles that changed
      ["account", "producer", "po", "uiEng", "beEng"].forEach((role) => {
        if (newState[role] !== originalState[role]) {
          logEntries.push(
            `ROLE CHANGED: ${role} from ${originalState[role] || "none"} to ${
              newState[role]
            }`
          );
        }
      });
    } else {
      logEntries.push(
        `State remained at sprintIndex = ${newState.sprintIndex}`
      );

      // Check if any roles changed even though the sprint index didn't
      let roleChanges = false;
      ["account", "producer", "po", "uiEng", "beEng"].forEach((role) => {
        if (newState[role] !== originalState[role]) {
          roleChanges = true;
          logEntries.push(
            `ROLE CHANGED: ${role} from ${originalState[role] || "none"} to ${
              newState[role]
            }`
          );
        }
      });

      if (!roleChanges) {
        logEntries.push("No role changes detected");
      }
    }
  } finally {
    // Always restore original functions
    restoreOriginals();
  }

  // Write log entries to a file
  const timestamp = dayjs().format("YYYY-MM-DD_HH-mm-ss");
  const logFile = TEST_LOG_FILE.replace(".txt", `_${timestamp}.txt`);
  fs.writeFileSync(logFile, logEntries.join("\n"), "utf8");

  console.log(`[SIMULATION] Completed. Log written to ${logFile}`);
  return {
    logEntries,
    logFile,
  };
}

// Add this at the top of testSystem.js
function testFindSprintForDate(dateStr) {
  const testDate = dayjs.tz(`${dateStr}T12:00:00`, "America/Los_Angeles");
  const sprints = dataUtils.readSprints();

  console.log(
    `Testing which sprint contains date: ${testDate.format("YYYY-MM-DD")}`
  );

  for (let i = 0; i < sprints.length; i++) {
    const { sprintName, startDate, endDate } = sprints[i];
    const sprintStart = dayjs.tz(
      `${startDate}T00:00:00`,
      "America/Los_Angeles"
    );
    const sprintEnd = dayjs.tz(`${endDate}T23:59:59`, "America/Los_Angeles");

    const afterStart =
      testDate.isAfter(sprintStart) || testDate.isSame(sprintStart, "day");
    const beforeEnd =
      testDate.isBefore(sprintEnd) || testDate.isSame(sprintEnd, "day");

    console.log(`Sprint ${i} (${sprintName}): ${startDate} to ${endDate}`);
    console.log(`  - After start: ${afterStart}`);
    console.log(`  - Before end: ${beforeEnd}`);
    console.log(`  - Match: ${afterStart && beforeEnd}`);

    if (afterStart && beforeEnd) {
      console.log(`Found match: Sprint ${i} (${sprintName})`);
      return { index: i, name: sprintName, startDate, endDate };
    }
  }

  console.log("No matching sprint found");
  return null;
}

/**
 * Add routes to express to expose test functionality
 */
function addTestRoutes(router) {
  // Simulate a time check for a specific date
  router.get("/simulate", async (req, res) => {
    try {
      const date = req.query.date || dayjs().format("YYYY-MM-DD");
      const timeCheck = req.query.time || "8am";
      const backup = req.query.backup !== "false";
      const realNotifications = req.query.real === "true";

      const { logEntries, logFile } = await simulateTimeCheck(
        date,
        timeCheck,
        backup,
        realNotifications
      );

      res.json({
        message: `Simulated ${timeCheck} check for ${date}`,
        useRealNotifications: realNotifications,
        logEntries,
        logFile,
      });
    } catch (err) {
      console.error("[simulate] Error:", err);
      res.status(500).json({
        error: `Error in simulation: ${err.message}`,
        stack: err.stack,
      });
    }
  });

  // Restore from backup
  router.get("/restore-backup", (req, res) => {
    try {
      const backupFile = CURRENT_STATE_FILE + ".bak";
      if (!fs.existsSync(backupFile)) {
        return res.status(404).json({
          error: "No backup file found.",
        });
      }

      fs.copyFileSync(backupFile, CURRENT_STATE_FILE);
      res.json({
        message: `Restored ${CURRENT_STATE_FILE} from backup.`,
      });
    } catch (err) {
      console.error("[restore-backup] Error:", err);
      res.status(500).json({
        error: `Error restoring backup: ${err.message}`,
        stack: err.stack,
      });
    }
  });

  // Testing endpoints for sprint detection
  router.get("/sprint-match", (req, res) => {
    try {
      const date = req.query.date || dayjs().format("YYYY-MM-DD");

      // Create mock date utils for the test date
      const mockDateUtils = createMockDateUtils(date);

      // Apply mocks
      applyMocks(mockDateUtils);

      // Find current sprint with mocked date
      const currentSprint = dataUtils.findCurrentSprint();

      // Restore original functions
      restoreOriginals();

      res.json({
        date,
        currentSprint,
      });
    } catch (err) {
      console.error("[sprint-match] Error:", err);
      res.status(500).json({
        error: `Error testing sprint match: ${err.message}`,
      });
    }
  });

  // Get actual logs from file
  router.get("/view-log", (req, res) => {
    try {
      const logFile = req.query.file;
      if (!logFile || !fs.existsSync(logFile)) {
        return res.status(404).json({
          error: "Log file not found",
        });
      }

      const logContent = fs.readFileSync(logFile, "utf8");
      res.json({
        logFile,
        content: logContent.split("\n"),
      });
    } catch (err) {
      console.error("[view-log] Error:", err);
      res.status(500).json({
        error: `Error viewing log: ${err.message}`,
      });
    }
  });

  // Then add this to your router:
  router.get("/test-date", (req, res) => {
    try {
      const date = req.query.date || dayjs().format("YYYY-MM-DD");
      const result = testFindSprintForDate(date);
      res.json({
        date,
        result,
      });
    } catch (err) {
      console.error("[test-date] Error:", err);
      res.status(500).json({
        error: `Error in test: ${err.message}`,
      });
    }
  });

  router.get("/direct-test", async (req, res) => {
    try {
      const date = req.query.date || dayjs().format("YYYY-MM-DD");
      const time = req.query.time || "8am";
      const backup = req.query.backup !== "false";

      // Create backup if requested
      if (backup) {
        const backupFile = CURRENT_STATE_FILE + ".bak";
        if (fs.existsSync(CURRENT_STATE_FILE)) {
          fs.copyFileSync(CURRENT_STATE_FILE, backupFile);
          console.log(`Backed up ${CURRENT_STATE_FILE} to ${backupFile}`);
        }
      }

      // Load original state
      const originalState = readCurrentState();
      console.log(`Original state: sprintIndex = ${originalState.sprintIndex}`);

      // Override getTodayPT in dataUtils
      const originalGetTodayPT = dataUtils.getTodayPT;
      dataUtils.getTodayPT = () => {
        const mockTime = time.toLowerCase() === "5pm" ? "17:00:00" : "08:00:00";
        const mockDate = dayjs.tz(`${date}T${mockTime}`, "America/Los_Angeles");
        console.log(`Mocked date for test: ${mockDate.format()}`);
        return mockDate;
      };

      // Mock notification functions
      const notifications = [];
      const originalNotifyUser = slackNotifier.notifyUser;
      const originalNotifyAdmins = slackNotifier.notifyAdmins;
      const originalUpdateGroup = slackNotifier.updateOnCallUserGroup;
      const originalUpdateTopic = slackNotifier.updateChannelTopic;

      slackNotifier.notifyUser = (userId, text) => {
        const msg = `[MOCK] Notify ${userId}: ${text}`;
        console.log(msg);
        notifications.push({ type: "user", userId, text });
        return Promise.resolve();
      };

      slackNotifier.notifyAdmins = (text) => {
        const msg = `[MOCK] Notify admins: ${text}`;
        console.log(msg);
        notifications.push({ type: "admin", text });
        return Promise.resolve();
      };

      slackNotifier.updateOnCallUserGroup = (userIds) => {
        const msg = `[MOCK] Update user group: ${userIds.join(", ")}`;
        console.log(msg);
        notifications.push({ type: "group", userIds });
        return Promise.resolve();
      };

      slackNotifier.updateChannelTopic = (userIds) => {
        const msg = `[MOCK] Update channel topic with: ${userIds}`;
        console.log(msg);
        notifications.push({ type: "topic", userIds });
        return Promise.resolve();
      };

      try {
        // Run the appropriate check
        if (time.toLowerCase() === "5pm") {
          await triageLogic.run5pmCheck();
        } else {
          await triageLogic.run8amCheck();
        }

        // Load new state
        const newState = readCurrentState();

        // Check for state changes
        const stateChanged = newState.sprintIndex !== originalState.sprintIndex;
        const roleChanges = [];

        ["account", "producer", "po", "uiEng", "beEng"].forEach((role) => {
          if (newState[role] !== originalState[role]) {
            roleChanges.push({
              role,
              from: originalState[role],
              to: newState[role],
            });
          }
        });

        res.json({
          date,
          time,
          originalState: {
            sprintIndex: originalState.sprintIndex,
          },
          newState: {
            sprintIndex: newState.sprintIndex,
          },
          stateChanged,
          roleChanges,
          notifications,
        });
      } finally {
        // Always restore original functions
        dataUtils.getTodayPT = originalGetTodayPT;
        slackNotifier.notifyUser = originalNotifyUser;
        slackNotifier.notifyAdmins = originalNotifyAdmins;
        slackNotifier.updateOnCallUserGroup = originalUpdateGroup;
        slackNotifier.updateChannelTopic = originalUpdateTopic;

        // Restore from backup if it exists
        if (backup) {
          const backupFile = CURRENT_STATE_FILE + ".bak";
          if (fs.existsSync(backupFile)) {
            fs.copyFileSync(backupFile, CURRENT_STATE_FILE);
            console.log(`Restored from backup: ${backupFile}`);
          }
        }
      }
    } catch (err) {
      console.error("[direct-test] Error:", err);
      res.status(500).json({
        error: `Error in direct test: ${err.message}`,
        stack: err.stack,
      });
    }
  });
  
  
  router.get('/debug-run8am', async (req, res) => {
  try {
    const date = req.query.date || dayjs().format('YYYY-MM-DD');
    
    // Save original function
    const originalGetTodayPT = dataUtils.getTodayPT;
    const originalFindCurrentSprint = dataUtils.findCurrentSprint;
    
    // Debug outputs
    const debugInfo = {
      requestedDate: date,
      mockDate: null,
      findCurrentSprintResult: null,
      triageLogicState: null
    };
    
    // Mock date function
    dataUtils.getTodayPT = () => {
      const mockDate = dayjs.tz(`${date}T08:00:00`, "America/Los_Angeles");
      debugInfo.mockDate = mockDate.format();
      console.log(`Debug mock date: ${mockDate.format()}`);
      return mockDate;
    };
    
    // Intercept findCurrentSprint
    dataUtils.findCurrentSprint = () => {
      // Use our test function directly
      const result = testFindSprintForDate(date);
      debugInfo.findCurrentSprintResult = result;
      console.log(`Debug findCurrentSprint result:`, result);
      return result;
    };
    
    // Get current state
    debugInfo.triageLogicState = triageLogic.getCurrentState();
    
    try {
      await triageLogic.run8amCheck();
    } finally {
      // Restore original functions
      dataUtils.getTodayPT = originalGetTodayPT;
      dataUtils.findCurrentSprint = originalFindCurrentSprint;
    }
    
    res.json(debugInfo);
  } catch (err) {
    console.error('[debug-run8am] Error:', err);
    res.status(500).json({
      error: `Error in debug: ${err.message}`,
      stack: err.stack
    });
  }
});

  return router;
}

module.exports = {
  simulateTimeCheck,
  addTestRoutes,
};
