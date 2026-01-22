/**
 * loadEnv.js
 *
 * Consistently load environment variables for local/dev/prod.
 * - Load `.env` first (if present)
 * - Load `.env.local` second (if present) and override `.env`
 *
 * Using absolute paths avoids surprises when process.cwd() differs.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
 
function loadEnv() {
  // Idempotent: only load once per process.
  if (process.env.__T1_ENV_LOADED === 'true') return;
  process.env.__T1_ENV_LOADED = 'true';

  const envPath = path.join(__dirname, '.env');
  const envLocalPath = path.join(__dirname, '.env.local');

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: true });
  }
}

module.exports = { loadEnv };

