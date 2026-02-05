/**
 * Decides whether to skip the JSON data migration at server startup.
 * Used so we don't re-seed production when the DB already has data.
 *
 * @param {boolean} forceSeed - FORCE_SEED=1 or true means always run migration
 * @param {() => Promise<number>} getSprintCount - async function that returns sprint count (e.g. prisma.sprint.count())
 * @returns {Promise<boolean>} true = skip migration, false = run migration
 */
async function shouldSkipJsonMigration(forceSeed, getSprintCount) {
  if (forceSeed) return false;
  try {
    const count = await getSprintCount();
    return count > 0;
  } catch (_e) {
    return false;
  }
}

module.exports = { shouldSkipJsonMigration };
