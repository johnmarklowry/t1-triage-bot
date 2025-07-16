/********************************
 * testRoutes.js
 * Fixed to remove duplicate routes and add validation endpoints
 ********************************/
const express = require('express');
const router = express.Router();

const fs = require('fs');
const path = require('path');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { readSprints, SPRINTS_FILE } = require('./dataUtils');

dayjs.extend(utc);
dayjs.extend(timezone);

// Import the test system
const { addTestRoutes } = require('./testSystem');

// Import the forceSprintTransition function
const { forceSprintTransition } = require('./triageLogic');

const dataUtils = require('./dataUtils');

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

// Import the relevant functions
const {
  notifyUser,
  updateOnCallUserGroup,
  updateChannelTopic
} = require('./slackNotifier');
const {
  run5pmCheck,
  run8amCheck,
  runImmediateRotation,
  setCurrentSprintState,
  getCurrentState
} = require('./triageLogic');

// For the Slack test, specify a user via .env or query param
const TEST_SLACK_USER = process.env.TEST_SLACK_USER || null;

/**
 * Test sending a Slack DM to a single user.
 * Usage:
 *   GET /test-slack?user=U123ABC
 * If no ?user= is provided, it uses TEST_SLACK_USER from .env
 */
router.get('/test-slack', async (req, res) => {
  try {
    const user = req.query.user || TEST_SLACK_USER;
    if (!user) {
      return res.status(400).send('No Slack user ID specified via ?user= or TEST_SLACK_USER env');
    }

    await notifyUser(user, `Hello from the Triage Bot! Testing Slack DM at ${new Date().toISOString()}`);
    res.send(`Slack DM sent to user ${user}`);
  } catch (err) {
    console.error('[test-slack] Error:', err);
    res.status(500).send(`Error sending Slack DM: ${err.message}`);
  }
});

/**
 * Test updating the Slack user group with a single user (or multiple).
 * Usage:
 *   GET /test-group-update?users=U123ABC,U456DEF
 *
 * If no ?users= provided, it will default to the TEST_SLACK_USER env variable (if set).
 */
router.get('/test-group-update', async (req, res) => {
  try {
    let userParam = req.query.users;
    if (!userParam && TEST_SLACK_USER) {
      userParam = TEST_SLACK_USER;
    }

    if (!userParam) {
      return res.status(400).send('No users specified via ?users= or TEST_SLACK_USER env');
    }

    const userIds = userParam.split(',');
    await updateOnCallUserGroup(userIds);

    res.send(`Slack user group updated with user(s): ${userIds.join(',')}`);
  } catch (err) {
    console.error('[test-group-update] Error:', err);
    res.status(500).send(`Error updating user group: ${err.message}`);
  }
});

/**
 * Manually trigger 5PM or 8AM checks
 * Usage:
 *   GET /check?time=5pm
 *   GET /check?time=8am
 */
router.get('/check', async (req, res) => {
  const time = req.query.time;
  try {
    if (time === '5pm') {
      await run5pmCheck();
      return res.send('5PM check triggered.');
    } else if (time === '8am') {
      await run8amCheck();
      return res.send('8AM check triggered.');
    } else {
      return res.status(400).send('Please specify ?time=5pm or ?time=8am');
    }
  } catch (err) {
    console.error('[Manual /check] Error:', err);
    return res.status(500).send('Error triggering check: ' + err.message);
  }
});

/**
 * GET /test/current-state
 * Returns the in-memory currentState
 */
router.get('/current-state', (req, res) => {
  try {
    const current = getCurrentState();
    res.json({
      message: 'Here is the current on-call state in memory.',
      state: current
    });
  } catch (err) {
    console.error('[current-state] Error:', err);
    res.status(500).send(`Error getting current state: ${err.message}`);
  }
});

/**
 * GET /test/set-state?sprintIndex=2
 * Force a new sprintIndex manually
 */
router.get('/set-state', async (req, res) => {
  try {
    const sprintIndexStr = req.query.sprintIndex;
    if (!sprintIndexStr) {
      return res.status(400).send('Please provide ?sprintIndex=');
    }

    const sprintIndex = parseInt(sprintIndexStr, 10);
    if (isNaN(sprintIndex)) {
      return res.status(400).send('Invalid sprintIndex. Must be a number.');
    }

    await setCurrentSprintState(sprintIndex);
    res.send(`Successfully set sprintIndex to ${sprintIndex}. Check /test/current-state for details.`);
  } catch (err) {
    console.error('[set-state] Error:', err);
    res.status(500).send(`Error setting sprint state: ${err.message}`);
  }
});

