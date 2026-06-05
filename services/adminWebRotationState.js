/**
 * Aggregates rotation management data for the web admin UI (issue #1).
 * Reuses repository + dataUtils paths used by Slack admin flows.
 */
const config = require('../config');
const {
  SprintsRepository,
  CurrentStateRepository,
  OverridesRepository,
  UsersRepository,
} = require('../db/repository');
const {
  getSprintUsers,
  getUpcomingSprints,
  readDisciplines,
  readOverrides,
} = require('../dataUtils');

const ROLE_KEYS = ['account', 'producer', 'po', 'uiEng', 'beEng'];

function normalizeSprintRow(sprint) {
  if (!sprint) return null;
  const sprintIndex = sprint.sprintIndex ?? sprint.index;
  return {
    sprintIndex,
    sprintName: sprint.sprintName ?? sprint.name ?? null,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
  };
}

function buildParticipantListsFromUsers(users) {
  const lists = {};
  for (const user of users || []) {
    if (!user?.discipline) continue;
    if (!lists[user.discipline]) lists[user.discipline] = [];
    lists[user.discipline].push({
      slackId: user.slackId,
      name: user.name,
      active: user.active !== false,
    });
  }
  for (const discipline of Object.keys(lists)) {
    // Preserve repository / JSON rotation order; only sort inactive after active within each list.
    lists[discipline].sort((a, b) => {
      if (a.active === b.active) return 0;
      return a.active ? -1 : 1;
    });
  }
  return lists;
}

async function buildParticipantLists() {
  try {
    const users = await UsersRepository.getAllUsers();
    return buildParticipantListsFromUsers(users);
  } catch (err) {
    console.warn('[adminWebRotationState] UsersRepository failed, falling back to readDisciplines:', err.message);
    const disciplines = await readDisciplines();
    const lists = {};
    for (const [discipline, members] of Object.entries(disciplines || {})) {
      if (!Array.isArray(members)) continue;
      lists[discipline] = members.map((m) => ({
        slackId: m.slackId,
        name: m.name,
        active: m.active !== false,
      }));
    }
    return lists;
  }
}

/**
 * @param {{ upcomingLimit?: number }} [options]
 */
async function buildAdminRotationSnapshot(options = {}) {
  const upcomingLimit = Number.isFinite(options.upcomingLimit)
    ? options.upcomingLimit
    : 8;

  const [dateBasedSprint, persistedState, overrides, upcomingRaw, participantLists] = await Promise.all([
    SprintsRepository.getCurrentSprint(),
    CurrentStateRepository.get(),
    readOverrides(),
    getUpcomingSprints(),
    buildParticipantLists(),
  ]);

  const currentSprint = normalizeSprintRow(dateBasedSprint);
  const sprintIndex = currentSprint?.sprintIndex ?? persistedState?.sprintIndex ?? null;

  let currentRoles = null;
  if (sprintIndex != null && Number.isFinite(Number(sprintIndex))) {
    currentRoles = await getSprintUsers(Number(sprintIndex));
  }

  const upcomingSchedule = [];
  for (const sprint of upcomingRaw.slice(0, upcomingLimit)) {
    const normalized = normalizeSprintRow(sprint);
    if (!normalized || normalized.sprintIndex == null) continue;
    const roles = await getSprintUsers(Number(normalized.sprintIndex));
    upcomingSchedule.push({ ...normalized, roles });
  }

  const pendingOverrides = overrides.filter((o) => !o.approved);
  const approvedOverrides = overrides.filter((o) => o.approved);

  return {
    environment: config.env,
    generatedAt: new Date().toISOString(),
    roles: ROLE_KEYS,
    currentSprint,
    persistedState,
    currentRoles,
    upcomingSchedule,
    overrides: {
      pendingCount: pendingOverrides.length,
      pending: pendingOverrides,
      approved: approvedOverrides,
    },
    participantLists,
  };
}

module.exports = {
  ROLE_KEYS,
  buildAdminRotationSnapshot,
  buildParticipantListsFromUsers,
};
