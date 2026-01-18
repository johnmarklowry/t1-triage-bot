/**
 * cache/redisClient.js
 * Minimal Redis JSON cache wrapper (Railway Redis via REDIS_URL).
 *
 * Fail-open design: if Redis is not configured or errors, callers should proceed without cache.
 */
const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || process.env.CACHE_REDIS_URL || null;
const CACHE_DEBUG = process.env.CACHE_DEBUG === 'true';
const ENV_PREFIX = String(process.env.TRIAGE_ENV || process.env.NODE_ENV || 'dev');
const KEY_PREFIX = `t1triage:${ENV_PREFIX}:`;

let client = null;
let clientConnecting = null;

function logDebug(message, data) {
  if (!CACHE_DEBUG) return;
  try {
    // Avoid logging secrets; only keys and metadata.
    console.log(`[cache] ${message}`, data || '');
  } catch {}
}

async function getClient() {
  if (!REDIS_URL) return null;
  if (client) return client;
  if (clientConnecting) return clientConnecting;

  clientConnecting = (async () => {
    const c = createClient({ url: REDIS_URL });
    c.on('error', (err) => {
      logDebug('redis client error', { message: err?.message });
    });
    await c.connect();
    client = c;
    clientConnecting = null;
    logDebug('redis connected');
    return client;
  })().catch((err) => {
    logDebug('redis connect failed', { message: err?.message });
    clientConnecting = null;
    client = null;
    return null;
  });

  return clientConnecting;
}

function k(key) {
  return `${KEY_PREFIX}${key}`;
}

async function getJson(key) {
  const c = await getClient();
  if (!c) return null;
  try {
    const raw = await c.get(k(key));
    if (!raw) {
      logDebug('miss', { key });
      return null;
    }
    logDebug('hit', { key });
    return JSON.parse(raw);
  } catch (err) {
    logDebug('getJson error', { key, message: err?.message });
    return null;
  }
}

async function setJson(key, value, ttlSeconds) {
  const c = await getClient();
  if (!c) return false;
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
      await c.set(k(key), payload, { EX: ttlSeconds });
    } else {
      await c.set(k(key), payload);
    }
    logDebug('set', { key, ttlSeconds: ttlSeconds || null });
    return true;
  } catch (err) {
    logDebug('setJson error', { key, message: err?.message });
    return false;
  }
}

async function del(key) {
  const c = await getClient();
  if (!c) return false;
  try {
    await c.del(k(key));
    logDebug('del', { key });
    return true;
  } catch (err) {
    logDebug('del error', { key, message: err?.message });
    return false;
  }
}

async function delMany(keys) {
  const c = await getClient();
  if (!c) return false;
  try {
    const ks = (keys || []).map((x) => k(x));
    if (ks.length === 0) return true;
    await c.del(ks);
    logDebug('delMany', { count: ks.length });
    return true;
  } catch (err) {
    logDebug('delMany error', { message: err?.message });
    return false;
  }
}

module.exports = {
  getJson,
  setJson,
  del,
  delMany,
  cacheKeyPrefix: KEY_PREFIX,
};

