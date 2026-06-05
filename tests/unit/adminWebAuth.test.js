<<<<<<< HEAD
const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const {
  createSignedToken,
} = require('../../services/slackOAuthSession');
=======
const { describe, it, expect, afterEach } = require('bun:test');
const { resetModuleCache } = require('../helpers/mockIsolation');

function loadAuth() {
  resetModuleCache(['../../middleware/adminWebAuth']);
  return require('../../middleware/adminWebAuth');
}
>>>>>>> origin/main

function mockRes() {
  const res = {
    statusCode: 200,
<<<<<<< HEAD
    headers: {},
=======
>>>>>>> origin/main
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
<<<<<<< HEAD
    redirect(url) {
      this.redirectUrl = url;
      return this;
    },
=======
>>>>>>> origin/main
  };
  return res;
}

<<<<<<< HEAD
describe('requireAdminWebAuth', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.WEB_ADMIN_SECRET;
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
    delete process.env.SLACK_OAUTH_REDIRECT_URI;
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows unauthenticated access in non-production when no auth is configured', () => {
    const { requireAdminWebAuth } = require('../../middleware/adminWebAuth');
    const req = { get: () => '', query: {}, path: '/admin' };
    const res = mockRes();
    const next = mock(() => {});
    requireAdminWebAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('requires WEB_ADMIN_SECRET when OAuth is not configured', () => {
    process.env.WEB_ADMIN_SECRET = 'secret-token';
    const { requireAdminWebAuth } = require('../../middleware/adminWebAuth');
    const req = { get: () => '', query: {}, path: '/admin' };
    const res = mockRes();
    const next = mock(() => {});
    requireAdminWebAuth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts WEB_ADMIN_SECRET bearer token', () => {
    process.env.WEB_ADMIN_SECRET = 'secret-token';
    const { requireAdminWebAuth } = require('../../middleware/adminWebAuth');
    const req = {
      get: (header) => (header === 'authorization' ? 'Bearer secret-token' : ''),
      query: {},
      path: '/admin',
    };
    const res = mockRes();
    const next = mock(() => {});
    requireAdminWebAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.slackUser.slackUserId).toBe('web-admin-secret');
  });

  it('accepts Slack OAuth session when configured', () => {
    process.env.SLACK_CLIENT_ID = 'client';
    process.env.SLACK_CLIENT_SECRET = 'secret';
    process.env.SLACK_OAUTH_REDIRECT_URI = 'http://localhost:3000/auth/slack/callback';
    process.env.SESSION_SECRET = 'session-secret';
    const token = createSignedToken({ slackUserId: 'U555', name: 'OAuth User' }, 'session-secret', 60_000);
    const { requireAdminWebAuth } = require('../../middleware/adminWebAuth');
    const req = {
      get: () => '',
      query: {},
      path: '/admin',
      headers: { cookie: `triage_session=${encodeURIComponent(token)}` },
    };
    const res = mockRes();
    const next = mock(() => {});
    requireAdminWebAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.slackUser.slackUserId).toBe('U555');
  });

  it('redirects HTML /admin requests to Slack OAuth when session is missing', () => {
    process.env.SLACK_CLIENT_ID = 'client';
    process.env.SLACK_CLIENT_SECRET = 'secret';
    process.env.SLACK_OAUTH_REDIRECT_URI = 'http://localhost:3000/auth/slack/callback';
    process.env.SESSION_SECRET = 'session-secret';
    const { requireAdminWebAuth } = require('../../middleware/adminWebAuth');
    const req = {
      get: (header) => (header === 'accept' ? 'text/html' : ''),
      query: {},
      path: '/admin',
      originalUrl: '/admin',
      headers: {},
    };
    const res = mockRes();
    const next = mock(() => {});
    requireAdminWebAuth(req, res, next);
    expect(res.redirectUrl).toBe('/auth/slack?returnTo=%2Fadmin');
    expect(next).not.toHaveBeenCalled();
=======
describe('adminWebAuth', () => {
  const orig = {
    WEB_ADMIN_SECRET: process.env.WEB_ADMIN_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };

  afterEach(() => {
    process.env.WEB_ADMIN_SECRET = orig.WEB_ADMIN_SECRET;
    process.env.NODE_ENV = orig.NODE_ENV;
  });

  it('allows requests when secret unset in non-production', () => {
    delete process.env.WEB_ADMIN_SECRET;
    process.env.NODE_ENV = 'development';
    const { requireAdminWebAuth } = loadAuth();
    const req = { get: () => '', query: {} };
    const res = mockRes();
    let called = false;
    requireAdminWebAuth(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('rejects when secret unset in production', () => {
    delete process.env.WEB_ADMIN_SECRET;
    process.env.NODE_ENV = 'production';
    const { requireAdminWebAuth } = loadAuth();
    const req = { get: () => '', query: {} };
    const res = mockRes();
    requireAdminWebAuth(req, res, () => {});
    expect(res.statusCode).toBe(503);
  });

  it('accepts Bearer token matching WEB_ADMIN_SECRET', () => {
    process.env.WEB_ADMIN_SECRET = 'test-secret';
    process.env.NODE_ENV = 'production';
    const { requireAdminWebAuth } = loadAuth();
    const req = {
      get: (h) => (h.toLowerCase() === 'authorization' ? 'Bearer test-secret' : ''),
      query: {},
    };
    const res = mockRes();
    let called = false;
    requireAdminWebAuth(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('rejects invalid token', () => {
    process.env.WEB_ADMIN_SECRET = 'test-secret';
    process.env.NODE_ENV = 'production';
    const { requireAdminWebAuth } = loadAuth();
    const req = { get: () => '', query: { token: 'wrong' } };
    const res = mockRes();
    requireAdminWebAuth(req, res, () => {});
    expect(res.statusCode).toBe(401);
>>>>>>> origin/main
  });
});
