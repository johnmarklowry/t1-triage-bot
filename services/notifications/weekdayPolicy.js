/**
 * Weekday policy helpers control when notifications should be deferred.
 * Full business logic will be implemented during User Story 3.
 */
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

function shouldDeferNotification(executedAt = new Date()) {
  const timestamp = dayjs(executedAt).tz('America/Los_Angeles');
  const day = timestamp.day(); // 0 (Sunday) -> 6 (Saturday)
  return day === 0 || day === 6;
}

function nextBusinessDay(executedAt = new Date()) {
  let timestamp = dayjs(executedAt).tz('America/Los_Angeles').add(1, 'day');
  while (timestamp.day() === 0 || timestamp.day() === 6) {
    timestamp = timestamp.add(1, 'day');
  }
  return timestamp.startOf('day').toDate();
}

module.exports = {
  shouldDeferNotification,
  nextBusinessDay,
};

