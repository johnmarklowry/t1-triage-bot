const { describe, it, expect } = require('bun:test');
const {
  buildDatabaseUrlFromPostgresEnv,
  ensureDatabaseUrl,
  shouldUseDatabaseSsl,
} = require('../../lib/databaseUrl');

describe('databaseUrl', () => {
  it('builds DATABASE_URL from POSTGRES_* with encoded password', () => {
    const url = buildDatabaseUrlFromPostgresEnv({
      POSTGRES_HOST: 'db.example.com',
      POSTGRES_PORT: '5432',
      POSTGRES_DB: 'triage_bot',
      POSTGRES_USER: 'app',
      POSTGRES_PASSWORD: 'p@ss!word',
    });

    expect(url).toBe(
      'postgresql://app:p%40ss!word@db.example.com:5432/triage_bot?sslmode=require'
    );
  });

  it('returns null when POSTGRES_* is incomplete', () => {
    expect(buildDatabaseUrlFromPostgresEnv({ POSTGRES_HOST: 'db.example.com' })).toBeNull();
  });

  it('ensureDatabaseUrl preserves an existing DATABASE_URL', () => {
    const env = { DATABASE_URL: 'postgresql://local/dev' };
    expect(ensureDatabaseUrl(env)).toBe('postgresql://local/dev');
  });

  it('ensureDatabaseUrl constructs DATABASE_URL on the env object', () => {
    const env = {
      POSTGRES_HOST: 'db.example.com',
      POSTGRES_DB: 'triage_bot',
      POSTGRES_USER: 'app',
      POSTGRES_PASSWORD: 'secret',
    };
    const url = ensureDatabaseUrl(env);
    expect(env.DATABASE_URL).toBe(url);
    expect(url).toContain('sslmode=require');
  });

  it('shouldUseDatabaseSsl when Monorail POSTGRES_HOST is set', () => {
    expect(shouldUseDatabaseSsl({ POSTGRES_HOST: 'db.example.com' })).toBe(true);
    expect(shouldUseDatabaseSsl({ DB_SSL: 'false', POSTGRES_HOST: 'db.example.com' })).toBe(false);
  });
});