/**
 * Trigger the entire rotation workflow immediately.
 * Usage:
 *   GET /test/immediate-rotation
 */
router.get('/immediate-rotation', async (req, res) => {
  try {
    await runImmediateRotation();
    res.send('Immediate rotation workflow triggered. Check logs, Slack, and /test/current-state.');
  } catch (err) {
    console.error('[Immediate Rotation Route] Error:', err);
    res.status(500).send(`Error running immediate rotation: ${err.message}`);
  }
});

/**
 * GET /test/channel-topic-current
 * Updates the channel topic with the current on-call members from currentState.
 */
router.get('/channel-topic-current', async (req, res) => {
  try {
    const current = getCurrentState();
    if (!current || !current.sprintIndex) {
      return res.status(400).send('No current sprint or on-call members in state.');
    }

    // Build array of user IDs (not the formatted string)
    const onCallIds = [
      current.account,
      current.producer,
      current.po,
      current.uiEng,
      current.beEng
    ].filter(Boolean); // remove undefined or null if any

    if (onCallIds.length === 0) {
      return res.status(400).send('No on-call members found in current state.');
    }

    // Just pass the array of user IDs to updateChannelTopic
    await updateChannelTopic(onCallIds);
    
    // For display in the response, create the formatted topic
    const mentionList = onCallIds.map(id => `<@${id}>`).join(', ');
    const topicPreview = `Bug Link Only - keep conversations in threads.\nTriage Team: ${mentionList}`;
    
    res.send(`Channel topic updated with on-call members: ${onCallIds.join(', ')}\nPreview: ${topicPreview}`);
  } catch (err) {
    console.error('[channel-topic-current] Error:', err);
    res.status(500).send(`Error updating channel topic: ${err.message}`);
  }
});

/**
 * GET /test/timezone-debug
 * Shows current time information in different formats to debug timezone issues
 */
router.get('/timezone-debug', (req, res) => {
  try {
    const now = new Date();
    const dayjsNow = dayjs();
    const dayjsPT = dayjs().tz("America/Los_Angeles");
    
    const tzInfo = {
      "Server timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
      "Current time (UTC)": now.toISOString(),
      "Current time (Server local)": now.toString(),
      "dayjs current time": dayjsNow.format('YYYY-MM-DD HH:mm:ss Z'),
      "dayjs PT time": dayjsPT.format('YYYY-MM-DD HH:mm:ss Z'),
      "dayjs default timezone": dayjs.tz.guess(),
      "Node timezone env": process.env.TZ || "Not set",
      "Process.env timezone vars": Object.keys(process.env)
        .filter(k => k.toLowerCase().includes('time') || k.toLowerCase().includes('tz'))
        .reduce((obj, key) => { obj[key] = process.env[key]; return obj; }, {})
    };
    
    res.json(tzInfo);
  } catch (err) {
    console.error('[timezone-debug] Error:', err);
    res.status(500).send(`Error getting timezone info: ${err.message}`);
  }
});

/**
 * GET /test/validate-data
 * Validates all data files for consistency and integrity
 */
