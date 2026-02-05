/**
 * Centralized configuration values for the triage bot.
 * Additional environment-driven flags should be surfaced here to
 * keep runtime modules decoupled from process.env access.
 */

/** Single source of truth for staging: one env var only (APP_ENV). */
const isStaging = process.env.APP_ENV === 'staging';

const config = {
  /**
   * Shared secret used to validate inbound Railway cron webhooks.
   * Lazy so that requiring config elsewhere (e.g. for isStaging) does not throw.
   */
  get railwayCronSecret() {
    if (!process.env.RAILWAY_CRON_SECRET) {
      throw new Error('[CONFIG] RAILWAY_CRON_SECRET not set - webhook signature validation required!');
    }
    return process.env.RAILWAY_CRON_SECRET;
  },

  /** True when APP_ENV=staging. Unset or any other value (e.g. production) = production mode. */
  isStaging,

  /** Current environment label for DB/queries: 'staging' or 'production'. */
  env: isStaging ? 'staging' : 'production',
};

module.exports = config;

