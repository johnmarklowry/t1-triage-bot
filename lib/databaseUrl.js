/**
 * Build DATABASE_URL for Monorail RDS (POSTGRES_* components) or pass through
 * an existing DATABASE_URL (Railway / local dev).
 */

function buildDatabaseUrlFromPostgresEnv(env = process.env) {
  const host = env.POSTGRES_HOST;
  const port = env.POSTGRES_PORT || '5432';
  const database = env.POSTGRES_DB;
  const user = env.POSTGRES_USER;
  const password = env.POSTGRES_PASSWORD;

  if (!host || !database || !user || password === undefined) {
    return null;
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${database}?sslmode=require`;
}

function ensureDatabaseUrl(env = process.env) {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  const url = buildDatabaseUrlFromPostgresEnv(env);
  if (url) {
    env.DATABASE_URL = url;
    return url;
  }

  return null;
}

function shouldUseDatabaseSsl(env = process.env) {
  if (env.DB_SSL === 'false') return false;
  if (env.POSTGRES_HOST) return true;
  if (env.DATABASE_URL && /sslmode=require/i.test(env.DATABASE_URL)) return true;
  return false;
}

module.exports = {
  buildDatabaseUrlFromPostgresEnv,
  ensureDatabaseUrl,
  shouldUseDatabaseSsl,
};
