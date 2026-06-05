/**
 * Web override requests for participants (issue #4).
 */
const { WebClient } = require('@slack/web-api');
const cache = require('../cache/redisClient');
const { OverridesRepository, UsersRepository } = require('../db/repository');
const { readDisciplines, readSprints } = require('../dataUtils');
const { findUserRole } = require('./userRotationView');

const USE_DATABASE = process.env.USE_DATABASE !== 'false';

function formatSprintLabel(sprintIndex, sprints) {
  const idx = Number(sprintIndex);
  const sprint = Array.isArray(sprints) ? sprints[idx] : null;
  if (!sprint) return `Sprint ${idx}`;
  const name = sprint.sprintName || `Sprint ${idx}`;
  const start = sprint.startDate || '';
  const end = sprint.endDate || '';
  if (start && end) return `${name} (${start} → ${end})`;
  return name;
}

async function loadDisciplines() {
  if (USE_DATABASE) {
    try {
      return await UsersRepository.getDisciplines();
    } catch (err) {
      console.warn('[userWebOverrides] DB disciplines failed, falling back:', err.message);
    }
  }
  return readDisciplines();
}

function getEligibleSprintOptions(requesterSlackId, role, sprints, disciplines) {
  const roleList = Array.isArray(disciplines?.[role]) ? disciplines[role] : [];
  const userIndex = roleList.findIndex((u) => u.slackId === requesterSlackId);
  if (userIndex < 0) return [];

  return (sprints || []).reduce((acc, sprint, index) => {
    if (roleList.length === 0) return acc;
    const assigned = roleList[index % roleList.length];
    if (assigned?.slackId === requesterSlackId) {
      acc.push({
        sprintIndex: index,
        label: formatSprintLabel(index, sprints),
        startDate: sprint.startDate,
        endDate: sprint.endDate,
      });
    }
    return acc;
  }, []);
}

function getReplacementOptions(role, disciplines, requesterSlackId) {
  const roleList = Array.isArray(disciplines?.[role]) ? disciplines[role] : [];
  return roleList
    .filter((u) => u?.slackId && u.slackId !== requesterSlackId && u.active !== false)
    .map((u) => ({ slackId: u.slackId, name: u.name || u.slackId }));
}

async function notifyAdminsOfOverrideRequest(override, sprintLabel) {
  const channelId = process.env.ADMIN_CHANNEL_ID;
  if (!channelId || !process.env.SLACK_BOT_TOKEN) {
    console.warn('[userWebOverrides] ADMIN_CHANNEL_ID or SLACK_BOT_TOKEN missing; skip admin notify');
    return;
  }

  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const { requestedBy, role, newSlackId, newName } = override;

  await client.chat.postMessage({
    channel: channelId,
    text: `Override Request: <@${requestedBy}> has requested an override for *${role}* on *${sprintLabel}*. Replacement: <@${newSlackId}> (${newName}). Please review and approve.`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Override Request (web): <@${requestedBy}> has requested an override for *${role}* on *${sprintLabel}*.\nReplacement: <@${newSlackId}> (${newName}).`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve' },
            style: 'primary',
            action_id: 'approve_override',
            value: JSON.stringify({
              sprintIndex: override.sprintIndex,
              sprintLabel,
              role,
              replacementSlackId: newSlackId,
              replacementName: newName,
              requesterId: requestedBy,
            }),
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Decline' },
            style: 'danger',
            action_id: 'decline_override',
            value: JSON.stringify({
              sprintIndex: override.sprintIndex,
              sprintLabel,
              role,
              replacementSlackId: newSlackId,
              requesterId: requestedBy,
            }),
          },
        ],
      },
    ],
  });
}

async function createOverrideRequest({ requesterSlackId, sprintIndex, replacementSlackId }) {
  if (!requesterSlackId) throw new Error('Requester is required');

  const sprints = await readSprints();
  const disciplines = await loadDisciplines();
  const role = findUserRole(requesterSlackId, disciplines);

  if (!role) throw new Error('You are not on any rotation roster');

  const eligible = getEligibleSprintOptions(requesterSlackId, role, sprints, disciplines);
  const sprintIdx = Number(sprintIndex);
  if (!eligible.some((s) => s.sprintIndex === sprintIdx)) {
    throw new Error('Selected sprint is not eligible for an override request');
  }

  const replacements = getReplacementOptions(role, disciplines, requesterSlackId);
  const replacement = replacements.find((r) => r.slackId === replacementSlackId);
  if (!replacement) throw new Error('Replacement must be an active member of your discipline');

  const override = {
    sprintIndex: sprintIdx,
    role,
    newSlackId: replacementSlackId,
    newName: replacement.name,
    requestedBy: requesterSlackId,
    approved: false,
    timestamp: new Date().toISOString(),
  };

  if (USE_DATABASE) {
    await OverridesRepository.addOverride(override, requesterSlackId);
    await cache.del('overrides:all');
    await cache.del(`sprintUsers:${sprintIdx}`);
  } else {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'overrides.json');
    let overrides = [];
    try {
      overrides = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      overrides = [];
    }
    if (!Array.isArray(overrides)) overrides = [];
    overrides.push(override);
    fs.writeFileSync(file, JSON.stringify(overrides, null, 2));
  }

  const sprintLabel = formatSprintLabel(sprintIdx, sprints);
  await notifyAdminsOfOverrideRequest(override, sprintLabel);

  return { override, sprintLabel };
}

module.exports = {
  createOverrideRequest,
  getEligibleSprintOptions,
  getReplacementOptions,
  formatSprintLabel,
};
