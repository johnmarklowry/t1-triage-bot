/**
 * db/connection.js
 * Database connection management with connection pooling
 */
const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

/**
 * Get or create the database connection pool
 */
function getPool() {
  if (!pool) {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'triage_bot',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
      min: parseInt(process.env.DB_MIN_CONNECTIONS) || 2,
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000,
    };

    pool = new Pool(config);

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    console.log(`[DB] Connection pool created with config:`, {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      max: config.max,
      min: config.min
    });
  }

  return pool;
}

/**
 * Execute a query with automatic connection management
 */
async function query(text, params = []) {
  const pool = getPool();
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB] Query executed in ${duration}ms: ${text.substring(0, 100)}...`);
    return result;
  } catch (error) {
    console.error(`[DB] Query error: ${error.message}`);
    throw error;
  }
}

/**
 * Execute a transaction with automatic rollback on error
 */
async function transaction(callback) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const result = await query('SELECT NOW() as current_time');
    console.log('[DB] Connection test successful:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('[DB] Connection test failed:', error.message);
    return false;
  }
}

/**
 * Close the connection pool
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] Connection pool closed');
  }
}

/**
 * Get database health status
 */
async function getHealthStatus() {
  try {
    const result = await query(`
      SELECT 
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
        (SELECT setting FROM pg_settings WHERE name = 'max_connections') as max_connections
    `);
    
    return {
      status: 'healthy',
      connections: result.rows[0],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  getPool,
  query,
  transaction,
  testConnection,
  closePool,
  getHealthStatus
};
