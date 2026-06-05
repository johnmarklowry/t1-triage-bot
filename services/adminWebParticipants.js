/**
 * Web admin participant list mutations (issue #1).
 * Mirrors Slack admin discipline flows; triggers rotation reconcile when needed.
 */
const cache = require('../cache/redisClient');
const { UsersRepository } = require('../db/repository');
const { loadJSON, saveJSON } = require('../dataUtils');
const { getDisciplinesSourceFile } = require('./adminViews');
const { ROLE_KEYS } = require('./adminWebRotationState');
const { reconcileCurrentStateAfterUserDeactivated } = require('../triageLogic');

const CHANGED_BY = 'web-admin';

function useDatabase() {
  return process.env.USE_DATABASE !== 'false' && !!process.env.DATABASE_URL;
}

function isValidDiscipline(discipline) {
  return ROLE_KEYS.includes(discipline);
}

function normalizeSlackId(value) {
  const slackId = String(value ?? '').trim();
  if (!/^U[A-Z0-9]+$/i.test(slackId)) {
    throw new Error('Invalid Slack user ID');
  }
  return slackId;
}

function normalizeName(value, slackId) {
  const name = String(value ?? '').trim();
  if (name) return name;
  return slackId;
}

async function invalidateDisciplineCaches() {
  await cache.del('disciplines:all');
}

function loadDisciplinesJson() {
  const sourceFile = getDisciplinesSourceFile();
  return { sourceFile, disciplines: loadJSON(sourceFile) || {} };
}

function saveDisciplinesJson(sourceFile, disciplines) {
  saveJSON(sourceFile, disciplines);
}

function ensureDisciplineArray(disciplines, discipline) {
  if (!disciplines[discipline]) disciplines[discipline] = [];
  if (!Array.isArray(disciplines[discipline])) {
    throw new Error(`Discipline ${discipline} is not an array`);
  }
}

/**
 * @param {{ discipline: string, slackId: string, name?: string, changedBy?: string }} input
 */
async function addParticipant(input) {
  const discipline = String(input.discipline ?? '').trim();
  if (!isValidDiscipline(discipline)) {
    throw new Error(`Invalid discipline: ${discipline}`);
  }
  const slackId = normalizeSlackId(input.slackId);
  const name = normalizeName(input.name, slackId);
  const changedBy = input.changedBy || CHANGED_BY;

  if (useDatabase()) {
    await UsersRepository.addUser(slackId, name, discipline, changedBy);
    await invalidateDisciplineCaches();
    return { discipline, slackId, name, active: true };
  }

  const { sourceFile, disciplines } = loadDisciplinesJson();
  ensureDisciplineArray(disciplines, discipline);
  const idx = disciplines[discipline].findIndex((m) => m?.slackId === slackId);
  if (idx >= 0) {
    disciplines[discipline][idx] = { ...disciplines[discipline][idx], name, active: true };
  } else {
    disciplines[discipline].push({ name, slackId, active: true });
  }
  saveDisciplinesJson(sourceFile, disciplines);
  return { discipline, slackId, name, active: true };
}

/**
 * @param {{ slackId: string, changedBy?: string }} input
 */
async function deactivateParticipant(input) {
  const slackId = normalizeSlackId(input.slackId);
  const changedBy = input.changedBy || CHANGED_BY;

  if (useDatabase()) {
    const ok = await UsersRepository.deactivateUser(slackId, changedBy);
    if (!ok) throw new Error('User not found');
    await invalidateDisciplineCaches();
  } else {
    const { sourceFile, disciplines } = loadDisciplinesJson();
    let found = false;
    for (const members of Object.values(disciplines)) {
      if (!Array.isArray(members)) continue;
      for (const member of members) {
        if (member?.slackId === slackId) {
          member.active = false;
          found = true;
        }
      }
    }
    if (!found) throw new Error('User not found');
    saveDisciplinesJson(sourceFile, disciplines);
  }

  const reconcile = await reconcileCurrentStateAfterUserDeactivated(slackId);
  return { slackId, active: false, reconciled: reconcile.reconciled };
}

/**
 * @param {{ slackId: string, changedBy?: string }} input
 */
async function reactivateParticipant(input) {
  const slackId = normalizeSlackId(input.slackId);
  const changedBy = input.changedBy || CHANGED_BY;

  if (useDatabase()) {
    const ok = await UsersRepository.reactivateUser(slackId, changedBy);
    if (!ok) throw new Error('User not found');
    await invalidateDisciplineCaches();
  } else {
    const { sourceFile, disciplines } = loadDisciplinesJson();
    let found = false;
    for (const members of Object.values(disciplines)) {
      if (!Array.isArray(members)) continue;
      for (const member of members) {
        if (member?.slackId === slackId) {
          member.active = true;
          found = true;
        }
      }
    }
    if (!found) throw new Error('User not found');
    saveDisciplinesJson(sourceFile, disciplines);
  }

  return { slackId, active: true };
}

/**
 * @param {{ discipline: string, slackIds: string[], changedBy?: string }} input
 */
async function reorderParticipants(input) {
  const discipline = String(input.discipline ?? '').trim();
  if (!isValidDiscipline(discipline)) {
    throw new Error(`Invalid discipline: ${discipline}`);
  }
  const slackIds = (input.slackIds || []).map((id) => normalizeSlackId(id));
  const changedBy = input.changedBy || CHANGED_BY;

  if (useDatabase()) {
    await UsersRepository.setDisciplineRotationOrder(discipline, slackIds, changedBy);
    await invalidateDisciplineCaches();
    return { discipline, slackIds };
  }

  const { sourceFile, disciplines } = loadDisciplinesJson();
  ensureDisciplineArray(disciplines, discipline);
  const activeMembers = disciplines[discipline].filter((m) => m?.active !== false);
  const activeIds = activeMembers.map((m) => m.slackId);
  if (slackIds.length !== activeIds.length) {
    throw new Error('slackIds must include every active member exactly once');
  }
  const activeSet = new Set(activeIds);
  if (slackIds.some((id) => !activeSet.has(id))) {
    throw new Error('slackIds contains unknown or inactive members');
  }
  if (new Set(slackIds).size !== slackIds.length) {
    throw new Error('slackIds contains duplicates');
  }

  const byId = new Map(disciplines[discipline].map((m) => [m.slackId, m]));
  const inactive = disciplines[discipline].filter((m) => m?.active === false);
  disciplines[discipline] = [
    ...slackIds.map((id) => byId.get(id)).filter(Boolean),
    ...inactive,
  ];
  saveDisciplinesJson(sourceFile, disciplines);
  return { discipline, slackIds };
}

module.exports = {
  ROLE_KEYS,
  CHANGED_BY,
  addParticipant,
  deactivateParticipant,
  reactivateParticipant,
  reorderParticipants,
  isValidDiscipline,
};