router.get('/validate-data', (req, res) => {
  try {
    const issues = [];
    
    // Check disciplines for duplicate users
    const disciplines = dataUtils.readDisciplines();
    const allUsers = new Map(); // userId -> { discipline, name }
    
    for (const [discipline, users] of Object.entries(disciplines)) {
      if (!Array.isArray(users)) {
        issues.push(`Discipline ${discipline} is not an array`);
        continue;
      }
      
      for (const user of users) {
        if (allUsers.has(user.slackId)) {
          const existing = allUsers.get(user.slackId);
          issues.push(`User ${user.slackId} (${user.name}) appears in multiple disciplines: ${existing.discipline} and ${discipline}`);
        } else {
          allUsers.set(user.slackId, { discipline, name: user.name });
        }
      }
    }
    
    // Check current state for validity
    const currentState = dataUtils.readCurrentState();
    if (currentState.sprintIndex !== null) {
      const sprints = dataUtils.readSprints();
      if (currentState.sprintIndex >= sprints.length) {
        issues.push(`Current state sprint index ${currentState.sprintIndex} is out of bounds (only ${sprints.length} sprints)`);
      }
      
      // Check if current state users exist in disciplines
      ['account', 'producer', 'po', 'uiEng', 'beEng'].forEach(role => {
        const userId = currentState[role];
        if (userId && !allUsers.has(userId)) {
          issues.push(`Current state ${role} user ${userId} not found in any discipline`);
        }
      });
      
      // Check for duplicate users in current state
      const stateUsers = [
        currentState.account,
        currentState.producer,
        currentState.po,
        currentState.uiEng,
        currentState.beEng
      ].filter(Boolean);
      
      const uniqueStateUsers = new Set(stateUsers);
      if (stateUsers.length !== uniqueStateUsers.size) {
        issues.push(`Current state has duplicate users`);
      }
    }
    
    // Check overrides
    const overrides = dataUtils.readOverrides();
    overrides.forEach((override, i) => {
      if (!allUsers.has(override.newSlackId)) {
        issues.push(`Override ${i}: replacement user ${override.newSlackId} not found in disciplines`);
      }
      if (!allUsers.has(override.requestedBy)) {
        issues.push(`Override ${i}: requester ${override.requestedBy} not found in disciplines`);
      }
    });
    
    // Test refreshCurrentState
    const refreshed = dataUtils.refreshCurrentState();
    
    res.json({
      validationComplete: true,
      issuesFound: issues.length,
      issues: issues,
      stateRefreshed: refreshed,
      summary: issues.length === 0 ? "All data files are valid!" : `Found ${issues.length} issue(s)`
    });
  } catch (err) {
    console.error('[validate-data] Error:', err);
    res.status(500).json({
      error: `Error validating data: ${err.message}`,
      stack: err.stack
    });
  }
});

/**
 * GET /test/debug-findCurrentSprint
 * Tests the findCurrentSprint function with explicit timezone handling
 */
router.get('/debug-findCurrentSprint', async (req, res) => {
  try {
    // This is a corrected version with Pacific Time
    const sprints = readSprints();
    const today = dayjs().tz("America/Los_Angeles").startOf("day");
    
    let foundSprint = null;
    
    for (let i = 0; i < sprints.length; i++) {
      const { sprintName, startDate, endDate } = sprints[i];
      const sprintStart = dayjs(startDate).tz("America/Los_Angeles").startOf("day");
      const sprintEnd = dayjs(endDate).tz("America/Los_Angeles").startOf("day");
      
      if (
        (today.isAfter(sprintStart) || today.isSame(sprintStart, 'day')) &&
        (today.isBefore(sprintEnd) || today.isSame(sprintEnd, 'day'))
      ) {
        foundSprint = { index: i, sprintName, startDate, endDate };
        break;
      }
    }
    
    res.json({
      message: foundSprint ? `Found current sprint: ${foundSprint.sprintName}` : 'No current sprint found',
      today: today.format('YYYY-MM-DD'),
      todayTimezone: 'America/Los_Angeles',
      foundSprint
    });
  } catch (err) {
    console.error('[debug-findCurrentSprint] Error:', err);
    res.status(500).send(`Error finding current sprint: ${err.message}`);
  }
});

// Add this to your testRoutes.js or directly import and use it
router.get('/debug-sprint-dates', (req, res) => {
  try {
    const date = req.query.date || dayjs().format('YYYY-MM-DD');
    
    // Read sprints directly
    const { readSprints } = require('./dataUtils');
    const sprints = readSprints();
    
    // Test date as midnight in PT
    const testDate = dayjs.tz(`${date}T00:00:00`, "America/Los_Angeles").startOf('day');
    
    const debugInfo = {
      requestedDate: date,
      formattedTestDate: testDate.format('YYYY-MM-DD HH:mm:ss Z'),
      testDateTimestamp: testDate.valueOf(),
      sprints: sprints.map((sprint, i) => {
        const startDate = dayjs.tz(`${sprint.startDate}T00:00:00`, "America/Los_Angeles").startOf('day');
        const endDate = dayjs.tz(`${sprint.endDate}T00:00:00`, "America/Los_Angeles").startOf('day');
        
        return {
          index: i,
          name: sprint.sprintName,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          startFormatted: startDate.format('YYYY-MM-DD HH:mm:ss Z'),
          endFormatted: endDate.format('YYYY-MM-DD HH:mm:ss Z'),
          isAfterStart: testDate.isAfter(startDate) || testDate.isSame(startDate, 'day'),
          isBeforeEnd: testDate.isBefore(endDate) || testDate.isSame(endDate, 'day'),
          shouldMatch: (testDate.isAfter(startDate) || testDate.isSame(startDate, 'day')) &&
                        (testDate.isBefore(endDate) || testDate.isSame(endDate, 'day'))
        };
      })
    };
    
    // Find which sprint should match
    const matchingSprint = debugInfo.sprints.find(s => s.shouldMatch);
    debugInfo.matchingSprint = matchingSprint ? matchingSprint.index : null;
    
    res.json(debugInfo);
  } catch (err) {
    console.error('[debug-sprint-dates] Error:', err);
    res.status(500).json({
      error: `Error debugging sprint dates: ${err.message}`,
      stack: err.stack
    });
  }
});

