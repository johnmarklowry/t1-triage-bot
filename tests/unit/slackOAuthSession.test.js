const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const {
  createSignedToken,
  parseSignedToken,
  createSessionCookie,
  readSessionFromRequest,
} = require('../../services/slackOAuthSession');

describe('slackOAuthSession', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('round-trips a signed session token', () => {
    const token = createSignedToken({ slackUserId: 'U123', name: 'Ada' }, 'test-session-secret', 60_000);
    const parsed = parseSignedToken(token, 'test-session-secret');
    expect(parsed.slackUserId).toBe('U123');
    expect(parsed.name).toBe('Ada');
  });

  it('rejects tampered signatures', () => {
    const token = createSignedToken({ slackUserId: 'U123' }, 'test-session-secret', 60_000);
    const tampered = `${token}x`;
    expect(parseSignedToken(tampered, 'test-session-secret')).toBeNull();
  });

  it('creates a session cookie readable from request headers', () => {
    const cookieHeader = createSessionCookie({ slackUserId: 'U999', name: 'Test User' });
    const [, value] = cookieHeader.split('=');
    const token = decodeURIComponent(value.split(';')[0]);
    const req = { headers: { cookie: `triage_session=${encodeURIComponent(token)}` } };
    const user = readSessionFromRequest(req);
    expect(user.slackUserId).toBe('U999');
    expect(user.name).toBe('Test User');
  });
});
