/**
 * Centralized configuration values for the triage bot.
 * Additional environment-driven flags should be surfaced here to
 * keep runtime modules decoupled from process.env access.
 */
if (!process.env.RAILWAY_CRON_SECRET) {
  throw new Error('[CONFIG] RAILWAY_CRON_SECRET not set - webhook signature validation required!');
}

const config = {
  /**
   * Shared secret used to validate inbound Railway cron webhooks.
   * The value is defined in `env.example` and must be set per environment.
   */
  railwayCronSecret: process.env.RAILWAY_CRON_SECRET,
};

module.exports = config;

