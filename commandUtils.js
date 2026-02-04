/**
 * commandUtils.js
 * Utility functions for environment-specific slash commands
 */
const config = require('./config');

/**
 * Get environment-specific command name
 * Appends '-staging' suffix when in staging environment
 * @param {string} baseCommand - The base command name (e.g., 'triage-schedule')
 * @returns {string} - Environment-specific command name
 */
function getEnvironmentCommand(baseCommand) {
  if (config.isStaging) {
    return `/${baseCommand}-staging`;
  }
  return `/${baseCommand}`;
}

/**
 * Get all environment-specific command names for a list of base commands
 * @param {string[]} baseCommands - Array of base command names
 * @returns {string[]} - Array of environment-specific command names
 */
function getEnvironmentCommands(baseCommands) {
  return baseCommands.map(baseCommand => getEnvironmentCommand(baseCommand));
}

module.exports = {
  getEnvironmentCommand,
  getEnvironmentCommands
};
