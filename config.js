/**
 * Centralized configuration values for the triage bot.
 * Additional environment-driven flags should be surfaced here to
 * keep runtime modules decoupled from process.env access.
 */
const config = {
  /**
   * Shared secret used to validate inbound Railway cron webhooks.
   * The value is defined in `env.example` and must be set per environment.
   */
  railwayCronSecret: process.env.RAILWAY_CRON_SECRET || '',
};

module.exports = config;

