const {
  findSprintStartingTomorrowPT,
  computeReleaseTeamUserIdsForSprint,
  getTodayPT,
} = require('../dataUtils');
const {
  updateReleaseTeamUserGroup,
  updateReleasesChannelTopic,
  notifyAdmins,
} = require('../slackNotifier');

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function logRelease(level, message, meta = {}) {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'railway-release-team-job',
    ...meta,
  };
  const output = JSON.stringify(line);
  if (level === 'error') {
    console.error(output);
    return;
  }
  if (level === 'warn') {
    console.warn(output);
    return;
  }
  console.log(output);
}

async function handleRailwayReleaseTeamUpdate(payload = {}) {
  const startedAtMs = Date.now();
  const triggerId = payload.trigger_id || `release-${startedAtMs}`;
  const tomorrowPT = getTodayPT().add(1, 'day').format('YYYY-MM-DD');
  logRelease('info', 'release-team handler started', {
    trigger_id: triggerId,
    tomorrow_pt: tomorrowPT,
    payload: safeJson(payload),
  });

  try {
    const sprint = await findSprintStartingTomorrowPT();
    if (!sprint) {
      const result = {
        result: 'skipped',
        reason: 'no_sprint_starting_tomorrow',
        tomorrowPT,
      };
      logRelease('info', 'release-team no-op (no matching sprint)', {
        trigger_id: triggerId,
        elapsed_ms: Date.now() - startedAtMs,
        ...result,
      });
      return result;
    }

    const sprintIndex = Number(sprint.index);
    const userIds = await computeReleaseTeamUserIdsForSprint(sprintIndex);
    if (!Array.isArray(userIds) || userIds.length === 0) {
      const result = {
        result: 'skipped',
        reason: 'empty_release_team_set_preserved_previous',
        sprintIndex,
        sprintName: sprint.sprintName || null,
      };
      logRelease('warn', 'release-team empty computed set; preserving existing Slack membership', {
        trigger_id: triggerId,
        elapsed_ms: Date.now() - startedAtMs,
        ...result,
      });
      return result;
    }

    await updateReleaseTeamUserGroup(userIds);
    await updateReleasesChannelTopic(userIds);

    const result = {
      result: 'delivered',
      sprintIndex,
      sprintName: sprint.sprintName || null,
      userIds,
      memberCount: userIds.length,
    };
    logRelease('info', 'release-team update completed', {
      trigger_id: triggerId,
      elapsed_ms: Date.now() - startedAtMs,
      ...safeJson(result),
    });
    return result;
  } catch (error) {
    logRelease('error', 'release-team handler failed', {
      trigger_id: triggerId,
      elapsed_ms: Date.now() - startedAtMs,
      error: error instanceof Error ? error.message : String(error),
    });
    await notifyAdmins(`Release team update failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  handleRailwayReleaseTeamUpdate,
};
