/**
 * Participant dashboard data (issue #4).
 */
const config = require('../config');
const { AdminMembershipRepository } = require('../db/repository');
const { readSprints, readDisciplines, readOverrides } = require('../dataUtils');
const { ROLE_KEYS } = require('./adminWebRotationState');
const {
  findUserRole,
  getUserOnCallStatus,
  getUserUpcomingShifts,
  ROLE_DISPLAY,
} = require('./userRotationView');
const { getEligibleSprintOptions, getReplacementOptions } = require('./userWebOverrides');
const { isFresh } = require('./adminMembership');

async function resolveIsAdmin(slackUserId) {
  const adminChannelId = process.env.ADMIN_CHANNEL_ID;
  if (!adminChannelId || !slackUserId) return false;

  try {
    const cached = await AdminMembershipRepository.get(slackUserId);
    if (cached && cached.isMember === true && isFresh(cached.checkedAt)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function buildUserDashboardSnapshot(slackUserId, options = {}) {
  const { getCurrentOnCall } = require('../appHome');
  const upcomingLimit = Number.isFinite(options.upcomingLimit) ? options.upcomingLimit : 8;

  const [current, disciplines, sprints, overrides, isAdmin] = await Promise.all([
    getCurrentOnCall().catch(() => null),
    readDisciplines().catch(() => null),
    readSprints().catch(() => []),
    readOverrides().catch(() => []),
    resolveIsAdmin(slackUserId),
  ]);

  const userRole = findUserRole(slackUserId, disciplines || {});
  const onCallStatus = getUserOnCallStatus(slackUserId, current);
  const upcomingShifts = userRole
    ? await getUserUpcomingShifts(slackUserId, sprints, disciplines || {}, { limit: upcomingLimit })
    : [];

  const relevantOverrides = (overrides || []).filter(
    (o) => o.requestedBy === slackUserId || o.newSlackId === slackUserId,
  );

  const overrideForm = userRole
    ? {
        eligibleSprints: getEligibleSprintOptions(slackUserId, userRole, sprints, disciplines),
        replacements: getReplacementOptions(userRole, disciplines, slackUserId),
      }
    : { eligibleSprints: [], replacements: [] };

  return {
    environment: config.env,
    generatedAt: new Date().toISOString(),
    user: {
      slackUserId,
      role: userRole,
      roleDisplay: userRole ? ROLE_DISPLAY[userRole] || userRole : null,
      inRotation: !!userRole,
    },
    isAdmin,
    onCallStatus,
    currentRotation: current,
    upcomingShifts,
    overrides: {
      pending: relevantOverrides.filter((o) => !o.approved),
      approved: relevantOverrides.filter((o) => o.approved),
    },
    overrideForm,
    roles: ROLE_KEYS,
  };
}

module.exports = {
  buildUserDashboardSnapshot,
  resolveIsAdmin,
};