router.get('/test-5pm-check', async (req, res) => {
  try {
    // Store original notification functions
    const originalNotifyUser = require('./slackNotifier').notifyUser;
    const originalNotifyAdmins = require('./slackNotifier').notifyAdmins;
    
    // Collect notifications instead of sending them
    const notifications = [];
    
    // Replace with mock functions
    require('./slackNotifier').notifyUser = (userId, text) => {
      notifications.push({ type: 'user', userId, text });
      console.log(`[MOCK] Would notify user ${userId}: ${text}`);
      return Promise.resolve();
    };
    
    require('./slackNotifier').notifyAdmins = (text) => {
      notifications.push({ type: 'admin', text });
      console.log(`[MOCK] Would notify admins: ${text}`);
      return Promise.resolve();
    };
    
    try {
      // Run the 5PM check with mocked notifications
      console.log("Running 5PM check with mocked notifications");
      await require('./triageLogic').run5pmCheck();
      
      res.json({
        message: "5PM check completed with mocked notifications",
        notifications,
        wouldSendNotifications: notifications.length > 0
      });
    } finally {
      // Restore original notification functions
      require('./slackNotifier').notifyUser = originalNotifyUser;
      require('./slackNotifier').notifyAdmins = originalNotifyAdmins;
    }
  } catch (err) {
    console.error('[test-5pm-check] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/force-transition', async (req, res) => {
  try {
    const newIndex = parseInt(req.query.newIndex, 10);
    if (isNaN(newIndex)) {
      return res.status(400).json({
        error: 'Invalid newIndex parameter'
      });
    }
    
    // Parse the mockNotifications parameter, default to true
    const mockNotifications = req.query.mockNotifications !== 'false';
    
    // Create a backup if requested
    if (req.query.backup === 'true') {
      const backupFile = path.join(__dirname, "currentState.json.bak");
      fs.copyFileSync(path.join(__dirname, "currentState.json"), backupFile);
      console.log(`Created backup at ${backupFile}`);
    }
    
    const result = await forceSprintTransition(newIndex, mockNotifications);
    
    res.json({
      ...result,
      mockNotifications, // Include this in the response so you know what mode it ran in
      message: mockNotifications 
        ? "Transition completed with mock notifications (no actual messages sent)"
        : "Transition completed with REAL notifications (messages were actually sent)"
    });
  } catch (err) {
    console.error('[force-transition] Error:', err);
    res.status(500).json({
      error: `Error in transition: ${err.message}`,
      stack: err.stack
    });
  }
});

router.get('/sprint-data-check', (req, res) => {
  try {
    // First, let's check what readSprints actually returns
    const sprintsData = readSprints();
    
    // Let's examine what we got back
    const debugInfo = {
      dataType: typeof sprintsData,
      isArray: Array.isArray(sprintsData),
      rawData: sprintsData
    };
    
    // If we have an array, let's add some additional information
    if (Array.isArray(sprintsData)) {
      debugInfo.count = sprintsData.length;
      debugInfo.firstSprint = sprintsData[0] || null;
    }
    
    res.json(debugInfo);
  } catch (err) {
    console.error('[sprint-data-check] Error:', err.message);
    res.status(500).send(`Error checking sprint data: ${err.message}`);
  }
});

router.get('/debug-date', (req, res) => {
  try {
    const now = new Date();
    const dateInfo = {
      jsDate: now.toString(),
      utcDate: now.toISOString(),
      serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      
      // Test dayjs functions
      dayjsNow: dayjs().format('YYYY-MM-DD HH:mm:ss Z'),
      dayjsPT: dayjs().tz("America/Los_Angeles").format('YYYY-MM-DD HH:mm:ss Z'),
      
      // Test dataUtils date functions
      getTodayPT: dataUtils.getTodayPT().format('YYYY-MM-DD HH:mm:ss Z'),
      parsedDate: dataUtils.parsePTDate('2025-04-24').format('YYYY-MM-DD HH:mm:ss Z'),
      
      // Test which sprint the current date falls into
      currentSprint: dataUtils.findCurrentSprint()
    };
    
    res.json(dateInfo);
  } catch (err) {
    console.error('[debug-date] Error:', err);
    res.status(500).json({
      error: `Error debugging date: ${err.message}`
    });
  }
});

/**
 * Detailed debug handler for sprint detection logic
 */
function sprintDebugHandler(req, res) {
  try {
    const sprintsData = readSprints();
    
    // Basic information about the sprints data
    const debugInfo = {
      dataType: typeof sprintsData,
      isArray: Array.isArray(sprintsData),
      count: Array.isArray(sprintsData) ? sprintsData.length : 0,
      sprintsFilePath: SPRINTS_FILE
    };
    
    // Current date information in PT
    const today = dayjs().tz("America/Los_Angeles").startOf("day");
    debugInfo.today = {
      date: today.format('YYYY-MM-DD'),
      dayOfWeek: today.format('dddd'),
      timestamp: today.valueOf(),
      iso: today.toISOString()
    };
    
    // If we have sprints data, add detailed debug info for each sprint
    if (Array.isArray(sprintsData) && sprintsData.length > 0) {
      debugInfo.sprints = sprintsData.map((sprint, i) => {
        // Convert sprint dates to Pacific Time
        const start = dayjs(sprint.startDate).tz("America/Los_Angeles").startOf("day");
        const end = dayjs(sprint.endDate).tz("America/Los_Angeles").startOf("day");
        
        // Check if today falls within this sprint
        const todayAfterStart = today.isAfter(start) || today.isSame(start, 'day');
        const todayBeforeEnd = today.isBefore(end) || today.isSame(end, 'day');
        const isCurrentSprint = todayAfterStart && todayBeforeEnd;
        
        return {
          index: i,
          name: sprint.sprintName,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          
          // Formatted dates in PT
          startFormatted: start.format('YYYY-MM-DD'),
          endFormatted: end.format('YYYY-MM-DD'),
          
          // Comparison details
          todayAfterStart: todayAfterStart,
          todayBeforeEnd: todayBeforeEnd,
          isCurrentSprint: isCurrentSprint,
          
          // Raw date info for debugging
          startTimestamp: start.valueOf(),
          endTimestamp: end.valueOf(),
          
          // Time differences for debugging
          daysSinceStart: today.diff(start, 'day'),
          daysUntilEnd: end.diff(today, 'day')
        };
      });
      
      // Find which sprint should be current (if any)
      const currentSprint = debugInfo.sprints.find(s => s.isCurrentSprint);
      debugInfo.currentSprintIndex = currentSprint ? currentSprint.index : null;
      debugInfo.currentSprintName = currentSprint ? currentSprint.name : null;
    } else {
      // Detailed error info if no sprints found
      debugInfo.error = "No valid sprints data found";
      
      try {
        const fs = require('fs');
        if (fs.existsSync(SPRINTS_FILE)) {
          const rawContent = fs.readFileSync(SPRINTS_FILE, 'utf8');
          debugInfo.fileExists = true;
          debugInfo.fileSize = rawContent.length;
          debugInfo.filePreview = rawContent.slice(0, 100) + (rawContent.length > 100 ? '...' : '');
        } else {
          debugInfo.fileExists = false;
        }
      } catch (fsErr) {
        debugInfo.fileAccessError = fsErr.message;
      }
    }
    
    res.json(debugInfo);
  } catch (err) {
    console.error('[sprint-debug] Error:', err);
    res.status(500).json({
      error: `Error debugging sprints: ${err.message}`,
      stack: err.stack
    });
  }
}

// Add advanced simulation routes from testSystem.js
addTestRoutes(router);

module.exports = router;

// Export the handler separately
module.exports.sprintDebugHandler = sprintDebugHandler;