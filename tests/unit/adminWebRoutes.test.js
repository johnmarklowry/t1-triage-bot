const { describe, it, expect, mock, beforeEach, afterEach } = require('bun:test');
const express = require('express');
const request = require('supertest');
const { resetModuleCache, restoreEnv, snapshotEnv } = require('../helpers/mockIsolation');

const buildSnapshotMock = mock(() => Promise.resolve({
  environment: 'test',
  generatedAt: '2026-01-01T00:00:00.000Z',
  currentSprint: null,
  currentRoles: null,
  upcomingSchedule: [],
  overrides: { pendingCount: 0, pending: [], approved: [] },
  participantLists: {
    po: [{ slackId: 'U1', name: 'Amy', active: true }],
  },
}));

const addParticipantMock = mock(() => Promise.resolve({ discipline: 'po', slackId: 'U9', name: 'New', active: true }));
const deactivateParticipantMock = mock(() => Promise.resolve({ slackId: 'U1', active: false, reconciled: false }));
const reorderParticipantsMock = mock(() => Promise.resolve({ discipline: 'po', slackIds: ['U1'] }));

mock.module('../../services/adminWebRotationState', () => ({
  ROLE_KEYS: ['account', 'producer', 'po', 'uiEng', 'beEng'],
  buildAdminRotationSnapshot: buildSnapshotMock,
  buildParticipantListsFromUsers: mock(() => ({})),
}));

mock.module('../../services/adminWebParticipants', () => ({
  addParticipant: addParticipantMock,
  deactivateParticipant: deactivateParticipantMock,
  reactivateParticipant: mock(() => Promise.resolve({ slackId: 'U1', active: true })),
  reorderParticipants: reorderParticipantsMock,
  isValidDiscipline: (d) => ['account', 'producer', 'po', 'uiEng', 'beEng'].includes(d),
}));

function buildApp() {
  resetModuleCache(['../../routes/adminWeb', '../../middleware/adminWebAuth']);
  process.env.WEB_ADMIN_SECRET = 'route-test-secret';
  process.env.NODE_ENV = 'production';
  const router = require('../../routes/adminWeb');
  const app = express();
  app.use('/admin', router);
  return app;
}

describe('adminWeb routes — participants', () => {
  const envSnap = snapshotEnv(['WEB_ADMIN_SECRET', 'NODE_ENV']);

  beforeEach(() => {
    buildSnapshotMock.mockClear();
    addParticipantMock.mockClear();
    deactivateParticipantMock.mockClear();
    reorderParticipantsMock.mockClear();
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  it('POST /admin/api/participants requires auth', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/admin/api/participants')
      .send({ discipline: 'po', slackId: 'U9', name: 'New' });
    expect(res.status).toBe(401);
  });

  it('POST /admin/api/participants adds member via JSON API', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/admin/api/participants')
      .set('Authorization', 'Bearer route-test-secret')
      .set('Content-Type', 'application/json')
      .send({ discipline: 'po', slackId: 'U9', name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(addParticipantMock).toHaveBeenCalled();
  });

  it('PUT /admin/api/participants/:discipline/order reorders members', async () => {
    const app = buildApp();
    const res = await request(app)
      .put('/admin/api/participants/po/order')
      .set('Authorization', 'Bearer route-test-secret')
      .send({ slackIds: ['U2', 'U1'] });
    expect(res.status).toBe(200);
    expect(reorderParticipantsMock).toHaveBeenCalledWith({ discipline: 'po', slackIds: ['U2', 'U1'] });
  });

  it('POST deactivate removes participant', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/admin/api/participants/U1/deactivate')
      .set('Authorization', 'Bearer route-test-secret')
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(deactivateParticipantMock).toHaveBeenCalledWith({ slackId: 'U1' });
  });
});
