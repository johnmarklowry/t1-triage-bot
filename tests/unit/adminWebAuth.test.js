const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const {
  createSignedToken,
} = require('../../services/slackOAuthSession');

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    },
  };
  return res;
}

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
  });
});
