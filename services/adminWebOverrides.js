/**
 * Web admin override mutations (issue #1).
 * Reuses overrideHandler + triageLogic paths used by Slack admin flows.
 */
const { readOverrides, findCurrentSprint } = require('../dataUtils');
const {
  approveOverride,
  declineOverride,
  removeOverride,
} = require('../overrideHandler');
const { applyCurrentSprintRotation } = require('../triageLogic');

const CHANGED_BY = 'web-admin';

function normalizeOptionalId(value) {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isFinite(id)) {
    throw new Error('Invalid override id');
  }
  return id;
}

function normalizeOverrideKey(input) {
  const sprintIndex = Number(input.sprintIndex);
  if (!Number.isFinite(sprintIndex)) {
    throw new Error('Invalid sprintIndex');
  }
  const role = String(input.role ?? '').trim();
  const requestedBy = String(input.requestedBy ?? '').trim();
  const replacementSlackId = String(input.replacementSlackId ?? input.newSlackId ?? '').trim();
  if (!role || !requestedBy || !replacementSlackId) {
    throw new Error('Missing override identifiers');
  }
  return { sprintIndex, role, requestedBy, replacementSlackId };
}

async function resolveOverride(input) {
  const overrides = await readOverrides();
  const id = normalizeOptionalId(input.id);
  if (id != null) {
    const found = overrides.find((o) => Number(o.id) === id);
    if (!found) throw new Error('Override not found');
    return found;
  }
  const key = normalizeOverrideKey(input);
  const found = overrides.find((o) =>
    Number(o.sprintIndex) === key.sprintIndex &&
    o.role === key.role &&
    o.requestedBy === key.requestedBy &&
    o.newSlackId === key.replacementSlackId
  );
  if (!found) throw new Error('Override not found');
  return found;
}

async function maybeApplyCurrentSprintRotation(sprintIndex) {
  const currentSprint = await findCurrentSprint();
  if (!currentSprint || Number(sprintIndex) !== Number(currentSprint.index)) {
    return { rotationApplied: false, updated: false, affectedUserIds: [] };
  }
  const { updated, affectedUserIds } = await applyCurrentSprintRotation();
  return {
    rotationApplied: true,
    updated: !!updated,
    affectedUserIds: affectedUserIds || [],
  };
}

/**
 * @param {{ id?: number|string, sprintIndex?: number, role?: string, requestedBy?: string, replacementSlackId?: string, changedBy?: string }} input
 */
async function approvePendingOverride(input) {
  const override = await resolveOverride(input);
  if (override.approved) {
    throw new Error('Override is already approved');
  }
  const changedBy = input.changedBy || CHANGED_BY;
  const result = await approveOverride(
    override.sprintIndex,
    override.role,
    override.requestedBy,
    override.newSlackId,
    changedBy
  );
  if (!result) {
    throw new Error('Failed to approve override');
  }
  const sync = await maybeApplyCurrentSprintRotation(override.sprintIndex);
  return { override: result, ...sync };
}

/**
 * @param {{ id?: number|string, sprintIndex?: number, role?: string, requestedBy?: string, replacementSlackId?: string, changedBy?: string }} input
 */
async function declinePendingOverride(input) {
  const override = await resolveOverride(input);
  if (override.approved) {
    throw new Error('Cannot decline an approved override; use remove instead');
  }
  const changedBy = input.changedBy || CHANGED_BY;
  const ok = await declineOverride(
    override.sprintIndex,
    override.role,
    override.requestedBy,
    override.newSlackId,
    changedBy
  );
  if (!ok) {
    throw new Error('Failed to decline override');
  }
  return { declined: true, override };
}

/**
 * @param {{ id?: number|string, sprintIndex?: number, role?: string, requestedBy?: string, replacementSlackId?: string, changedBy?: string }} input
 */
async function removeAdminOverride(input) {
  const override = await resolveOverride(input);
  const changedBy = input.changedBy || CHANGED_BY;
  const { deleted } = await removeOverride(override, changedBy);
  if (!deleted) {
    throw new Error('Failed to remove override');
  }
  const sync = await maybeApplyCurrentSprintRotation(override.sprintIndex);
  return { removed: override, ...sync };
}

module.exports = {
  CHANGED_BY,
  approvePendingOverride,
  declinePendingOverride,
  removeAdminOverride,
  resolveOverride,
};
