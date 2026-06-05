const { describe, it, expect, mock, beforeEach, afterEach } = require('bun:test');
const express = require('express');
const request = require('supertest');
const { resetModuleCache, restoreEnv, snapshotEnv } = require('../helpers/mockIsolation');

const buildDashboardSnapshotMock = mock(() => Promise.resolve({
  environment: 'test',
  generatedAt: '2026-01-01T00:00:00.000Z',
  user: { slackUserId: 'U123', inRotation: true, role: 'po', roleDisplay: 'PO' },
  isAdmin: false,
  onCallStatus: null,
  currentRotation: null,
  upcomingShifts: [],
  overrides: { pending: [], approved: [] },
  overrideForm: { eligibleSprints: [], replacements: [] },
}));

const createOverrideRequestMock = mock(() => Promise.resolve({
  sprintLabel: 'Sprint 1',
  override: { sprintIndex: 1, role: 'po' },
}));

mock.module('../../services/userDashboardState', () => ({
  buildUserDashboardSnapshot: buildDashboardSnapshotMock,
  resolveIsAdmin: mock(() => Promise.resolve(false)),
}));

mock.module('../../services/userWebOverrides', () => ({
  createOverrideRequest: createOverrideRequestMock,
}));

mock.module('../../services/slackOAuthSession', () => ({
  createCsrfToken: () => 'csrf-test-token',
  validateCsrfToken: (token) => token === 'csrf-test-token',
  readSessionFromRequest: () => null,
}));

function buildApp() {
  resetModuleCache(['../../routes/dashboardWeb', '../../middleware/webSessionAuth']);
  process.env.SLACK_CLIENT_ID = 'test-client-id';
  process.env.SLACK_CLIENT_SECRET = 'test-client-secret';
  process.env.SLACK_OAUTH_REDIRECT_URI = 'http://localhost:3000/auth/slack/callback';
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.NODE_ENV = 'production';

  mock.module('../../middleware/webSessionAuth', () => ({
    requireSlackSession: (req, res, next) => {
      req.slackUser = { slackUserId: 'U123', name: 'Pat' };
      next();
    },
    requireCsrfToken: (req, res, next) => {
      const token = req.body?._csrf;
      if (token !== 'csrf-test-token') {
        return res.status(403).json({ status: 'forbidden' });
      }
      next();
    },
  }));

  const router = require('../../routes/dashboardWeb');
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use('/dashboard', router);
  return app;
}

describe('dashboardWeb routes', () => {
  const envSnap = snapshotEnv([
    'SLACK_CLIENT_ID',
    'SLACK_CLIENT_SECRET',
    'SLACK_OAUTH_REDIRECT_URI',
    'SESSION_SECRET',
    'NODE_ENV',
  ]);

  beforeEach(() => {
    buildDashboardSnapshotMock.mockClear();
    createOverrideRequestMock.mockClear();
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  it('GET /dashboard/api/state returns participant snapshot', async () => {
    const app = buildApp();
    const res = await request(app).get('/dashboard/api/state').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.user.slackUserId).toBe('U123');
  });

  it('POST /dashboard/api/overrides/request requires CSRF token', async () => {
    const app = buildApp();
    await request(app)
      .post('/dashboard/api/overrides/request')
      .send({ sprintIndex: 1, replacementSlackId: 'U9' })
      .expect(403);
  });

  it('POST /dashboard/api/overrides/request submits override with CSRF', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/api/overrides/request')
      .type('form')
      .send({ _csrf: 'csrf-test-token', sprintIndex: 1, replacementSlackId: 'U9' })
      .expect(303);
    expect(res.headers.location).toContain('/dashboard');
    expect(createOverrideRequestMock).toHaveBeenCalled();
  });
});
