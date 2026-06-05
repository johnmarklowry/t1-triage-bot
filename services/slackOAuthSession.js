/**
 * Signed session cookies for authenticated Slack users (issue #4).
 */
const crypto = require('crypto');
const { getSlackOAuthConfig } = require('../lib/slackOAuthConfig');

const SESSION_COOKIE = 'triage_session';
const OAUTH_STATE_COOKIE = 'triage_oauth_state';
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function base64urlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64urlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createSignedToken(data, secret, ttlMs) {
  const envelope = {
    ...data,
    exp: Date.now() + ttlMs,
  };
  const payload = base64urlEncode(JSON.stringify(envelope));
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
}

function parseSignedToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = signPayload(payload, secret);
  if (!timingSafeEqual(signature, expected)) return null;

  let envelope;
  try {
    envelope = JSON.parse(base64urlDecode(payload));
  } catch {
    return null;
  }

  if (!envelope?.exp || Date.now() > envelope.exp) return null;
  return envelope;
}

function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  return cookieHeader.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function buildSetCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function getSessionSecret() {
  return getSlackOAuthConfig().sessionSecret;
}

function createSessionCookie(user) {
  const secret = getSessionSecret();
  const token = createSignedToken(
    {
      slackUserId: user.slackUserId,
      name: user.name || null,
      email: user.email || null,
    },
    secret,
    DEFAULT_SESSION_TTL_MS,
  );
  return buildSetCookie(SESSION_COOKIE, token, {
    maxAge: Math.floor(DEFAULT_SESSION_TTL_MS / 1000),
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
}

function clearSessionCookie() {
  return buildSetCookie(SESSION_COOKIE, '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
}

function createOAuthStateCookie(state, nonce, returnTo) {
  const secret = getSessionSecret();
  const token = createSignedToken({ state, nonce, returnTo: returnTo || '/admin' }, secret, OAUTH_STATE_TTL_MS);
  return buildSetCookie(OAUTH_STATE_COOKIE, token, {
    maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
    httpOnly: true,
    sameSite: 'Lax',
    path: '/auth',
    secure: process.env.NODE_ENV === 'production',
  });
}

function clearOAuthStateCookie() {
  return buildSetCookie(OAUTH_STATE_COOKIE, '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/auth',
    secure: process.env.NODE_ENV === 'production',
  });
}

function readSessionFromRequest(req) {
  const secret = getSessionSecret();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  const envelope = parseSignedToken(token, secret);
  if (!envelope?.slackUserId) return null;
  return {
    slackUserId: envelope.slackUserId,
    name: envelope.name,
    email: envelope.email,
  };
}

function readOAuthStateFromRequest(req) {
  const secret = getSessionSecret();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[OAUTH_STATE_COOKIE];
  const envelope = parseSignedToken(token, secret);
  if (!envelope?.state || !envelope?.nonce) return null;
  return envelope;
}

function createCsrfToken(slackUserId) {
  const secret = getSessionSecret();
  return createSignedToken({ slackUserId, purpose: 'csrf' }, secret, 60 * 60 * 1000);
}

function validateCsrfToken(token, slackUserId) {
  const secret = getSessionSecret();
  const envelope = parseSignedToken(token, secret);
  return envelope?.purpose === 'csrf' && envelope?.slackUserId === slackUserId;
}

module.exports = {
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  createSessionCookie,
  clearSessionCookie,
  createOAuthStateCookie,
  clearOAuthStateCookie,
  readSessionFromRequest,
  readOAuthStateFromRequest,
  parseSignedToken,
  createSignedToken,
  createCsrfToken,
  validateCsrfToken,
};
