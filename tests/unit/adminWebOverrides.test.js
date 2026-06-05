const { describe, it, expect, mock, beforeEach, afterEach } = require('bun:test');
const { resetModuleCache, restoreEnv, snapshotEnv } = require('../helpers/mockIsolation');

const readOverridesMock = mock(() => Promise.resolve([]));
const findCurrentSprintMock = mock(() => Promise.resolve(null));
const approveOverrideMock = mock(() => Promise.resolve(null));
const declineOverrideMock = mock(() => Promise.resolve(false));
const removeOverrideMock = mock(() => Promise.resolve({ deleted: false }));
const applyCurrentSprintRotationMock = mock(() => Promise.resolve({ updated: false, affectedUserIds: [] }));

mock.module('../../dataUtils', () => ({
  readOverrides: readOverridesMock,
  findCurrentSprint: findCurrentSprintMock,
}));

mock.module('../../overrideHandler', () => ({
  approveOverride: approveOverrideMock,
  declineOverride: declineOverrideMock,
  removeOverride: removeOverrideMock,
}));

mock.module('../../triageLogic', () => ({
  applyCurrentSprintRotation: applyCurrentSprintRotationMock,
}));

function loadOverridesService() {
  resetModuleCache(['../../services/adminWebOverrides']);
  return require('../../services/adminWebOverrides');
}

describe('adminWebOverrides', () => {
  const envSnap = snapshotEnv([]);

  const pendingOverride = {
    id: 7,
    sprintIndex: 2,
    role: 'po',
    requestedBy: 'U_REQ',
    newSlackId: 'U_REPLACE',
    approved: false,
  };

  beforeEach(() => {
    readOverridesMock.mockClear();
    findCurrentSprintMock.mockClear();
    approveOverrideMock.mockClear();
    declineOverrideMock.mockClear();
    removeOverrideMock.mockClear();
    applyCurrentSprintRotationMock.mockClear();
    readOverridesMock.mockResolvedValue([pendingOverride]);
    findCurrentSprintMock.mockResolvedValue({ index: 2 });
    approveOverrideMock.mockResolvedValue({ ...pendingOverride, approved: true });
    declineOverrideMock.mockResolvedValue(true);
    removeOverrideMock.mockResolvedValue({ deleted: true, removed: pendingOverride });
    applyCurrentSprintRotationMock.mockResolvedValue({ updated: true, affectedUserIds: ['U_OLD'] });
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  it('approvePendingOverride calls overrideHandler and applies current sprint rotation', async () => {
    const { approvePendingOverride } = loadOverridesService();
    const result = await approvePendingOverride({ id: 7 });
    expect(approveOverrideMock).toHaveBeenCalledWith(2, 'po', 'U_REQ', 'U_REPLACE', 'web-admin');
    expect(applyCurrentSprintRotationMock).toHaveBeenCalledTimes(1);
    expect(result.rotationApplied).toBe(true);
    expect(result.updated).toBe(true);
  });

  it('declinePendingOverride rejects approved overrides', async () => {
    readOverridesMock.mockResolvedValue([{ ...pendingOverride, approved: true }]);
    const { declinePendingOverride } = loadOverridesService();
    await expect(declinePendingOverride({ id: 7 }))
      .rejects.toThrow('Cannot decline an approved override');
  });

  it('removeAdminOverride deletes override and syncs current sprint', async () => {
    const { removeAdminOverride } = loadOverridesService();
    const result = await removeAdminOverride({ id: 7 });
    expect(removeOverrideMock).toHaveBeenCalled();
    expect(applyCurrentSprintRotationMock).toHaveBeenCalledTimes(1);
    expect(result.removed.newSlackId).toBe('U_REPLACE');
  });

  it('resolveOverride finds override by composite key when id missing', async () => {
    readOverridesMock.mockResolvedValue([{ ...pendingOverride, id: undefined }]);
    const { resolveOverride } = loadOverridesService();
    const found = await resolveOverride({
      sprintIndex: 2,
      role: 'po',
      requestedBy: 'U_REQ',
      replacementSlackId: 'U_REPLACE',
    });
    expect(found.newSlackId).toBe('U_REPLACE');
  });
});
