const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const express = require('express');
const request = require('supertest');
const slackOAuthRouter = require('../../routes/slackOAuth');

describe('slack OAuth routes', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SLACK_CLIENT_ID = 'test-client-id';
    process.env.SLACK_CLIENT_SECRET = 'test-client-secret';
    process.env.SLACK_OAUTH_REDIRECT_URI = 'http://localhost:3000/auth/slack/callback';
    process.env.SESSION_SECRET = 'test-session-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('GET /auth/slack redirects to Slack authorize URL', async () => {
    const app = express();
    app.use('/auth', slackOAuthRouter);
    const res = await request(app).get('/auth/slack').expect(302);
    expect(res.headers.location).toStartWith('https://slack.com/openid/connect/authorize');
    expect(res.headers['set-cookie']?.join(';')).toContain('triage_oauth_state=');
  });

  it('GET /auth/slack/callback rejects invalid state', async () => {
    const app = express();
    app.use('/auth', slackOAuthRouter);
    await request(app)
      .get('/auth/slack/callback?code=abc&state=wrong')
      .expect(400);
  });

  it('GET /auth/slack/callback exchanges code and sets session cookie', async () => {
    const app = express();
    app.use('/auth', slackOAuthRouter);

    const start = await request(app).get('/auth/slack').expect(302);
    const stateCookie = start.headers['set-cookie'].find((c) => c.startsWith('triage_oauth_state='));
    const stateMatch = start.headers.location.match(/state=([^&]+)/);
    expect(stateMatch).not.toBeNull();

    const { parseSignedToken } = require('../../services/slackOAuthSession');
    const stateToken = decodeURIComponent(stateCookie.split('=')[1].split(';')[0]);
    const oauthState = parseSignedToken(stateToken, 'test-session-secret');
    expect(oauthState?.nonce).toBeTruthy();

    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: 'U777',
      'https://slack.com/user_id': 'U777',
      name: 'Slack User',
      email: 'user@example.com',
      nonce: oauthState.nonce,
    })).toString('base64url');
    const idToken = `${header}.${payload}.sig`;

    global.fetch = mock(() => Promise.resolve({
      json: () => Promise.resolve({ ok: true, id_token: idToken }),
    }));

    const res = await request(app)
      .get(`/auth/slack/callback?code=good-code&state=${stateMatch[1]}`)
      .set('Cookie', stateCookie)
      .expect(302);

    expect(res.headers.location).toBe('/dashboard');
    expect(res.headers['set-cookie'].join(';')).toContain('triage_session=');
  });
});
