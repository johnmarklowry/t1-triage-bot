/**
 * User-facing rotation view helpers (issue #4).
 * Shared by App Home and the web participant dashboard.
 */
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const {
  readOverrides,
  getSprintUsers,
  parsePTDate,
  getTodayPT,
} = require('../dataUtils');

dayjs.extend(utc);
dayjs.extend(timezone);

const ROLE_DISPLAY = {
  account: 'Account',
  producer: 'Producer',
  po: 'PO',
  uiEng: 'UI Engineer',
  beEng: 'BE Engineer',
};

function formatTimeRemaining(endDate) {
  const endStart = parsePTDate(endDate);
  if (!endStart) return 'Ended';
  const end = endStart.endOf('day');
  const now = dayjs().tz('America/Los_Angeles');
  const diff = end.diff(now);

  if (diff < 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days === 0 && hours === 0) {
    return `Ends in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  if (days === 0) {
    return `Ends in ${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  if (days === 1) return 'Ends tomorrow';
  return `${days} day${days !== 1 ? 's' : ''} remaining`;
}

function formatDaysUntil(startDate) {
  const start = parsePTDate(startDate);
  if (!start) return 'Starts';
  const now = getTodayPT();
  const days = start.diff(now, 'day');

  if (days < 0) return 'Started';
  if (days === 0) return 'Starts today';
  if (days === 1) return 'Starts tomorrow';
  return `In ${days} days`;
}

function getUserOnCallStatus(userId, currentRotation) {
  if (!currentRotation || !userId) return null;

  const userOnCall = currentRotation.users.find((u) => u.slackId === userId);
  if (!userOnCall) return null;

  return {
    isOnCall: true,
    role: userOnCall.role,
    roleDisplay: ROLE_DISPLAY[userOnCall.role] || userOnCall.role,
    timeRemaining: formatTimeRemaining(currentRotation.endDate),
    sprintIndex: currentRotation.sprintIndex,
    sprintName: currentRotation.sprintName,
    startDate: currentRotation.startDate,
    endDate: currentRotation.endDate,
  };
}

async function getUserUpcomingShifts(userId, sprints, disciplines, options = {}) {
  if (!userId || !sprints || !disciplines) return [];

  const rawLimit = Number(options?.limit);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, rawLimit) : null;

  let userRole = null;
  let userIndex = -1;

  for (const [role, roleList] of Object.entries(disciplines)) {
    const index = roleList.findIndex((u) => u.slackId === userId);
    if (index !== -1) {
      userRole = role;
      userIndex = index;
      break;
    }
  }

  if (!userRole || userIndex === -1) return [];

  const roleList = disciplines[userRole];
  const upcomingShifts = [];
  const today = dayjs().tz('America/Los_Angeles');

  const nameBySlackId = {};
  for (const users of Object.values(disciplines)) {
    if (!Array.isArray(users)) continue;
    for (const u of users) {
      if (u?.slackId && u?.name && !nameBySlackId[u.slackId]) {
        nameBySlackId[u.slackId] = u.name;
      }
    }
  }

  const overrides = await readOverrides();
  const overrideBySprintRole = new Map();
  for (const o of Array.isArray(overrides) ? overrides : []) {
    if (!o || o.approved !== true) continue;
    if (o.sprintIndex === null || o.sprintIndex === undefined) continue;
    if (!o.role) continue;
    overrideBySprintRole.set(`${o.sprintIndex}:${o.role}`, o);
  }

  for (let i = 0; i < sprints.length; i++) {
    const sprint = sprints[i];
    const sprintStart = dayjs(sprint.startDate).tz('America/Los_Angeles');

    if (sprintStart.isAfter(today) || sprintStart.isSame(today, 'day')) {
      const override = overrideBySprintRole.get(`${i}:${userRole}`) || null;
      const assignedIndex = i % roleList.length;
      const isBaseAssigned = assignedIndex === userIndex;
      const isAssignedByOverride = !!override && override.newSlackId === userId;
      const isRemovedByOverride = isBaseAssigned && !!override && override.newSlackId !== userId;
      const shouldInclude = (isBaseAssigned && !isRemovedByOverride) || isAssignedByOverride;
      if (!shouldInclude) continue;

      const sprintUsers = await getSprintUsers(i);
      const rotationLines = [];
      for (const roleKey of ['account', 'producer', 'po', 'uiEng', 'beEng']) {
        const slackId = sprintUsers?.[roleKey] || null;
        const displayRole = ROLE_DISPLAY[roleKey] || roleKey;
        if (!slackId) {
          rotationLines.push(`*${displayRole}*: _Unassigned_`);
          continue;
        }
        const name = nameBySlackId[slackId];
        const suffix = slackId === userId ? ' (you)' : '';
        rotationLines.push(
          name
            ? `*${displayRole}*: ${name} (<@${slackId}>)${suffix}`
            : `*${displayRole}*: <@${slackId}>${suffix}`,
        );
      }

      upcomingShifts.push({
        sprintIndex: i,
        sprintName: sprint.sprintName,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        role: userRole,
        roleDisplay: ROLE_DISPLAY[userRole] || userRole,
        daysUntil: formatDaysUntil(sprint.startDate),
        rotationUsers: sprintUsers || null,
        rotationText: rotationLines.join('\n'),
      });

      if (limit && upcomingShifts.length >= limit) break;
    }
  }

  return upcomingShifts;
}

function findUserRole(userId, disciplines) {
  if (!userId || !disciplines) return null;
  for (const [role, roleList] of Object.entries(disciplines)) {
    if (!Array.isArray(roleList)) continue;
    if (roleList.some((u) => u?.slackId === userId && u.active !== false)) {
      return role;
    }
  }
  return null;
}

module.exports = {
  ROLE_DISPLAY,
  formatTimeRemaining,
  formatDaysUntil,
  getUserOnCallStatus,
  getUserUpcomingShifts,
  findUserRole,
};
